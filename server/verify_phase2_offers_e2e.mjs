// server/verify_phase2_offers_e2e.mjs
// Comprehensive verification of Zen Café Offers API & PostgreSQL persistence

import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const BASE_URL = 'http://localhost:3000'

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 55432),
  database: process.env.DB_NAME || 'zencafe_db',
  user: process.env.DB_USER || 'zencafe_app',
  password: process.env.DB_PASSWORD,
  ssl: false,
})

async function run() {
  console.log('=== PHASE 2: OFFERS API & POSTGRESQL VERIFICATION ===\n')

  // 1. Health check
  console.log('1. Checking Server Health...')
  const healthRes = await fetch(`${BASE_URL}/api/health`)
  const health = await healthRes.json()
  console.log('   Health response:', health)
  if (!health.ok || health.database !== 'connected-postgres') {
    throw new Error('Server health check failed: database not connected-postgres')
  }

  // 2. Security checks (Unauthenticated mutations must return 401)
  console.log('\n2. Verifying Security & Authorization on Offers...')
  const unauthPost = await fetch(`${BASE_URL}/api/offers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Hacked Offer', discountValue: 50 }),
  })
  console.log(`   POST /api/offers (no auth) status: ${unauthPost.status} (expected 401)`)
  if (unauthPost.status !== 401) throw new Error('Unauthenticated POST was not blocked with 401')

  const unauthPut = await fetch(`${BASE_URL}/api/offers/9999`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: false }),
  })
  console.log(`   PUT /api/offers/9999 (no auth) status: ${unauthPut.status} (expected 401)`)
  if (unauthPut.status !== 401) throw new Error('Unauthenticated PUT was not blocked with 401')

  const unauthDelete = await fetch(`${BASE_URL}/api/offers/9999`, {
    method: 'DELETE',
  })
  console.log(`   DELETE /api/offers/9999 (no auth) status: ${unauthDelete.status} (expected 401)`)
  if (unauthDelete.status !== 401) throw new Error('Unauthenticated DELETE was not blocked with 401')

  // 3. Admin login
  console.log('\n3. Authenticating Admin Session...')
  const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@zencafe.com',
      password: process.env.ADMIN_PASSWORD || 'Admin@123',
    }),
  })
  const loginJson = await loginRes.json()
  console.log(`   Admin login status: ${loginRes.status}, success: ${loginJson.success}`)
  if (!loginRes.ok || !loginJson.token) throw new Error('Admin login failed')

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${loginJson.token}`,
  }

  // 4. Create Active Offer (with code & percentage discount)
  console.log('\n4. Creating Test Promotion via Authenticated POST...')
  const offerData = {
    title: 'Weekend Matcha Euphoria',
    description: 'Enjoy 20% off all handcrafted ceremonial Uji matcha drinks every Saturday and Sunday.',
    discountType: 'percentage',
    discountValue: 20,
    code: 'MATCHA20',
    startDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10), // yesterday
    endDate: new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10), // in 7 days
    active: true,
    image: '/assets/menu-panda-main.png',
  }

  const createRes = await fetch(`${BASE_URL}/api/offers`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(offerData),
  })
  const createJson = await createRes.json()
  console.log(`   POST /api/offers status: ${createRes.status}, id: ${createJson.data?.id}`)
  if (createRes.status !== 201 || !createJson.data?.id) {
    throw new Error(`Failed to create offer: ${JSON.stringify(createJson)}`)
  }
  const offerId = createJson.data.id

  // 5. Verify Public Visibility & Dates
  console.log('\n5. Verifying Public Offers Query (GET /api/offers)...')
  const pubRes = await fetch(`${BASE_URL}/api/offers`)
  const pubJson = await pubRes.json()
  console.log(`   GET /api/offers public count: ${pubJson.count}`)
  if (pubJson.count !== 1 || pubJson.data[0].id !== String(offerId)) {
    throw new Error('Public endpoint did not return active valid offer')
  }
  console.log(`   Offer title: "${pubJson.data[0].title}", code: "${pubJson.data[0].code}", badge: "${pubJson.data[0].badge}"`)

  // 6. Edit Offer
  console.log('\n6. Testing Offer Edit (PUT /api/offers/:id)...')
  const editRes = await fetch(`${BASE_URL}/api/offers/${offerId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      discountValue: 25,
      code: 'MATCHA25',
      title: 'Weekend Matcha Super Euphoria',
    }),
  })
  const editJson = await editRes.json()
  console.log(`   PUT /api/offers/${offerId} status: ${editRes.status}, new value: ${editJson.data?.discountValue}%, new code: ${editJson.data?.code}`)
  if (editJson.data?.discountValue !== 25 || editJson.data?.code !== 'MATCHA25') {
    throw new Error('Edit failed to update values')
  }

  // 7. Deactivate Offer
  console.log('\n7. Testing Offer Deactivation (Toggle Active: false)...')
  const deactRes = await fetch(`${BASE_URL}/api/offers/${offerId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ active: false }),
  })
  const deactJson = await deactRes.json()
  console.log(`   Offer active status toggled to: ${deactJson.data?.active}`)

  // Public endpoint should now return 0 active offers
  const pubAfterDeact = await fetch(`${BASE_URL}/api/offers`)
  const pubAfterDeactJson = await pubAfterDeact.json()
  console.log(`   GET /api/offers (public) count after deactivation: ${pubAfterDeactJson.count} (expected 0)`)
  if (pubAfterDeactJson.count !== 0) throw new Error('Deactivated offer still returned in public view')

  // Admin endpoint should still see the deactivated offer
  const adminRes = await fetch(`${BASE_URL}/api/offers?all=true`, {
    headers: authHeaders,
  })
  const adminJson = await adminRes.json()
  console.log(`   GET /api/offers?all=true (admin) count: ${adminJson.count} (expected 1)`)
  if (adminJson.count !== 1) throw new Error('Admin endpoint did not see deactivated offer')

  // 8. Verify Direct PostgreSQL Persistence
  console.log('\n8. Verifying Real PostgreSQL Persistence in zencafe_db...')
  const dbCheck = await pool.query(
    'SELECT id, title, discount_type, discount_value, code, is_active, starts_at, ends_at FROM public.offers'
  )
  console.log('   PostgreSQL public.offers rows:')
  dbCheck.rows.forEach(r => {
    console.log(`   - [ID ${r.id}] "${r.title}" | ${r.discount_value}% (${r.discount_type}) | Code: ${r.code} | Active: ${r.is_active}`)
  })
  if (dbCheck.rows.length !== 1) throw new Error('PostgreSQL does not reflect exactly 1 offer')

  // 9. Clean up (DELETE offer)
  console.log('\n9. Cleaning up Test Offer via Authenticated DELETE...')
  const delRes = await fetch(`${BASE_URL}/api/offers/${offerId}`, {
    method: 'DELETE',
    headers: authHeaders,
  })
  console.log(`   DELETE /api/offers/${offerId} status: ${delRes.status}`)
  if (delRes.status !== 200) throw new Error('Delete failed')

  // 10. Verify Clean State
  const finalDbCheck = await pool.query('SELECT count(*) as count FROM public.offers')
  console.log(`\n10. Final PostgreSQL offers count: ${finalDbCheck.rows[0].count} (expected 0)`)
  if (Number(finalDbCheck.rows[0].count) !== 0) throw new Error('Offer was not cleaned up from DB')

  console.log('\n✅ ALL OFFERS API, AUTH, CRUD, TOGGLE, PERSISTENCE & SECURITY TESTS PASSED 100%!\n')
}

run()
  .catch(err => {
    console.error('\n❌ Verification Failed:', err)
    process.exit(1)
  })
  .finally(() => pool.end())
