import http from 'node:http'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const TEST_PORT = 3088
const BASE_URL = `http://localhost:${TEST_PORT}`

async function request(url, options = {}, body = null) {
  const parsed = new URL(url)
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      res => {
        let data = ''
        res.on('data', chunk => (data += chunk))
        res.on('end', () => {
          let parsedData = null
          try {
            parsedData = JSON.parse(data)
          } catch {
            parsedData = data
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsedData })
        })
      }
    )
    req.on('error', reject)
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body))
    }
    req.end()
  })
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now()
  let lastRes = null
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await request(`${BASE_URL}/api/health`)
      lastRes = res
      if (res.status === 200 && res.body && res.body.ok === true) return true
    } catch {
      // Retry in 200ms
    }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`Server failed to start or DB failed within ${timeoutMs}ms. Last response: ${JSON.stringify(lastRes)}`)
}

async function run() {
  console.log('\n======================================================')
  console.log('🌐 ZEN CAFÉ — SELF-STARTING HTTP SERVER INTEGRATION TEST')
  console.log('======================================================\n')

  let serverProcess = null

  try {
    // 1. Start server process
    console.log(`Starting isolated test server on port ${TEST_PORT}...`)
    serverProcess = spawn(
      process.execPath,
      [path.join(projectRoot, 'server.mjs')],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          PORT: String(TEST_PORT),
          ZEN_TEST_MODE: 'true', // Allow in-memory fallback explicitly for tests
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )

    serverProcess.stdout.on('data', () => {})
    serverProcess.stderr.on('data', () => {})

    await waitForServer()
    console.log('✅ Test server is healthy and accepting connections.\n')

    // 2. Health check
    console.log('Step 1: Checking /api/health...')
    const health = await request(`${BASE_URL}/api/health`)
    assert.equal(health.status, 200)
    assert.equal(health.body.ok, true)
    console.log('  ✅ /api/health returned 200 OK.\n')

    // 3. Admin login endpoint
    console.log('Step 2: Admin Login (POST /api/admin/login)...')
    const badLogin = await request(
      `${BASE_URL}/api/admin/login`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'admin@zencafe.com', password: 'WrongPassword' }
    )
    assert.equal(badLogin.status, 401, 'Bad credentials should return 401')

    const loginRes = await request(
      `${BASE_URL}/api/admin/login`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'admin@zencafe.com', password: 'Admin@123' }
    )
    assert.equal(loginRes.status, 200, 'Valid login should return 200')
    assert.ok(loginRes.body.token, 'Must return session token')
    const sessionToken = loginRes.body.token
    console.log('  ✅ Server-side login issued session token:', sessionToken.slice(0, 12) + '...\n')

    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    }

    // 4. Verify admin check endpoint
    console.log('Step 3: Checking session validity (GET /api/admin/check)...')
    const checkRes = await request(`${BASE_URL}/api/admin/check`, {
      headers: adminHeaders,
    })
    assert.equal(checkRes.status, 200)
    assert.equal(checkRes.body.authenticated, true)
    console.log('  ✅ Session verified as active and valid.\n')

    // 5. Public read products
    console.log('Step 4: Public read available products...')
    const listRes = await request(`${BASE_URL}/api/products`)
    assert.equal(listRes.status, 200)
    assert.ok(Array.isArray(listRes.body.data))
    console.log(`  ✅ Public products count: ${listRes.body.data.length}\n`)

    // 6. Security: Reject unauthenticated mutations
    console.log('Step 5: Security check - Reject unauthenticated mutations...')
    const unauthedPost = await request(
      `${BASE_URL}/api/products`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { name: 'Unauthorized item', kind: 'food', category: 'Wraps' }
    )
    assert.equal(unauthedPost.status, 401, 'Must reject mutation without auth')
    console.log('  ✅ Unauthenticated POST rejected with 401.\n')

    // 7. Authorized POST product
    console.log('Step 6: Authorized Product Creation (POST /api/products)...')
    const createRes = await request(
      `${BASE_URL}/api/products`,
      { method: 'POST', headers: adminHeaders },
      {
        name: 'Zen Caramel Golden Milk',
        kind: 'drink',
        category: 'Hot Drinks',
        price: 780,
        description: 'Turmeric, steamed milk, and caramel drizzle.',
        serving: 'Hot ceramic cup',
        dairyType: 'milk',
      }
    )
    assert.equal(createRes.status, 201)
    assert.ok(createRes.body.data.id, 'Must return product id')
    assert.equal(createRes.body.data.price, 780)
    const createdId = createRes.body.data.id
    console.log(`  ✅ Product created over HTTP with session token (id: ${createdId}).\n`)

    // 8. Verify customer sees newly created product
    console.log('Step 7: Customer verification...')
    const customerList = await request(`${BASE_URL}/api/products?kind=drink`)
    const foundItem = customerList.body.data.find(i => i.id === createdId)
    assert.ok(foundItem, 'New product must be visible to customer')
    assert.equal(foundItem.price, 780)
    console.log(`  ✅ Customer sees item: "${foundItem.name}" at LKR ${foundItem.price}\n`)

    // 9. Authorized PUT product
    console.log('Step 8: Authorized Product Edit (PUT /api/products/:id)...')
    const updateRes = await request(
      `${BASE_URL}/api/products/${createdId}`,
      { method: 'PUT', headers: adminHeaders },
      { price: 820 }
    )
    assert.equal(updateRes.status, 200)
    assert.equal(updateRes.body.data.price, 820)
    console.log('  ✅ Product updated over HTTP. New price: LKR 820\n')

    // 10. Authorized DELETE product
    console.log('Step 9: Authorized Product Delete (DELETE /api/products/:id)...')
    const deleteRes = await request(
      `${BASE_URL}/api/products/${createdId}`,
      { method: 'DELETE', headers: adminHeaders }
    )
    assert.equal(deleteRes.status, 200)
    console.log('  ✅ Product deleted successfully.\n')

    // 10.1 Offers HTTP Lifecycle Test
    console.log('Step 9b: Authorized Offers HTTP Lifecycle (POST, GET, PUT, DELETE /api/offers)...')
    const offerCreateRes = await request(
      `${BASE_URL}/api/offers`,
      { method: 'POST', headers: adminHeaders },
      {
        title: 'Zen HTTP Matcha Promo',
        discountType: 'percentage',
        discountValue: 15,
        code: 'ZENHTTP15',
        active: true,
      }
    )
    assert.equal(offerCreateRes.status, 201)
    const offerId = offerCreateRes.body.data.id

    const pubOffers = await request(`${BASE_URL}/api/offers`)
    assert.equal(pubOffers.status, 200)
    assert.ok(pubOffers.body.data.some(o => o.id === offerId))

    const offerUpdateRes = await request(
      `${BASE_URL}/api/offers/${offerId}`,
      { method: 'PUT', headers: adminHeaders },
      { discountValue: 20 }
    )
    assert.equal(offerUpdateRes.status, 200)
    assert.equal(offerUpdateRes.body.data.discountValue, 20)

    const offerDelRes = await request(
      `${BASE_URL}/api/offers/${offerId}`,
      { method: 'DELETE', headers: adminHeaders }
    )
    assert.equal(offerDelRes.status, 200)
    console.log('  ✅ Offers HTTP lifecycle (POST, GET, PUT, DELETE) verified.\n')

    // 10.2 Bookings HTTP Lifecycle Test
    console.log('Step 9c: Bookings & Availability HTTP Lifecycle...')
    const bookingCreateRes = await request(
      `${BASE_URL}/api/bookings`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      {
        customerName: 'Integration Tester',
        phone: '0771239999',
        email: 'tester@zencafe.com',
        bookingDate: '2026-11-25',
        bookingTime: '15:00',
        duration: 2,
        guests: 8,
        occasion: 'Team Dinner',
        roomName: 'Private Dining Room',
      }
    )
    assert.equal(bookingCreateRes.status, 201, 'Booking creation should return 201')
    assert.equal(bookingCreateRes.body.data.status, 'pending')
    const bookingId = bookingCreateRes.body.data.id

    // Admin accepts
    const bookingAcceptRes = await request(
      `${BASE_URL}/api/bookings/${bookingId}/accept`,
      { method: 'POST', headers: adminHeaders }
    )
    assert.equal(bookingAcceptRes.status, 200)
    assert.equal(bookingAcceptRes.body.data.status, 'confirmed')

    // Overlapping booking rejected
    const overlapRes = await request(
      `${BASE_URL}/api/bookings`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      {
        customerName: 'Competing Tester',
        phone: '0771112222',
        bookingDate: '2026-11-25',
        bookingTime: '16:00', // overlaps 15:00 - 17:00
        duration: 2,
        roomName: 'Private Dining Room',
      }
    )
    assert.equal(overlapRes.status, 409, 'Overlapping booking should return 409')

    // Admin creates block
    const blockRes = await request(
      `${BASE_URL}/api/bookings/blocks`,
      { method: 'POST', headers: adminHeaders },
      {
        roomName: 'Private Dining Room',
        blockDate: '2026-11-26',
        startTime: '10:00',
        endTime: '12:00',
        reason: 'Maintenance',
      }
    )
    assert.equal(blockRes.status, 201)
    const blockId = blockRes.body.data.id

    // Admin deletes block
    const delBlockRes = await request(
      `${BASE_URL}/api/bookings/blocks/${blockId}`,
      { method: 'DELETE', headers: adminHeaders }
    )
    assert.equal(delBlockRes.status, 200)

    // Admin rejects booking with reason
    const rejectRes = await request(
      `${BASE_URL}/api/bookings/${bookingId}/reject`,
      { method: 'POST', headers: adminHeaders },
      { reason: 'Test complete' }
    )
    assert.equal(rejectRes.status, 200)
    assert.equal(rejectRes.body.data.status, 'rejected')

    // Cleanup delete booking
    const delBookingRes = await request(
      `${BASE_URL}/api/bookings/${bookingId}`,
      { method: 'DELETE', headers: adminHeaders }
    )
    assert.equal(delBookingRes.status, 200)
    console.log('  ✅ Bookings & availability HTTP lifecycle verified.\n')

    // Step 9d: Customer Registration & Email Verification HTTP Lifecycle
    console.log('Step 9d: Customer Registration & Email Verification HTTP Lifecycle...')
    const httpCustEmail = `http_cust_${Date.now()}@zen.lk`
    const regHttpRes = await request(
      `${BASE_URL}/api/auth/register`,
      { method: 'POST' },
      { name: 'HTTP Test Customer', email: httpCustEmail, phone: '0778889999' }
    )
    assert.equal(regHttpRes.status, 201)
    assert.equal(regHttpRes.body.success, true)
    assert.ok(regHttpRes.body.delivery?.devVerificationUrl)

    const httpTokenMatch = regHttpRes.body.delivery.devVerificationUrl.match(/verify=([^&]+)/)
    assert.ok(httpTokenMatch)
    const httpRawToken = decodeURIComponent(httpTokenMatch[1])

    // Verify token over HTTP
    const verifyHttpRes = await request(
      `${BASE_URL}/api/auth/verify?token=${encodeURIComponent(httpRawToken)}`,
      { method: 'GET' }
    )
    assert.equal(verifyHttpRes.status, 200)
    assert.equal(verifyHttpRes.body.success, true)
    assert.ok(verifyHttpRes.body.token)
    const custToken = verifyHttpRes.body.token

    // Customer Session Check (GET /api/auth/me)
    const meHttpRes = await request(
      `${BASE_URL}/api/auth/me`,
      { headers: { authorization: `Bearer ${custToken}` } }
    )
    assert.equal(meHttpRes.status, 200)
    assert.equal(meHttpRes.body.authenticated, true)
    assert.equal(meHttpRes.body.customer.email, httpCustEmail)

    // Gallery Check Email over HTTP
    const galleryHttpRes = await request(
      `${BASE_URL}/api/gallery/check-email`,
      { method: 'POST' },
      { email: httpCustEmail }
    )
    assert.equal(galleryHttpRes.status, 200)
    assert.equal(galleryHttpRes.body.registered, true)
    assert.equal(galleryHttpRes.body.isVerified, true)

    // Step 9e: Community Gallery Photo Upload & Admin Moderation HTTP Lifecycle
    console.log('Step 9e: Community Gallery Photo Upload & Moderation HTTP Lifecycle...')
    const uploadHttpRes = await request(
      `${BASE_URL}/api/gallery/upload`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${custToken}`,
          'content-type': 'application/json',
        },
      },
      {
        email: httpCustEmail,
        name: 'HTTP Test Customer',
        caption: 'A wonderful moment over HTTP',
        photos: [
          {
            name: 'moment.jpg',
            data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD//gA+Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcK',
          },
        ],
      }
    )
    assert.equal(uploadHttpRes.status, 201)
    assert.equal(uploadHttpRes.body.success, true)
    const uploadedPhotoId = uploadHttpRes.body.photos[0].id

    // Admin retrieves pending photos over HTTP
    const adminPhotosRes = await request(
      `${BASE_URL}/api/gallery/admin/photos?status=pending`,
      { method: 'GET', headers: adminHeaders }
    )
    assert.equal(adminPhotosRes.status, 200)
    assert.ok(adminPhotosRes.body.photos.some(p => String(p.id) === String(uploadedPhotoId)))

    // Admin approves photo over HTTP
    const approveHttpRes = await request(
      `${BASE_URL}/api/gallery/admin/photos/${uploadedPhotoId}/approve`,
      { method: 'POST', headers: adminHeaders }
    )
    assert.equal(approveHttpRes.status, 200)
    assert.equal(approveHttpRes.body.data.status, 'approved')

    // Public reads approved photos over HTTP
    const publicGalleryRes = await request(
      `${BASE_URL}/api/gallery/public`,
      { method: 'GET' }
    )
    assert.equal(publicGalleryRes.status, 200)
    assert.ok(publicGalleryRes.body.photos.some(p => String(p.id) === String(uploadedPhotoId)))

    // Admin deletes photo over HTTP
    const deleteHttpRes = await request(
      `${BASE_URL}/api/gallery/admin/photos/${uploadedPhotoId}`,
      { method: 'DELETE', headers: adminHeaders }
    )
    assert.equal(deleteHttpRes.status, 200)
    console.log('  ✅ Community Gallery HTTP upload, approval, public carousel, and deletion lifecycle verified.\n')

    // Customer Logout over HTTP
    const custLogoutRes = await request(
      `${BASE_URL}/api/auth/logout`,
      { method: 'POST', headers: { authorization: `Bearer ${custToken}` } }
    )
    assert.equal(custLogoutRes.status, 200)

    const postLogoutMe = await request(
      `${BASE_URL}/api/auth/me`,
      { headers: { authorization: `Bearer ${custToken}` } }
    )
    assert.equal(postLogoutMe.status, 401)
    console.log('  ✅ Customer registration, verification, session check, and gallery readiness verified over HTTP.\n')

    // 11. Admin logout & session revocation
    console.log('Step 10: Admin Logout & Session Revocation (POST /api/admin/logout)...')
    const logoutRes = await request(`${BASE_URL}/api/admin/logout`, {
      method: 'POST',
      headers: adminHeaders,
    })
    assert.equal(logoutRes.status, 200)

    // Verify revoked session is rejected
    const postLogoutCheck = await request(`${BASE_URL}/api/admin/check`, {
      headers: adminHeaders,
    })
    assert.equal(postLogoutCheck.status, 401, 'Revoked token must return 401')
    console.log('  ✅ Session revoked. Subsequent requests with old token are rejected (401).\n')

    console.log('======================================================')
    console.log('🎉 ALL SELF-CONTAINED HTTP INTEGRATION TESTS PASSED!')
    console.log('======================================================\n')
  } finally {
    if (serverProcess) {
      console.log('Shutting down isolated test server...')
      serverProcess.kill('SIGTERM')
      await new Promise(r => setTimeout(r, 600))
    }
  }
}

run().catch(err => {
  console.error('\n❌ Test failure:', err)
  process.exit(1)
})
