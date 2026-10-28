
import { getDbPool } from '../db.mjs'
import { verifyAdminRequest } from '../auth.mjs'
import {
  getCustomerSession,
  extractCustomerToken,
  handleGalleryCheckEmail,
  normalizeEmail,
  isValidEmail,
} from './auth.mjs'
import {
  validateImageBuffer,
  generateStorageKey,
  putObjectToR2,
  getObjectFromR2,
  deleteObjectFromR2,
  MAX_IMAGE_SIZE_BYTES,
} from '../r2_storage.mjs'

/* =========================================================
   ZEN CAFÉ — COMMUNITY GALLERY API

   CUSTOMER WORKFLOW
   1. Register once
   2. Verify email once
   3. Return to the gallery at any time
   4. Enter the registered email
   5. PostgreSQL checks verification and cooldown
   6. Upload 1–2 photos
   7. Photos publish immediately
   8. Next upload available after 24 hours

   IMPORTANT:
   Email-only uploads do not prove email ownership.
   This is the access policy selected for this gallery.
========================================================= */

const MAX_BATCH_PHOTOS = 2
const MAX_BATCH_BYTES = 15 * 1024 * 1024
const MAX_CAPTION_LENGTH = 1000
const MAX_NAME_LENGTH = 150
const COOLDOWN_MS = 24 * 60 * 60 * 1000

/* =========================================================
   JSON RESPONSES
========================================================= */

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods':
      'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-admin-token, x-customer-token',
    'X-Content-Type-Options': 'nosniff',
  })

  res.end(JSON.stringify(data))
  return true
}

function jsonError(res, message, status = 400, details = null) {
  return jsonResponse(
    res,
    {
      success: false,
      error: message,
      message,
      ...(details ? { details } : {}),
    },
    status
  )
}

function badRequestMessage(error) {
  return error instanceof Error
    ? error.message
    : 'Invalid upload request.'
}

function isPayloadError(error) {
  return Boolean(error?.isPayloadError)
}

function payloadError(message) {
  const error = new Error(message)
  error.isPayloadError = true
  return error
}

/* =========================================================
   MULTIPART AND JSON PARSING
========================================================= */

function readRequestBuffer(req, limit = MAX_BATCH_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let totalBytes = 0
    let settled = false

    const declaredLength = Number(
      req.headers['content-length'] || 0
    )

    if (declaredLength > limit) {
      reject(
        payloadError(
          'Upload exceeds the maximum 15 MB request size.'
        )
      )

      req.resume()
      return
    }

    req.on('data', chunk => {
      if (settled) return

      totalBytes += chunk.length

      if (totalBytes > limit) {
        settled = true
        chunks.length = 0

        reject(
          payloadError(
            'Upload exceeds the maximum 15 MB request size.'
          )
        )

        req.resume()
        return
      }

      chunks.push(chunk)
    })

    req.on('end', () => {
      if (settled) return

      settled = true
      resolve(Buffer.concat(chunks))
    })

    req.on('error', error => {
      if (settled) return

      settled = true
      reject(error)
    })

    req.on('aborted', () => {
      if (settled) return

      settled = true
      reject(payloadError('Upload request was interrupted.'))
    })
  })
}

function parseJsonPayload(buffer) {
  let parsed

  try {
    parsed = JSON.parse(buffer.toString('utf8'))
  } catch {
    throw payloadError('Invalid JSON request body.')
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    throw payloadError('JSON request must be an object.')
  }

  const photos = []

  if (parsed.photos !== undefined) {
    if (!Array.isArray(parsed.photos)) {
      throw payloadError('Photos must be an array.')
    }

    if (parsed.photos.length > MAX_BATCH_PHOTOS) {
      throw payloadError(
        'You can upload a maximum of 2 photos.'
      )
    }

    for (const photo of parsed.photos) {
      if (
        !photo ||
        typeof photo.data !== 'string'
      ) {
        throw payloadError('Invalid photo data.')
      }

      const encoded = photo.data.replace(
        /^data:[^;]+;base64,/i,
        ''
      )

      if (
        !encoded ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) ||
        encoded.length % 4 === 1
      ) {
        throw payloadError('Invalid base64 photo data.')
      }

      photos.push({
        filename: String(photo.name || 'upload.jpg'),
        buffer: Buffer.from(encoded, 'base64'),
      })
    }
  }

  return {
    fields: {
      name: String(parsed.name || ''),
      email: String(parsed.email || ''),
      caption: String(parsed.caption || ''),
    },
    photos,
  }
}

