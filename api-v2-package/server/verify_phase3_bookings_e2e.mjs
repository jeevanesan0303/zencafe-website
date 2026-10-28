import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { getDbPool } from './db.mjs'
import { handleBookingsRoute } from './api/bookings.mjs'
import { createAdminSession } from './auth.mjs'

// Mock HTTP req/res helper for testing handleBookingsRoute directly
function createMockReqRes({ method, path, headers = {}, body = null }) {
  const req = new EventEmitter()
  req.method = method
  req.url = path
  req.headers = { host: 'localhost:3000', ...headers }

  let statusCode = 200
  let responseHeaders = {}
  let responseBody = ''

  const res = {
    writeHead(code, hdrs) {
      statusCode = code
      responseHeaders = hdrs
    },
    end(chunk) {
      if (chunk) responseBody += chunk
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
      try {
        parsed = JSON.parse(responseBody)
      } catch {
        parsed = responseBody
      }
      resolve({ status: statusCode, headers: responseHeaders, body: parsed })
    })
  })

  const dispatch = async () => {
    const url = new URL(path, 'http://localhost:3000')
    const routePromise = handleBookingsRoute(req, res, url)
    setTimeout(() => {
      if (body !== null) {
        req.emit('data', Buffer.from(JSON.stringify(body)))
      }
      req.emit('end')
    }, 20)
    await routePromise
    return runPromise
  }

  return { dispatch }
}

