process.env.ZEN_TEST_MODE = 'true'

import assert from 'node:assert/strict'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import { handleBookingsRoute, intervalsOverlap, timeToMinutes, minutesToTime } from '../server/api/bookings.mjs'
import { createAdminSession } from '../server/auth.mjs'
import { getDbPool } from '../server/db.mjs'

// Mock HTTP req/res helpers for testing handleBookingsRoute
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

async function runTests() {
  console.log('\n======================================================')
  console.log('🧪 ZEN CAFÉ — PHASE 3 BOOKINGS BACKEND & API TEST SUITE')
  console.log('======================================================\n')

  const pool = await getDbPool()
  // Clean up any stale test bookings from interrupted previous test runs
  await pool.query("DELETE FROM public.bookings WHERE customer_email = 'kavinda@example.com'").catch(() => {})

  const publicHeaders = { 'Content-Type': 'application/json' }
  const session = await createAdminSession('admin@zencafe.com')
  const adminHeaders = {
    'Content-Type': 'application/json',
    authorization: `Bearer ${session.token}`,
    'x-admin-token': session.token,
  }

  // -------------------------------------------------------------------------
  // Test 1: Interval Overlap Math Verification
  // -------------------------------------------------------------------------
  console.log('Test 1: Time Interval Overlap Logic...')
  assert.equal(intervalsOverlap('12:00', '14:00', '13:00', '15:00'), true, 'Overlapping partial')
  assert.equal(intervalsOverlap('12:00', '14:00', '14:00', '16:00'), false, 'Adjacent intervals do not overlap')
  assert.equal(intervalsOverlap('12:00', '14:00', '10:00', '12:00'), false, 'Adjacent intervals do not overlap')
  assert.equal(intervalsOverlap('12:00', '15:00', '13:00', '14:00'), true, 'Contained interval overlaps')
  console.log('  ✅ Interval overlap math verified.\n')

  // -------------------------------------------------------------------------
  // Test 2: Public Availability Query
  // -------------------------------------------------------------------------
  console.log('Test 2: Public Availability Query (GET /api/bookings/availability)...')
  const availRes = await createMockReqRes({
    method: 'GET',
    path: '/api/bookings/availability?date=2026-11-15&room=Private%20Dining%20Room',
  }).dispatch()

  assert.equal(availRes.status, 200, 'Availability should return 200')
  assert.equal(availRes.body.success, true)
  assert.ok(Array.isArray(availRes.body.availableSlots))
  assert.ok(availRes.body.availableSlots.length > 0)
  console.log(`  ✅ Public availability returned 200 with ${availRes.body.availableSlots.length} available slots.\n`)

  // -------------------------------------------------------------------------
  // Test 3: Security - Reject Unauthorized Admin Mutations (401)
  // -------------------------------------------------------------------------
  console.log('Test 3: Security - Reject Unauthorized Admin Operations (401)...')
  const unauthList = await createMockReqRes({
    method: 'GET',
    path: '/api/bookings',
    headers: publicHeaders,
  }).dispatch()
  assert.equal(unauthList.status, 401, 'Unauthenticated list should return 401')

  const unauthAccept = await createMockReqRes({
    method: 'POST',
    path: '/api/bookings/1/accept',
    headers: publicHeaders,
  }).dispatch()
  assert.equal(unauthAccept.status, 401, 'Unauthenticated accept should return 401')

  const unauthReject = await createMockReqRes({
    method: 'POST',
    path: '/api/bookings/1/reject',
    headers: publicHeaders,
    body: { reason: 'Unauthorized' },
  }).dispatch()
  assert.equal(unauthReject.status, 401, 'Unauthenticated reject should return 401')

  const unauthBlock = await createMockReqRes({
    method: 'POST',
    path: '/api/bookings/blocks',
    headers: publicHeaders,
    body: { blockDate: '2026-11-15', startTime: '12:00', endTime: '14:00' },
  }).dispatch()
  assert.equal(unauthBlock.status, 401, 'Unauthenticated block should return 401')
  console.log('  ✅ All unauthenticated admin endpoints rejected with 401 Unauthorized.\n')

  // -------------------------------------------------------------------------
  // Test 4: Customer Booking Request (Status: Pending)
  // -------------------------------------------------------------------------
  console.log('Test 4: Customer Submits Room Booking (Status: Pending)...')
  const createBookingRes = await createMockReqRes({
    method: 'POST',
    path: '/api/bookings',
    headers: publicHeaders,
    body: {
      customerName: 'Kavinda Perera',
      phone: '0771234567',
      email: 'kavinda@example.com',
      bookingDate: '2026-11-15',
      bookingTime: '13:00',
      duration: 2,
      guests: 12,
      occasion: 'Birthday Party',
      notes: 'Please arrange balloons on table',
      roomName: 'Private Dining Room',
    },
  }).dispatch()

  assert.equal(createBookingRes.status, 201, 'Booking creation should return 201')
  assert.equal(createBookingRes.body.success, true)
  const booking = createBookingRes.body.data
  assert.ok(booking.id)
  assert.equal(booking.status, 'pending', 'New bookings must be saved as pending')
  assert.equal(booking.roomName, 'Private Dining Room')
  console.log(`  ✅ Booking created successfully with ID ${booking.id} and status "pending".\n`)

  // -------------------------------------------------------------------------
  // Test 5: Admin Accepts Booking -> Confirmed & Slot Reserved
  // -------------------------------------------------------------------------
  console.log('Test 5: Admin Accepts Booking (Status: Confirmed)...')
  const acceptRes = await createMockReqRes({
    method: 'POST',
    path: `/api/bookings/${booking.id}/accept`,
    headers: adminHeaders,
  }).dispatch()

  assert.equal(acceptRes.status, 200, 'Accept booking should return 200')
  assert.equal(acceptRes.body.success, true)
  assert.equal(acceptRes.body.data.status, 'confirmed', 'Accepted booking is now confirmed')
  console.log(`  ✅ Booking #${booking.id} accepted. Status: "confirmed".\n`)

  // -------------------------------------------------------------------------
  // Test 6: Overlap Prevention (Cannot book or accept conflicting slot)
  // -------------------------------------------------------------------------
  console.log('Test 6: Overlap Prevention (Conflicting slot must be rejected)...')
  const conflictingRes = await createMockReqRes({
    method: 'POST',
    path: '/api/bookings',
    headers: publicHeaders,
    body: {
      customerName: 'Competing Guest',
      phone: '0779998888',
      bookingDate: '2026-11-15',
      bookingTime: '14:00', // Overlaps with 13:00 - 15:00
      duration: 2,
      guests: 10,
      roomName: 'Private Dining Room',
    },
  }).dispatch()

  assert.equal(conflictingRes.status, 409, 'Overlapping booking request must return 409 Conflict')
  assert.equal(conflictingRes.body.success, false)
  console.log('  ✅ Conflicting booking rejected with 409 Conflict.\n')

  // -------------------------------------------------------------------------
  // Test 7: Admin Proposes Modification
  // -------------------------------------------------------------------------
  console.log('Test 7: Admin Proposes Modification (Status: modification_proposed)...')
  const modifyRes = await createMockReqRes({
    method: 'POST',
    path: `/api/bookings/${booking.id}/modify`,
    headers: adminHeaders,
    body: {
      proposedDate: '2026-11-16',
      proposedStartTime: '16:00',
      duration: 2,
      reason: 'Requested slot needed for special setup. Proposing next day at 4 PM.',
    },
  }).dispatch()

  assert.equal(modifyRes.status, 200, 'Modify booking should return 200')
  assert.equal(modifyRes.body.data.status, 'modification_proposed')
  assert.equal(modifyRes.body.data.proposedDate, '2026-11-16')
  console.log(`  ✅ Modification proposed successfully with reason.\n`)

  // -------------------------------------------------------------------------
  // Test 8: Admin Rejects Booking With Reason
  // -------------------------------------------------------------------------
  console.log('Test 8: Admin Rejects Booking with Mandatory Reason...')
  const rejectNoReason = await createMockReqRes({
    method: 'POST',
    path: `/api/bookings/${booking.id}/reject`,
    headers: adminHeaders,
    body: { reason: '' },
  }).dispatch()
  assert.equal(rejectNoReason.status, 400, 'Reject without reason should return 400')

  const rejectRes = await createMockReqRes({
    method: 'POST',
    path: `/api/bookings/${booking.id}/reject`,
    headers: adminHeaders,
    body: { reason: 'Customer requested cancellation.' },
  }).dispatch()
  assert.equal(rejectRes.status, 200, 'Reject with reason should return 200')
  assert.equal(rejectRes.body.data.status, 'rejected')
  console.log('  ✅ Rejection with mandatory reason verified.\n')

  // -------------------------------------------------------------------------
  // Test 9: Manual Slot Blocking & Conflict Check
  // -------------------------------------------------------------------------
  console.log('Test 9: Manual Slot Blocking (POST /api/bookings/blocks)...')
  const blockRes = await createMockReqRes({
    method: 'POST',
    path: '/api/bookings/blocks',
    headers: adminHeaders,
    body: {
      roomName: 'Private Dining Room',
      blockDate: '2026-11-20',
      startTime: '10:00',
      endTime: '13:00',
      reason: 'Deep carpet cleaning',
    },
  }).dispatch()

  assert.equal(blockRes.status, 201, 'Block creation should return 201')
  const blockId = blockRes.body.data.id
  assert.ok(blockId)

  // Verify that customer cannot book during blocked interval
  const blockedTry = await createMockReqRes({
    method: 'POST',
    path: '/api/bookings',
    headers: publicHeaders,
    body: {
      customerName: 'Hopeful Guest',
      phone: '0770001111',
      bookingDate: '2026-11-20',
      bookingTime: '11:00', // Inside 10:00 - 13:00 block
      duration: 2,
      roomName: 'Private Dining Room',
    },
  }).dispatch()
  assert.equal(blockedTry.status, 409, 'Customer cannot book blocked interval')

  // Unblock
  const unblockRes = await createMockReqRes({
    method: 'DELETE',
    path: `/api/bookings/blocks/${blockId}`,
    headers: adminHeaders,
  }).dispatch()
  assert.equal(unblockRes.status, 200, 'Block removal should return 200')
  console.log('  ✅ Manual slot blocking and unblocking verified.\n')

  // -------------------------------------------------------------------------
  // Test 10: Delete Booking Cleanup
  // -------------------------------------------------------------------------
  console.log('Test 10: Cleaning up Test Booking...')
  const deleteRes = await createMockReqRes({
    method: 'DELETE',
    path: `/api/bookings/${booking.id}`,
    headers: adminHeaders,
  }).dispatch()
  assert.equal(deleteRes.status, 200, 'Delete booking should return 200')
  console.log('  ✅ Booking deleted successfully.\n')

  console.log('======================================================')
  console.log('🎉 ALL 10 BOOKINGS BACKEND & API TESTS PASSED!')
  console.log('======================================================\n')
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err)
  process.exit(1)
})
