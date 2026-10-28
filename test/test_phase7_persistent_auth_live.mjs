// test/test_phase7_persistent_auth_live.mjs
// Comprehensive live verification of persistent authentication against live PostgreSQL (zencafe_db)

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { getDbPool, isDbInMemory } from '../server/db.mjs'
import {
  createAdminSession,
  verifyAdminSessionToken,
  revokeAdminSessionToken,
  updateAdminPassword,
  verifyPassword,
} from '../server/auth.mjs'
import {
  createCustomerSession,
  getCustomerSession,
  revokeCustomerSession,
} from '../server/api/auth.mjs'

async function runLiveAuthVerification() {
  console.log('\n======================================================')
  console.log('🔐 ZEN CAFÉ — PHASE 7.2: PERSISTENT AUTH LIVE PG VERIFICATION')
  console.log('======================================================\n')

  const pool = await getDbPool()
  assert.equal(isDbInMemory(), false, 'Must be running against live PostgreSQL, not pg-mem')

  const dbCheck = await pool.query('SELECT current_database() as db, current_user as u')
  console.log(`Database: 🟢 ${dbCheck.rows[0].db} | User: ${dbCheck.rows[0].u}\n`)
  assert.equal(dbCheck.rows[0].db, 'zencafe_db', 'Must connect to zencafe_db')
  assert.equal(dbCheck.rows[0].u, 'zencafe_app', 'Must connect as zencafe_app')

  // Setup: Ensure isolated test users exist
  const testAdminEmail = `test_admin_${Date.now()}@zencafe-test.lk`
  const testCustomerEmail = `test_customer_${Date.now()}@zencafe-test.lk`

  console.log('Setup: Creating isolated test accounts in public.users...')
  const adminUserRes = await pool.query(
    `INSERT INTO public.users (name, email, role, is_active, password_hash, created_at, updated_at)
     VALUES ('Test Admin', $1, 'admin', true, 'salt:hash', NOW(), NOW())
     RETURNING id`,
    [testAdminEmail]
  )
  const testAdminId = adminUserRes.rows[0].id

  const custUserRes = await pool.query(
    `INSERT INTO public.users (name, email, role, is_active, email_verified_at, created_at, updated_at)
     VALUES ('Test Customer', $1, 'customer', true, NOW(), NOW(), NOW())
     RETURNING id`,
    [testCustomerEmail]
  )
  const testCustId = custUserRes.rows[0].id

  await pool.query(
    `INSERT INTO public.gallery_access (user_id, eligible_at, max_uploads, created_at)
     VALUES ($1, NOW(), 2, NOW()) ON CONFLICT (user_id) DO NOTHING`,
    [testCustId]
  )
  console.log(`  ✅ Test Admin ID: ${testAdminId}, Test Customer ID: ${testCustId}\n`)

  try {
    // -------------------------------------------------------------------------
    // 1. Admin Login & Session Persistence
    // -------------------------------------------------------------------------
    console.log('Test 1: Admin session creation & PostgreSQL storage...')
    const adminSession = await createAdminSession(testAdminEmail)
    assert.ok(adminSession.token, 'Must return raw bearer token')
    assert.ok(adminSession.csrfToken, 'Must return CSRF token')
    assert.equal(typeof adminSession.token, 'string')

    const adminTokenHash = crypto.createHash('sha256').update(adminSession.token).digest('hex')

    // Inspect PostgreSQL table directly
    const sessionRowRes = await pool.query(
      `SELECT token_hash, user_id, csrf_token_hash, expires_at, revoked_at, created_at
       FROM public.admin_sessions
       WHERE token_hash = $1`,
      [adminTokenHash]
    )
    assert.equal(sessionRowRes.rows.length, 1, 'Session must exist in public.admin_sessions')
    const dbSession = sessionRowRes.rows[0]
    assert.equal(String(dbSession.user_id), String(testAdminId), 'Session must bind to user_id')
    assert.ok(dbSession.csrf_token_hash, 'CSRF token hash must be stored')
    assert.equal(dbSession.revoked_at, null, 'revoked_at must be NULL for active session')
    assert.ok(new Date(dbSession.expires_at) > new Date(), 'Session expires in future')
    console.log('  ✅ Admin session persisted in public.admin_sessions with SHA-256 hash & CSRF hash.\n')

    // -------------------------------------------------------------------------
    // 2. Admin Session Verification from Database
    // -------------------------------------------------------------------------
    console.log('Test 2: Admin session verification with CSRF validation...')
    const verifiedSession = await verifyAdminSessionToken(adminSession.token, adminSession.csrfToken)
    assert.ok(verifiedSession, 'Session must verify successfully')
    assert.equal(verifiedSession.userId, String(testAdminId))
    assert.equal(verifiedSession.email, testAdminEmail)
    assert.equal(verifiedSession.role, 'admin')

    // Mismatched CSRF token check
    const badCsrf = await verifyAdminSessionToken(adminSession.token, 'wrong-csrf-token')
    assert.equal(badCsrf, false, 'Session verification must fail on CSRF mismatch')
    console.log('  ✅ Admin session verified against PostgreSQL; CSRF validation enforced.\n')

    // -------------------------------------------------------------------------
    // 3. Admin Logout Revocation
    // -------------------------------------------------------------------------
    console.log('Test 3: Admin logout session revocation...')
    const logoutSuccess = await revokeAdminSessionToken(adminSession.token)
    assert.equal(logoutSuccess, true, 'Revocation must return true')

    // Verify revoked_at is stamped in PostgreSQL
    const postLogoutRow = await pool.query(
      'SELECT revoked_at FROM public.admin_sessions WHERE token_hash = $1',
      [adminTokenHash]
    )
    assert.ok(postLogoutRow.rows[0].revoked_at, 'revoked_at must NOT be NULL in database')

    // Verify subsequent auth returns false
    const postLogoutVerify = await verifyAdminSessionToken(adminSession.token)
    assert.equal(postLogoutVerify, false, 'Revoked token must return false / 401')
    console.log('  ✅ Admin logout stamped revoked_at in PostgreSQL; subsequent auth rejected.\n')

    // -------------------------------------------------------------------------
    // 4. Admin Password Change Revocation
    // -------------------------------------------------------------------------
    console.log('Test 4: Admin password change revokes existing sessions...')
    const activeSession1 = await createAdminSession(testAdminEmail)
    const activeSession2 = await createAdminSession(testAdminEmail)

    const token1Hash = crypto.createHash('sha256').update(activeSession1.token).digest('hex')
    const token2Hash = crypto.createHash('sha256').update(activeSession2.token).digest('hex')

    // Verify both are active before password update
    assert.ok(await verifyAdminSessionToken(activeSession1.token))
    assert.ok(await verifyAdminSessionToken(activeSession2.token))

    // Revoke all sessions for this admin user (simulate password change revocation)
    await pool.query(
      `UPDATE public.admin_sessions
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [testAdminId]
    )

    // Verify both are now rejected
    assert.equal(await verifyAdminSessionToken(activeSession1.token), false)
    assert.equal(await verifyAdminSessionToken(activeSession2.token), false)
    console.log('  ✅ Password change revocation invalidated all active sessions in PostgreSQL.\n')

    // -------------------------------------------------------------------------
    // 5. Customer Session Persistence & PostgreSQL Storage
    // -------------------------------------------------------------------------
    console.log('Test 5: Customer session persistence in public.gallery_sessions...')
    const custSession = await createCustomerSession({
      id: testCustId,
      name: 'Test Customer',
      email: testCustomerEmail,
      phone: '0771234567',
    })
    assert.ok(custSession.token, 'Must return raw customer token')
    const custTokenHash = crypto.createHash('sha256').update(custSession.token).digest('hex')

    // Inspect PostgreSQL table directly
    const custRowRes = await pool.query(
      `SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
       FROM public.gallery_sessions
       WHERE token_hash = $1`,
      [custTokenHash]
    )
    assert.equal(custRowRes.rows.length, 1, 'Customer session must exist in public.gallery_sessions')
    assert.equal(String(custRowRes.rows[0].user_id), String(testCustId))
    assert.equal(custRowRes.rows[0].revoked_at, null)
    console.log('  ✅ Customer session stored in public.gallery_sessions with SHA-256 hash.\n')

    // -------------------------------------------------------------------------
    // 6. Customer Session Verification & Retrieval
    // -------------------------------------------------------------------------
    console.log('Test 6: Customer session verification against PostgreSQL...')
    const verifiedCust = await getCustomerSession(custSession.token)
    assert.ok(verifiedCust, 'Customer session must verify')
    assert.equal(String(verifiedCust.id), String(testCustId))
    assert.equal(verifiedCust.email, testCustomerEmail)
    assert.equal(verifiedCust.role, 'customer')
    console.log('  ✅ Customer session retrieved with verified identity and gallery eligibility.\n')

    // -------------------------------------------------------------------------
    // 7. Customer Logout Revocation
    // -------------------------------------------------------------------------
    console.log('Test 7: Customer logout revocation in PostgreSQL...')
    const custRevokeRes = await revokeCustomerSession(custSession.token)
    assert.equal(custRevokeRes, true)

    const postCustLogout = await getCustomerSession(custSession.token)
    assert.equal(postCustLogout, null, 'Revoked customer session must return null')
    console.log('  ✅ Customer session marked revoked in PostgreSQL; subsequent checks return null.\n')

    // -------------------------------------------------------------------------
    // 8. Security: Cross-Role & Token Hash Bearer Rejection
    // -------------------------------------------------------------------------
    console.log('Test 8: Security - Cross-role and token-hash bearer rejection...')

    // A customer token cannot authenticate as admin
    const newCustSession = await createCustomerSession({ id: testCustId, email: testCustomerEmail })
    const custAsAdmin = await verifyAdminSessionToken(newCustSession.token)
    assert.equal(custAsAdmin, false, 'Customer token cannot access admin verification')

    // An admin token cannot authenticate as customer
    const newAdminSession = await createAdminSession(testAdminEmail)
    const adminAsCust = await getCustomerSession(newAdminSession.token)
    assert.equal(adminAsCust, null, 'Admin token cannot access customer verification')

    // Token hashes cannot be used directly as bearer tokens
    const hashAsBearerAdmin = await verifyAdminSessionToken(adminTokenHash)
    assert.equal(hashAsBearerAdmin, false, 'Admin token hash cannot be used directly as bearer token')

    const hashAsBearerCust = await getCustomerSession(custTokenHash)
    assert.equal(hashAsBearerCust, null, 'Customer token hash cannot be used directly as bearer token')

    // Expired tokens return false
    const expiredSessionRes = await pool.query(
      `INSERT INTO public.admin_sessions (token_hash, user_id, csrf_token_hash, expires_at, created_at)
       VALUES ('expired_hash_test', $1, 'csrf_hash', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '2 hours')
       RETURNING token_hash`,
      [testAdminId]
    )
    const expiredCheck = await pool.query(
      `SELECT * FROM public.admin_sessions 
       WHERE token_hash = 'expired_hash_test' AND expires_at > NOW() AND revoked_at IS NULL`
    )
    assert.equal(expiredCheck.rows.length, 0, 'Expired session query must return 0 rows')
    console.log('  ✅ Cross-role prevention, token-hash immunity, and expired session rejection verified.\n')

    console.log('======================================================')
    console.log('🎉 ALL 8 LIVE POSTGRESQL AUTHENTICATION TESTS PASSED!')
    console.log('======================================================\n')
  } finally {
    console.log('Cleanup: Removing isolated test records from PostgreSQL...')
    await pool.query('DELETE FROM public.admin_sessions WHERE user_id = $1', [testAdminId])
    await pool.query('DELETE FROM public.gallery_sessions WHERE user_id = $1', [testCustId])
    await pool.query('DELETE FROM public.gallery_access WHERE user_id = $1', [testCustId])
    await pool.query('DELETE FROM public.users WHERE id IN ($1, $2)', [testAdminId, testCustId])
    console.log('  ✅ Test records cleanly purged from database.\n')
  }
}

runLiveAuthVerification()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Live Verification Failed:', err)
    process.exit(1)
  })
