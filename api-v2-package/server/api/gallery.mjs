import crypto from 'node:crypto'
import { getDbPool } from '../db.mjs'
import { verifyAdminRequest } from '../auth.mjs'
import { getCustomerSession, extractCustomerToken, handleGalleryCheckEmail } from './auth.mjs'
import {
  validateImageBuffer,
  generateStorageKey,
  putObjectToR2,
  getObjectFromR2,
  deleteObjectFromR2,
  checkR2Configuration,
  MAX_IMAGE_SIZE_BYTES,
} from '../r2_storage.mjs'

// In-memory mutex for concurrency-safe mutual exclusion per customer
const activeUploadsByUser = new Set()

/**
 * Helper to write JSON responses
 */
function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token, x-customer-token',
  })
  res.end(JSON.stringify(data))
}

function jsonError(res, message, status = 400, details = null) {
  jsonResponse(res, { success: false, error: message, message, ...(details ? { details } : {}) }, status)
}

/**
 * Parse multipart/form-data or JSON payload
 */
async function parseUploadPayload(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || ''
    const chunks = []
    let totalBytes = 0
    const maxLimit = 15 * 1024 * 1024 // 15 MB limit for total batch

    req.on('data', chunk => {
      totalBytes += chunk.length
      if (totalBytes > maxLimit) {
        reject(new Error('Total upload payload exceeds 15 MB limit.'))
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      const fullBuffer = Buffer.concat(chunks)

      const textTrim = fullBuffer.toString('utf8').trim()
      // 1. JSON payload support (for test suites / API clients)
      if (contentType.includes('application/json') || (!contentType.includes('multipart') && textTrim.startsWith('{'))) {
        try {
          const parsed = JSON.parse(textTrim)
          const photos = []
          if (Array.isArray(parsed.photos)) {
            for (const p of parsed.photos) {
              if (p.data && typeof p.data === 'string') {
                // Base64 data URL
                const base64Data = p.data.replace(/^data:[^;]+;base64,/, '')
                photos.push({
                  filename: p.name || 'upload.jpg',
                  buffer: Buffer.from(base64Data, 'base64'),
                })
              }
            }
          }
          resolve({
            fields: {
              name: parsed.name || '',
              caption: parsed.caption || '',
              email: parsed.email || '',
            },
            photos,
          })
          return
        } catch (err) {
          reject(new Error('Invalid JSON payload: ' + err.message))
          return
        }
      }

      // 2. Multipart/form-data parsing
      if (contentType.includes('multipart/form-data')) {
        const boundaryMatch = contentType.match(/boundary=(?:["']?)([^"';]+)(?:["']?)/)
        if (!boundaryMatch) {
          reject(new Error('Missing multipart boundary.'))
          return
        }

        const boundary = boundaryMatch[1]
        const delimiter = Buffer.from(`--${boundary}`)
        const fields = {}
        const photos = []

        // Split buffer by delimiter
        let cur = 0
        while (cur < fullBuffer.length) {
          const nextIndex = fullBuffer.indexOf(delimiter, cur)
          if (nextIndex === -1) break

          const partStart = cur
          const partEnd = nextIndex
          cur = nextIndex + delimiter.length

          if (partEnd <= partStart) continue
          const part = fullBuffer.subarray(partStart, partEnd)

          // Find header end (\r\n\r\n)
          const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
          if (headerEnd === -1) continue

          const headerText = part.subarray(0, headerEnd).toString('utf8')
          // Body starts after \r\n\r\n and trims trailing \r\n
          let bodyStart = headerEnd + 4
          let bodyEnd = part.length
          if (part.subarray(part.length - 2).equals(Buffer.from('\r\n'))) {
            bodyEnd -= 2
          }
          const bodyBuffer = part.subarray(bodyStart, bodyEnd)

          // Check if it's a file
          const filenameMatch = headerText.match(/filename=(?:["']?)([^"'\r\n]+)(?:["']?)/)
          const nameMatch = headerText.match(/name=(?:["']?)([^"';\r\n]+)(?:["']?)/)
          const fieldName = nameMatch ? nameMatch[1] : null

          if (filenameMatch && bodyBuffer.length > 0) {
            photos.push({
              filename: filenameMatch[1],
              buffer: bodyBuffer,
            })
          } else if (fieldName) {
            fields[fieldName] = bodyBuffer.toString('utf8').trim()
          }
        }

        resolve({ fields, photos })
        return
      }

      reject(new Error('Unsupported content-type for upload. Expected multipart/form-data or application/json.'))
    })

    req.on('error', reject)
  })
}

/**
 * Main Gallery Route Handler
 */
