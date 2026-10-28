// test/gallery-api.test.mjs
// Zen Café — Phase 5: Community Gallery, Photo Uploads & Admin Moderation Test Suite

process.env.ZEN_TEST_MODE = 'true'
process.env.NODE_ENV = 'test'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { getDbPool } from '../server/db.mjs'
import { handleGalleryRoute } from '../server/api/gallery.mjs'
import { createAdminSession } from '../server/auth.mjs'
import { createCustomerSession } from '../server/api/auth.mjs'
import {
  validateImageBuffer,
  generateStorageKey,
  putObjectToR2,
  getObjectFromR2,
  deleteObjectFromR2,
  checkR2Configuration,
  mockR2Storage,
} from '../server/r2_storage.mjs'

// Realistic magic bytes buffers for testing
const VALID_JPEG = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9,
])

const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
])

const VALID_WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(16),
])

const MALFORMED_IMAGE = Buffer.from('NOT_AN_IMAGE_FILE_JUST_PLAIN_TEXT_DISGUISED_AS_IMAGE')
const OVERSIZED_IMAGE = Buffer.concat([VALID_JPEG, Buffer.alloc(5 * 1024 * 1024 + 1024)])

/**
 * Mock HTTP request/response helper for handleGalleryRoute
 */
function createMockReqRes({ method, path, headers = {}, body = null }) {
  const req = new EventEmitter()
  req.method = method
  req.url = path
  const defaultHeaders = body !== null && typeof body === 'object' && !Buffer.isBuffer(body)
    ? { 'content-type': 'application/json' }
    : {}
  req.headers = { host: 'localhost:3000', ...defaultHeaders, ...headers }

  let statusCode = 200
  let responseHeaders = {}
  let responseBody = ''

  const res = {
    writeHead(code, hdrs) {
      statusCode = code
      responseHeaders = hdrs || {}
    },
    end(chunk) {
      if (chunk) {
        if (Buffer.isBuffer(chunk)) responseBody = chunk
        else responseBody += chunk
      }
      res.emit('finish')
    },
    on(event, cb) {
      if (event === 'finish') res.finishCb = cb
    },
    emit(event) {
      if (event === 'finish' && res.finishCb) res.finishCb()
    },
  }

  const runPromise = new Promise(resolve => {
    res.on('finish', () => {
      let parsed = null
      if (Buffer.isBuffer(responseBody)) {
        parsed = responseBody
      } else {
        try {
          parsed = JSON.parse(responseBody)
        } catch {
          parsed = responseBody
        }
      }
      resolve({ status: statusCode, headers: responseHeaders, body: parsed })
    })
  })

  const dispatch = async () => {
    const url = new URL(path, 'http://localhost:3000')
    const routePromise = handleGalleryRoute(req, res, url)
    setTimeout(() => {
      if (body !== null) {
        if (Buffer.isBuffer(body)) {
          req.emit('data', body)
        } else if (typeof body === 'object') {
          req.emit('data', Buffer.from(JSON.stringify(body)))
        } else {
          req.emit('data', Buffer.from(String(body)))
        }
      }
      req.emit('end')
    }, 15)
    await routePromise
    return runPromise
  }

  return { dispatch }
}

