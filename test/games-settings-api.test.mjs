process.env.ZEN_TEST_MODE = 'true'

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { handleApiRequest } from '../server/api/index.mjs'
import { createAdminSession, verifyPassword } from '../server/auth.mjs'
import { getDbPool, isDbInMemory } from '../server/db.mjs'
import { DEFAULT_CARDS } from '../server/api/games.mjs'
import { DEFAULT_SETTINGS } from '../server/api/settings.mjs'

// Helper to simulate HTTP requests through handleApiRequest
function createMockReqRes({ method, path, headers = {}, body = null }) {
  const req = new EventEmitter()
  req.method = method
  req.url = path
  req.headers = { host: 'localhost:3000', ...headers }

  let statusCode = 200
  let responseHeaders = {}
  let responseBody = ''

  const res = {
    writeHead(code, hdrs) {
      statusCode = code
      responseHeaders = hdrs
    },
    end(chunk) {
      if (chunk) responseBody += chunk
      res.emit('finish')
    },
    on(event, cb) {
      if (event === 'finish') res.finishCb = cb
    },
    emit(event) {
      if (event === 'finish' && res.finishCb) res.finishCb()
    },
  }

  const runPromise = new Promise(resolve => {
    res.on('finish', () => {
      let parsed = null
      try {
        parsed = JSON.parse(responseBody)
      } catch {
        parsed = responseBody
      }
      resolve({ status: statusCode, headers: responseHeaders, body: parsed })
    })
  })

  const dispatch = async () => {
    const routePromise = handleApiRequest(req, res)
    setTimeout(() => {
      if (body !== null) {
        req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
      }
      req.emit('end')
    }, 15)
    await routePromise
    return runPromise
  }

  return { dispatch }
}

