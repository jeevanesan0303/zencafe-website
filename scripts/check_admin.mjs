import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const pool = new pg.Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT) || 55432,
  user: process.env.PGUSER || 'zencafe_app',
  password: process.env.PGPASSWORD || 'ZeCafe2026@',
  database: process.env.PGDATABASE || 'zencafe_db',
})

async function main() {
  const res = await pool.query("SELECT id, name, email, role, is_active FROM public.users WHERE role = 'admin'")
  console.log('ADMIN_USERS:', JSON.stringify(res.rows, null, 2))
  await pool.end()
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
