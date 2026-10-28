process.env.ZEN_TEST_MODE = 'true'

import assert from 'node:assert/strict'
import {
  handleGetOffers,
  handleGetOfferById,
  handleCreateOffer,
  handleUpdateOffer,
  handleDeleteOffer,
} from '../server/api/offers.mjs'
import { createAdminSession } from '../server/auth.mjs'

async function runTests() {
  console.log('\n======================================================')
  console.log('🧪 ZEN CAFÉ — PHASE 2 OFFERS BACKEND & API TEST SUITE')
  console.log('======================================================\n')

  const publicReq = { headers: {} }
  const session = await createAdminSession('admin@zencafe.com')
  const adminReq = {
    headers: {
      authorization: `Bearer ${session.token}`,
      'x-admin-token': session.token,
    },
  }

  // -------------------------------------------------------------------------
  // Test 1: Public Read
  // -------------------------------------------------------------------------
  console.log('Test 1: Public Read Active Offers...')
  const initialPublic = await handleGetOffers(
    new URL('http://localhost/api/offers'),
    publicReq
  )
  assert.equal(initialPublic.status, 200, 'Public read should return 200')
  assert.equal(initialPublic.body.success, true)
  assert.ok(Array.isArray(initialPublic.body.data), 'Returns offers array')
  console.log(`  ✅ Public read returned status 200 (count: ${initialPublic.body.data.length}).\n`)

  // -------------------------------------------------------------------------
  // Test 2: Security - Reject Unauthorized Mutations (401)
  // -------------------------------------------------------------------------
  console.log('Test 2: Security - Reject Unauthorized Mutations (401)...')
  const unauthCreate = await handleCreateOffer(
    { title: 'Unauthorized Offer', discountValue: 20 },
    publicReq
  )
  assert.equal(unauthCreate.status, 401, 'POST without auth must return 401')

  const unauthUpdate = await handleUpdateOffer(
    '1',
    { active: false },
    publicReq
  )
  assert.equal(unauthUpdate.status, 401, 'PUT without auth must return 401')

  const unauthDelete = await handleDeleteOffer('1', publicReq)
  assert.equal(unauthDelete.status, 401, 'DELETE without auth must return 401')
  console.log('  ✅ All unauthorized mutations rejected with 401 Unauthorized.\n')

  // -------------------------------------------------------------------------
  // Test 3: Admin Creates Offer -> Stored in Database
  // -------------------------------------------------------------------------
  console.log('Test 3: Admin Creates Promotion...')
  const now = new Date()
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
  const nextWeek = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)

  const createRes = await handleCreateOffer(
    {
      title: 'Zen Summer Strawberry Sparkler',
      description: 'Handcrafted seasonal strawberry drinks with fresh mint and crushed ice.',
      discountType: 'percentage',
      discountValue: 20,
      code: 'SUMMER20',
      startDate: yesterday,
      endDate: nextWeek,
      active: true,
      image: '/assets/menu-panda-main.png',
    },
    adminReq
  )

  assert.equal(createRes.status, 201, 'Create should return 201')
  assert.equal(createRes.body.success, true)
  assert.equal(createRes.body.data.title, 'Zen Summer Strawberry Sparkler')
  assert.equal(createRes.body.data.code, 'SUMMER20')
  assert.equal(createRes.body.data.discountValue, 20)
  assert.equal(createRes.body.data.badge, '20% OFF')
  const createdId = createRes.body.data.id
  console.log(`  ✅ Offer created with ID: ${createdId}, code: "${createRes.body.data.code}", badge: "${createRes.body.data.badge}".\n`)

  // -------------------------------------------------------------------------
  // Test 4: Public Visibility & Valid Date Filtering
  // -------------------------------------------------------------------------
  console.log('Test 4: Customer Website Displays Active Offer...')
  const pubRead = await handleGetOffers(
    new URL('http://localhost/api/offers'),
    publicReq
  )
  assert.equal(pubRead.status, 200)
  assert.equal(pubRead.body.data.length, 1)
  assert.equal(pubRead.body.data[0].id, createdId)
  console.log(`  ✅ Active valid offer is visible to public customers.\n`)

  // -------------------------------------------------------------------------
  // Test 5: Admin Edits Offer
  // -------------------------------------------------------------------------
  console.log('Test 5: Admin Edits Offer...')
  const editRes = await handleUpdateOffer(
    createdId,
    {
      discountValue: 25,
      code: 'SUMMER25',
      title: 'Zen Grand Summer Strawberry Sparkler',
    },
    adminReq
  )
  assert.equal(editRes.status, 200, 'Update should return 200')
  assert.equal(editRes.body.data.discountValue, 25)
  assert.equal(editRes.body.data.code, 'SUMMER25')
  assert.equal(editRes.body.data.badge, '25% OFF')
  console.log('  ✅ Offer edited: discount 25%, code SUMMER25, badge 25% OFF.\n')

  // -------------------------------------------------------------------------
  // Test 6: Toggle Active (Deactivate)
  // -------------------------------------------------------------------------
  console.log('Test 6: Admin Toggles Offer Availability (Active = false)...')
  const deactRes = await handleUpdateOffer(
    createdId,
    { active: false },
    adminReq
  )
  assert.equal(deactRes.status, 200)
  assert.equal(deactRes.body.data.active, false)

  // Public view should now return 0
  const pubAfterDeact = await handleGetOffers(
    new URL('http://localhost/api/offers'),
    publicReq
  )
  assert.equal(pubAfterDeact.body.data.length, 0, 'Deactivated offer must be hidden from customers')

  // Admin view (?all=true) should still return 1
  const adminAfterDeact = await handleGetOffers(
    new URL('http://localhost/api/offers?all=true'),
    adminReq
  )
  assert.equal(adminAfterDeact.body.data.length, 1, 'Admin can see deactivated offers')
  console.log('  ✅ Offer deactivation verified: hidden from customer, visible to admin.\n')

  // -------------------------------------------------------------------------
  // Test 7: Admin Deletes Offer
  // -------------------------------------------------------------------------
  console.log('Test 7: Admin Deletes Offer...')
  const deleteRes = await handleDeleteOffer(createdId, adminReq)
  assert.equal(deleteRes.status, 200)
  assert.equal(deleteRes.body.success, true)

  const pubAfterDelete = await handleGetOffers(
    new URL('http://localhost/api/offers?all=true'),
    adminReq
  )
  assert.equal(pubAfterDelete.body.data.length, 0, 'Deleted offer no longer exists')
  console.log('  ✅ Offer deleted successfully.\n')

  // -------------------------------------------------------------------------
  // Test 8: Date Range Validation
  // -------------------------------------------------------------------------
  console.log('Test 8: Date Range Validation...')
  const invalidDateRes = await handleCreateOffer(
    {
      title: 'Invalid Date Offer',
      discountValue: 10,
      startDate: '2026-12-31',
      endDate: '2026-01-01', // Before start
    },
    adminReq
  )
  assert.equal(invalidDateRes.status, 400, 'End date before start date must return 400')
  console.log('  ✅ Invalid date range rejected with 400 Bad Request.\n')

  console.log('======================================================')
  console.log('🎉 ALL 8 OFFERS BACKEND & API TESTS PASSED!')
  console.log('======================================================\n')
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err)
  process.exit(1)
})
