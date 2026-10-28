import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

dotenv.config({ path: path.join(projectRoot, '.env') })

const { getDbPool } = await import('./db.mjs')

async function verify() {
  const pool = await getDbPool()
  try {
    // 1. Confirm active DB & user
    const dbRes = await pool.query('SELECT current_database(), current_user')
    console.log('\n--- 1. ACTIVE DB & USER ---')
    console.log(dbRes.rows[0])

    // 2. User permissions on public schema & tables
    const permRes = await pool.query(`
      SELECT 
        table_name,
        privilege_type 
      FROM information_schema.table_privileges 
      WHERE grantee = current_user AND table_schema = 'public' AND table_name IN ('products', 'categories')
      ORDER BY table_name, privilege_type
    `)
    console.log('\n--- 2. TABLE PRIVILEGES FOR zencafe_app ---')
    console.table(permRes.rows)

    const schemaPerm = await pool.query(`
      SELECT 
        has_schema_privilege(current_user, 'public', 'CREATE') as can_create_in_schema,
        has_schema_privilege(current_user, 'public', 'USAGE') as can_use_schema,
        has_table_privilege(current_user, 'public.products', 'SELECT') as can_select_products,
        has_table_privilege(current_user, 'public.products', 'INSERT') as can_insert_products,
        has_table_privilege(current_user, 'public.products', 'UPDATE') as can_update_products,
        has_table_privilege(current_user, 'public.products', 'DELETE') as can_delete_products
    `)
    console.log('\n--- 3. SCHEMA & TABLE PRIVILEGES ---')
    console.table(schemaPerm.rows)

    // Check table owner
    const ownerRes = await pool.query(`
      SELECT schemaname, tablename, tableowner 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename IN ('products', 'categories')
    `)
    console.log('\n--- 4. TABLE OWNERSHIP ---')
    console.table(ownerRes.rows)

    // Check if user is superuser or can alter table
    const alterCheck = await pool.query(`
      SELECT rolsuper, rolcreaterole, rolcreatedb 
      FROM pg_roles 
      WHERE rolname = current_user
    `)
    console.log('\n--- 5. ROLE ATTRIBUTES ---')
    console.table(alterCheck.rows)

    // 3. Inspect columns of products and categories
    const colRes = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'products'
      ORDER BY ordinal_position
    `)
    console.log('\n--- 6. EXISTING COLUMNS IN public.products ---')
    console.table(colRes.rows)

    // 4. Check if any proposed columns already exist
    const proposed = ['kind', 'ingredients', 'serving', 'accent', 'is_new', 'spice_level', 'dietary_type', 'dairy_type']
    const existingCols = colRes.rows.map(r => r.column_name)
    const alreadyExist = proposed.filter(c => existingCols.includes(c))
    console.log('\n--- 7. PROPOSED COLUMNS ALREADY EXISTING ---')
    console.log(alreadyExist.length > 0 ? alreadyExist : 'None of the 8 columns exist yet.')

    // Check indexes
    const indexRes = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public' AND tablename IN ('products', 'categories')
    `)
    console.log('\n--- 8. EXISTING INDEXES ---')
    console.table(indexRes.rows)

  } finally {
    await pool.end()
  }
}

verify().catch(console.error)