export async function handleGalleryRoute(req, res, parsedUrl) {
  const pool = await getDbPool()
  const pathname = parsedUrl.pathname
  const method = req.method

  // ========================================================
  // 1. GET /api/gallery/public (Public: Approved Community Photos)
  // ========================================================
  if (pathname === '/api/gallery/public' && method === 'GET') {
    try {
      const result = await pool.query(`
        SELECT 
          g.id,
          g.title,
          g.description AS caption,
          g.image_url,
          g.image_key,
          g.created_at,
          COALESCE(u.name, g.title, 'Zen Guest') AS user_name
        FROM public.gallery g
        LEFT JOIN public.users u ON u.id = g.uploaded_by
        WHERE g.status = 'approved'
        ORDER BY g.created_at DESC
        LIMIT 50
      `)

      return jsonResponse(res, {
        success: true,
        count: result.rows.length,
        photos: result.rows.map(r => ({
          id: String(r.id),
          user: r.user_name || 'Zen Guest',
          caption: r.caption || '',
          imageUrl: r.image_url || `/api/gallery/image/${encodeURIComponent(r.image_key)}`,
          image_url: r.image_url || `/api/gallery/image/${encodeURIComponent(r.image_key)}`,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          likes: 0,
        })),
      })
    } catch (err) {
      console.error('Error fetching public gallery:', err)
      return jsonError(res, 'Failed to fetch public gallery photos.', 500)
    }
  }

  // ========================================================
  // 1b. POST /api/gallery/check-email (Check customer eligibility)
  // ========================================================
  if (pathname === '/api/gallery/check-email' && method === 'POST') {
    try {
      const payload = await parseUploadPayload(req).catch(() => ({ fields: {} }))
      const result = await handleGalleryCheckEmail(req, res, payload.fields)
      return jsonResponse(res, result.body, result.status)
    } catch (err) {
      console.error('Error in /api/gallery/check-email:', err)
      return jsonError(res, 'Failed to check gallery eligibility.', 500)
    }
  }

  // ========================================================
  // 2. POST /api/gallery/upload (Customer Photo Upload)
  // ========================================================
  if (pathname === '/api/gallery/upload' && method === 'POST') {
    let client
    let user = null
    try {
      const payload = await parseUploadPayload(req)
      const { fields, photos } = payload
      const email = String(fields.email || '').trim().toLowerCase()
      const name = String(fields.name || '').trim()
      const caption = String(fields.caption || '').trim()

      if (!email) {
        return jsonError(res, 'Registered email is required for gallery upload.', 400)
      }

      // 1. Customer must have a valid server-verified customer session
      const token = extractCustomerToken(req)
      if (!token) {
        return jsonError(res, 'Authentication required: A valid verified customer session token is required to upload photos.', 401)
      }

      const session = await getCustomerSession(token)
      if (!session) {
        return jsonError(res, 'Invalid or expired customer session. Please verify your email or log in again.', 401)
      }

      client = await pool.connect()
      await client.query('BEGIN')

      // 2. Fetch authenticated customer record from PostgreSQL
      const userRes = await client.query(
        'SELECT id, name, email, email_verified_at, is_active FROM public.users WHERE id = $1',
        [session.userId]
      )

      if (userRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return jsonError(res, 'Customer account not found.', 403)
      }

      user = userRes.rows[0]

      // Concurrency lock: Reject simultaneous upload requests for the same customer
      if (activeUploadsByUser.has(user.id)) {
        await client.query('ROLLBACK')
        return jsonError(res, 'Simultaneous upload request rejected. Cooldown in effect.', 429)
      }
      activeUploadsByUser.add(user.id)

      // 3. Do not authorize uploads using a typed email address alone.
      // If a typed email is provided in the form, ensure it matches the authenticated session user
      if (email && email.toLowerCase() !== user.email.toLowerCase()) {
        await client.query('ROLLBACK')
        return jsonError(res, 'Authenticated customer session does not match the provided email address.', 403)
      }

      // 4. Verify email_verified_at is populated
      if (!user.email_verified_at) {
        await client.query('ROLLBACK')
        return jsonError(res, 'Your email is not verified yet. Please click the verification link sent to your inbox.', 403)
      }

      if (!user.is_active) {
        await client.query('ROLLBACK')
        return jsonError(res, 'Customer account is deactivated.', 403)
      }

      // Enforce batch size limits (1 or 2 images)
      if (!photos || photos.length < 1) {
        await client.query('ROLLBACK')
        return jsonError(res, 'Please select at least 1 photo to upload.', 400)
      }

      if (photos.length > 2) {
        await client.query('ROLLBACK')
        return jsonError(res, 'Maximum 2 images allowed per upload batch.', 400)
      }

      // Concurrency-safe: Check gallery_access cooldown with FOR UPDATE
      const accessRes = await client.query(
        'SELECT eligible_at, max_uploads FROM public.gallery_access WHERE user_id = $1 FOR UPDATE',
        [user.id]
      )

      const now = new Date()
      let eligibleAt = null

      if (accessRes.rows.length > 0 && accessRes.rows[0].eligible_at) {
        eligibleAt = new Date(accessRes.rows[0].eligible_at)
        if (eligibleAt > now) {
          await client.query('ROLLBACK')
          return jsonError(
            res,
            `24-hour upload cooldown is active. Please wait until ${eligibleAt.toISOString()} to upload again.`,
            429,
            { nextUploadAt: eligibleAt.toISOString() }
          )
        }
      }

      // Validate each image buffer (magic bytes and size limit)
      const validatedImages = []
      for (const p of photos) {
        try {
          const validation = validateImageBuffer(p.buffer)
          validatedImages.push({
            buffer: p.buffer,
            ext: validation.ext,
            mime: validation.mime,
          })
        } catch (vErr) {
          await client.query('ROLLBACK')
          return jsonError(res, `Image validation failed: ${vErr.message}`, 400)
        }
      }

      // Upload images to R2 storage & record in public.gallery
      const createdPhotos = []
      for (const img of validatedImages) {
        const storageKey = generateStorageKey(img.ext)
        const putResult = await putObjectToR2({
          key: storageKey,
          buffer: img.buffer,
          contentType: img.mime,
        })

        const insertRes = await client.query(
          `INSERT INTO public.gallery (
             uploaded_by, title, description, image_key, image_url, status, created_at
           ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
           RETURNING id, title, description, image_key, image_url, status, created_at`,
          [
            user.id,
            name || user.name,
            caption || '',
            storageKey,
            putResult.url,
          ]
        )
        createdPhotos.push(insertRes.rows[0])
      }

      // Update 24-hour cooldown in public.gallery_access
      const nextEligibleAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      await client.query(
        `INSERT INTO public.gallery_access (user_id, eligible_at, max_uploads, created_at)
         VALUES ($1, $2, 2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET eligible_at = $2`,
        [user.id, nextEligibleAt]
      )

      await client.query('COMMIT')

      return jsonResponse(
        res,
        {
          success: true,
          message: 'Photos uploaded successfully! They will appear in the community gallery once approved by admin.',
          count: createdPhotos.length,
          uploadedCount: createdPhotos.length,
          status: 'pending',
          nextUploadAt: nextEligibleAt.toISOString(),
          photos: createdPhotos.map(p => ({
            id: String(p.id),
            title: p.title,
            caption: p.description,
            imageUrl: p.image_url,
            image_key: p.image_key,
            status: p.status,
          })),
        },
        201
      )
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      console.error('Error uploading gallery photos:', err)
      return jsonError(res, err.message || 'Failed to upload photo batch.', 500)
    } finally {
      if (user && user.id) {
        activeUploadsByUser.delete(user.id)
      }
      if (client) client.release()
    }
  }

  // ========================================================
  // 3. ADMIN GALLERY MODERATION ROUTES
  // ========================================================

  // GET /api/gallery/admin/photos (Admin only: View photos)
  if (pathname === '/api/gallery/admin/photos' && method === 'GET') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }

    try {
      const statusFilter = parsedUrl.searchParams.get('status') || 'all'
      let query = `
        SELECT 
          g.id,
          g.title,
          g.description,
          g.image_key,
          g.image_url,
          g.status,
          g.created_at,
          u.name AS customer_name,
          u.email AS customer_email,
          u.phone AS customer_phone
        FROM public.gallery g
        LEFT JOIN public.users u ON u.id = g.uploaded_by
      `
      const params = []
      if (statusFilter !== 'all') {
        params.push(statusFilter)
        query += ` WHERE g.status = $1`
      }
      query += ` ORDER BY g.created_at DESC LIMIT 100`

      const result = await pool.query(query, params)
      return jsonResponse(res, {
        success: true,
        count: result.rows.length,
        photos: result.rows.map(r => ({
          id: String(r.id),
          title: r.title,
          description: r.description,
          imageUrl: r.image_url || `/api/gallery/image/${encodeURIComponent(r.image_key)}`,
          image_url: r.image_url || `/api/gallery/image/${encodeURIComponent(r.image_key)}`,
          status: r.status,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          customerName: r.customer_name || 'Guest',
          customerEmail: r.customer_email || '—',
          customerPhone: r.customer_phone || '—',
        })),
      })
    } catch (err) {
      console.error('Error fetching admin gallery photos:', err)
      return jsonError(res, 'Failed to fetch photos for moderation.', 500)
    }
  }

  // POST /api/gallery/admin/photos/:id/approve (Admin: Approve photo)
  const approveMatch = pathname.match(/^\/api\/gallery\/admin\/photos\/(\d+)\/approve$/)
  if (approveMatch && method === 'POST') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }

    const photoId = Number(approveMatch[1])
    try {
      const updRes = await pool.query(
        `UPDATE public.gallery SET status = 'approved' WHERE id = $1 RETURNING *`,
        [photoId]
      )
      if (updRes.rows.length === 0) {
        return jsonError(res, 'Photo not found.', 404)
      }
      return jsonResponse(res, {
        success: true,
        message: 'Photo approved and published to community gallery.',
        data: updRes.rows[0],
      })
    } catch (err) {
      console.error('Error approving gallery photo:', err)
      return jsonError(res, 'Failed to approve photo.', 500)
    }
  }

  // POST /api/gallery/admin/photos/:id/reject (Admin: Reject photo)
  const rejectMatch = pathname.match(/^\/api\/gallery\/admin\/photos\/(\d+)\/reject$/)
  if (rejectMatch && method === 'POST') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }

    const photoId = Number(rejectMatch[1])
    try {
      const updRes = await pool.query(
        `UPDATE public.gallery SET status = 'rejected' WHERE id = $1 RETURNING *`,
        [photoId]
      )
      if (updRes.rows.length === 0) {
        return jsonError(res, 'Photo not found.', 404)
      }
      return jsonResponse(res, {
        success: true,
        message: 'Photo rejected.',
        data: updRes.rows[0],
      })
    } catch (err) {
      console.error('Error rejecting gallery photo:', err)
      return jsonError(res, 'Failed to reject photo.', 500)
    }
  }

  // DELETE /api/gallery/admin/photos/:id (Admin: Delete photo)
  const deleteMatch = pathname.match(/^\/api\/gallery\/admin\/photos\/(\d+)$/)
  if (deleteMatch && method === 'DELETE') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }

    const photoId = Number(deleteMatch[1])
    try {
      const photoRes = await pool.query('SELECT image_key FROM public.gallery WHERE id = $1', [photoId])
      if (photoRes.rows.length === 0) {
        return jsonError(res, 'Photo not found.', 404)
      }

      const imageKey = photoRes.rows[0].image_key
      // Delete the image from Cloudflare R2 first.
// If R2 deletion fails, preserve the PostgreSQL record.
await deleteObjectFromR2(imageKey)

// Remove the database record only after R2 deletion succeeds.
await pool.query(
  'DELETE FROM public.gallery WHERE id = $1',
  [photoId]
)

      return jsonResponse(res, {
        success: true,
        message: 'Photo deleted permanently.',
      })
    } catch (err) {
      console.error('Error deleting gallery photo:', err)
      return jsonError(res, 'Failed to delete photo.', 500)
    }
  }

  // ========================================================
  // 4. GET /api/gallery/image/:key (Safe Private Image Serving)
  // ========================================================
  const imageMatch = pathname.match(/^\/api\/gallery\/image\/(.+)$/)
  if (imageMatch && method === 'GET') {
    const rawKey = decodeURIComponent(imageMatch[1])
    try {
      // Lookup status in PostgreSQL
      const photoRes = await pool.query(
        'SELECT status, uploaded_by FROM public.gallery WHERE image_key = $1',
        [rawKey]
      )

      if (photoRes.rows.length === 0) {
        return jsonError(res, 'Image not found.', 404)
      }

      const photo = photoRes.rows[0]

      // If pending or rejected, require admin or uploader authorization
      if (photo.status !== 'approved') {
        const isAdmin = await verifyAdminRequest(req)
        const custToken = extractCustomerToken(req)
        let isUploader = false
        if (custToken) {
          const custSession = await getCustomerSession(custToken)
          if (custSession && String(custSession.userId) === String(photo.uploaded_by)) {
            isUploader = true
          }
        }

        if (!isAdmin && !isUploader) {
          return jsonError(res, 'Unauthorized: Image is awaiting moderation.', 403)
        }
      }

      const obj = await getObjectFromR2(rawKey)
      if (!obj || !obj.buffer) {
        return jsonError(res, 'Image object not found in storage.', 404)
      }

      res.writeHead(200, {
        'Content-Type': obj.contentType || 'image/jpeg',
        'Content-Length': obj.buffer.length,
        'Cache-Control': photo.status === 'approved' ? 'public, max-age=86400' : 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(obj.buffer)
      return true
    } catch (err) {
      console.error('Error serving gallery image:', err)
      return jsonError(res, 'Error serving image.', 500)
    }
  }

  return false
}
