// server/inspect_bookings_db.mjs
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
  console.log('=== INSPECTING ZEN CAFÉ DATABASE (BOOKINGS & RELATED TABLES) ===\n')

  // 1. Verify DB and user
  const dbInfo = await pool.query('SELECT current_database() as db, current_user as u')
  console.log(`Database: "${dbInfo.rows[0].db}", User: "${dbInfo.rows[0].u}"`)
  if (dbInfo.rows[0].db !== 'zencafe_db' || dbInfo.rows[0].u !== 'zencafe_app') {
    throw new Error('Not connected to zencafe_db as zencafe_app!')
  }

  // 2. List all tables in public schema
  const tables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `)
  console.log('\nAll tables in public schema:')
  console.table(tables.rows)

  // 3. For any table that might be relevant (bookings, rooms, settings, notifications, etc.)
  const targetTables = tables.rows
    .map(r => r.table_name)
    .filter(name => /booking|room|notif|setting|outbox|avail/i.test(name))

  console.log('\nTarget relevant tables found:', targetTables)

  for (const tableName of targetTables) {
    console.log(`\n-----------------------------------------`)
    console.log(`TABLE: public.${tableName}`)
    console.log(`-----------------------------------------`)

    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName])
    console.table(cols.rows)

    // Constraints & indexes
    const constraints = await pool.query(`
      SELECT conname, contype, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND conrelid = $1::regclass
    `, [`public.${tableName}`])
    console.log('Constraints:')
    console.table(constraints.rows)

    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
    `, [tableName])
    console.log('Indexes:')
    console.table(indexes.rows)

    const count = await pool.query(`SELECT count(*) as count FROM public.${tableName}`)
    console.log(`Row count: ${count.rows[0].count}`)

    if (Number(count.rows[0].count) > 0 && Number(count.rows[0].count) <= 5) {
      const sample = await pool.query(`SELECT * FROM public.${tableName} LIMIT 5`)
      console.log('Sample rows:')
      console.log(sample.rows)
    }
  }

  // 4. Also check applied migrations
  const migrations = await pool.query(`
    SELECT version, name, applied_at
    FROM public.zen_schema_migrations
    ORDER BY id ASC
  `)
  console.log('\nApplied migrations:')
  console.table(migrations.rows)
}

run()
  .catch(err => {
    console.error('Inspection failed:', err)
    process.exit(1)
  })
  .finally(() => pool.end())
