// server/verify_phase1_e2e.mjs
// Comprehensive verification of Zen Café Products API & PostgreSQL persistence

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'http://localhost:3000';

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 55432),
  database: process.env.DB_NAME || 'zencafe_db',
  user: process.env.DB_USER || 'zencafe_app',
  password: process.env.DB_PASSWORD,
  ssl: false,
});

async function run() {
  console.log('=== PHASE 1 FINAL: API & POSTGRESQL VERIFICATION ===\n');

  // Step 1: Health check
  console.log('1. Checking Server Health...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const health = await healthRes.json();
  console.log('   Health response:', health);
  if (!health.ok || health.database !== 'connected-postgres') {
    throw new Error('Server health check failed: database not connected-postgres');
  }

  // Step 2: Security checks (Unauthenticated mutations must fail with 401)
  console.log('\n2. Verifying Security & Authorization Checks...');
  
  const unauthPost = await fetch(`${BASE_URL}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hacker Item', price: 999, category: 'Hacked', kind: 'food' }),
  });
  console.log(`   POST /api/products (no auth) status: ${unauthPost.status} (expected 401)`);
  if (unauthPost.status !== 401) throw new Error('Unauthenticated POST was not blocked with 401');

  const unauthPut = await fetch(`${BASE_URL}/api/products/9999`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price: 100 }),
  });
  console.log(`   PUT /api/products/9999 (no auth) status: ${unauthPut.status} (expected 401)`);
  if (unauthPut.status !== 401) throw new Error('Unauthenticated PUT was not blocked with 401');

  const unauthDelete = await fetch(`${BASE_URL}/api/products/9999`, {
    method: 'DELETE',
  });
  console.log(`   DELETE /api/products/9999 (no auth) status: ${unauthDelete.status} (expected 401)`);
  if (unauthDelete.status !== 401) throw new Error('Unauthenticated DELETE was not blocked with 401');

  // Step 3: Admin login with server-verified authentication
  console.log('\n3. Testing Server Admin Login...');
  
  // Test invalid login
  const invalidLoginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@zencafe.com', password: 'wrongpassword' }),
  });
  console.log(`   POST /api/admin/login (bad password) status: ${invalidLoginRes.status} (expected 401)`);
  if (invalidLoginRes.status !== 401) throw new Error('Invalid credentials did not return 401');

  // Test valid login
  const validLoginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@zencafe.com', password: process.env.ADMIN_PASSWORD || 'Admin@123' }),
  });
  const loginJson = await validLoginRes.json();
  console.log(`   POST /api/admin/login status: ${validLoginRes.status}, success: ${loginJson.success}`);
  if (!validLoginRes.ok || !loginJson.token) throw new Error('Valid login failed or returned no token');

  const adminToken = loginJson.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
  };

  // Step 4: Add Drink Product (with extended attributes)
  console.log('\n4. Adding Test Drink Product via Authenticated POST...');
  const drinkData = {
    name: 'Zen Signature Matcha Glacier',
    category: 'Specialty Drinks',
    description: 'Ceremonial Uji matcha whisked with velvety organic oat milk and chilled over pure crystal ice.',
    ingredients: 'Ceremonial matcha, organic oat milk, raw organic cane syrup, pure ice',
    serving: '380 ml Glass',
    price: 850.00,
    kind: 'drink',
    image: '/assets/signature-drinks/zen-drink-character-01.png',
    accent: '#4a9a68',
    available: true,
    featured: true,
    isNew: true,
    dairyType: 'dairy-free',
  };

  const drinkRes = await fetch(`${BASE_URL}/api/products`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(drinkData),
  });
  const drinkJson = await drinkRes.json();
  console.log(`   POST /api/products (drink) status: ${drinkRes.status}, id: ${drinkJson.data?.id}`);
  if (drinkRes.status !== 201 || !drinkJson.data?.id) {
    throw new Error(`Failed to create drink: ${JSON.stringify(drinkJson)}`);
  }
  const drinkId = drinkJson.data.id;

  // Step 5: Add Food Product (with extended attributes)
  console.log('\n5. Adding Test Food Product via Authenticated POST...');
  const foodData = {
    name: 'Zen Truffle Teriyaki Bao',
    category: 'Signature Kitchen',
    description: 'Fluffy handmade steam bao stuffed with glazed teriyaki mushroom and black truffle drizzle.',
    ingredients: 'Fluffy wheat bun, shiitake mushroom, house teriyaki sauce, black truffle oil, microgreens',
    serving: 'Set of 2 Pieces',
    price: 1250.00,
    kind: 'food',
    image: '/assets/menu-panda-main.png',
    accent: '#a32722',
    available: true,
    featured: true,
    isNew: false,
    dietaryType: 'veg',
    spiceLevel: 'mild',
  };

  const foodRes = await fetch(`${BASE_URL}/api/products`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(foodData),
  });
  const foodJson = await foodRes.json();
  console.log(`   POST /api/products (food) status: ${foodRes.status}, id: ${foodJson.data?.id}`);
  if (foodRes.status !== 201 || !foodJson.data?.id) {
    throw new Error(`Failed to create food: ${JSON.stringify(foodJson)}`);
  }
  const foodId = foodJson.data.id;

  // Step 6: Verify Customer Website Fetch (/api/products)
  console.log('\n6. Verifying Customer Website Queries (/api/products)...');
  
  // Public query: all available products
  const pubRes = await fetch(`${BASE_URL}/api/products`);
  const pubJson = await pubRes.json();
  console.log(`   GET /api/products -> count: ${pubJson.count}`);
  if (pubJson.count !== 2) throw new Error(`Expected 2 public products, got ${pubJson.count}`);

  // Kind filter: drinks for MenuCarousel
  const drinkFilterRes = await fetch(`${BASE_URL}/api/products?kind=drink`);
  const drinkFilterJson = await drinkFilterRes.json();
  console.log(`   GET /api/products?kind=drink -> count: ${drinkFilterJson.count}, name: "${drinkFilterJson.data[0]?.name}"`);
  if (drinkFilterJson.count !== 1 || drinkFilterJson.data[0].id !== drinkId) {
    throw new Error('Kind=drink filter did not return expected drink');
  }

  // Kind filter: food for KitchenPage
  const foodFilterRes = await fetch(`${BASE_URL}/api/products?kind=food`);
  const foodFilterJson = await foodFilterRes.json();
  console.log(`   GET /api/products?kind=food -> count: ${foodFilterJson.count}, name: "${foodFilterJson.data[0]?.name}"`);
  if (foodFilterJson.count !== 1 || foodFilterJson.data[0].id !== foodId) {
    throw new Error('Kind=food filter did not return expected food');
  }

  // Step 7: Verify Edit Product (PUT /api/products/:id)
  console.log('\n7. Testing Product Edit (PUT /api/products/:id)...');
  const editRes = await fetch(`${BASE_URL}/api/products/${foodId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      price: 1350.00,
      description: 'Updated premium description for truffle bao.',
      spiceLevel: 'medium',
    }),
  });
  const editJson = await editRes.json();
  console.log(`   PUT /api/products/${foodId} status: ${editRes.status}, new price: ${editJson.data?.price}, spice: ${editJson.data?.spiceLevel}`);
  if (editJson.data?.price !== 1350 || editJson.data?.spiceLevel !== 'medium') {
    throw new Error('Edit product failed to update values properly');
  }

  // Step 8: Verify Toggle Availability (Hide Drink from Menu)
  console.log('\n8. Testing Toggle Product Availability...');
  const toggleRes = await fetch(`${BASE_URL}/api/products/${drinkId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ available: false }),
  });
  const toggleJson = await toggleRes.json();
  console.log(`   Toggled drink available to false: ${toggleJson.data?.available === false}`);

  // Check public endpoint - drink must disappear from public view
  const pubAfterHideRes = await fetch(`${BASE_URL}/api/products`);
  const pubAfterHideJson = await pubAfterHideRes.json();
  console.log(`   GET /api/products (public) count after hiding drink: ${pubAfterHideJson.count} (expected 1)`);
  if (pubAfterHideJson.count !== 1 || pubAfterHideJson.data[0].id !== foodId) {
    throw new Error('Unavailable drink was not hidden from public query');
  }

  // Check admin endpoint - admin sees all products including unavailable
  const adminQueryRes = await fetch(`${BASE_URL}/api/products?all=true`, {
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  const adminQueryJson = await adminQueryRes.json();
  console.log(`   GET /api/products?all=true (admin) count: ${adminQueryJson.count} (expected 2)`);
  if (adminQueryJson.count !== 2) throw new Error('Admin did not see unavailable item');

  // Step 9: Verify Real PostgreSQL Persistence
  console.log('\n9. Verifying Real PostgreSQL Persistence directly in zencafe_db...');
  const dbCheck = await pool.query(
    'SELECT id, name, kind, price, is_available, is_featured, dietary_type, dairy_type, spice_level FROM public.products ORDER BY id'
  );
  console.log('   PostgreSQL public.products rows:');
  dbCheck.rows.forEach(row => {
    console.log(`   - [ID ${row.id}] ${row.name} (${row.kind}) | LKR ${row.price} | available: ${row.is_available} | featured: ${row.is_featured} | dietary: ${row.dietary_type} | dairy: ${row.dairy_type} | spice: ${row.spice_level}`);
  });
  if (dbCheck.rows.length !== 2) throw new Error('PostgreSQL does not reflect 2 products');

  // Step 10: Delete Products (Clean up)
  console.log('\n10. Testing Product Deletion via Authenticated DELETE...');
  const delDrinkRes = await fetch(`${BASE_URL}/api/products/${drinkId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  console.log(`   DELETE drink (${drinkId}) status: ${delDrinkRes.status}`);

  const delFoodRes = await fetch(`${BASE_URL}/api/products/${foodId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  console.log(`   DELETE food (${foodId}) status: ${delFoodRes.status}`);

  // Step 11: Final Clean State Verification
  console.log('\n11. Verifying Database Cleaned Up to 0 Products...');
  const finalDbCheck = await pool.query('SELECT count(*) as count FROM public.products');
  console.log(`   Final PostgreSQL products count: ${finalDbCheck.rows[0].count}`);
  if (Number(finalDbCheck.rows[0].count) !== 0) throw new Error('Database products were not cleaned up');

  const finalPubRes = await fetch(`${BASE_URL}/api/products`);
  const finalPubJson = await finalPubRes.json();
  console.log(`   Final GET /api/products count: ${finalPubJson.count}`);
  if (finalPubJson.count !== 0) throw new Error('Public endpoint still has products');

  console.log('\n✅ ALL API, AUTH, CRUD, TOGGLE, PERSISTENCE & SECURITY TESTS PASSED 100%!\n');
}

run()
  .catch(err => {
    console.error('\n❌ Verification Failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