function parseMultipartPayload(buffer, contentType) {
  const boundaryMatch = contentType.match(
    /boundary=(?:"([^"]+)"|([^;\s]+))/i
  )

  const boundary =
    boundaryMatch?.[1] || boundaryMatch?.[2]

  if (!boundary) {
    throw payloadError('Missing multipart boundary.')
  }

  const delimiter = Buffer.from(`--${boundary}`)
  const headerSeparator = Buffer.from('\r\n\r\n')

  const fields = {}
  const photos = []

  let cursor = buffer.indexOf(delimiter)

  if (cursor < 0) {
    throw payloadError('Invalid multipart upload body.')
  }

  while (cursor >= 0) {
    const partStart = cursor + delimiter.length

    if (
      buffer.subarray(partStart, partStart + 2).toString() ===
      '--'
    ) {
      break
    }

    if (
      buffer.subarray(partStart, partStart + 2).toString() !==
      '\r\n'
    ) {
      throw payloadError('Malformed multipart boundary.')
    }

    const headerStart = partStart + 2
    const nextBoundary = buffer.indexOf(
      delimiter,
      headerStart
    )

    if (nextBoundary < 0) {
      throw payloadError('Incomplete multipart upload.')
    }

    const partEnd = nextBoundary - 2

    if (
      partEnd < headerStart ||
      buffer.subarray(partEnd, nextBoundary).toString() !==
        '\r\n'
    ) {
      throw payloadError('Malformed multipart upload.')
    }

    const headerEnd = buffer.indexOf(
      headerSeparator,
      headerStart
    )

    if (
      headerEnd < 0 ||
      headerEnd >= partEnd
    ) {
      throw payloadError('Malformed multipart headers.')
    }

    const headerText = buffer
      .subarray(headerStart, headerEnd)
      .toString('utf8')

    const bodyBuffer = buffer.subarray(
      headerEnd + headerSeparator.length,
      partEnd
    )

    const nameMatch = headerText.match(
      /(?:^|;)\s*name="([^"]+)"/i
    )

    const filenameMatch = headerText.match(
      /(?:^|;)\s*filename="([^"]*)"/i
    )

    const fieldName = nameMatch?.[1] || ''

    if (filenameMatch) {
      if (bodyBuffer.length > 0) {
        photos.push({
          filename: filenameMatch[1] || 'upload.jpg',
          buffer: bodyBuffer,
        })

        if (photos.length > MAX_BATCH_PHOTOS) {
          throw payloadError(
            'You can upload a maximum of 2 photos.'
          )
        }
      }
    } else if (
      fieldName === 'name' ||
      fieldName === 'email' ||
      fieldName === 'caption'
    ) {
      if (bodyBuffer.length > 4096) {
        throw payloadError(
          'A gallery text field is too large.'
        )
      }

      fields[fieldName] = bodyBuffer
        .toString('utf8')
        .trim()
    }

    cursor = nextBoundary
  }

  return {
    fields,
    photos,
  }
}

async function parseUploadPayload(req) {
  const contentType = String(
    req.headers['content-type'] || ''
  ).toLowerCase()

  const buffer = await readRequestBuffer(req)

  if (contentType.includes('application/json')) {
    return parseJsonPayload(buffer)
  }

  if (contentType.includes('multipart/form-data')) {
    return parseMultipartPayload(buffer, contentType)
  }

  throw payloadError(
    'Unsupported upload format. Use multipart/form-data or application/json.'
  )
}

/* =========================================================
   PHOTO SERIALIZATION
========================================================= */

function photoImageUrl(row) {
  return (
    row.image_url ||
    `/api/gallery/image/${encodeURIComponent(row.image_key)}`
  )
}

function serializePublicPhoto(row) {
  const imageUrl = photoImageUrl(row)

  return {
    id: String(row.id),
    user: row.user_name || 'Zen Guest',
    caption: row.caption || '',
    imageUrl,
    image_url: imageUrl,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : new Date().toISOString(),
    likes: 0,
  }
}

/* =========================================================
   CUSTOMER EMAIL LOOKUP
========================================================= */

