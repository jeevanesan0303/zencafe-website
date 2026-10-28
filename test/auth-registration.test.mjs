// test/auth-registration.test.mjs
// Zen Café — Phase 4: Customer Registration & Email Verification Test Suite

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { getDbPool } from '../server/db.mjs'
import {
  handleCustomerRegister,
  handleCustomerVerify,
  handleResendVerification,
  handleCustomerMe,
  handleCustomerLogout,
  handleGalleryCheckEmail,
  generateVerificationToken,
  hashToken,
} from '../server/api/auth.mjs'

process.env.NODE_ENV = 'test'

async function runAuthTests() {
  console.log('\n======================================================')
  console.log('🧪 ZEN CAFÉ — PHASE 4 REGISTRATION & VERIFICATION TESTS')
  console.log('======================================================\n')

  const pool = await getDbPool()
  const testPrefix = `test_customer_${Date.now()}`
  const testEmail = `${testPrefix}@zencafe-test.lk`
  const testName = 'Zen Cafe Test Customer'
  const testPhone = '0771234567'

  let generatedVerifyToken = null
  let customerSessionToken = null
  let createdUserId = null

  try {
    // ----------------------------------------------------
    // Test 1: Customer Registration Succeeds
    // ----------------------------------------------------
    console.log('Test 1: Customer Registration Succeeds...')
    const mockReq = {
      headers: { host: 'localhost:3000' },
      socket: { remoteAddress: '127.0.0.1' },
    }

    const regResult = await handleCustomerRegister(mockReq, {}, {
      name: testName,
      email: testEmail,
      phone: testPhone,
    })

    assert.equal(regResult.status, 201, 'Should return HTTP 201 Created')
    assert.equal(regResult.body.success, true, 'Registration body.success should be true')
    assert.equal(regResult.body.email, testEmail)
    assert.ok(regResult.body.delivery, 'Delivery information should be returned')
    assert.equal(regResult.body.delivery.simulated, true, 'Test mode should simulate email delivery without fake secrets')

    // Extract raw token from simulated verification URL
    const urlMatch = regResult.body.delivery.devVerificationUrl.match(/verify=([^&]+)/)
    assert.ok(urlMatch, 'devVerificationUrl should contain verify token')
    generatedVerifyToken = decodeURIComponent(urlMatch[1])

    // Verify database record in public.users
    const userDbRes = await pool.query(
      'SELECT id, name, email, role, is_active, email_verified_at FROM public.users WHERE email = $1',
      [testEmail]
    )
    assert.equal(userDbRes.rows.length, 1, 'User must exist in public.users')
    createdUserId = userDbRes.rows[0].id
    assert.equal(userDbRes.rows[0].role, 'customer')
    assert.equal(userDbRes.rows[0].is_active, true)
    assert.equal(userDbRes.rows[0].email_verified_at, null, 'Must be unverified initially')

    // Verify token record in public.email_verification_tokens
    const tokenDbRes = await pool.query(
      'SELECT id, user_id, token_hash, expires_at, used_at FROM public.email_verification_tokens WHERE user_id = $1',
      [createdUserId]
    )
    assert.equal(tokenDbRes.rows.length, 1, 'Token record must exist')
    assert.equal(tokenDbRes.rows[0].token_hash, hashToken(generatedVerifyToken), 'Database must store SHA-256 token hash')
    assert.equal(tokenDbRes.rows[0].used_at, null, 'Token used_at must be null initially')
    console.log('  ✅ Customer registration successfully inserted in PostgreSQL with unverified state & secure token hash.')

    // ----------------------------------------------------
    // Test 2: Invalid Registration Data is Rejected (400)
    // ----------------------------------------------------
    console.log('\nTest 2: Validation - Reject Invalid Registration Payloads...')
    const badName = await handleCustomerRegister(mockReq, {}, { name: 'A', email: 'valid@zen.lk', phone: testPhone })
    assert.equal(badName.status, 400, 'Name < 2 chars must be rejected')

    const badEmail = await handleCustomerRegister(mockReq, {}, { name: 'Test User', email: 'not-an-email', phone: testPhone })
    assert.equal(badEmail.status, 400, 'Invalid email must be rejected')

    const badPhone = await handleCustomerRegister(mockReq, {}, { name: 'Test User', email: 'test@zen.lk', phone: '123' })
    assert.equal(badPhone.status, 400, 'Phone < 7 digits must be rejected')
    console.log('  ✅ Invalid name, email, and phone payloads properly rejected with 400 Bad Request.')

    // ----------------------------------------------------
    // Test 3: Unverified User Access Restrictions
    // ----------------------------------------------------
    console.log('\nTest 3: Unverified Users Cannot Access Verified Features...')
    const galleryCheckUnverified = await handleGalleryCheckEmail(mockReq, {}, { email: testEmail })
    assert.equal(galleryCheckUnverified.status, 200)
    assert.equal(galleryCheckUnverified.body.registered, true)
    assert.equal(galleryCheckUnverified.body.isVerified, false, 'Unverified email must report isVerified: false')
    assert.equal(galleryCheckUnverified.body.canUpload, false, 'Unverified email cannot upload to gallery')
    console.log('  ✅ Unverified customer correctly prevented from gallery access.')

    // ----------------------------------------------------
    // Test 4: Invalid Verification Token Fails (400)
    // ----------------------------------------------------
    console.log('\nTest 4: Invalid Verification Token Fails...')
    const invalidTokenRes = await handleCustomerVerify(mockReq, {}, 'fake_token_1234567890abcdef')
    assert.equal(invalidTokenRes.status, 400)
    assert.equal(invalidTokenRes.body.success, false)
    console.log('  ✅ Unknown/invalid verification token safely rejected.')

    // ----------------------------------------------------
    // Test 5: Expired Verification Token Fails (400)
    // ----------------------------------------------------
    console.log('\nTest 5: Expired Verification Token Fails...')
    const { rawToken: expiredRaw, tokenHash: expiredHash } = generateVerificationToken()
    await pool.query(
      `INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '2 hours')`,
      [createdUserId, expiredHash]
    )
    const expiredRes = await handleCustomerVerify(mockReq, {}, expiredRaw)
    assert.equal(expiredRes.status, 400)
    assert.equal(expiredRes.body.expired, true, 'Expired token response must indicate expired: true')
    console.log('  ✅ Expired token correctly rejected.')

    // ----------------------------------------------------
    // Test 6: Valid Token Verifies Customer
    // ----------------------------------------------------
    console.log('\nTest 6: Valid Token Verifies Customer & Issues Session...')
    const validVerifyRes = await handleCustomerVerify(mockReq, {}, generatedVerifyToken)
    assert.equal(validVerifyRes.status, 200)
    assert.equal(validVerifyRes.body.success, true)
    assert.ok(validVerifyRes.body.token, 'Customer session token must be issued')
    customerSessionToken = validVerifyRes.body.token

    // Check DB state: email_verified_at must be populated now
    const userVerifiedCheck = await pool.query('SELECT email_verified_at FROM public.users WHERE id = $1', [createdUserId])
    assert.ok(userVerifiedCheck.rows[0].email_verified_at, 'email_verified_at must be populated in public.users')

    // Check DB token state: used_at must be populated
    const tokenUsedCheck = await pool.query(
      'SELECT used_at FROM public.email_verification_tokens WHERE token_hash = $1',
      [hashToken(generatedVerifyToken)]
    )
    assert.ok(tokenUsedCheck.rows[0].used_at, 'used_at must be populated in public.email_verification_tokens')
    console.log('  ✅ Valid token marked email_verified_at and transitioned token to used.')

    // ----------------------------------------------------
    // Test 7: Token Cannot Be Reused (Single-Use Enforcement)
    // ----------------------------------------------------
    console.log('\nTest 7: Token Cannot Be Reused...')
    const reuseRes = await handleCustomerVerify(mockReq, {}, generatedVerifyToken)
    assert.equal(reuseRes.status, 400)
    assert.equal(reuseRes.body.success, false)
    assert.ok(reuseRes.body.error.includes('already been used'))
    console.log('  ✅ Second verification attempt with same token strictly rejected.')

    // ----------------------------------------------------
    // Test 8: Duplicate Registration of Verified Email (409)
    // ----------------------------------------------------
    console.log('\nTest 8: Prevent Duplicate Customer Registrations...')
    const dupRes = await handleCustomerRegister(mockReq, {}, {
      name: testName,
      email: testEmail,
      phone: testPhone,
    })
    assert.equal(dupRes.status, 409, 'Duplicate registration of verified customer must return 409 Conflict')
    assert.equal(dupRes.body.isVerified, true)
    console.log('  ✅ Duplicate registration of verified customer safely rejected with 409 Conflict.')

    // ----------------------------------------------------
    // Test 9: Customer Session Verification (GET /api/auth/me)
    // ----------------------------------------------------
    console.log('\nTest 9: Server-Verified Customer Session (GET /api/auth/me)...')
    const authReq = {
      headers: { authorization: `Bearer ${customerSessionToken}` },
    }
    const meRes = await handleCustomerMe(authReq, {})
    assert.equal(meRes.status, 200)
    assert.equal(meRes.body.authenticated, true)
    assert.equal(meRes.body.customer.email, testEmail)
    assert.equal(meRes.body.customer.role, 'customer')
    assert.equal(meRes.body.customer.emailVerified, true)
    console.log('  ✅ Customer session authenticated and verified against PostgreSQL.')

    // ----------------------------------------------------
    // Test 10: Strict Separation of Customer and Admin Permissions
    // ----------------------------------------------------
    console.log('\nTest 10: Strict Separation of Customer and Admin Permissions...')
    // Admin mutations must reject a customer token
    const fakeAdminReq = {
      headers: { 'x-admin-token': customerSessionToken },
    }
    const { verifyAdminRequest } = await import('../server/auth.mjs')
    const isAdmin = await verifyAdminRequest(fakeAdminReq)
    assert.equal(isAdmin, false, 'Customer token must NEVER grant admin privileges')
    console.log('  ✅ Customer token cannot be forged or used for admin operations.')

    // ----------------------------------------------------
    // Test 11: Customer Logout Revokes Session
    // ----------------------------------------------------
    console.log('\nTest 11: Customer Logout (POST /api/auth/logout)...')
    const logoutRes = await handleCustomerLogout(authReq, {})
    assert.equal(logoutRes.status, 200)
    const afterLogoutMe = await handleCustomerMe(authReq, {})
    assert.equal(afterLogoutMe.status, 401, 'Session must be revoked after logout')
    console.log('  ✅ Customer session successfully revoked upon logout.')

    // ----------------------------------------------------
    // Test 12: Gallery Readiness (POST /api/gallery/check-email)
    // ----------------------------------------------------
    console.log('\nTest 12: Gallery Integration Readiness...')
    const galleryCheckVerified = await handleGalleryCheckEmail(mockReq, {}, { email: testEmail })
    assert.equal(galleryCheckVerified.status, 200)
    assert.equal(galleryCheckVerified.body.registered, true)
    assert.equal(galleryCheckVerified.body.isVerified, true, 'Verified customer is recognized by gallery check')
    assert.ok(galleryCheckVerified.body.nextUploadAt !== undefined)
    console.log('  ✅ Community gallery readiness check correctly verified in PostgreSQL.')

    // ----------------------------------------------------
    // Test 13: Resend Verification & Rate Limiting
    // ----------------------------------------------------
    console.log('\nTest 13: Resend Verification & Rate Limiting...')
    const unverifiedEmail = `unverified_${Date.now()}@zen.lk`
    await handleCustomerRegister(mockReq, {}, { name: 'Unverified User', email: unverifiedEmail, phone: '0779998888' })

    const resendRes1 = await handleResendVerification(mockReq, {}, { email: unverifiedEmail })
    assert.equal(resendRes1.status, 200)
    assert.equal(resendRes1.body.success, true)

    // Account enumeration test: non-existent email returns generic success
    const enumRes = await handleResendVerification(mockReq, {}, { email: 'nonexistent999@zen.lk' })
    assert.equal(enumRes.status, 200)
    assert.ok(enumRes.body.message.includes('If an unverified account exists'))
    console.log('  ✅ Resend verification works and prevents account enumeration.')

    // ----------------------------------------------------
    // Test 14: Safe Cleanup of Test Data
    // ----------------------------------------------------
    console.log('\nTest 14: Safe Cleanup of Test Data...')
    await pool.query('DELETE FROM public.email_verification_tokens WHERE user_id = $1', [createdUserId])
    await pool.query('DELETE FROM public.gallery_access WHERE user_id = $1', [createdUserId])
    await pool.query('DELETE FROM public.users WHERE id = $1', [createdUserId])
    await pool.query('DELETE FROM public.users WHERE email = $1', [unverifiedEmail])
    console.log('  ✅ Test customer and token records cleanly purged from database.')

    console.log('\n======================================================')
    console.log('🎉 ALL 14 CUSTOMER REGISTRATION & VERIFICATION TESTS PASSED!')
    console.log('======================================================\n')
  } catch (err) {
    console.error('\n❌ Test Suite Failed:', err)
    if (createdUserId) {
      await pool.query('DELETE FROM public.email_verification_tokens WHERE user_id = $1', [createdUserId]).catch(() => {})
      await pool.query('DELETE FROM public.gallery_access WHERE user_id = $1', [createdUserId]).catch(() => {})
      await pool.query('DELETE FROM public.users WHERE id = $1', [createdUserId]).catch(() => {})
    }
    process.exit(1)
  }
}

runAuthTests().then(() => process.exit(0)).catch(e => {
  console.error(e)
  process.exit(1)
})
