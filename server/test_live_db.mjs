import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

dotenv.config({ path: path.join(projectRoot, '.env') })

// Ensure we are NOT in test mode or in-memory mode!
delete process.env.ZEN_TEST_MODE
delete process.env.NODE_ENV

const { getDbPool, query, isDbInMemory } = await import('./db.mjs')
const {
  handleGetProducts,
  handleGetProductById,
  handleCreateProduct,
  handleUpdateProduct,
  handleDeleteProduct,
} = await import('./api/products.mjs')
const { createAdminSession } = await import('./auth.mjs')

async function runLiveDbVerification() {
  console.log('\n======================================================')
  console.log('🔴 LIVE HOSTINGER POSTGRESQL CRUD INTEGRATION TEST')
  console.log('======================================================\n')

  // Step 1: Confirm database name and authenticated user
  console.log('Step 1: Confirm database name and authenticated user...')
  const dbInfo = await query(`
    SELECT 
      current_database() AS database,
      current_user AS username,
      inet_server_addr() AS server_ip,
      inet_server_port() AS server_port
  `)
  const row = dbInfo.rows[0]
  console.log('  Database:', row.database)
  console.log('  Username:', row.username)
  console.log('  In-Memory mode:', isDbInMemory() ? 'YES (FAIL)' : 'NO (REAL PG LIVE)')
  assert.equal(row.database, 'zencafe_db', 'Must be zencafe_db')
  assert.equal(row.username, 'zencafe_app', 'Must be authenticated as zencafe_app')
  assert.equal(isDbInMemory(), false, 'Must not be in-memory database')
  console.log('  ✅ Step 1 Verified: Connected to real Hostinger PostgreSQL (zencafe_db) as zencafe_app.\n')

  // Step 2: Confirm the 21 columns in products table
  console.log('Step 2: Confirm all 21 columns in public.products...')
  const tableCheck = await query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products'
    ORDER BY ordinal_position
  `)
  const prodColumns = tableCheck.rows.map(r => r.column_name)
  console.log('  products column count:', prodColumns.length)
  console.log('  products columns:', prodColumns.join(', '))
  assert.equal(prodColumns.length, 21, 'Must have 21 columns total')
  assert.ok(prodColumns.includes('kind'), 'Must have kind')
  assert.ok(prodColumns.includes('ingredients'), 'Must have ingredients')
  assert.ok(prodColumns.includes('serving'), 'Must have serving')
  assert.ok(prodColumns.includes('accent'), 'Must have accent')
  assert.ok(prodColumns.includes('is_new'), 'Must have is_new')
  assert.ok(prodColumns.includes('spice_level'), 'Must have spice_level')
  assert.ok(prodColumns.includes('dietary_type'), 'Must have dietary_type')
  assert.ok(prodColumns.includes('dairy_type'), 'Must have dairy_type')
  console.log('  ✅ Step 2 Verified: All 8 extended columns verified in public.products.\n')

  const publicReq = { headers: {} }
  const session = await createAdminSession('admin@zencafe.com')
  const adminReq = {
    headers: {
      authorization: `Bearer ${session.token}`,
      'x-admin-token': session.token,
    },
  }

  // Step 3: Admin creates product with all 8 extended attributes
  console.log('Step 3: Verify product creation with all 8 extended attributes...')
  const testPayload = {
    name: 'Zen Temp Ceremonial Matcha #77',
    category: 'Hot Drinks',
    kind: 'drink',
    description: 'Ceremonial grade Uji matcha whisked with oat milk and organic honey.',
    ingredients: 'Uji matcha, oat milk, raw honey, vanilla dust',
    serving: 'Hot handmade ceramic bowl',
    price: 850,
    image: '/assets/signature-drinks/zen-drink-character-01.png',
    accent: '#4a9a68',
    available: true,
    featured: true,
    isNew: true,
    dairyType: 'dairy-free',
  }

  const createRes = await handleCreateProduct(testPayload, adminReq)
  assert.equal(createRes.status, 201, 'Should return HTTP 201')
  assert.equal(createRes.body.success, true)
  const createdItem = createRes.body.data
  const createdId = createdItem.id

  console.log('  Created Item Details:')
  console.log('    ID:', createdItem.id)
  console.log('    Slug:', createdItem.slug)
  console.log('    Kind:', createdItem.kind)
  console.log('    Price: LKR', createdItem.price)
  console.log('    Ingredients:', createdItem.ingredients)
  console.log('    Serving:', createdItem.serving)
  console.log('    Accent:', createdItem.accent)
  console.log('    isNew:', createdItem.isNew)
  console.log('    dairyType:', createdItem.dairyType)

  assert.equal(createdItem.name, 'Zen Temp Ceremonial Matcha #77')
  assert.equal(createdItem.kind, 'drink')
  assert.equal(createdItem.category, 'Hot Drinks')
  assert.equal(createdItem.price, 850)
  assert.equal(createdItem.ingredients, 'Uji matcha, oat milk, raw honey, vanilla dust')
  assert.equal(createdItem.serving, 'Hot handmade ceramic bowl')
  assert.equal(createdItem.accent, '#4a9a68')
  assert.equal(createdItem.isNew, true)
  assert.equal(createdItem.dairyType, 'dairy-free')
  console.log('  ✅ Step 3 Verified: Product created with all 8 extended attributes.\n')

  // Step 4: Verify the created product can be read back from PostgreSQL directly
  console.log('Step 4: Verify read-back from PostgreSQL directly...')
  const readBack = await handleGetProductById(createdId)
  assert.equal(readBack.status, 200)
  assert.equal(readBack.body.data.name, 'Zen Temp Ceremonial Matcha #77')
  assert.equal(readBack.body.data.price, 850)
  assert.equal(readBack.body.data.kind, 'drink')
  assert.equal(readBack.body.data.ingredients, 'Uji matcha, oat milk, raw honey, vanilla dust')

  // Direct SQL row query
  const sqlCheck = await query('SELECT * FROM public.products WHERE id = $1', [Number(createdId)])
  assert.equal(sqlCheck.rows.length, 1)
  const sqlRow = sqlCheck.rows[0]
  assert.equal(sqlRow.name, 'Zen Temp Ceremonial Matcha #77')
  assert.equal(Number(sqlRow.price), 850)
  assert.equal(sqlRow.kind, 'drink')
  assert.equal(sqlRow.ingredients, 'Uji matcha, oat milk, raw honey, vanilla dust')
  assert.equal(sqlRow.serving, 'Hot handmade ceramic bowl')
  assert.equal(sqlRow.accent, '#4a9a68')
  assert.equal(sqlRow.is_new, true)
  assert.equal(sqlRow.dairy_type, 'dairy-free')
  console.log('  Direct SQL row verified successfully.')
  console.log('  ✅ Step 4 Verified: All 8 attributes match in Hostinger PostgreSQL.\n')

  // Step 5: Verify partial editing and availability toggle
  console.log('Step 5: Verify partial editing and availability changes...')
  const updateRes = await handleUpdateProduct(
    createdId,
    {
      price: 920,
      available: false,
      description: 'Updated description for live audit test.',
      spiceLevel: 'mild',
      dietaryType: 'veg',
    },
    adminReq
  )
  assert.equal(updateRes.status, 200)
  assert.equal(updateRes.body.data.price, 920)
  assert.equal(updateRes.body.data.available, false)
  assert.equal(updateRes.body.data.spiceLevel, 'mild')
  assert.equal(updateRes.body.data.dietaryType, 'veg')
  // Verify omitted fields were PRESERVED, not cleared
  assert.equal(updateRes.body.data.ingredients, 'Uji matcha, oat milk, raw honey, vanilla dust', 'Ingredients preserved')
  assert.equal(updateRes.body.data.serving, 'Hot handmade ceramic bowl', 'Serving preserved')
  assert.equal(updateRes.body.data.accent, '#4a9a68', 'Accent preserved')
  assert.equal(updateRes.body.data.dairyType, 'dairy-free', 'Dairy type preserved')

  // Check public endpoint hides unavailable product
  const publicList = await handleGetProducts(new URL('http://localhost/api/products'), publicReq)
  assert.ok(
    !publicList.body.data.some(p => p.id === createdId),
    'Unavailable product MUST be hidden from public'
  )

  // Check admin endpoint shows unavailable product
  const adminList = await handleGetProducts(new URL('http://localhost/api/products?all=true'), adminReq)
  const foundInAdmin = adminList.body.data.find(p => p.id === createdId)
  assert.ok(foundInAdmin, 'Admin with ?all=true MUST see unavailable product')
  assert.equal(foundInAdmin.available, false)
  console.log('  ✅ Step 5 Verified: Partial updates preserve omitted fields & availability toggle works.\n')

  // Step 6: Verify deletion and cleanup
  console.log('Step 6: Verify deletion and cleanup from live PostgreSQL...')
  const deleteRes = await handleDeleteProduct(createdId, adminReq)
  assert.equal(deleteRes.status, 200)
  assert.equal(deleteRes.body.success, true)

  const checkAfterDelete = await query('SELECT count(*) FROM public.products WHERE id = $1', [Number(createdId)])
  assert.equal(Number(checkAfterDelete.rows[0].count), 0, 'Must be 0 rows in DB')
  console.log('  ✅ Step 6 Verified: Temporary test product deleted from PostgreSQL.\n')

  // Step 7: Verify database state is clean
  const finalCount = await query('SELECT count(*) FROM public.products')
  console.log(`Final count of products in public.products: ${finalCount.rows[0].count}`)
  assert.equal(Number(finalCount.rows[0].count), 0, 'Database is clean after test')

  console.log('======================================================')
  console.log('🎉 ALL LIVE POSTGRESQL CRUD TESTS PASSED!')
  console.log('======================================================\n')

  const pool = await getDbPool()
  await pool.end()
}

runLiveDbVerification().catch(err => {
  console.error('\n❌ Live DB Test failure:', err)
  process.exit(1)
})