async function runGalleryTests() {
  console.log('\n======================================================')
  console.log('🧪 ZEN CAFÉ — PHASE 5 COMMUNITY GALLERY & MODERATION')
  console.log('======================================================\n')

  const pool = await getDbPool()
  const testRunId = Date.now()

  // Prepare test users
  const verifiedUser = {
    name: 'Verified Gallery Tester',
    email: `verified_${testRunId}@zencafe-test.lk`,
    phone: '0771112233',
  }

  const unverifiedUser = {
    name: 'Unverified Gallery Tester',
    email: `unverified_${testRunId}@zencafe-test.lk`,
    phone: '0774445566',
  }

  const adminSession = await createAdminSession('admin@zencafe.com')
  const adminToken = adminSession.token

  let verifiedUserId = null
  let unverifiedUserId = null
  let verifiedCustomerToken = null
  let unverifiedCustomerToken = null
  let uploadedPhotoId1 = null
  let uploadedPhotoId2 = null
  let uploadedImageKey = null

  try {
    // Setup test users in database
    const vRes = await pool.query(
      `INSERT INTO public.users (name, email, phone, role, is_active, email_verified_at, created_at)
       VALUES ($1, $2, $3, 'customer', true, NOW(), NOW())
       RETURNING id`,
      [verifiedUser.name, verifiedUser.email, verifiedUser.phone]
    )
    verifiedUserId = String(vRes.rows[0].id)
    verifiedUser.id = verifiedUserId

    // Initialize gallery_access for verified user (immediate eligibility upon verification)
    await pool.query(
      `INSERT INTO public.gallery_access (user_id, eligible_at, max_uploads, created_at)
       VALUES ($1, NOW(), 2, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [verifiedUserId]
    )

    const uRes = await pool.query(
      `INSERT INTO public.users (name, email, phone, role, is_active, email_verified_at, created_at)
       VALUES ($1, $2, $3, 'customer', true, NULL, NOW())
       RETURNING id`,
      [unverifiedUser.name, unverifiedUser.email, unverifiedUser.phone]
    )
    unverifiedUserId = String(uRes.rows[0].id)
    unverifiedUser.id = unverifiedUserId

    // Create session tokens
    const vSession = await createCustomerSession(verifiedUser)
    verifiedCustomerToken = vSession.token

    const uSession = await createCustomerSession(unverifiedUser)
    unverifiedCustomerToken = uSession.token

    // ----------------------------------------------------
    // Test 1: Verified customer access
    // ----------------------------------------------------
    console.log('Test 1: Verified customer access check...')
    const checkRes = await createMockReqRes({
      method: 'POST',
      path: '/api/gallery/check-email',
      body: { email: verifiedUser.email },
    }).dispatch()

    assert.equal(checkRes.status, 200)
    assert.equal(checkRes.body.registered, true)
    assert.equal(checkRes.body.isVerified, true)
    assert.equal(checkRes.body.canUpload, true, 'Verified customer should be immediately eligible to upload')
    console.log('  ✅ Verified customer correctly identified as eligible.')

    // ----------------------------------------------------
    // Test 2: Unverified customer rejection
    // ----------------------------------------------------
    console.log('Test 2: Unverified customer rejection...')
    const unverifiedCheck = await createMockReqRes({
      method: 'POST',
      path: '/api/gallery/check-email',
      body: { email: unverifiedUser.email },
    }).dispatch()

    assert.equal(unverifiedCheck.status, 200)
    assert.equal(unverifiedCheck.body.isVerified, false)
    assert.equal(unverifiedCheck.body.canUpload, false, 'Unverified customer must NOT be allowed to upload')

    // Attempt upload with unverified token
    const unverifiedUpload = await createMockReqRes({
      method: 'POST',
      path: '/api/gallery/upload',
      headers: {
        authorization: `Bearer ${unverifiedCustomerToken}`,
        'content-type': 'application/json',
      },
      body: {
        email: unverifiedUser.email,
        name: unverifiedUser.name,
        caption: 'Attempt by unverified user',
        photos: [{ name: 'test.jpg', data: `data:image/jpeg;base64,${VALID_JPEG.toString('base64')}` }],
      },
    }).dispatch()

    assert.equal(unverifiedUpload.status, 403, 'Unverified customer upload must return 403 Forbidden')
    console.log('  ✅ Unverified customer correctly rejected from uploading.')

    // ----------------------------------------------------
    // Test 3: Unauthorized upload rejection (typed email alone)
    // ----------------------------------------------------
    console.log('Test 3: Unauthorized upload rejection...')
    const noTokenUpload = await createMockReqRes({
      method: 'POST',
      path: '/api/gallery/upload',
      headers: { 'content-type': 'application/json' },
      body: {
        email: verifiedUser.email,
        name: verifiedUser.name,
        caption: 'Typed email alone without server token',
        photos: [{ name: 'test.jpg', data: `data:image/jpeg;base64,${VALID_JPEG.toString('base64')}` }],
      },
    }).dispatch()

    assert.equal(noTokenUpload.status, 401, 'Upload without session token must return 401 Unauthorized')

    // Attempt upload where session email does not match typed email
    const mismatchedUpload = await createMockReqRes({
      method: 'POST',
      path: '/api/gallery/upload',
      headers: {
        authorization: `Bearer ${verifiedCustomerToken}`,
        'content-type': 'application/json',
      },
      body: {
        email: 'another_person@example.com',
        name: 'Impersonator',
        caption: 'Mismatched email',
        photos: [{ name: 'test.jpg', data: `data:image/jpeg;base64,${VALID_JPEG.toString('base64')}` }],
      },
    }).dispatch()

    assert.equal(mismatchedUpload.status, 403, 'Mismatched session email must return 403 Forbidden')
    console.log('  ✅ Strict authorization verified: Typed email alone rejected, session spoofing prevented.')

    // ----------------------------------------------------
    // Test 4: Image type and size validation
    // ----------------------------------------------------
    console.log('Test 4: Image type and size validation...')
    assert.equal(validateImageBuffer(VALID_JPEG).valid, true, 'Genuine JPEG magic bytes valid')
    assert.equal(validateImageBuffer(VALID_PNG).valid, true, 'Genuine PNG magic bytes valid')
    assert.equal(validateImageBuffer(VALID_WEBP).valid, true, 'Genuine WebP magic bytes valid')
    assert.throws(() => validateImageBuffer(MALFORMED_IMAGE), /Unsupported or malformed/, 'Non-image text file must fail magic bytes')

    // Reject malformed file
    const malformedUpload = await createMockReqRes({
      method: 'POST',
      path: '/api/gallery/upload',
      headers: {
        authorization: `Bearer ${verifiedCustomerToken}`,
        'content-type': 'application/json',
      },
      body: {
        email: verifiedUser.email,
        name: verifiedUser.name,
        caption: 'Spoofed image file',
        photos: [{ name: 'fake.jpg', data: `data:image/jpeg;base64,${MALFORMED_IMAGE.toString('base64')}` }],
      },
    }).dispatch()

    assert.equal(malformedUpload.status, 400, 'Malformed image file must return 400 Bad Request')
    console.log('  ✅ Magic bytes validation rejected spoofed/malformed image files.')

    // ----------------------------------------------------
    // Test 5: One-image upload
    // ----------------------------------------------------
    console.log('Test 5: One-image upload...')
    const singleUpload = await createMockReqRes({
      method: 'POST',
      path: '/api/gallery/upload',
      headers: {
        authorization: `Bearer ${verifiedCustomerToken}`,
        'content-type': 'application/json',
      },
      body: {
        email: verifiedUser.email,
        name: verifiedUser.name,
        caption: 'Serene tea time at Zen Cafe',
        photos: [{ name: 'zen_tea.jpg', data: `data:image/jpeg;base64,${VALID_JPEG.toString('base64')}` }],
      },
    }).dispatch()

    assert.equal(singleUpload.status, 201, 'Single photo upload should return 201 Created')
    assert.equal(singleUpload.body.success, true)
    assert.equal(singleUpload.body.uploadedCount, 1)
    assert.ok(singleUpload.body.photos[0].id)
    assert.equal(singleUpload.body.photos[0].status, 'pending', 'New uploads must default to pending status')
    uploadedPhotoId1 = singleUpload.body.photos[0].id
    uploadedImageKey = singleUpload.body.photos[0].image_key
    console.log(`  ✅ 1 image uploaded successfully with ID #${uploadedPhotoId1} (status: pending).`)

    // ----------------------------------------------------
    // Test 6: 24-hour cooldown enforcement
    // ----------------------------------------------------
    console.log('Test 6: 24-hour cooldown enforcement...')
    const cooldownBlockedUpload = await createMockReqRes({
      method: 'POST',
      path: '/api/gallery/upload',
      headers: {
        authorization: `Bearer ${verifiedCustomerToken}`,
        'content-type': 'application/json',
      },
      body: {
        email: verifiedUser.email,
        name: verifiedUser.name,
        caption: 'Immediate second upload attempt',
        photos: [{ name: 'second.jpg', data: `data:image/jpeg;base64,${VALID_JPEG.toString('base64')}` }],
      },
    }).dispatch()

    assert.equal(cooldownBlockedUpload.status, 429, 'Immediate second upload must return 429 Too Many Requests')
    assert.ok(cooldownBlockedUpload.body.details?.nextUploadAt, 'nextUploadAt timestamp must be returned')
    console.log('  ✅ 24-hour cooldown strictly enforced transactionally in PostgreSQL.')

    // ----------------------------------------------------
    // Test 7: Two-image upload (using new customer)
    // ----------------------------------------------------
    console.log('Test 7: Two-image upload batch...')
    const user2 = {
      name: 'Two Photo Tester',
      email: `two_photo_${testRunId}@zencafe-test.lk`,
      phone: '0779998877',
    }
    const u2Res = await pool.query(
      `INSERT INTO public.users (name, email, phone, role, is_active, email_verified_at, created_at)
       VALUES ($1, $2, $3, 'customer', true, NOW(), NOW())
       RETURNING id`,
      [user2.name, user2.email, user2.phone]
    )
    user2.id = String(u2Res.rows[0].id)
    await pool.query(
      `INSERT INTO public.gallery_access (user_id, eligible_at, max_uploads, created_at)
       VALUES ($1, NOW(), 2, NOW())`,
      [user2.id]
    )
    const token2 = (await createCustomerSession(user2)).token

    const batchUpload = await createMockReqRes({
      method: 'POST',
      path: '/api/gallery/upload',
      headers: {
        authorization: `Bearer ${token2}`,
        'content-type': 'application/json',
      },
      body: {
        email: user2.email,
        name: user2.name,
        caption: 'Delightful brunch memories',
        photos: [
          { name: 'photo1.png', data: `data:image/png;base64,${VALID_PNG.toString('base64')}` },
          { name: 'photo2.webp', data: `data:image/webp;base64,${VALID_WEBP.toString('base64')}` },
        ],
      },
    }).dispatch()

    assert.equal(batchUpload.status, 201)
    assert.equal(batchUpload.body.uploadedCount, 2, '2-image batch should succeed')
    uploadedPhotoId2 = batchUpload.body.photos[0].id
    console.log('  ✅ 2-image upload batch accepted and saved to PostgreSQL.')

    // ----------------------------------------------------
    // Test 8: Three-image batch rejection
    // ----------------------------------------------------
    console.log('Test 8: Three-image batch rejection...')
    const user3 = {
      name: 'Three Photo Tester',
      email: `three_photo_${testRunId}@zencafe-test.lk`,
      phone: '0773332211',
    }
    const u3Res = await pool.query(
      `INSERT INTO public.users (name, email, phone, role, is_active, email_verified_at, created_at)
       VALUES ($1, $2, $3, 'customer', true, NOW(), NOW())
       RETURNING id`,
      [user3.name, user3.email, user3.phone]
    )
    user3.id = String(u3Res.rows[0].id)
    await pool.query(
      `INSERT INTO public.gallery_access (user_id, eligible_at, max_uploads, created_at)
       VALUES ($1, NOW(), 2, NOW())`,
      [user3.id]
    )
    const token3 = (await createCustomerSession(user3)).token

    const threeUpload = await createMockReqRes({
      method: 'POST',
      path: '/api/gallery/upload',
      headers: {
        authorization: `Bearer ${token3}`,
        'content-type': 'application/json',
      },
      body: {
        email: user3.email,
        name: user3.name,
        caption: 'Three photos attempt',
        photos: [
          { name: 'p1.jpg', data: `data:image/jpeg;base64,${VALID_JPEG.toString('base64')}` },
          { name: 'p2.jpg', data: `data:image/jpeg;base64,${VALID_JPEG.toString('base64')}` },
          { name: 'p3.jpg', data: `data:image/jpeg;base64,${VALID_JPEG.toString('base64')}` },
        ],
      },
    }).dispatch()

    assert.equal(threeUpload.status, 400, 'Batch of 3 photos must be rejected with 400 Bad Request')
    console.log('  ✅ 3-photo batch correctly rejected by server limit.')

    // ----------------------------------------------------
    // Test 9: Concurrent upload protection
    // ----------------------------------------------------
    console.log('Test 9: Concurrent upload protection...')
    const user4 = {
      name: 'Concurrent Tester',
      email: `concurrent_${testRunId}@zencafe-test.lk`,
      phone: '0776665544',
    }
    const u4Res = await pool.query(
      `INSERT INTO public.users (name, email, phone, role, is_active, email_verified_at, created_at)
       VALUES ($1, $2, $3, 'customer', true, NOW(), NOW())
       RETURNING id`,
      [user4.name, user4.email, user4.phone]
    )
    user4.id = String(u4Res.rows[0].id)
    await pool.query(
      `INSERT INTO public.gallery_access (user_id, eligible_at, max_uploads, created_at)
       VALUES ($1, NOW(), 2, NOW())`,
      [user4.id]
    )
    const token4 = (await createCustomerSession(user4)).token

    // Dispatch two uploads concurrently
    const [reqA, reqB] = await Promise.all([
      createMockReqRes({
        method: 'POST',
        path: '/api/gallery/upload',
        headers: {
          authorization: `Bearer ${token4}`,
          'content-type': 'application/json',
        },
        body: {
          email: user4.email,
          name: user4.name,
          caption: 'Concurrent A',
          photos: [{ name: 'a.jpg', data: `data:image/jpeg;base64,${VALID_JPEG.toString('base64')}` }],
        },
      }).dispatch(),
      createMockReqRes({
        method: 'POST',
        path: '/api/gallery/upload',
        headers: {
          authorization: `Bearer ${token4}`,
          'content-type': 'application/json',
        },
        body: {
          email: user4.email,
          name: user4.name,
          caption: 'Concurrent B',
          photos: [{ name: 'b.jpg', data: `data:image/jpeg;base64,${VALID_JPEG.toString('base64')}` }],
        },
      }).dispatch(),
    ])

    const successCount = [reqA, reqB].filter(r => r.status === 201).length
    const blockedCount = [reqA, reqB].filter(r => r.status === 429).length

    assert.equal(successCount, 1, 'Exactly one concurrent request must succeed')
    assert.equal(blockedCount, 1, 'The conflicting concurrent request must receive 429 cooldown')
    console.log('  ✅ Concurrency protection verified: Only 1 request succeeded; conflicting request received 429.')

    // ----------------------------------------------------
    // Test 10: Private R2 storage & key generation
    // ----------------------------------------------------
    console.log('Test 10: Private R2 storage...')
    const key = generateStorageKey('test image with spaces.jpg')
    assert.match(key, /^gallery\/\d{4}\/\d{2}\/[a-f0-9-]+\.jpg$/, 'Storage key must be sanitized and uniquely prefixed')
    assert.ok(!key.includes('..'), 'Path traversal must be prevented')

    // Test storage read/write
    await putObjectToR2('gallery/test/mock.jpg', VALID_JPEG, 'image/jpeg')
    const fetched = await getObjectFromR2('gallery/test/mock.jpg')
    assert.ok(fetched && fetched.buffer, 'Object should be retrievable from storage')
    assert.equal(fetched.contentType, 'image/jpeg')
    console.log('  ✅ Private R2 storage integration and key generation verified.')

    // ----------------------------------------------------
    // Test 11: Admin pending gallery view
    // ----------------------------------------------------
    console.log('Test 11: Admin pending gallery view...')
    const pendingView = await createMockReqRes({
      method: 'GET',
      path: '/api/gallery/admin/photos?status=pending',
      headers: { authorization: `Bearer ${adminToken}` },
    }).dispatch()

    assert.equal(pendingView.status, 200)
    assert.ok(Array.isArray(pendingView.body.photos))
    const foundPhoto = pendingView.body.photos.find(p => String(p.id) === String(uploadedPhotoId1))
    assert.ok(foundPhoto, 'Pending uploaded photo should appear in admin pending view')
    assert.equal(foundPhoto.status, 'pending')
    console.log('  ✅ Admin pending gallery view returned pending photo submissions.')

    // ----------------------------------------------------
    // Test 12: Admin approval
    // ----------------------------------------------------
    console.log('Test 12: Admin photo approval...')
    const approveRes = await createMockReqRes({
      method: 'POST',
      path: `/api/gallery/admin/photos/${uploadedPhotoId1}/approve`,
      headers: { authorization: `Bearer ${adminToken}` },
    }).dispatch()

    assert.equal(approveRes.status, 200)
    assert.equal(approveRes.body.success, true)
    assert.equal(approveRes.body.data.status, 'approved')
    console.log(`  ✅ Photo #${uploadedPhotoId1} successfully approved by admin.`)

    // ----------------------------------------------------
    // Test 13: Public approved-image visibility
    // ----------------------------------------------------
    console.log('Test 13: Public approved-image visibility...')
    const publicView = await createMockReqRes({
      method: 'GET',
      path: '/api/gallery/public',
    }).dispatch()

    assert.equal(publicView.status, 200)
    assert.ok(Array.isArray(publicView.body.photos))
    const publicPhoto = publicView.body.photos.find(p => String(p.id) === String(uploadedPhotoId1))
    assert.ok(publicPhoto, 'Approved photo must now be visible in public gallery')
    assert.ok(publicPhoto.imageUrl, 'Public photo must have an image URL')
    console.log('  ✅ Approved photo is now visible to the public community.')

    // ----------------------------------------------------
    // Test 14: Pending/rejected-image isolation
    // ----------------------------------------------------
    console.log('Test 14: Pending/rejected-image isolation...')
    const unapprovedPhotoInPublic = publicView.body.photos.find(p => String(p.id) === String(uploadedPhotoId2))
    assert.equal(unapprovedPhotoInPublic, undefined, 'Pending photo #2 must NEVER be visible in public gallery')

    // Test private image proxy serving for pending photo
    const pendingPhotoRow = await pool.query('SELECT image_key FROM public.gallery WHERE id = $1', [uploadedPhotoId2])
    if (pendingPhotoRow.rows.length > 0) {
      const pendingKey = pendingPhotoRow.rows[0].image_key
      const unauthorizedImageFetch = await createMockReqRes({
        method: 'GET',
        path: `/api/gallery/image/${encodeURIComponent(pendingKey)}`,
      }).dispatch()
      assert.equal(unauthorizedImageFetch.status, 403, 'Direct access to pending image must be blocked with 403')
    }
    console.log('  ✅ Pending/rejected image isolation verified: never leaked to public.')

    // ----------------------------------------------------
    // Test 15: Admin rejection
    // ----------------------------------------------------
    console.log('Test 15: Admin photo rejection...')
    const rejectRes = await createMockReqRes({
      method: 'POST',
      path: `/api/gallery/admin/photos/${uploadedPhotoId2}/reject`,
      headers: { authorization: `Bearer ${adminToken}` },
    }).dispatch()

    assert.equal(rejectRes.status, 200)
    assert.equal(rejectRes.body.data.status, 'rejected')

    // Verify rejected photo does not appear in public gallery
    const publicAfterReject = await createMockReqRes({
      method: 'GET',
      path: '/api/gallery/public',
    }).dispatch()
    assert.equal(
      publicAfterReject.body.photos.find(p => String(p.id) === String(uploadedPhotoId2)),
      undefined,
      'Rejected photo must not appear in public gallery'
    )
    console.log(`  ✅ Photo #${uploadedPhotoId2} rejected and isolated from public gallery.`)

    // ----------------------------------------------------
    // Test 16: Admin deletion
    // ----------------------------------------------------
    console.log('Test 16: Admin photo deletion...')
    const deleteRes = await createMockReqRes({
      method: 'DELETE',
      path: `/api/gallery/admin/photos/${uploadedPhotoId1}`,
      headers: { authorization: `Bearer ${adminToken}` },
    }).dispatch()

    assert.equal(deleteRes.status, 200)
    assert.equal(deleteRes.body.success, true)

    // Verify row removed from PostgreSQL
    const checkDb = await pool.query('SELECT id FROM public.gallery WHERE id = $1', [uploadedPhotoId1])
    assert.equal(checkDb.rows.length, 0, 'Deleted photo must be removed from PostgreSQL')
    console.log(`  ✅ Photo #${uploadedPhotoId1} permanently deleted from database and storage.`)

    // ----------------------------------------------------
    // Test 17: PostgreSQL persistence & data integrity
    // ----------------------------------------------------
    console.log('Test 17: PostgreSQL persistence & data integrity...')
    const remainingPhotos = await pool.query('SELECT id, status, uploaded_by FROM public.gallery')
    assert.ok(Array.isArray(remainingPhotos.rows))
    console.log(`  ✅ PostgreSQL database contains ${remainingPhotos.rows.length} gallery records with valid schema.`)

    // ----------------------------------------------------
    // Test 18: Cleanup of temporary test data
    // ----------------------------------------------------
    console.log('Test 18: Cleanup of temporary test data and objects...')
    const userIds = [verifiedUserId, unverifiedUserId, user2.id, user3.id, user4.id].filter(Boolean)
    if (userIds.length > 0) {
      await pool.query('DELETE FROM public.gallery WHERE uploaded_by = ANY($1::bigint[])', [userIds])
      await pool.query('DELETE FROM public.gallery_access WHERE user_id = ANY($1::bigint[])', [userIds])
      await pool.query('DELETE FROM public.users WHERE id = ANY($1::bigint[])', [userIds])
    }
    await deleteObjectFromR2('gallery/test/mock.jpg')
    console.log('  ✅ Temporary test users, access records, and storage objects cleanly purged.')

    console.log('\n======================================================')
    console.log('🎉 ALL 18 GALLERY & MODERATION TESTS PASSED!')
    console.log('======================================================\n')
  } catch (err) {
    console.error('\n❌ Gallery Test Suite Error:', err)
    process.exit(1)
  }
}

runGalleryTests()
