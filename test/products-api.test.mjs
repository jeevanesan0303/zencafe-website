process.env.ZEN_TEST_MODE = 'true'

import assert from 'node:assert/strict'
import { query } from '../server/db.mjs'
import {
  handleGetProducts,
  handleCreateProduct,
  handleUpdateProduct,
  handleDeleteProduct,
} from '../server/api/products.mjs'
import { createAdminSession } from '../server/auth.mjs'

async function runTests() {
  console.log('\n======================================================')
  console.log('🧪 ZEN CAFÉ — PHASE 1 PRODUCTS BACKEND & API TEST SUITE')
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
  console.log('Test 1: PostgreSQL Public Read...')
  const initialPublic = await handleGetProducts(
    new URL('http://localhost/api/products'),
    publicReq
  )
  assert.equal(initialPublic.status, 200, 'Public read should return 200')
  assert.equal(initialPublic.body.success, true)
  assert.ok(Array.isArray(initialPublic.body.data), 'Returns products array')
  console.log(`  ✅ Public read returned status 200 and valid array (count: ${initialPublic.body.data.length}).\n`)

  // -------------------------------------------------------------------------
  // Test 2: Unauthorized API Mutations Are Rejected (Security)
  // -------------------------------------------------------------------------
  console.log('Test 2: Security - Reject Unauthorized Mutations (401)...')
  const unauthorizedCreate = await handleCreateProduct(
    {
      name: 'Hacked Product',
      kind: 'food',
      category: 'Burgers',
      price: 100,
    },
    publicReq
  )
  assert.equal(
    unauthorizedCreate.status,
    401,
    'Unauthorized POST should be rejected with 401'
  )
  assert.equal(unauthorizedCreate.body.success, false)

  const unauthorizedUpdate = await handleUpdateProduct(
    'non-existent-product',
    { price: 9999 },
    publicReq
  )
  assert.equal(
    unauthorizedUpdate.status,
    401,
    'Unauthorized PUT should be rejected with 401'
  )

  const unauthorizedDelete = await handleDeleteProduct(
    'non-existent-product',
    publicReq
  )
  assert.equal(
    unauthorizedDelete.status,
    401,
    'Unauthorized DELETE should be rejected with 401'
  )
  console.log('  ✅ All unauthorized mutations rejected with 401 Unauthorized.\n')

  // -------------------------------------------------------------------------
  // Test 3: Admin Adds Product -> Saved in PostgreSQL
  // -------------------------------------------------------------------------
  console.log('Test 3: Admin Adds Product -> Stored in PostgreSQL...')
  const newProductPayload = {
    name: 'Zen Matcha Dragon Latte',
    category: 'Hot Drinks',
    kind: 'drink',
    description: 'Ceremonial grade Uji matcha whisked with oat milk and honey.',
    ingredients: 'Ceremonial matcha, oat milk, honey, cinnamon dust',
    serving: 'Served warm in handmade ceramic bowl',
    price: 850,
    image: '/assets/signature-drinks/zen-drink-character-01.png',
    accent: '#4a9a68',
    available: true,
    featured: true,
    isNew: true,
    dairyType: 'dairy-free',
  }

  const createRes = await handleCreateProduct(newProductPayload, adminReq)
  assert.equal(createRes.status, 201, 'Admin create should return 201')
  assert.equal(createRes.body.success, true)
  assert.equal(createRes.body.data.name, 'Zen Matcha Dragon Latte')
  assert.equal(createRes.body.data.price, 850)
  assert.equal(createRes.body.data.category, 'Hot Drinks')
  assert.equal(createRes.body.data.kind, 'drink')
  assert.equal(createRes.body.data.ingredients, 'Ceremonial matcha, oat milk, honey, cinnamon dust')
  assert.equal(createRes.body.data.serving, 'Served warm in handmade ceramic bowl')
  assert.equal(createRes.body.data.accent, '#4a9a68')
  assert.equal(createRes.body.data.isNew, true)
  assert.equal(createRes.body.data.dairyType, 'dairy-free')
  const createdId = createRes.body.data.id

  // Direct PostgreSQL verification
  const dbCheck = await query('SELECT * FROM products WHERE id = $1', [
    Number(createdId),
  ])
  assert.equal(dbCheck.rows.length, 1, 'Product must exist in PostgreSQL table')
  assert.equal(dbCheck.rows[0].name, 'Zen Matcha Dragon Latte')
  assert.equal(Number(dbCheck.rows[0].price), 850)
  assert.equal(dbCheck.rows[0].is_available, true)
  assert.equal(dbCheck.rows[0].kind, 'drink')
  assert.equal(dbCheck.rows[0].ingredients, 'Ceremonial matcha, oat milk, honey, cinnamon dust')
  assert.equal(dbCheck.rows[0].serving, 'Served warm in handmade ceramic bowl')
  assert.equal(dbCheck.rows[0].accent, '#4a9a68')
  assert.equal(dbCheck.rows[0].is_new, true)
  assert.equal(dbCheck.rows[0].dairy_type, 'dairy-free')
  console.log('  ✅ Product created and verified directly in PostgreSQL table.\n')

  // -------------------------------------------------------------------------
  // Test 4: Customer Website Displays the Product
  // -------------------------------------------------------------------------
  console.log('Test 4: Customer Website Displays the Product...')
  const customerView = await handleGetProducts(
    new URL('http://localhost/api/products?kind=drink'),
    publicReq
  )
  assert.equal(customerView.status, 200)
  const foundInPublic = customerView.body.data.find(
    p => p.id === createdId
  )
  assert.ok(foundInPublic, 'New product must be visible to public customer')
  assert.equal(foundInPublic.name, 'Zen Matcha Dragon Latte')
  assert.equal(foundInPublic.price, 850)
  console.log('  ✅ Public customer view displays the new product.\n')

  // -------------------------------------------------------------------------
  // Test 5: Admin Edits Product -> Website Reflects Changes
  // -------------------------------------------------------------------------
  console.log('Test 5: Admin Edits Product -> Changes Persisted & Displayed...')
  const updateRes = await handleUpdateProduct(
    createdId,
    {
      price: 920,
      description: 'Updated recipe with organic vanilla bean.',
    },
    adminReq
  )
  assert.equal(updateRes.status, 200, 'Admin update should return 200')
  assert.equal(updateRes.body.data.price, 920)

  // Verify in PostgreSQL directly
  const dbUpdateCheck = await query(
    'SELECT price, description FROM products WHERE id = $1',
    [Number(createdId)]
  )
  assert.equal(Number(dbUpdateCheck.rows[0].price), 920)
  assert.equal(
    dbUpdateCheck.rows[0].description,
    'Updated recipe with organic vanilla bean.'
  )

  // Verify on public customer view
  const publicUpdated = await handleGetProducts(
    new URL('http://localhost/api/products?kind=drink'),
    publicReq
  )
  const updatedItem = publicUpdated.body.data.find(
    p => p.id === createdId
  )
  assert.equal(updatedItem.price, 920)
  assert.equal(
    updatedItem.description,
    'Updated recipe with organic vanilla bean.'
  )
  console.log('  ✅ Product edits persisted in PostgreSQL and customer view reflects changes.\n')

  // -------------------------------------------------------------------------
  // Test 6: Admin Hides/Shows Product
  // -------------------------------------------------------------------------
  console.log('Test 6: Admin Toggles Product Availability...')
  await handleUpdateProduct(
    createdId,
    { available: false },
    adminReq
  )

  const publicHiddenCheck = await handleGetProducts(
    new URL('http://localhost/api/products'),
    publicReq
  )
  assert.ok(
    !publicHiddenCheck.body.data.some(p => p.id === createdId),
    'Hidden product must not appear in public view'
  )

  const adminAllCheck = await handleGetProducts(
    new URL('http://localhost/api/products?all=true'),
    adminReq
  )
  const adminItem = adminAllCheck.body.data.find(
    p => p.id === createdId
  )
  assert.ok(adminItem, 'Admin with all=true sees hidden product')
  assert.equal(adminItem.available, false)
  console.log('  ✅ Product availability toggle works: hidden from customer, visible to admin.\n')

  // -------------------------------------------------------------------------
  // Test 7: Admin Deletes Product -> Removed from PostgreSQL & Customer View
  // -------------------------------------------------------------------------
  console.log('Test 7: Admin Deletes Product...')
  const deleteRes = await handleDeleteProduct(
    createdId,
    adminReq
  )
  assert.equal(deleteRes.status, 200, 'Delete should return 200')
  assert.equal(deleteRes.body.success, true)

  // Direct database check
  const dbDeleteCheck = await query(
    'SELECT count(*) FROM products WHERE id = $1',
    [Number(createdId)]
  )
  assert.equal(Number(dbDeleteCheck.rows[0].count), 0, 'Must be 0 in database')

  // Public check
  const publicAfterDelete = await handleGetProducts(
    new URL('http://localhost/api/products?all=true'),
    adminReq
  )
  assert.ok(
    !publicAfterDelete.body.data.some(p => p.id === createdId),
    'Deleted product must not appear anywhere'
  )
  console.log('  ✅ Product successfully removed from PostgreSQL and all views.\n')

  // -------------------------------------------------------------------------
  // Test 8: Multi-Client / Refresh Consistency
  // -------------------------------------------------------------------------
  console.log('Test 8: Cross-Client / Page Refresh Consistency...')
  const clientA = await handleGetProducts(
    new URL('http://localhost/api/products'),
    publicReq
  )
  const clientB = await handleGetProducts(
    new URL('http://localhost/api/products'),
    publicReq
  )
  assert.deepEqual(
    clientA.body.data,
    clientB.body.data,
    'Both clients see identical data from database'
  )
  console.log('  ✅ Client A and Client B receive identical database records.\n')

  console.log('======================================================')
  console.log('🎉 ALL 8 TESTS PASSED SUCCESSFULLY!')
  console.log('======================================================\n')
}

runTests().catch(err => {
  console.error('\n❌ Test failure:', err)
  process.exit(1)
})
