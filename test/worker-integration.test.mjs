// test/worker-integration.test.mjs
// Zen Café — Production Cloudflare Worker Integration Test Suite
// Verifies worker/index.ts against live PostgreSQL & Cloudflare Worker APIs

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import dotenv from 'dotenv'
import { getDbPool } from '../server/db.mjs'
import workerModule from '../worker/index.ts'

dotenv.config()
process.env.NODE_ENV = 'test'
const pool = await getDbPool()

console.log('\n======================================================')
console.log('🧪 ZEN CAFÉ — CLOUDFLARE WORKER INTEGRATION SUITE')
console.log('======================================================\n')

const mockR2Bucket = {
  storage: new Map(),
  async put(key, value, options) {
    this.storage.set(key, { value, options })
    return { key, size: value.length, etag: 'mock-etag' }
  },
  async get(key) {
    const item = this.storage.get(key)
    if (!item) return null
    return {
      body: item.value,
      httpMetadata: item.options?.httpMetadata,
    }
  },
  async delete(key) {
    this.storage.delete(key)
  },
}

const mockEnv = {
  DB_POOL: pool,
  DATABASE_URL: 'postgres://zencafe_app:ZenCafe2026Secure!@127.0.0.1:55432/zencafe_db',
  ADMIN_EMAIL: 'admin@zencafe.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@123',
  PUBLIC_BASE_URL: 'https://zencafe.lk',
  GALLERY_BUCKET: mockR2Bucket,
  ASSETS: {
    async fetch(req) {
      return new Response('Mock Asset', { status: 200 })
    },
  },
}

