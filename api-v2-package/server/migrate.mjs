// server/migrate.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import dotenv from 'dotenv'

const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

dotenv.config({ path: path.join(projectRoot, '.env') })

const EXPECTED_DATABASE = 'zencafe_db'
const EXPECTED_USER = 'zencafe_app'

// Verified list of approved additive migrations
const APPROVED_MIGRATIONS = [
  {
    version: '002',
    file: '002_extend_products_attributes.sql',
    table: 'products',
    columns: [
      { name: 'kind', type: 'character varying' },
      { name: 'ingredients', type: 'text' },
      { name: 'serving', type: 'character varying' },
      { name: 'accent', type: 'character varying' },
      { name: 'is_new', type: 'boolean' },
      { name: 'spice_level', type: 'character varying' },
      { name: 'dietary_type', type: 'character varying' },
      { name: 'dairy_type', type: 'character varying' },
    ],
  },
  {
    version: '003',
    file: '003_add_code_to_offers.sql',
    table: 'offers',
    columns: [
      { name: 'code', type: 'character varying' },
    ],
  },
  {
    version: '004',
    file: '004_add_room_name_and_booking_blocks.sql',
    table: 'bookings',
    columns: [
      { name: 'room_name', type: 'character varying' },
    ],
  },
]

async function runMigration() {
  console.log('\n======================================================')
  console.log('📦 ZEN CAFÉ — SAFE DATABASE MIGRATION RUNNER')
  console.log('======================================================\n')

  const connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL

  const hasConfig = Boolean(connectionString || process.env.PGHOST)

  if (!hasConfig) {
    console.error('❌ Error: No PostgreSQL configuration detected.')
    console.error('Please configure .env before running migrations.')
    process.exit(1)
  }

  const ssl = process.env.PGSSLMODE === 'disable' ? false : false

  const pool = new Pool(
    connectionString
      ? { connectionString, ssl }
      : {
          host: process.env.PGHOST || '127.0.0.1',
          port: Number(process.env.PGPORT || 55432),
          user: process.env.PGUSER || EXPECTED_USER,
          password: process.env.PGPASSWORD,
          database: process.env.PGDATABASE || EXPECTED_DATABASE,
          ssl,
          connectionTimeoutMillis: 5000,
        }
  )

  let client
  try {
    client = await pool.connect()
  } catch (err) {
    console.error(`❌ Connection failed: Unable to connect to PostgreSQL at ${process.env.PGHOST}:${process.env.PGPORT} (${err.message}).`)
    console.error('Please ensure the SSH tunnel is active: ssh -N -L 55432:127.0.0.1:5432 root@200.141.10.226')
    process.exit(1)
  }

  try {
    // 1. Safety check: Verify target database and user
    const dbInfo = await client.query('SELECT current_database(), current_user')
    const currentDb = dbInfo.rows[0].current_database
    const currentUser = dbInfo.rows[0].current_user

    console.log(`Connected to database: "${currentDb}" as user: "${currentUser}"`)

    if (currentDb !== EXPECTED_DATABASE) {
      throw new Error(`Safety violation: Refusing to run migrations on database "${currentDb}". Target MUST be "${EXPECTED_DATABASE}".`)
    }

    if (currentUser !== EXPECTED_USER) {
      console.warn(`⚠️ Warning: Running as user "${currentUser}" instead of expected "${EXPECTED_USER}".`)
    }

    // 2. Ensure migration tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.zen_schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    for (const migration of APPROVED_MIGRATIONS) {
      const migrationCheck = await client.query(
        'SELECT version, applied_at FROM public.zen_schema_migrations WHERE version = $1',
        [migration.version]
      )

      if (migrationCheck.rows.length > 0) {
        console.log(`ℹ️ Migration ${migration.version} (${migration.file}) was already applied at ${migrationCheck.rows[0].applied_at.toISOString()}.`)
      } else {
        const migrationPath = path.join(projectRoot, 'migrations', migration.file)
        if (!fs.existsSync(migrationPath)) {
          throw new Error(`Migration file not found at: ${migrationPath}`)
        }

        const sql = fs.readFileSync(migrationPath, 'utf8')
        console.log(`\nExecuting migration ${migration.version}: migrations/${migration.file}...`)
        
        await client.query('BEGIN')
        await client.query(sql)

        await client.query(
          'INSERT INTO public.zen_schema_migrations (version, name, applied_at) VALUES ($1, $2, NOW()) ON CONFLICT (version) DO NOTHING',
          [migration.version, migration.file]
        )

        await client.query('COMMIT')
        console.log(`✅ Migration ${migration.file} committed successfully.`)
      }

      // Verify columns for the migration
      const cols = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
      `, [migration.table])
      
      const colMap = new Map(cols.rows.map(r => [r.column_name, r.data_type]))
      for (const col of migration.columns) {
        if (!colMap.has(col.name)) {
          throw new Error(`Column ${col.name} missing from public.${migration.table}!`)
        }
        console.log(`  ✓ public.${migration.table}.${col.name} (${colMap.get(col.name)})`)
      }
    }

    console.log('\n✅ All approved migrations verified successfully!\n')
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {})
    }
    console.error('\n❌ Migration failed:', err.message)
    process.exit(1)
  } finally {
    if (client) client.release()
    await pool.end()
  }
}

runMigration()
