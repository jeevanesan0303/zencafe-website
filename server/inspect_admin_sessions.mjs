// server/inspect_admin_sessions.mjs
// Zen Café — Phase 7.1: Read-only inspection of public.admin_sessions in zencafe_db

import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'zencafe_app',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'zencafe_db',
  connectionTimeoutMillis: 5000,
})

async function inspect() {
  console.log('Connecting to PostgreSQL database...')
  const client = await pool.connect()

  try {
    const dbInfo = await client.query('SELECT current_database(), current_user, version()')
    console.log('Connected to:', dbInfo.rows[0])

    // 1. Check if public.admin_sessions exists
    const tableExistsRes = await client.query(`
      SELECT to_regclass('public.admin_sessions') AS table_regclass
    `)
    const tableExists = Boolean(tableExistsRes.rows[0]?.table_regclass)

    console.log('\n======================================================')
    console.log(`TABLE public.admin_sessions exists: ${tableExists}`)
    console.log('======================================================')

    if (!tableExists) {
      console.log('public.admin_sessions does NOT exist in zencafe_db.')
      
      // Also inspect what session-related tables DO exist
      const sessionTables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name LIKE '%session%'
      `)
      console.log('Session-related tables in public schema:', sessionTables.rows.map(r => r.table_name))
      return { exists: false }
    }

    // 2. Inspect columns and data types
    const columnsRes = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        udt_name, 
        is_nullable, 
        column_default, 
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'admin_sessions'
      ORDER BY ordinal_position
    `)
    console.log('\n--- COLUMNS ---')
    console.table(columnsRes.rows)

    // 3. Inspect Primary Key & Constraints
    const constraintsRes = await client.query(`
      SELECT 
        tc.constraint_name, 
        tc.constraint_type, 
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name = 'admin_sessions'
    `)
    console.log('\n--- CONSTRAINTS ---')
    console.table(constraintsRes.rows)

    // 4. Inspect Foreign Keys
    const fksRes = await client.query(`
      SELECT 
        tc.constraint_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule,
        rc.update_rule
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu 
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu 
        ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_schema = 'public' 
        AND tc.table_name = 'admin_sessions'
    `)
    console.log('\n--- FOREIGN KEYS ---')
    console.table(fksRes.rows)

    // 5. Inspect Indexes
    const indexesRes = await client.query(`
      SELECT 
        indexname, 
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public' AND tablename = 'admin_sessions'
    `)
    console.log('\n--- INDEXES ---')
    console.table(indexesRes.rows)

    // 6. Inspect Row count and existing structure
    const countRes = await client.query('SELECT COUNT(*) FROM public.admin_sessions')
    console.log('\n--- ROW COUNT ---', countRes.rows[0].count)

    const sampleRes = await client.query('SELECT * FROM public.admin_sessions LIMIT 5')
    console.log('\n--- SAMPLE ROWS (limit 5) ---')
    console.log(JSON.stringify(sampleRes.rows, null, 2))

    return {
      exists: true,
      columns: columnsRes.rows,
      constraints: constraintsRes.rows,
      foreignKeys: fksRes.rows,
      indexes: indexesRes.rows,
      rowCount: countRes.rows[0].count,
      sampleRows: sampleRes.rows,
    }
  } finally {
    client.release()
    await pool.end()
  }
}

inspect()
  .then(res => {
    console.log('\nInspection complete.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Inspection error:', err.message);
    process.exit(1);
  });
