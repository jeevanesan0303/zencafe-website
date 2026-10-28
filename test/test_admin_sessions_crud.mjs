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
})

async function run() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Test INSERT
    await client.query(
      `INSERT INTO public.admin_sessions (token_hash, user_id, csrf_token_hash, expires_at, created_at)
       VALUES ('test_token_hash_verify', 2, 'test_csrf_hash_verify', NOW() + INTERVAL '1 hour', NOW())`
    )
    console.log('✅ INSERT privilege verified.')

    // Test UPDATE
    await client.query(
      `UPDATE public.admin_sessions SET revoked_at = NOW() WHERE token_hash = 'test_token_hash_verify'`
    )
    console.log('✅ UPDATE privilege verified.')

    // Test SELECT
    const res = await client.query(
      `SELECT token_hash, user_id, revoked_at FROM public.admin_sessions WHERE token_hash = 'test_token_hash_verify'`
    )
    console.log('✅ SELECT privilege verified. Row count:', res.rows.length)

    // Test DELETE
    await client.query(
      `DELETE FROM public.admin_sessions WHERE token_hash = 'test_token_hash_verify'`
    )
    console.log('✅ DELETE privilege verified.')

    await client.query('ROLLBACK')
    console.log('✅ Rolled back cleanly. All 4 privileges (SELECT, INSERT, UPDATE, DELETE) fully working for zencafe_app on public.admin_sessions!')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(err => {
  console.error('Privilege test failed:', err)
  process.exit(1)
})
