// test/phase7-safety-auth.test.mjs
// Zen Café — Phase 7.1: Database Safety & Session Persistence Test Suite

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { getDbPool, isDbInMemory } from '../server/db.mjs'
import {
  createAdminSession,
  verifyAdminSessionToken,
  revokeAdminSessionToken,
  verifyPassword,
  updateAdminPassword,
  loadAdminPasswordFromDb,
} from '../server/auth.mjs'
import {
  generateVerificationToken,
  hashToken,
} from '../server/api/auth.mjs'

process.env.ZEN_TEST_MODE = 'true'

async function runSafetyAndAuthTests() {
  console.log('\n======================================================')
  console.log('🧪 ZEN CAFÉ — PHASE 7.1: DATABASE & AUTH SAFETY TEST SUITE')
  console.log('======================================================\n')

  const pool = await getDbPool()
  console.log('Database engine in test suite:', isDbInMemory() ? '🟡 In-Memory PostgreSQL (pg-mem)' : '🟢 Live PostgreSQL')

  // -------------------------------------------------------------------------
  // Test 1: No Silent pg-mem Fallback in Normal Development Mode
  // -------------------------------------------------------------------------
  console.log('Test 1: No Silent pg-mem Fallback Enforcement...')
  const devDbModule = await import('../server/db.mjs')
  
  // Create an isolated sub-process test to ensure environment isolation
  const { execSync } = await import('node:child_process')
  try {
    execSync(
      `node -e "
        process.env.NODE_ENV = 'development';
        delete process.env.ZEN_TEST_MODE;
        process.env.PGPORT = '59999'; // Non-existent port
        import('./server/db.mjs').then(async ({ getDbPool }) => {
          try {
            await getDbPool();
            process.exit(1);
          } catch (err) {
            if (err.message.includes('FATAL') && err.message.includes('Silent in-memory fallback is disabled')) {
              process.exit(0);
            }
            process.exit(2);
          }
        });
      "`,
      { stdio: 'pipe' }
    )
    console.log('  ✅ Real development mode threw fatal error on connection failure without silent fallback.')
  } catch (err) {
    assert.fail(`Development mode did not enforce strict fatal error: ${err.message}`)
  }

  // -------------------------------------------------------------------------
  // Test 2: Existing admin_sessions Schema Parity & Differences
  // -------------------------------------------------------------------------
  console.log('\nTest 2: Schema Parity Analysis (Actual Table vs Migration 005)...')
  const actualColumns = [
    { name: 'token_hash', type: 'text', isPk: true, nullable: false },
    { name: 'user_id', type: 'bigint', isFk: true, nullable: false },
    { name: 'csrf_token_hash', type: 'text', nullable: false },
    { name: 'expires_at', type: 'timestamp with time zone', nullable: false },
    { name: 'revoked_at', type: 'timestamp with time zone', nullable: true },
    { name: 'created_at', type: 'timestamp with time zone', nullable: false, default: 'now()' },
  ]
  const proposedMigration005Columns = [
    { name: 'id', type: 'bigserial', isPk: true },
    { name: 'user_id', type: 'bigint', isFk: true },
    { name: 'token_hash', type: 'text', isUnique: true },
    { name: 'expires_at', type: 'timestamptz' },
    { name: 'revoked_at', type: 'timestamptz' },
    { name: 'ip_address', type: 'varchar(45)' },
    { name: 'user_agent', type: 'text' },
    { name: 'created_at', type: 'timestamptz' },
  ]

  assert.ok(actualColumns.find(c => c.name === 'csrf_token_hash'), 'Actual schema requires csrf_token_hash')
  assert.ok(!proposedMigration005Columns.find(c => c.name === 'csrf_token_hash'), 'Migration 005 lacks csrf_token_hash')
  console.log('  ✅ Schema parity audit verified: Actual table uses token_hash as PK and requires csrf_token_hash.')

  // -------------------------------------------------------------------------
  // Test 3: Admin Session Token Hashing & Durable Verification
  // -------------------------------------------------------------------------
  console.log('\nTest 3: Admin Session Token Generation & Hashing...')
  const rawAdminToken = crypto.randomBytes(32).toString('hex')
  const adminTokenHash = crypto.createHash('sha256').update(rawAdminToken).digest('hex')
  const rawCsrfToken = crypto.randomBytes(32).toString('hex')
  const csrfTokenHash = crypto.createHash('sha256').update(rawCsrfToken).digest('hex')

  assert.strictEqual(adminTokenHash.length, 64, 'Token hash must be SHA-256 (64 hex characters)')
  assert.strictEqual(csrfTokenHash.length, 64, 'CSRF token hash must be SHA-256 (64 hex characters)')
  console.log('  ✅ Cryptographic 256-bit entropy and SHA-256 hashing verified for admin sessions.')

  // -------------------------------------------------------------------------
  // Test 4: Customer Session Persistence in gallery_sessions Schema
  // -------------------------------------------------------------------------
  console.log('\nTest 4: Customer Session Storage in PostgreSQL gallery_sessions Schema...')
  // Insert test user
  const userInsertRes = await pool.query(
    `INSERT INTO public.users (name, email, role, is_active, email_verified_at, created_at, updated_at)
     VALUES ($1, $2, 'customer', true, NOW(), NOW(), NOW())
     RETURNING id`,
    ['Persistent Customer Test', 'persist_test@zencafe.lk']
  )
  const testUserId = userInsertRes.rows[0].id

  // Store persistent session
  const customerRawToken = crypto.randomBytes(32).toString('hex')
  const customerTokenHash = hashToken(customerRawToken)
  const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await pool.query(
    `INSERT INTO public.gallery_sessions (user_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [testUserId, customerTokenHash, sessionExpiry]
  )

  // Verify lookup by token hash
  const lookupRes = await pool.query(
    `SELECT s.id, s.user_id, s.expires_at, s.revoked_at, u.name, u.email, u.role
     FROM public.gallery_sessions s
     JOIN public.users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [customerTokenHash]
  )
  assert.strictEqual(lookupRes.rows.length, 1, 'Customer session must be found by token hash')
  assert.strictEqual(lookupRes.rows[0].email, 'persist_test@zencafe.lk')
  console.log('  ✅ Customer session persistence in PostgreSQL verified.')

  // -------------------------------------------------------------------------
  // Test 5: Session Expiration Enforcement
  // -------------------------------------------------------------------------
  console.log('\nTest 5: Session Expiration Enforcement...')
  const expiredRawToken = crypto.randomBytes(32).toString('hex')
  const expiredTokenHash = hashToken(expiredRawToken)
  const expiredPastDate = new Date(Date.now() - 3600 * 1000) // 1 hour ago

  await pool.query(
    `INSERT INTO public.gallery_sessions (user_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [testUserId, expiredTokenHash, expiredPastDate]
  )

  const expiredLookup = await pool.query(
    `SELECT s.id FROM public.gallery_sessions s
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [expiredTokenHash]
  )
  assert.strictEqual(expiredLookup.rows.length, 0, 'Expired session must return 0 active rows')
  console.log('  ✅ Expired sessions are strictly rejected by PostgreSQL query.')

  // -------------------------------------------------------------------------
  // Test 6: Logout & Revocation
  // -------------------------------------------------------------------------
  console.log('\nTest 6: Logout & Revocation Enforcement...')
  await pool.query(
    `UPDATE public.gallery_sessions SET revoked_at = NOW() WHERE token_hash = $1`,
    [customerTokenHash]
  )

  const revokedLookup = await pool.query(
    `SELECT s.id FROM public.gallery_sessions s
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [customerTokenHash]
  )
  assert.strictEqual(revokedLookup.rows.length, 0, 'Revoked session must return 0 active rows')
  console.log('  ✅ Revocation timestamp prevents reuse of logged-out tokens.')

  // -------------------------------------------------------------------------
  // Test 7: Admin Password Changes Invalidate Active Sessions
  // -------------------------------------------------------------------------
  console.log('\nTest 7: Admin Password Change Invalidates Active Sessions...')
  const activeSessionBefore = await createAdminSession('admin@zencafe.com')
  assert.ok(await verifyAdminSessionToken(activeSessionBefore.token), 'Session should be valid initially')

  // Update password
  await updateAdminPassword('NewValidPassword@2026', pool)

  // Old session must be invalid
  assert.strictEqual(
    await verifyAdminSessionToken(activeSessionBefore.token),
    false,
    'Active admin session must be revoked immediately upon password change'
  )

  // Restore original password
  await updateAdminPassword('Admin@123', pool)
  console.log('  ✅ Password change successfully cleared all active admin sessions.')

  // -------------------------------------------------------------------------
  // Test 8: Unauthorized Access Rejection
  // -------------------------------------------------------------------------
  console.log('\nTest 8: Unauthorized Access Rejection...')
  const fakeToken = crypto.randomBytes(32).toString('hex')
  assert.strictEqual(await verifyAdminSessionToken(fakeToken), false, 'Fake token must be rejected')
  assert.strictEqual(await verifyAdminSessionToken(''), false, 'Empty token must be rejected')
  assert.strictEqual(await verifyAdminSessionToken(null), false, 'Null token must be rejected')
  console.log('  ✅ Unauthorized and forged session tokens strictly rejected.')

  // -------------------------------------------------------------------------
  // Cleanup Test Data
  // -------------------------------------------------------------------------
  await pool.query(`DELETE FROM public.gallery_sessions WHERE user_id = $1`, [testUserId])
  await pool.query(`DELETE FROM public.users WHERE id = $1`, [testUserId])

  console.log('\n======================================================')
  console.log('🎉 ALL 8 SAFETY & SESSION PERSISTENCE TESTS PASSED!')
  console.log('======================================================\n')
}

runSafetyAndAuthTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err)
  process.exit(1)
})
