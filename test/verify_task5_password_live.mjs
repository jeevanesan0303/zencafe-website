// test/verify_task5_password_live.mjs
// Verification of admin password persistence and isolation against real PostgreSQL database

import pg from 'pg'
import dotenv from 'dotenv'
import crypto from 'node:crypto'

dotenv.config()

const { Pool } = pg
const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
})

async function testPasswordPersistence() {
  console.log('\n======================================================')
  console.log('🔒 TASK 5: ADMIN PASSWORD PERSISTENCE VERIFICATION')
  console.log('======================================================\n')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Inspect initial records
    const initialRes = await client.query('SELECT id, email, role, password_hash FROM public.users ORDER BY id')
    const initialAdmin = initialRes.rows.find(u => u.role === 'admin')
    const initialCustomer = initialRes.rows.find(u => u.role === 'customer')

    console.log('1. Initial admin record identified: ID', initialAdmin.id, initialAdmin.email)
    console.log('   Initial customer record identified: ID', initialCustomer.id, initialCustomer.email)

    // 2. Perform test update with secure scrypt
    const testSalt = crypto.randomBytes(16).toString('hex')
    const testKey = crypto.scryptSync('TemporaryTestPass@123', testSalt, 64).toString('hex')
    const testHash = `${testSalt}:${testKey}`

    await client.query(
      "UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE role = 'admin' OR LOWER(email) = LOWER($2)",
      [testHash, 'admin@zencafe.com']
    )

    // 3. Verify admin record was updated
    const afterRes = await client.query('SELECT id, email, role, password_hash FROM public.users ORDER BY id')
    const afterAdmin = afterRes.rows.find(u => u.role === 'admin')
    const afterCustomer = afterRes.rows.find(u => u.role === 'customer')

    if (afterAdmin.password_hash !== testHash) {
      throw new Error('Admin password hash was not updated!')
    }
    console.log('2. ✅ Admin password hash securely updated in PostgreSQL to scrypt format.')

    // 4. Verify customer record was NOT touched
    if (afterCustomer.password_hash !== initialCustomer.password_hash) {
      throw new Error('Customer record was accidentally modified!')
    }
    console.log('3. ✅ Customer record was completely untouched and unmutated.')

    // 5. Test restart restoration query
    const restoreRes = await client.query(
      "SELECT password_hash FROM public.users WHERE (role = 'admin' OR LOWER(email) = LOWER($1)) AND password_hash IS NOT NULL LIMIT 1",
      ['admin@zencafe.com']
    )
    if (restoreRes.rows.length === 0 || restoreRes.rows[0].password_hash !== testHash) {
      throw new Error('Server restart restoration query failed to locate persistent hash!')
    }
    console.log('4. ✅ Server restart restoration query successfully retrieved persistent hash.')

    // 6. Rollback to leave database 100% identical to start
    await client.query('ROLLBACK')
    console.log('5. ✅ Transaction safely rolled back: No permanent modifications made.')

    // 7. Verify database state is identical to start
    const finalRes = await client.query('SELECT id, email, role, password_hash FROM public.users ORDER BY id')
    const finalAdmin = finalRes.rows.find(u => u.role === 'admin')
    if (finalAdmin.password_hash !== initialAdmin.password_hash) {
      throw new Error('Database state did not revert!')
    }
    console.log('6. ✅ Verified: Original database records completely preserved.')

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

testPasswordPersistence()
  .then(() => {
    console.log('\n🎉 Task 5 Verification PASSED on live PostgreSQL!\n')
    process.exit(0)
  })
  .catch(err => {
    console.error('\n❌ Task 5 Verification FAILED:', err)
    process.exit(1)
  })