async function runTests() {
  console.log('\n======================================================')
  console.log('🧪 ZEN CAFÉ — PHASE 6: GAMES & WEBSITE SETTINGS TEST SUITE')
  console.log('======================================================\n')

  const pool = await getDbPool()
  const inMemory = isDbInMemory()
  console.log(`Database engine: ${inMemory ? '🟡 IN-MEMORY POSTGRESQL (pg-mem)' : '🟢 REAL POSTGRESQL (zencafe_db)'}`)

  // Capture original records if any exist in the database for exact restoration
  let originalGameSettings = null
  let originalWebsiteSettings = null
  try {
    const origGames = await pool.query("SELECT * FROM public.game_settings WHERE game_key = 'scratch'")
    if (origGames.rows.length > 0) {
      originalGameSettings = origGames.rows[0]
    }
    const origSettings = await pool.query("SELECT * FROM public.website_settings WHERE key = 'cafe_info'")
    if (origSettings.rows.length > 0) {
      originalWebsiteSettings = origSettings.rows[0]
    }
  } catch (err) {
    console.warn('Note: Could not inspect initial DB state for backup:', err.message)
  }

  let adminSession = await createAdminSession('admin@zencafe.com')
  const publicHeaders = { 'Content-Type': 'application/json' }
  const adminHeaders = {
    'Content-Type': 'application/json',
    authorization: `Bearer ${adminSession.token}`,
    'x-admin-token': adminSession.token,
  }

  try {
    // -------------------------------------------------------------------------
    // Test 1: Admin Login
    // -------------------------------------------------------------------------
    console.log('Test 1: Admin Login Verification...')
    const loginReq = createMockReqRes({
      method: 'POST',
      path: '/api/admin/login',
      headers: publicHeaders,
      body: { email: 'admin@zencafe.com', password: 'Admin@123' },
    })
    const loginRes = await loginReq.dispatch()
    assert.equal(loginRes.status, 200, 'Admin login should succeed with 200')
    assert.equal(loginRes.body.success, true, 'Admin login should return success: true')
    assert.ok(loginRes.body.token, 'Admin login should return session token')
    console.log('  ✅ Admin login verified and returned server session token.\n')

    // -------------------------------------------------------------------------
    // Test 2: Games Settings Retrieval (Public & Initial)
    // -------------------------------------------------------------------------
    console.log('Test 2: Games Settings Retrieval...')
    const getGamesReq = createMockReqRes({
      method: 'GET',
      path: '/api/games/settings',
      headers: publicHeaders,
    })
    const getGamesRes = await getGamesReq.dispatch()
    assert.equal(getGamesRes.status, 200, 'GET /api/games/settings returns 200')
    assert.equal(getGamesRes.body.success, true)
    assert.ok(Array.isArray(getGamesRes.body.cards), 'Cards array returned')
    assert.equal(getGamesRes.body.cards.length, 5, 'Exactly 5 cards returned')
    console.log('  ✅ Games settings retrieved successfully (5 cards configured).\n')

    // -------------------------------------------------------------------------
    // Test 3: Games Settings Update (Admin)
    // -------------------------------------------------------------------------
    console.log('Test 3: Games Settings Update (Admin)...')
    const updatedCards = [
      {
        cardId: 1,
        prize: {
          productId: 'demo-matcha-latte',
          title: 'Zen Matcha Latte',
          detail: 'Ceremonial grade green tea.',
          emoji: '🍵',
        },
      },
      { cardId: 2, prize: null },
      { cardId: 3, prize: null },
      {
        cardId: 4,
        prize: {
          productId: 'demo-chocolate-cake',
          title: 'Zen Truffle Cake',
          detail: 'Rich dark chocolate decadence.',
          emoji: '🍰',
        },
      },
      { cardId: 5, prize: null },
    ]

    const updateGamesReq = createMockReqRes({
      method: 'PUT',
      path: '/api/games/settings',
      headers: adminHeaders,
      body: {
        enabled: true,
        cards: updatedCards,
      },
    })
    const updateGamesRes = await updateGamesReq.dispatch()
    assert.equal(updateGamesRes.status, 200, 'PUT /api/games/settings returns 200')
    assert.equal(updateGamesRes.body.success, true)
    assert.equal(updateGamesRes.body.config.cards[0].prize.title, 'Zen Matcha Latte')
    console.log('  ✅ Games settings updated and persisted successfully.\n')

    // -------------------------------------------------------------------------
    // Test 4: Public Games Page Reflects Changes
    // -------------------------------------------------------------------------
    console.log('Test 4: Public Games Page Reflects Changes...')
    const publicReflectReq = createMockReqRes({
      method: 'GET',
      path: '/api/games/settings',
      headers: publicHeaders,
    })
    const publicReflectRes = await publicReflectReq.dispatch()
    assert.equal(publicReflectRes.status, 200)
    assert.equal(publicReflectRes.body.cards[0].prize.title, 'Zen Matcha Latte')
    assert.equal(publicReflectRes.body.cards[3].prize.title, 'Zen Truffle Cake')
    console.log('  ✅ Public read reflects updated card configuration without auth.\n')

    // -------------------------------------------------------------------------
    // Test 5: Settings Persistence After Refresh
    // -------------------------------------------------------------------------
    console.log('Test 5: Settings Persistence After Refresh...')
    const dbCheck = await pool.query("SELECT * FROM public.game_settings WHERE game_key = 'scratch'")
    assert.equal(dbCheck.rows.length, 1, 'game_settings row exists in PostgreSQL')
    const dbSettings = typeof dbCheck.rows[0].settings === 'string'
      ? JSON.parse(dbCheck.rows[0].settings)
      : dbCheck.rows[0].settings
    assert.equal(dbSettings.cards[0].prize.title, 'Zen Matcha Latte')
    console.log('  ✅ Verified direct PostgreSQL row persistence in public.game_settings.\n')

    // -------------------------------------------------------------------------
    // Test 6: Café Information Retrieval (Public vs Admin)
    // -------------------------------------------------------------------------
    console.log('Test 6: Café Information Retrieval...')
    const getPublicSettingsReq = createMockReqRes({
      method: 'GET',
      path: '/api/settings',
      headers: publicHeaders,
    })
    const getPublicSettingsRes = await getPublicSettingsReq.dispatch()
    assert.equal(getPublicSettingsRes.status, 200)
    assert.equal(getPublicSettingsRes.body.success, true)
    assert.ok(getPublicSettingsRes.body.settings.cafeName, 'Café name present')
    assert.equal(getPublicSettingsRes.body.settings.adminName, undefined, 'Admin name not exposed in public read')
    assert.equal(getPublicSettingsRes.body.settings.adminEmail, undefined, 'Admin email not exposed in public read')

    const getAdminSettingsReq = createMockReqRes({
      method: 'GET',
      path: '/api/settings/admin',
      headers: adminHeaders,
    })
    const getAdminSettingsRes = await getAdminSettingsReq.dispatch()
    assert.equal(getAdminSettingsRes.status, 200)
    assert.equal(getAdminSettingsRes.body.success, true)
    assert.ok(getAdminSettingsRes.body.settings.adminEmail, 'Admin email present in admin read')
    console.log('  ✅ Café settings retrieved; safe public view cleanly filters private administrator fields.\n')

    // -------------------------------------------------------------------------
    // Test 7: Café Information Update
    // -------------------------------------------------------------------------
    console.log('Test 7: Café Information Update...')
    const updateSettingsReq = createMockReqRes({
      method: 'PUT',
      path: '/api/settings',
      headers: adminHeaders,
      body: {
        cafeName: 'Zen Café Colombo',
        tagline: 'Tranquil Dining & Specialty Coffee',
        phone: '011 987 6543',
        address: 'No. 88, Galle Face Terrace, Colombo 03, Sri Lanka',
        openingTime: '08:30',
        closingTime: '23:00',
      },
    })
    const updateSettingsRes = await updateSettingsReq.dispatch()
    assert.equal(updateSettingsRes.status, 200)
    assert.equal(updateSettingsRes.body.success, true)
    assert.equal(updateSettingsRes.body.settings.cafeName, 'Zen Café Colombo')
    assert.equal(updateSettingsRes.body.settings.phone, '011 987 6543')
    console.log('  ✅ Café information updated and saved successfully.\n')

    // -------------------------------------------------------------------------
    // Test 8: Public Website Reflects Saved Settings
    // -------------------------------------------------------------------------
    console.log('Test 8: Public Website Reflects Saved Settings...')
    const publicSettingsCheckReq = createMockReqRes({
      method: 'GET',
      path: '/api/settings',
      headers: publicHeaders,
    })
    const publicSettingsCheckRes = await publicSettingsCheckReq.dispatch()
    assert.equal(publicSettingsCheckRes.status, 200)
    assert.equal(publicSettingsCheckRes.body.settings.cafeName, 'Zen Café Colombo')
    assert.equal(publicSettingsCheckRes.body.settings.phone, '011 987 6543')
    assert.equal(publicSettingsCheckRes.body.settings.openingTime, '08:30')
    assert.equal(publicSettingsCheckRes.body.settings.closingTime, '23:00')
    console.log('  ✅ Public endpoint immediately reflects saved café details.\n')

    // -------------------------------------------------------------------------
    // Test 9: My Profile Save
    // -------------------------------------------------------------------------
    console.log('Test 9: My Profile Save...')
    const profileUpdateReq = createMockReqRes({
      method: 'PUT',
      path: '/api/settings',
      headers: adminHeaders,
      body: {
        adminName: 'Zen Master Admin',
        adminEmail: 'master@zencafe.com',
        adminAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      },
    })
    const profileUpdateRes = await profileUpdateReq.dispatch()
    assert.equal(profileUpdateRes.status, 200)
    assert.equal(profileUpdateRes.body.settings.adminName, 'Zen Master Admin')
    assert.equal(profileUpdateRes.body.settings.adminEmail, 'master@zencafe.com')
    assert.ok(profileUpdateRes.body.settings.adminAvatar.includes('unsplash'), 'Avatar URL preserved')
    console.log('  ✅ Administrator Profile updated and saved successfully.\n')

    // -------------------------------------------------------------------------
    // Test 10: Security Settings Save (Password Change with Scrypt)
    // -------------------------------------------------------------------------
    console.log('Test 10: Security Settings Save (Admin Password Change)...')
    const passChangeReq = createMockReqRes({
      method: 'POST',
      path: '/api/admin/change-password',
      headers: adminHeaders,
      body: {
        currentPassword: 'Admin@123',
        newPassword: 'ZenSecretPass2026!',
        confirmPassword: 'ZenSecretPass2026!',
      },
    })
    const passChangeRes = await passChangeReq.dispatch()
    assert.equal(passChangeRes.status, 200, 'Password change returns 200')
    assert.equal(passChangeRes.body.success, true)

    // Verify new password works
    assert.ok(verifyPassword('ZenSecretPass2026!'), 'New password verified with scrypt')
    assert.ok(!verifyPassword('Admin@123'), 'Old password rejected')

    // Verify old session token was invalidated upon password change
    const staleReq = createMockReqRes({
      method: 'GET',
      path: '/api/settings/admin',
      headers: adminHeaders,
    })
    const staleRes = await staleReq.dispatch()
    assert.equal(staleRes.status, 401, 'Stale session invalidated after password change')

    // Log in with new password to get fresh session
    const freshLoginReq = createMockReqRes({
      method: 'POST',
      path: '/api/admin/login',
      headers: publicHeaders,
      body: { email: 'admin@zencafe.com', password: 'ZenSecretPass2026!' },
    })
    const freshLoginRes = await freshLoginReq.dispatch()
    assert.equal(freshLoginRes.status, 200, 'Login with new password succeeded')
    const freshHeaders = {
      'Content-Type': 'application/json',
      authorization: `Bearer ${freshLoginRes.body.token}`,
      'x-admin-token': freshLoginRes.body.token,
    }

    // Restore original password
    const restorePassReq = createMockReqRes({
      method: 'POST',
      path: '/api/admin/change-password',
      headers: freshHeaders,
      body: {
        currentPassword: 'ZenSecretPass2026!',
        newPassword: 'Admin@123',
        confirmPassword: 'Admin@123',
      },
    })
    const restorePassRes = await restorePassReq.dispatch()
    assert.equal(restorePassRes.status, 200)
    assert.ok(verifyPassword('Admin@123'), 'Original admin password restored')

    // Re-authenticate adminSession for subsequent tests
    const reAuth = await (createMockReqRes({
      method: 'POST',
      path: '/api/admin/login',
      headers: publicHeaders,
      body: { email: 'admin@zencafe.com', password: 'Admin@123' },
    })).dispatch()
    adminSession = { token: reAuth.body.token }
    adminHeaders.authorization = `Bearer ${reAuth.body.token}`
    adminHeaders['x-admin-token'] = reAuth.body.token
    console.log('  ✅ Admin password change and session invalidation successfully verified.\n')

    // -------------------------------------------------------------------------
    // Test 11: Unauthorized Mutations Return 401/403
    // -------------------------------------------------------------------------
    console.log('Test 11: Security - Reject Unauthorized Mutations (401)...')
    const unauthGamesReq = createMockReqRes({
      method: 'PUT',
      path: '/api/games/settings',
      headers: publicHeaders,
      body: { enabled: true, cards: updatedCards },
    })
    const unauthGamesRes = await unauthGamesReq.dispatch()
    assert.equal(unauthGamesRes.status, 401, 'Unauthorized games update rejected')

    const unauthSettingsReq = createMockReqRes({
      method: 'PUT',
      path: '/api/settings',
      headers: publicHeaders,
      body: { cafeName: 'Hacked Cafe' },
    })
    const unauthSettingsRes = await unauthSettingsReq.dispatch()
    assert.equal(unauthSettingsRes.status, 401, 'Unauthorized settings update rejected')

    const unauthPassReq = createMockReqRes({
      method: 'POST',
      path: '/api/admin/change-password',
      headers: publicHeaders,
      body: { currentPassword: 'admin', newPassword: 'hackedPassword', confirmPassword: 'hackedPassword' },
    })
    const unauthPassRes = await unauthPassReq.dispatch()
    assert.equal(unauthPassRes.status, 401, 'Unauthorized password change rejected')
    console.log('  ✅ Unauthorized mutations strictly rejected with HTTP 401.\n')

    // -------------------------------------------------------------------------
    // Test 12: Partial Updates Preserve Unrelated Fields
    // -------------------------------------------------------------------------
    console.log('Test 12: Partial Updates Preserve Unrelated Fields...')
    const partialReq = createMockReqRes({
      method: 'PUT',
      path: '/api/settings',
      headers: adminHeaders,
      body: {
        currency: 'USD',
      },
    })
    const partialRes = await partialReq.dispatch()
    assert.equal(partialRes.status, 200)
    assert.equal(partialRes.body.settings.currency, 'USD')
    assert.equal(partialRes.body.settings.cafeName, 'Zen Café Colombo', 'Unrelated cafeName preserved')
    assert.equal(partialRes.body.settings.phone, '011 987 6543', 'Unrelated phone preserved')
    assert.equal(partialRes.body.settings.openingTime, '08:30', 'Unrelated openingTime preserved')
    console.log('  ✅ Partial update updated currency without overwriting other café fields.\n')

    // -------------------------------------------------------------------------
    // Test 13: Invalid Input is Rejected
    // -------------------------------------------------------------------------
    console.log('Test 13: Validation - Reject Invalid Input...')
    // 13a. Game with 3 winners instead of 2
    const invalidWinnersReq = createMockReqRes({
      method: 'PUT',
      path: '/api/games/settings',
      headers: adminHeaders,
      body: {
        enabled: true,
        cards: [
          { cardId: 1, prize: { productId: 'p1', title: 'P1', detail: 'D1', emoji: '🎁' } },
          { cardId: 2, prize: { productId: 'p2', title: 'P2', detail: 'D2', emoji: '🎁' } },
          { cardId: 3, prize: { productId: 'p3', title: 'P3', detail: 'D3', emoji: '🎁' } },
          { cardId: 4, prize: null },
          { cardId: 5, prize: null },
        ],
      },
    })
    const invalidWinnersRes = await invalidWinnersReq.dispatch()
    assert.equal(invalidWinnersRes.status, 400, '3 winners rejected with 400')

    // 13b. Game with only 4 cards
    const invalidCardCountReq = createMockReqRes({
      method: 'PUT',
      path: '/api/games/settings',
      headers: adminHeaders,
      body: {
        enabled: true,
        cards: [{ cardId: 1, prize: null }],
      },
    })
    const invalidCardCountRes = await invalidCardCountReq.dispatch()
    assert.equal(invalidCardCountRes.status, 400, 'Invalid card count rejected with 400')

    // 13c. Invalid email format
    const invalidEmailReq = createMockReqRes({
      method: 'PUT',
      path: '/api/settings',
      headers: adminHeaders,
      body: { email: 'not-an-email' },
    })
    const invalidEmailRes = await invalidEmailReq.dispatch()
    assert.equal(invalidEmailRes.status, 400, 'Malformed email rejected with 400')

    // 13d. Negative max guests
    const invalidGuestsReq = createMockReqRes({
      method: 'PUT',
      path: '/api/settings',
      headers: adminHeaders,
      body: { maxGuests: -5 },
    })
    const invalidGuestsRes = await invalidGuestsReq.dispatch()
    assert.equal(invalidGuestsRes.status, 400, 'Negative max guests rejected with 400')

    // 13e. Short password (<8 chars)
    const shortPassReq = createMockReqRes({
      method: 'POST',
      path: '/api/admin/change-password',
      headers: adminHeaders,
      body: { currentPassword: 'admin', newPassword: 'short', confirmPassword: 'short' },
    })
    const shortPassRes = await shortPassReq.dispatch()
    assert.equal(shortPassRes.status, 400, 'Short password rejected with 400')
    console.log('  ✅ All invalid inputs rejected with appropriate 400 Bad Request messages.\n')

    // -------------------------------------------------------------------------
    // Test 14: Regression - Existing Products Remain Functional
    // -------------------------------------------------------------------------
    console.log('Test 14: Regression - Existing Products API...')
    const productsReq = createMockReqRes({
      method: 'GET',
      path: '/api/products',
      headers: publicHeaders,
    })
    const productsRes = await productsReq.dispatch()
    assert.equal(productsRes.status, 200)
    assert.equal(productsRes.body.success, true)
    assert.ok(Array.isArray(productsRes.body.data), 'Products array returned')
    console.log(`  ✅ Existing Products API verified (${productsRes.body.data.length} products).\n`)

    // -------------------------------------------------------------------------
    // Test 15: Regression - Existing Offers Remain Functional
    // -------------------------------------------------------------------------
    console.log('Test 15: Regression - Existing Offers API...')
    const offersReq = createMockReqRes({
      method: 'GET',
      path: '/api/offers',
      headers: publicHeaders,
    })
    const offersRes = await offersReq.dispatch()
    assert.equal(offersRes.status, 200)
    assert.equal(offersRes.body.success, true)
    console.log('  ✅ Existing Offers API verified.\n')

    // -------------------------------------------------------------------------
    // Test 16: Regression - Existing Room Bookings Remain Functional
    // -------------------------------------------------------------------------
    console.log('Test 16: Regression - Existing Room Bookings Availability...')
    const bookingsReq = createMockReqRes({
      method: 'GET',
      path: '/api/bookings/availability?room=Zen%20Garden%20Pavilion&date=2026-11-15',
      headers: publicHeaders,
    })
    const bookingsRes = await bookingsReq.dispatch()
    assert.equal(bookingsRes.status, 200)
    assert.equal(bookingsRes.body.success, true)
    assert.ok(Array.isArray(bookingsRes.body.availableSlots))
    console.log('  ✅ Existing Bookings availability API verified.\n')

    // -------------------------------------------------------------------------
    // Test 17: Regression - Existing Registration Remains Functional
    // -------------------------------------------------------------------------
    console.log('Test 17: Regression - Customer Registration Validation...')
    const registerReq = createMockReqRes({
      method: 'POST',
      path: '/api/auth/register',
      headers: publicHeaders,
      body: { name: '', email: 'invalid' },
    })
    const registerRes = await registerReq.dispatch()
    assert.equal(registerRes.status, 400)
    assert.equal(registerRes.body.success, false)
    console.log('  ✅ Existing Customer Registration validation verified.\n')

    // -------------------------------------------------------------------------
    // Test 18: Regression - Existing Gallery Remains Functional
    // -------------------------------------------------------------------------
    console.log('Test 18: Regression - Existing Gallery Photos API...')
    const galleryReq = createMockReqRes({
      method: 'GET',
      path: '/api/gallery/photos',
      headers: publicHeaders,
    })
    const galleryRes = await galleryReq.dispatch()
    assert.equal(galleryRes.status, 200)
    assert.equal(galleryRes.body.success, true)
    assert.ok(Array.isArray(galleryRes.body.data))
    console.log(`  ✅ Existing Gallery photos API verified (${galleryRes.body.data.length} photos).\n`)

  } finally {
    // Restore original records if any were captured
    try {
      if (originalGameSettings) {
        await pool.query(
          "UPDATE public.game_settings SET settings = $1, is_enabled = $2 WHERE game_key = 'scratch'",
          [originalGameSettings.settings, originalGameSettings.is_enabled]
        )
      } else {
        await pool.query(
          "INSERT INTO public.game_settings (game_key, settings, is_enabled) VALUES ('scratch', $1::jsonb, true) ON CONFLICT (game_key) DO UPDATE SET settings = $1::jsonb, is_enabled = true",
          [JSON.stringify({ cards: DEFAULT_CARDS })]
        )
      }

      if (originalWebsiteSettings) {
        await pool.query(
          "UPDATE public.website_settings SET value = $1 WHERE key = 'cafe_info'",
          [originalWebsiteSettings.value]
        )
      } else {
        await pool.query(
          "INSERT INTO public.website_settings (key, value) VALUES ('cafe_info', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = $1::jsonb",
          [JSON.stringify(DEFAULT_SETTINGS)]
        )
      }
      console.log('🧹 Test cleanup: restored database settings to original state.\n')
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr.message)
    }
  }

  console.log('======================================================')
  console.log('🎉 ALL 18 PHASE 6 TESTS PASSED SUCCESSFULLY!')
  console.log('======================================================\n')
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILURE:', err)
  process.exit(1)
})
