// server/check_offers_state.mjs
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 55432),
  database: process.env.DB_NAME || 'zencafe_db',
  user: process.env.DB_USER || 'zencafe_app',
  password: process.env.DB_PASSWORD,
  ssl: false,
})

async function run() {
  console.log('=== CHECKING POSTGRESQL STATE FOR ZEN CAFÉ OFFERS ===\n')

  // 1. Verify target database and user
  const dbInfo = await pool.query('SELECT current_database() as db, current_user as u')
  const { db, u } = dbInfo.rows[0]
  console.log(`Database: "${db}" (expected: "zencafe_db")`)
  console.log(`User: "${u}" (expected: "zencafe_app")`)

  if (db !== 'zencafe_db') {
    throw new Error(`CRITICAL: Connected to "${db}" instead of "zencafe_db"!`)
  }

  // 2. Check migrations table
  const migrations = await pool.query(`
    SELECT version, name, applied_at
    FROM public.zen_schema_migrations
    ORDER BY id ASC
  `)
  console.log('\nApplied migrations in public.zen_schema_migrations:')
  console.table(migrations.rows)

  // 3. Check public.offers columns
  const cols = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offers'
    ORDER BY ordinal_position
  `)
  console.log('\nColumns in public.offers:')
  console.table(cols.rows)

  const hasCode = cols.rows.some(c => c.column_name === 'code')
  console.log(`\nIs 'code' column present in public.offers? ${hasCode}`)

  // 4. Count rows in public.offers
  const count = await pool.query('SELECT count(*) as count FROM public.offers')
  console.log(`Current rows in public.offers: ${count.rows[0].count}`)
}

run()
  .catch(err => {
    console.error('Check failed:', err)
    process.exit(1)
  })
  .finally(() => pool.end())