async function runE2E() {
  console.log('\n======================================================')
  console.log('🧪 ZEN CAFÉ — PHASE 3 LIVE POSTGRESQL E2E INTEGRATION')
  console.log('======================================================\n')

  const pool = await getDbPool()

  // Verify connection target
  const check = await pool.query('SELECT current_database() as db, current_user as u')
  console.log(`Connected to Database: ${check.rows[0].db}, User: ${check.rows[0].u}`)
  assert.equal(check.rows[0].db, 'zencafe_db', 'Must connect to zencafe_db')
  assert.equal(check.rows[0].u, 'zencafe_app', 'Must connect as zencafe_app')

  const session = await createAdminSession('admin@zencafe.com')
  const adminHeaders = {
    'Content-Type': 'application/json',
    authorization: `Bearer ${session.token}`,
    'x-admin-token': session.token,
  }
  const publicHeaders = { 'Content-Type': 'application/json' }

  const testPrefix = `E2E_${Date.now()}`
  const createdBookingIds = []
  const createdBlockIds = []

  try {
    // -----------------------------------------------------------------------
    // 1. Customer booking submission
    // -----------------------------------------------------------------------
    console.log('1. Customer booking submission...')
    const bookingRes = await createMockReqRes({
      method: 'POST',
      path: '/api/bookings',
      headers: publicHeaders,
      body: {
        customerName: `${testPrefix} Customer`,
        phone: '0771234567',
        email: 'customer@test.com',
        bookingDate: '2026-12-10',
        bookingTime: '18:00',
        duration: 2,
        guests: 6,
        occasion: 'Anniversary Dinner',
        notes: 'Window seat preferred',
        roomName: 'Private Dining Room',
      },
    }).dispatch()

    assert.equal(bookingRes.status, 201, 'Booking submission should return 201')
    assert.equal(bookingRes.body.success, true)
    const booking1 = bookingRes.body.data
    createdBookingIds.push(booking1.id)
    console.log(`   ✅ Booking created with ID ${booking1.id}`)

    // -----------------------------------------------------------------------
    // 2. Pending status verification in PostgreSQL
    // -----------------------------------------------------------------------
    console.log('2. Pending status verification...')
    const dbBooking1 = await pool.query('SELECT * FROM public.bookings WHERE id = $1', [booking1.id])
    assert.equal(dbBooking1.rows.length, 1)
    assert.equal(dbBooking1.rows[0].status, 'pending')
    assert.equal(dbBooking1.rows[0].room_name, 'Private Dining Room')
    assert.equal(dbBooking1.rows[0].customer_name, `${testPrefix} Customer`)
    console.log('   ✅ Initial status in PostgreSQL is strictly "pending"')

    // -----------------------------------------------------------------------
    // 3. Admin acceptance
    // -----------------------------------------------------------------------
    console.log('3. Admin acceptance...')
    const acceptRes = await createMockReqRes({
      method: 'POST',
      path: `/api/bookings/${booking1.id}/accept`,
      headers: adminHeaders,
    }).dispatch()

    assert.equal(acceptRes.status, 200, 'Accept booking should return 200')
    assert.equal(acceptRes.body.data.status, 'confirmed')

    const dbAccepted = await pool.query('SELECT status, reviewed_by FROM public.bookings WHERE id = $1', [booking1.id])
    assert.equal(dbAccepted.rows[0].status, 'confirmed')
    console.log('   ✅ Booking successfully confirmed in PostgreSQL')

    // -----------------------------------------------------------------------
    // 4. Overlapping booking prevention
    // -----------------------------------------------------------------------
    console.log('4. Overlapping booking prevention...')
    const overlapRes = await createMockReqRes({
      method: 'POST',
      path: '/api/bookings',
      headers: publicHeaders,
      body: {
        customerName: `${testPrefix} Overlap`,
        phone: '0779998888',
        email: 'overlap@test.com',
        bookingDate: '2026-12-10',
        bookingTime: '19:00', // Overlaps with 18:00 - 20:00
        duration: 2,
        guests: 4,
        roomName: 'Private Dining Room',
      },
    }).dispatch()

    assert.equal(overlapRes.status, 409, 'Overlapping booking must return 409 Conflict')
    console.log('   ✅ Overlapping booking rejected with 409 Conflict')

    // -----------------------------------------------------------------------
    // 5. Simultaneous acceptance protection (PostgreSQL advisory lock)
    // -----------------------------------------------------------------------
    console.log('5. Simultaneous acceptance protection (race condition test)...')
    // Create two conflicting pending bookings on a different date
    const race1 = await createMockReqRes({
      method: 'POST',
      path: '/api/bookings',
      headers: publicHeaders,
      body: {
        customerName: `${testPrefix} Race 1`,
        phone: '0771110001',
        bookingDate: '2026-12-12',
        bookingTime: '14:00',
        duration: 2,
        guests: 4,
        roomName: 'Private Dining Room',
      },
    }).dispatch()
    assert.equal(race1.status, 201)
    createdBookingIds.push(race1.body.data.id)

    const race2 = await createMockReqRes({
      method: 'POST',
      path: '/api/bookings',
      headers: publicHeaders,
      body: {
        customerName: `${testPrefix} Race 2`,
        phone: '0771110002',
        bookingDate: '2026-12-12',
        bookingTime: '15:00', // Overlaps with 14:00 - 16:00
        duration: 2,
        guests: 4,
        roomName: 'Private Dining Room',
      },
    }).dispatch()
    assert.equal(race2.status, 201)
    createdBookingIds.push(race2.body.data.id)

    const [result1, result2] = await Promise.all([
      createMockReqRes({
        method: 'POST',
        path: `/api/bookings/${race1.body.data.id}/accept`,
        headers: adminHeaders,
      }).dispatch(),
      createMockReqRes({
        method: 'POST',
        path: `/api/bookings/${race2.body.data.id}/accept`,
        headers: adminHeaders,
      }).dispatch(),
    ])

    console.log(`      Accept 1 status: ${result1.status}`, result1.status !== 200 ? result1.body : '')
    console.log(`      Accept 2 status: ${result2.status}`, result2.status !== 200 ? result2.body : '')

    const statuses = [result1.status, result2.status].sort()
    assert.deepEqual(statuses, [200, 409], 'Exactly one concurrent accept must succeed (200) and one must fail (409)')
    console.log('   ✅ Race condition verified: One acceptance succeeded (200), overlapping one rejected (409)')

    // -----------------------------------------------------------------------
    // 6. Admin rejection with reason
    // -----------------------------------------------------------------------
    console.log('6. Admin rejection with reason...')
    const rejectWithoutReason = await createMockReqRes({
      method: 'POST',
      path: `/api/bookings/${booking1.id}/reject`,
      headers: adminHeaders,
      body: { reason: '' },
    }).dispatch()
    assert.equal(rejectWithoutReason.status, 400, 'Rejection without reason should be 400')

    const rejectWithReason = await createMockReqRes({
      method: 'POST',
      path: `/api/bookings/${booking1.id}/reject`,
      headers: adminHeaders,
      body: { reason: 'Kitchen under emergency maintenance on that evening.' },
    }).dispatch()
    assert.equal(rejectWithReason.status, 200)
    assert.equal(rejectWithReason.body.data.status, 'rejected')

    const dbRejected = await pool.query('SELECT status, admin_reason FROM public.bookings WHERE id = $1', [booking1.id])
    assert.equal(dbRejected.rows[0].status, 'rejected')
    assert.equal(dbRejected.rows[0].admin_reason, 'Kitchen under emergency maintenance on that evening.')
    console.log('   ✅ Booking rejected with reason recorded in PostgreSQL')

    // -----------------------------------------------------------------------
    // 7. Modification proposal
    // -----------------------------------------------------------------------
    console.log('7. Modification proposal...')
    const modifyRes = await createMockReqRes({
      method: 'POST',
      path: `/api/bookings/${booking1.id}/modify`,
      headers: adminHeaders,
      body: {
        proposedDate: '2026-12-11',
        proposedStartTime: '19:00',
        duration: 2,
        reason: 'We can accommodate your party on Friday at 7 PM in the same room.',
      },
    }).dispatch()
    assert.equal(modifyRes.status, 200)
    assert.equal(modifyRes.body.data.status, 'modification_proposed')

    const dbModified = await pool.query('SELECT status, proposed_date, proposed_start_time, admin_reason FROM public.bookings WHERE id = $1', [booking1.id])
    assert.equal(dbModified.rows[0].status, 'modification_proposed')
    assert.equal(String(dbModified.rows[0].proposed_date).slice(0, 10), '2026-12-11')
    assert.equal(dbModified.rows[0].proposed_start_time.slice(0, 5), '19:00')
    console.log('   ✅ Modification proposal saved in PostgreSQL with proposed date & time')

    // -----------------------------------------------------------------------
    // 8. Manual slot blocking
    // -----------------------------------------------------------------------
    console.log('8. Manual slot blocking...')
    const blockRes = await createMockReqRes({
      method: 'POST',
      path: '/api/bookings/blocks',
      headers: adminHeaders,
      body: {
        roomName: 'Private Dining Room',
        blockDate: '2026-12-15',
        startTime: '12:00',
        endTime: '16:00',
        reason: 'VIP Private Tasting Event',
      },
    }).dispatch()
    assert.equal(blockRes.status, 201)
    const blockId = blockRes.body.data.id
    createdBlockIds.push(blockId)
    console.log(`   ✅ Manual block created with ID ${blockId}`)

    // -----------------------------------------------------------------------
    // 9. Manual unblocking
    // -----------------------------------------------------------------------
    console.log('9. Manual unblocking...')
    const unblockRes = await createMockReqRes({
      method: 'DELETE',
      path: `/api/bookings/blocks/${blockId}`,
      headers: adminHeaders,
    }).dispatch()
    assert.equal(unblockRes.status, 200)

    const checkBlock = await pool.query('SELECT * FROM public.booking_blocks WHERE id = $1', [blockId])
    assert.equal(checkBlock.rows.length, 0)
    console.log('   ✅ Manual block deleted from PostgreSQL')
    createdBlockIds.pop() // Removed

    // -----------------------------------------------------------------------
    // 10. Customer availability filtering
    // -----------------------------------------------------------------------
    console.log('10. Customer availability filtering...')
    // Re-create a block for 2026-12-20
    const block2 = await createMockReqRes({
      method: 'POST',
      path: '/api/bookings/blocks',
      headers: adminHeaders,
      body: {
        roomName: 'Private Dining Room',
        blockDate: '2026-12-20',
        startTime: '12:00',
        endTime: '15:00',
        reason: 'Maintenance',
      },
    }).dispatch()
    assert.equal(block2.status, 201)
    createdBlockIds.push(block2.body.data.id)

    const availRes = await createMockReqRes({
      method: 'GET',
      path: '/api/bookings/availability?date=2026-12-20&room=Private%20Dining%20Room',
    }).dispatch()
    assert.equal(availRes.status, 200)
    assert.ok(Array.isArray(availRes.body.availableSlots))
    // 12:00, 13:00, 14:00 should NOT be available
    assert.equal(availRes.body.availableSlots.includes('12:00'), false)
    assert.equal(availRes.body.availableSlots.includes('13:00'), false)
    assert.equal(availRes.body.availableSlots.includes('14:00'), false)
    // 16:00 should be available
    assert.equal(availRes.body.availableSlots.includes('16:00'), true)
    console.log('   ✅ Blocked intervals correctly excluded from public availability slots')

    // -----------------------------------------------------------------------
    // 11. Notification queue creation
    // -----------------------------------------------------------------------
    console.log('11. Notification queue creation...')
    const adminNotifs = await pool.query(
      `SELECT * FROM public.admin_notifications WHERE title LIKE '%Booking Request%' ORDER BY created_at DESC LIMIT 5`
    )
    assert.ok(adminNotifs.rows.length > 0, 'Admin notification must be recorded')
    console.log(`   ✅ public.admin_notifications verified (${adminNotifs.rows.length} records found)`)

    const outbox = await pool.query(
      `SELECT * FROM public.notification_outbox WHERE recipient LIKE '%@%' ORDER BY created_at DESC LIMIT 5`
    )
    assert.ok(outbox.rows.length > 0, 'Outbox notifications must be recorded')
    console.log(`   ✅ public.notification_outbox verified (${outbox.rows.length} records found)`)

    // -----------------------------------------------------------------------
    // 12. Unauthorized mutation rejection
    // -----------------------------------------------------------------------
    console.log('12. Unauthorized mutation rejection (401)...')
    const unauthAccept = await createMockReqRes({
      method: 'POST',
      path: `/api/bookings/${booking1.id}/accept`,
      headers: publicHeaders,
    }).dispatch()
    assert.equal(unauthAccept.status, 401)
    console.log('   ✅ Mutations without admin authorization rejected with 401')

    // -----------------------------------------------------------------------
    // 13. Browser refresh persistence
    // -----------------------------------------------------------------------
    console.log('13. Browser refresh persistence (fresh read via API)...')
    const listRes = await createMockReqRes({
      method: 'GET',
      path: '/api/bookings',
      headers: adminHeaders,
    }).dispatch()
    assert.equal(listRes.status, 200)
    const foundBooking = listRes.body.data.find(b => b.id === booking1.id)
    assert.ok(foundBooking)
    assert.equal(foundBooking.status, 'modification_proposed')
    console.log('   ✅ Fresh fetch from database reflects latest state accurately')

  } finally {
    // -----------------------------------------------------------------------
    // 14. Safe cleanup of temporary test records
    // -----------------------------------------------------------------------
    console.log('14. Safe cleanup of temporary test records...')
    for (const blockId of createdBlockIds) {
      await pool.query('DELETE FROM public.booking_blocks WHERE id = $1', [blockId])
    }
    for (const bookingId of createdBookingIds) {
      await pool.query('DELETE FROM public.bookings WHERE id = $1', [bookingId])
    }
    // Clean up test notifications
    await pool.query(`DELETE FROM public.admin_notifications WHERE title LIKE '%${testPrefix}%' OR message LIKE '%${testPrefix}%'`)
    await pool.query(`DELETE FROM public.notification_outbox WHERE payload::text LIKE '%${testPrefix}%'`)

    const remainingBookings = await pool.query('SELECT count(*) as c FROM public.bookings')
    const remainingBlocks = await pool.query('SELECT count(*) as c FROM public.booking_blocks')
    console.log(`   ✅ Cleanup complete. Total bookings in database: ${remainingBookings.rows[0].c}, blocks: ${remainingBlocks.rows[0].c}`)
  }

  console.log('\n======================================================')
  console.log('🎉 ALL 14 PHASE 3 POSTGRESQL E2E CHECKS PASSED!')
  console.log('======================================================\n')
}

runE2E().catch(err => {
  console.error('\n❌ E2E Integration Failed:', err)
  process.exit(1)
})