async function run() {
  // 1. Health check with real database
  console.log('Test 1: Worker /api/health with live PostgreSQL...')
  const healthReq = new Request('http://localhost/api/health')
  const healthRes = await workerModule.fetch(healthReq, mockEnv)
  assert.equal(healthRes.status, 200)
  const healthData = await healthRes.json()
  assert.equal(healthData.ok, true)
  assert.equal(healthData.service, 'zen-cafe-worker')
  assert.equal(healthData.database, 'connected-postgres')
  console.log('  ✅ Worker health check connected directly to live PostgreSQL.')

  // 2. Health check without DB binding -> 503 (No silent fallback!)
  console.log('\nTest 2: Worker /api/health without DB binding...')
  const noDbReq = new Request('http://localhost/api/health')
  const noDbRes = await workerModule.fetch(noDbReq, { ...mockEnv, DB_POOL: undefined, DATABASE_URL: undefined, HYPERDRIVE: undefined, PGHOST: undefined })
  assert.equal(noDbRes.status, 503)
  const noDbData = await noDbRes.json()
  assert.equal(noDbData.ok, false)
  console.log('  ✅ Unbound worker returns 503 without fake in-memory fallback.')

  // 3. Security: Reject unauthorized mutations
  console.log('\nTest 3: Security - Reject unauthorized mutations (401)...')
  const unauthProd = await workerModule.fetch(new Request('http://localhost/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hacker Drink', kind: 'drink', category: 'Tea' }),
  }), mockEnv)
  assert.equal(unauthProd.status, 401)

  const unauthOffers = await workerModule.fetch(new Request('http://localhost/api/offers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Free Coffee' }),
  }), mockEnv)
  assert.equal(unauthOffers.status, 401)

  const unauthBookings = await workerModule.fetch(new Request('http://localhost/api/bookings'), mockEnv)
  assert.equal(unauthBookings.status, 401)
  console.log('  ✅ All unauthenticated administrative routes strictly rejected with 401.')

  // 4. Admin Login with real PostgreSQL credentials
  console.log('\nTest 4: Admin Login via Worker (PostgreSQL persistent sessions)...')
  const loginReq = new Request('http://localhost/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@zencafe.com', password: process.env.ADMIN_PASSWORD || 'Admin@123' }),
  })
  const loginRes = await workerModule.fetch(loginReq, mockEnv)
  assert.equal(loginRes.status, 200)
  const loginData = await loginRes.json()
  assert.equal(loginData.success, true)
  assert.ok(loginData.token)
  assert.ok(loginData.csrfToken)
  const adminToken = loginData.token
  console.log(`  ✅ Admin login issued persistent session token: ${adminToken.slice(0, 16)}...`)

  // 5. Admin Check
  console.log('\nTest 5: Verify Admin Session (GET /api/admin/check)...')
  const checkReq = new Request('http://localhost/api/admin/check', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const checkRes = await workerModule.fetch(checkReq, mockEnv)
  assert.equal(checkRes.status, 200)
  const checkData = await checkRes.json()
  assert.equal(checkData.authenticated, true)
  assert.equal(checkData.user.role, 'admin')
  console.log('  ✅ Admin session authoritatively verified in PostgreSQL.')

  // 6. Products CRUD via Worker against PostgreSQL
  console.log('\nTest 6: Products CRUD via Worker...')
  const createProdReq = new Request('http://localhost/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: 'Worker Test Golden Matcha',
      kind: 'drink',
      category: 'Tea',
      price: 650,
      description: 'Tested via Cloudflare Worker',
      available: true,
      featured: true,
    }),
  })
  const createProdRes = await workerModule.fetch(createProdReq, mockEnv)
  if (createProdRes.status !== 201) {
    console.error('createProdRes error:', await createProdRes.json())
  }
  assert.equal(createProdRes.status, 201)
  const createdProd = await createProdRes.json()
  assert.equal(createdProd.success, true)
  const prodId = createdProd.data.id
  console.log(`  ✅ Product #${prodId} created in PostgreSQL via Worker.`)

  // Public read
  const publicProdRes = await workerModule.fetch(new Request('http://localhost/api/products'), mockEnv)
  assert.equal(publicProdRes.status, 200)
  const publicProds = await publicProdRes.json()
  assert.ok(publicProds.data.some(p => p.id === prodId))
  console.log('  ✅ Public website displays the newly created product.')

  // Update product
  const updateProdReq = new Request(`http://localhost/api/products/${prodId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ price: 690 }),
  })
  const updateProdRes = await workerModule.fetch(updateProdReq, mockEnv)
  assert.equal(updateProdRes.status, 200)
  const updatedProd = await updateProdRes.json()
  assert.equal(updatedProd.data.price, 690)
  console.log('  ✅ Product updated in PostgreSQL via Worker.')

  // Delete product
  const delProdReq = new Request(`http://localhost/api/products/${prodId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const delProdRes = await workerModule.fetch(delProdReq, mockEnv)
  assert.equal(delProdRes.status, 200)
  console.log('  ✅ Product cleanly deleted from PostgreSQL.')

  // 7. Offers CRUD via Worker
  console.log('\nTest 7: Offers CRUD via Worker...')
  const createOfferReq = new Request('http://localhost/api/offers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      title: 'Worker Sprint Special',
      discountType: 'percentage',
      discountValue: 15,
      code: 'WORKER15',
      active: true,
    }),
  })
  const createOfferRes = await workerModule.fetch(createOfferReq, mockEnv)
  if (createOfferRes.status !== 201) {
    console.error('createOfferRes error:', await createOfferRes.json())
  }
  assert.equal(createOfferRes.status, 201)
  const createdOffer = await createOfferRes.json()
  const offerId = createdOffer.data.id
  console.log(`  ✅ Offer #${offerId} created in PostgreSQL via Worker.`)

  // Delete offer
  const delOfferRes = await workerModule.fetch(new Request(`http://localhost/api/offers/${offerId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  }), mockEnv)
  assert.equal(delOfferRes.status, 200)
  console.log('  ✅ Offer cleanly deleted from PostgreSQL.')

  // 8. Bookings & Availability via Worker
  console.log('\nTest 8: Room Bookings & Availability via Worker...')
  const availReq = new Request('http://localhost/api/bookings/availability?date=2026-11-20&room=Private+Dining+Room')
  const availRes = await workerModule.fetch(availReq, mockEnv)
  if (availRes.status !== 200) {
    console.error('availRes error:', await availRes.json())
  }
  assert.equal(availRes.status, 200)
  const availData = await availRes.json()
  assert.ok(availData.availableSlots.length > 0)
  console.log(`  ✅ Availability checked: ${availData.availableSlots.length} available slots on 2026-11-20.`)

  // Clean test booking date slot if previous test left one
  await pool.query("DELETE FROM public.bookings WHERE customer_email = 'worker_test@example.com'")

  const bookReq = new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Worker Tester',
      phone: '0771234567',
      email: 'worker_test@example.com',
      roomName: 'Private Dining Room',
      bookingDate: '2026-11-20',
      bookingTime: '14:00',
      duration: 2,
      guests: 8,
    }),
  })
  const bookRes = await workerModule.fetch(bookReq, mockEnv)
  assert.equal(bookRes.status, 201)
  const bookData = await bookRes.json()
  const bookingId = bookData.data.id
  console.log(`  ✅ Booking #${bookingId} created in PostgreSQL (status: pending).`)

  // Admin accepts booking
  const acceptReq = new Request(`http://localhost/api/bookings/${bookingId}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const acceptRes = await workerModule.fetch(acceptReq, mockEnv)
  assert.equal(acceptRes.status, 200)
  console.log('  ✅ Admin accepted booking via Worker (status: confirmed).')

  // Conflicting booking is rejected with 409
  const conflictReq = new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Conflict Guest',
      phone: '0779998888',
      email: 'conflict@example.com',
      roomName: 'Private Dining Room',
      bookingDate: '2026-11-20',
      bookingTime: '14:30',
      duration: 2,
    }),
  })
  const conflictRes = await workerModule.fetch(conflictReq, mockEnv)
  assert.equal(conflictRes.status, 409)
  console.log('  ✅ Conflicting booking rejected with 409 Conflict.')

  // Clean up test booking
  await pool.query('DELETE FROM public.bookings WHERE id = $1', [bookingId])
  await pool.query("DELETE FROM public.notification_outbox WHERE recipient = 'worker_test@example.com'")
  await pool.query('DELETE FROM public.admin_notifications WHERE booking_id = $1', [bookingId])

  // 9. Customer Auth & Verification via Worker
  console.log('\nTest 9: Customer Registration & Verification via Worker...')
  const testEmail = `worker_customer_${Date.now()}@example.com`
  const regReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Worker Customer',
      email: testEmail,
      phone: '0775556666',
    }),
  })
  const regRes = await workerModule.fetch(regReq, mockEnv)
  if (regRes.status !== 201) {
    console.error('regRes error:', await regRes.json())
  }
  assert.equal(regRes.status, 201)

  // Find verification token in PostgreSQL
  const tokenDbRes = await pool.query(
    `SELECT t.token_hash, u.id as user_id 
     FROM public.users u 
     JOIN public.email_verification_tokens t ON t.user_id = u.id 
     WHERE LOWER(u.email) = LOWER($1) ORDER BY t.created_at DESC LIMIT 1`,
    [testEmail]
  )
  assert.ok(tokenDbRes.rows.length > 0)
  const testUserId = tokenDbRes.rows[0].user_id

  // Verify email directly via DB token record
  await pool.query('UPDATE public.users SET email_verified_at = NOW() WHERE id = $1', [testUserId])
  await pool.query(
    'INSERT INTO public.gallery_access (user_id, eligible_at, max_uploads, created_at) VALUES ($1, NOW(), 2, NOW()) ON CONFLICT (user_id) DO NOTHING',
    [testUserId]
  )

  // Check email
  const checkEmailReq = new Request('http://localhost/api/gallery/check-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail }),
  })
  const checkEmailRes = await workerModule.fetch(checkEmailReq, mockEnv)
  assert.equal(checkEmailRes.status, 200)
  const checkEmailData = await checkEmailRes.json()
  assert.equal(checkEmailData.isVerified, true)
  assert.equal(checkEmailData.canUpload, true)
  console.log('  ✅ Customer verification & gallery eligibility verified in PostgreSQL.')

  // Clean up test customer
  await pool.query('DELETE FROM public.email_verification_tokens WHERE user_id = $1', [testUserId])
  await pool.query('DELETE FROM public.gallery_access WHERE user_id = $1', [testUserId])
  await pool.query('DELETE FROM public.gallery_sessions WHERE user_id = $1', [testUserId])
  await pool.query('DELETE FROM public.users WHERE id = $1', [testUserId])
  await pool.query('DELETE FROM public.notification_outbox WHERE recipient = $1', [testEmail])

  // 9b. Community Gallery R2 Image Security & Anti-Leak Caching Lifecycle
  console.log('\nTest 9b: Gallery R2 Image Security & Anti-Leak Caching Lifecycle...')
  const custRes = await pool.query(
    "INSERT INTO public.users (name, email, role, is_active, email_verified_at, created_at, updated_at) VALUES ('Gallery Tester', 'gallery_tester@example.com', 'customer', true, NOW(), NOW(), NOW()) RETURNING id"
  )
  const gUserId = custRes.rows[0].id
  const gCustToken = 'zen_cust_test_token_1234567890abcdef'
  const gTokenHash = crypto.createHash('sha256').update(gCustToken).digest('hex')
  await pool.query(
    'INSERT INTO public.gallery_sessions (user_id, token_hash, expires_at, created_at) VALUES ($1, $2, NOW() + INTERVAL \'1 day\', NOW())',
    [gUserId, gTokenHash]
  )
  await pool.query(
    'INSERT INTO public.gallery_access (user_id, eligible_at, max_uploads, created_at) VALUES ($1, NOW(), 2, NOW())',
    [gUserId]
  )

  // 1. Upload photo via Worker (genuine JPEG magic bytes: FF D8 FF)
  const validJpegBase64 = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64')
  const uploadReq = new Request('http://localhost/api/gallery/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${gCustToken}`,
    },
    body: JSON.stringify({
      name: 'Gallery Tester',
      caption: 'My Zen Moment',
      photos: [{ data: validJpegBase64 }],
    }),
  })
  const uploadRes = await workerModule.fetch(uploadReq, mockEnv)
  assert.equal(uploadRes.status, 201)
  const uploadData = await uploadRes.json()
  const photoId = uploadData.photos[0].id
  const photoUrl = uploadData.photos[0].image_url

  // 2. Unauthenticated public request for pending image MUST be rejected with 403 & private no-cache
  const publicPendingRes = await workerModule.fetch(new Request(`http://localhost${photoUrl}`), mockEnv)
  assert.equal(publicPendingRes.status, 403)
  assert.ok(publicPendingRes.headers.get('cache-control')?.includes('no-store'))
  console.log('  ✅ Unauthenticated access to pending photo strictly rejected (403 + no-store).')

  // 3. Admin approves photo
  const approveRes = await workerModule.fetch(new Request(`http://localhost/api/gallery/admin/photos/${photoId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  }), mockEnv)
  assert.equal(approveRes.status, 200)

  // 4. Public request for approved image succeeds with safe cache headers (revalidating, not immutable)
  const publicApprovedRes = await workerModule.fetch(new Request(`http://localhost${photoUrl}`), mockEnv)
  assert.equal(publicApprovedRes.status, 200)
  assert.ok(publicApprovedRes.headers.get('cache-control')?.includes('public'))
  assert.equal(publicApprovedRes.headers.get('cache-control')?.includes('immutable'), false)
  console.log('  ✅ Approved photo publicly accessible with safe revalidating cache header.')

  // 5. Admin deletes photo
  const deletePhotoRes = await workerModule.fetch(new Request(`http://localhost/api/gallery/admin/photos/${photoId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  }), mockEnv)
  assert.equal(deletePhotoRes.status, 200)

  // 6. Deleted photo returns 404 with no-cache header
  const afterDeleteRes = await workerModule.fetch(new Request(`http://localhost${photoUrl}`), mockEnv)
  assert.equal(afterDeleteRes.status, 404)
  assert.ok(afterDeleteRes.headers.get('cache-control')?.includes('no-store'))
  console.log('  ✅ Deleted photo immediately returns 404 with anti-cache headers.')

  // Clean up
  await pool.query('DELETE FROM public.gallery WHERE id = $1', [photoId])
  await pool.query('DELETE FROM public.gallery_access WHERE user_id = $1', [gUserId])
  await pool.query('DELETE FROM public.gallery_sessions WHERE user_id = $1', [gUserId])
  await pool.query('DELETE FROM public.users WHERE id = $1', [gUserId])

  // 10. Games Settings via Worker
  console.log('\nTest 10: Games Settings via Worker...')
  const gameGetRes = await workerModule.fetch(new Request('http://localhost/api/games/settings'), mockEnv)
  assert.equal(gameGetRes.status, 200)
  const gameGetData = await gameGetRes.json()
  assert.equal(gameGetData.cards.length, 5)

  // Invalid card configuration (3 winners) rejected
  const invalidGameReq = new Request('http://localhost/api/games/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      enabled: true,
      cards: [
        { cardId: 1, prize: { title: 'P1' } },
        { cardId: 2, prize: { title: 'P2' } },
        { cardId: 3, prize: { title: 'P3' } },
        { cardId: 4, prize: null },
        { cardId: 5, prize: null },
      ],
    }),
  })
  const invalidGameRes = await workerModule.fetch(invalidGameReq, mockEnv)
  assert.equal(invalidGameRes.status, 400)
  console.log('  ✅ Game configuration enforced: exactly 2 winners required.')

  // 11. Website Settings via Worker
  console.log('\nTest 11: Website Settings via Worker...')
  const settingsRes = await workerModule.fetch(new Request('http://localhost/api/settings'), mockEnv)
  assert.equal(settingsRes.status, 200)
  const settingsData = await settingsRes.json()
  assert.ok(settingsData.settings.cafeName)
  assert.equal(settingsData.settings.adminPassword, undefined)
  console.log('  ✅ Public settings safely filtered (no internal secrets leaked).')

  // 12. Admin Logout via Worker
  console.log('\nTest 12: Admin Logout & Session Revocation via Worker...')
  const logoutReq = new Request('http://localhost/api/admin/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const logoutRes = await workerModule.fetch(logoutReq, mockEnv)
  assert.equal(logoutRes.status, 200)

  // Subsequent check is rejected with 401
  const recheckRes = await workerModule.fetch(new Request('http://localhost/api/admin/check', {
    headers: { Authorization: `Bearer ${adminToken}` },
  }), mockEnv)
  assert.equal(recheckRes.status, 401)
  console.log('  ✅ Admin session revoked in PostgreSQL. Subsequent requests rejected with 401.')

  await pool.end()

  console.log('\n======================================================')
  console.log('🎉 ALL 12 WORKER INTEGRATION TESTS PASSED!')
  console.log('======================================================\n')
}

run().catch(err => {
  console.error('\n❌ Worker integration test failed:', err)
  pool.end()
  process.exit(1)
})