async function findVerifiedCustomer(client, email) {
  const result = await client.query(
    `SELECT
       id,
       name,
       email,
       role,
       email_verified_at,
       is_active
     FROM public.users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  )

  return result.rows[0] || null
}

async function getGalleryAccess(client, userId) {
  const result = await client.query(
    `SELECT
       eligible_at,
       max_uploads
     FROM public.gallery_access
     WHERE user_id = $1
     FOR UPDATE`,
    [userId]
  )

  return result.rows[0] || null
}

function getCooldownRemaining(eligibleAt) {
  if (!eligibleAt) return 0

  const timestamp = new Date(eligibleAt).getTime()

  if (!Number.isFinite(timestamp)) return 0

  return Math.max(0, timestamp - Date.now())
}

/* =========================================================
   UPLOAD VALIDATION
========================================================= */

function validateUploadFields(fields, photos) {
  const email = normalizeEmail(fields.email)
  const name = String(fields.name || '').trim()
  const caption = String(fields.caption || '').trim()

  if (!isValidEmail(email)) {
    throw payloadError(
      'Please enter a valid registered email address.'
    )
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw payloadError(
      'Customer name is too long.'
    )
  }

  if (caption.length > MAX_CAPTION_LENGTH) {
    throw payloadError(
      'Caption must not exceed 1000 characters.'
    )
  }

  if (!Array.isArray(photos) || photos.length === 0) {
    throw payloadError(
      'Please select at least one photo.'
    )
  }

  if (photos.length > MAX_BATCH_PHOTOS) {
    throw payloadError(
      'Maximum 2 photos are allowed per upload.'
    )
  }

  const validatedPhotos = []

  for (const photo of photos) {
    if (
      !Buffer.isBuffer(photo.buffer) ||
      photo.buffer.length === 0
    ) {
      throw payloadError(
        'An uploaded photo is empty or invalid.'
      )
    }

    if (
      Number.isFinite(MAX_IMAGE_SIZE_BYTES) &&
      photo.buffer.length > MAX_IMAGE_SIZE_BYTES
    ) {
      throw payloadError(
        'One of the photos exceeds the allowed image size.'
      )
    }

    let validation

    try {
      validation = validateImageBuffer(photo.buffer)
    } catch (error) {
      throw payloadError(
        `Image validation failed: ${badRequestMessage(error)}`
      )
    }

    validatedPhotos.push({
      buffer: photo.buffer,
      ext: validation.ext,
      mime: validation.mime,
    })
  }

  return {
    email,
    name,
    caption,
    photos: validatedPhotos,
  }
}

/* =========================================================
   R2 CLEANUP AFTER FAILED DATABASE TRANSACTION
========================================================= */

async function cleanupUploadedObjects(keys) {
  for (const key of keys) {
    try {
      await deleteObjectFromR2(key)
    } catch (error) {
      console.error(
        '[Zen Café Gallery] R2 cleanup failed:',
        key,
        error
      )
    }
  }
}

/* =========================================================
   MAIN GALLERY ROUTE HANDLER
========================================================= */

export async function handleGalleryRoute(
  req,
  res,
  parsedUrl
) {
  const pathname = parsedUrl.pathname
  const method = req.method

  /* =======================================================
     1. PUBLIC GALLERY
     GET /api/gallery/public
  ======================================================= */

  if (
    pathname === '/api/gallery/public' &&
    method === 'GET'
  ) {
    try {
      const pool = await getDbPool()

      const result = await pool.query(
        `SELECT
           g.id,
           g.title,
           g.description AS caption,
           g.image_url,
           g.image_key,
           g.created_at,
           COALESCE(u.name, g.title, 'Zen Guest')
             AS user_name
         FROM public.gallery g
         LEFT JOIN public.users u
           ON u.id = g.uploaded_by
         WHERE g.status = 'approved'
         ORDER BY g.created_at DESC
         LIMIT 50`
      )

      return jsonResponse(res, {
        success: true,
        count: result.rows.length,
        photos: result.rows.map(serializePublicPhoto),
      })
    } catch (error) {
      console.error(
        '[Zen Café Gallery] Public photos error:',
        error
      )

      return jsonError(
        res,
        'Failed to load community gallery photos.',
        500
      )
    }
  }

  /* =======================================================
     2. CHECK REGISTERED EMAIL
     POST /api/gallery/check-email

     No customer session is required.
     Email must exist and be verified in PostgreSQL.
  ======================================================= */

  if (
    pathname === '/api/gallery/check-email' &&
    method === 'POST'
  ) {
    try {
      const payload = await parseUploadPayload(req)

      const result = await handleGalleryCheckEmail(
        req,
        res,
        payload.fields
      )

      return jsonResponse(
        res,
        result.body,
        result.status
      )
    } catch (error) {
      if (isPayloadError(error)) {
        return jsonError(
          res,
          badRequestMessage(error),
          400
        )
      }

      console.error(
        '[Zen Café Gallery] Email check error:',
        error
      )

      return jsonError(
        res,
        'Failed to check gallery eligibility.',
        500
      )
    }
  }

  /* =======================================================
     3. CUSTOMER PHOTO UPLOAD
     POST /api/gallery/upload

     Registered email only.
     No Bearer token or customer session required.

     PostgreSQL row lock serializes uploads for
     the same customer across API processes.

     A successful batch publishes immediately
     and starts one 24-hour cooldown.
  ======================================================= */

  if (
    pathname === '/api/gallery/upload' &&
    method === 'POST'
  ) {
    let client = null
    let transactionOpen = false
    let committed = false

    const uploadedObjectKeys = []

    try {
      const payload = await parseUploadPayload(req)

      const validated = validateUploadFields(
        payload.fields,
        payload.photos
      )

      const pool = await getDbPool()
      client = await pool.connect()

      await client.query('BEGIN')
      transactionOpen = true

      // Lock the customer record so simultaneous uploads
      // for the same email cannot both pass cooldown checks.
      const customerResult = await client.query(
        `SELECT
           id,
           name,
           email,
           role,
           email_verified_at,
           is_active
         FROM public.users
         WHERE LOWER(email) = LOWER($1)
         FOR UPDATE`,
        [validated.email]
      )

      if (customerResult.rows.length === 0) {
        await client.query('ROLLBACK')
        transactionOpen = false

        return jsonError(
          res,
          'This email is not registered. Please register and verify your email first.',
          403
        )
      }

      const customer = customerResult.rows[0]

      if (
        customer.role !== 'customer' ||
        !customer.is_active
      ) {
        await client.query('ROLLBACK')
        transactionOpen = false

        return jsonError(
          res,
          'This customer account is not eligible for gallery uploads.',
          403
        )
      }

      if (!customer.email_verified_at) {
        await client.query('ROLLBACK')
        transactionOpen = false

        return jsonError(
          res,
          'Your email has not been verified. Please complete email verification first.',
          403
        )
      }

      // Ensure an access record exists for verified customers.
      // Initial eligible_at = NOW() means immediate access.
      await client.query(
        `INSERT INTO public.gallery_access
           (
             user_id,
             eligible_at,
             max_uploads,
             created_at
           )
         VALUES ($1, NOW(), 2, NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [customer.id]
      )

      const access = await getGalleryAccess(
        client,
        customer.id
      )

      const cooldownRemaining = getCooldownRemaining(
        access?.eligible_at
      )

      if (cooldownRemaining > 0) {
        const nextUploadAt = new Date(
          access.eligible_at
        ).toISOString()

        await client.query('ROLLBACK')
        transactionOpen = false

        return jsonError(
          res,
          `24-hour upload cooldown is active. You can upload again after ${nextUploadAt}.`,
          429,
          {
            nextUploadAt,
            remainingMs: cooldownRemaining,
          }
        )
      }

      const allowedPhotos = Math.min(
        MAX_BATCH_PHOTOS,
        Number(access?.max_uploads || MAX_BATCH_PHOTOS)
      )

      if (
        validated.photos.length > allowedPhotos
      ) {
        await client.query('ROLLBACK')
        transactionOpen = false

        return jsonError(
          res,
          `You can upload a maximum of ${allowedPhotos} photos.`,
          400
        )
      }

      const createdPhotos = []

      for (const photo of validated.photos) {
        const storageKey = generateStorageKey(
          photo.ext
        )

        // Track the key before upload so a partial R2
        // failure can still be cleaned up.
        uploadedObjectKeys.push(storageKey)

        const storedObject = await putObjectToR2({
          key: storageKey,
          buffer: photo.buffer,
          contentType: photo.mime,
        })

        const insertResult = await client.query(
          `INSERT INTO public.gallery
             (
               uploaded_by,
               title,
               description,
               image_key,
               image_url,
               status,
               created_at
             )
           VALUES
             ($1, $2, $3, $4, $5, 'approved', NOW())
           RETURNING
             id,
             title,
             description,
             image_key,
             image_url,
             status,
             created_at`,
          [
            customer.id,
            customer.name || validated.name || 'Zen Guest',
            validated.caption,
            storageKey,
            storedObject?.url || null,
          ]
        )

        createdPhotos.push(insertResult.rows[0])
      }

      // Only after all photos have been successfully
      // stored and inserted do we start the cooldown.
      const nextEligibleAt = new Date(
        Date.now() + COOLDOWN_MS
      )

      await client.query(
        `UPDATE public.gallery_access
         SET eligible_at = $2
         WHERE user_id = $1`,
        [
          customer.id,
          nextEligibleAt,
        ]
      )

      await client.query('COMMIT')

      transactionOpen = false
      committed = true

      return jsonResponse(
        res,
        {
          success: true,
          message:
            'Photos uploaded successfully! Your photos are now visible in the Community Gallery.',
          count: createdPhotos.length,
          uploadedCount: createdPhotos.length,
          status: 'approved',
          nextUploadAt: nextEligibleAt.toISOString(),
          photos: createdPhotos.map(photo => ({
            id: String(photo.id),
            title: photo.title,
            caption: photo.description || '',
            imageUrl: photoImageUrl(photo),
            image_url: photoImageUrl(photo),
            image_key: photo.image_key,
            status: photo.status,
          })),
        },
        201
      )
    } catch (error) {
      if (transactionOpen && client) {
        await client.query('ROLLBACK').catch(
          rollbackError => {
            console.error(
              '[Zen Café Gallery] Rollback failed:',
              rollbackError
            )
          }
        )
      }

      if (!committed && uploadedObjectKeys.length > 0) {
        await cleanupUploadedObjects(
          uploadedObjectKeys
        )
      }

      if (isPayloadError(error)) {
        return jsonError(
          res,
          badRequestMessage(error),
          400
        )
      }

      console.error(
        '[Zen Café Gallery] Upload error:',
        error
      )

      return jsonError(
        res,
        'Unable to upload photos. Please try again.',
        500
      )
    } finally {
      if (client) {
        client.release()
      }
    }
  }

  /* =======================================================
     4. ADMIN — LIST GALLERY PHOTOS
     GET /api/gallery/admin/photos
  ======================================================= */

  if (
    pathname === '/api/gallery/admin/photos' &&
    method === 'GET'
  ) {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(
        res,
        'Admin authentication required.',
        401
      )
    }

    try {
      const pool = await getDbPool()

      const statusFilter =
        parsedUrl.searchParams.get('status') || 'all'

      const parameters = []

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
        LEFT JOIN public.users u
          ON u.id = g.uploaded_by
      `

      if (statusFilter !== 'all') {
        parameters.push(statusFilter)
        query += ` WHERE g.status = $1`
      }

      query += `
        ORDER BY g.created_at DESC
        LIMIT 100
      `

      const result = await pool.query(
        query,
        parameters
      )

      return jsonResponse(res, {
        success: true,
        count: result.rows.length,
        photos: result.rows.map(row => ({
          id: String(row.id),
          title: row.title,
          description: row.description,
          imageUrl: photoImageUrl(row),
          image_url: photoImageUrl(row),
          status: row.status,
          createdAt: row.created_at
            ? new Date(row.created_at).toISOString()
            : null,
          customerName:
            row.customer_name || 'Zen Guest',
          customerEmail:
            row.customer_email || '—',
          customerPhone:
            row.customer_phone || '—',
        })),
      })
    } catch (error) {
      console.error(
        '[Zen Café Gallery] Admin list error:',
        error
      )

      return jsonError(
        res,
        'Failed to load gallery photos.',
        500
      )
    }
  }

  /* =======================================================
     5. ADMIN — APPROVE PHOTO
  ======================================================= */

  const approveMatch = pathname.match(
    /^\/api\/gallery\/admin\/photos\/(\d+)\/approve$/
  )

  if (approveMatch && method === 'POST') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(
        res,
        'Admin authentication required.',
        401
      )
    }

    try {
      const pool = await getDbPool()

      const result = await pool.query(
        `UPDATE public.gallery
         SET status = 'approved'
         WHERE id = $1
         RETURNING *`,
        [approveMatch[1]]
      )

      if (result.rows.length === 0) {
        return jsonError(
          res,
          'Photo not found.',
          404
        )
      }

      return jsonResponse(res, {
        success: true,
        message:
          'Photo approved and published.',
        data: result.rows[0],
      })
    } catch (error) {
      console.error(
        '[Zen Café Gallery] Approve error:',
        error
      )

      return jsonError(
        res,
        'Failed to approve photo.',
        500
      )
    }
  }

  /* =======================================================
     6. ADMIN — REJECT PHOTO
  ======================================================= */

  const rejectMatch = pathname.match(
    /^\/api\/gallery\/admin\/photos\/(\d+)\/reject$/
  )

  if (rejectMatch && method === 'POST') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(
        res,
        'Admin authentication required.',
        401
      )
    }

    try {
      const pool = await getDbPool()

      const result = await pool.query(
        `UPDATE public.gallery
         SET status = 'rejected'
         WHERE id = $1
         RETURNING *`,
        [rejectMatch[1]]
      )

      if (result.rows.length === 0) {
        return jsonError(
          res,
          'Photo not found.',
          404
        )
      }

      return jsonResponse(res, {
        success: true,
        message: 'Photo rejected.',
        data: result.rows[0],
      })
    } catch (error) {
      console.error(
        '[Zen Café Gallery] Reject error:',
        error
      )

      return jsonError(
        res,
        'Failed to reject photo.',
        500
      )
    }
  }

  /* =======================================================
     7. ADMIN — DELETE PHOTO
  ======================================================= */

  const deleteMatch = pathname.match(
    /^\/api\/gallery\/admin\/photos\/(\d+)$/
  )

  if (deleteMatch && method === 'DELETE') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(
        res,
        'Admin authentication required.',
        401
      )
    }

    try {
      const pool = await getDbPool()

      const result = await pool.query(
        `SELECT image_key
         FROM public.gallery
         WHERE id = $1`,
        [deleteMatch[1]]
      )

      if (result.rows.length === 0) {
        return jsonError(
          res,
          'Photo not found.',
          404
        )
      }

      const imageKey = result.rows[0].image_key

      // Preserve the existing behavior:
      // delete R2 object first, then PostgreSQL record.
      await deleteObjectFromR2(imageKey)

      await pool.query(
        `DELETE FROM public.gallery
         WHERE id = $1`,
        [deleteMatch[1]]
      )

      return jsonResponse(res, {
        success: true,
        message: 'Photo deleted permanently.',
      })
    } catch (error) {
      console.error(
        '[Zen Café Gallery] Delete error:',
        error
      )

      return jsonError(
        res,
        'Failed to delete photo.',
        500
      )
    }
  }

  /* =======================================================
     8. SERVE GALLERY IMAGE
     GET /api/gallery/image/:key

     Approved images are public.
     Non-approved images remain protected.
  ======================================================= */

  const imageMatch = pathname.match(
    /^\/api\/gallery\/image\/(.+)$/
  )

  if (imageMatch && method === 'GET') {
    let imageKey

    try {
      imageKey = decodeURIComponent(
        imageMatch[1]
      )
    } catch {
      return jsonError(
        res,
        'Invalid image key.',
        400
      )
    }

    try {
      const pool = await getDbPool()

      const result = await pool.query(
        `SELECT
           status,
           uploaded_by
         FROM public.gallery
         WHERE image_key = $1`,
        [imageKey]
      )

      if (result.rows.length === 0) {
        return jsonError(
          res,
          'Image not found.',
          404
        )
      }

      const photo = result.rows[0]

      if (photo.status !== 'approved') {
        const isAdmin = await verifyAdminRequest(req)

        let isUploader = false

        if (!isAdmin) {
          const token = extractCustomerToken(req)

          if (token) {
            const session = await getCustomerSession(
              token
            )

            isUploader = Boolean(
              session &&
              String(session.userId) ===
                String(photo.uploaded_by)
            )
          }
        }

        if (!isAdmin && !isUploader) {
          return jsonError(
            res,
            'This image is not publicly available.',
            403
          )
        }
      }

      const object = await getObjectFromR2(
        imageKey
      )

      if (!object || !object.buffer) {
        return jsonError(
          res,
          'Image not found in storage.',
          404
        )
      }

      res.writeHead(200, {
        'Content-Type':
          object.contentType || 'image/jpeg',
        'Content-Length':
          object.buffer.length,
        'Cache-Control':
          photo.status === 'approved'
            ? 'public, max-age=86400'
            : 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })

      res.end(object.buffer)

      return true
    } catch (error) {
      console.error(
        '[Zen Café Gallery] Image error:',
        error
      )

      return jsonError(
        res,
        'Failed to load gallery image.',
        500
      )
    }
  }

  return false
}
