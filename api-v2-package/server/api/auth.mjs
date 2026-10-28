// server/api/auth.mjs
// Zen Café — Phase 4: Customer Registration, Email Verification & Session Management

import crypto from 'node:crypto'
import { getDbPool, isDbInMemory } from '../db.mjs'
import { checkNotificationCredentials } from '../notification_dispatcher.mjs'

const RESEND_API_URL = 'https://api.resend.com/emails'
const TOKEN_EXPIRY_HOURS = 24
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 5

// In-memory rate limiting tracker (per IP or email)
const rateLimitMap = new Map()

/**
 * Clean up expired rate-limit records periodically
 */
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.startTime > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(key)
    }
  }
}, 5 * 60 * 1000).unref()

/**
 * Enforce rate limits
 */
function checkRateLimit(key) {
  const now = Date.now()
  const record = rateLimitMap.get(key)
  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, startTime: now })
    return true
  }
  if (record.count >= MAX_ATTEMPTS_PER_WINDOW) {
    return false
  }
  record.count++
  return true
}

function hashPasswordScrypt(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const key = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${key}`
}

/**
 * Generate cryptographically secure verification token & SHA-256 hash
 */
export function generateVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  return { rawToken, tokenHash }
}

/**
 * Hash raw token for lookup
 */
export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

/**
 * Normalize and validate email
 */
export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))
}

export function isValidName(name) {
  return typeof name === 'string' && name.trim().length >= 2
}

export function isValidPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

/**
 * Build branded Zen Café verification email
 */
function buildBrandedVerificationEmail({ name, verifyUrl }) {
  return {
    subject: 'Verify your email — Zen Café',
    html: `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; border: 1px solid #f0e2d5; border-radius: 20px; background: #fffcf8; color: #241713;">
        <div style="text-align: center; margin-bottom: 28px;">
          <h1 style="color: #a32722; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 32px; margin: 0; font-weight: 600; letter-spacing: -0.02em;">
            ZEN CAFÉ
          </h1>
          <p style="color: #8c786c; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; margin-top: 4px;">
            Good Food Brings People Together
          </p>
        </div>

        <div style="background: #ffffff; border: 1px solid #f3e7dc; border-radius: 16px; padding: 28px 24px; box-shadow: 0 4px 20px rgba(92, 45, 30, 0.04);">
          <h2 style="color: #241713; font-size: 20px; margin-top: 0; margin-bottom: 12px; font-weight: 700;">
            Welcome, ${name || 'Valued Guest'}!
          </h2>
          <p style="color: #6c5b51; font-size: 14px; line-height: 1.7; margin-top: 0; margin-bottom: 24px;">
            Thank you for registering with Zen Café. Please verify your email address to unlock your customer access and start your 24-hour community gallery timer.
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(145deg, #b73931, #8f211d); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 14px 32px; border-radius: 999px; box-shadow: 0 8px 24px rgba(163, 39, 34, 0.25);">
              Verify Email Address
            </a>
          </div>

          <p style="color: #9e8e84; font-size: 12px; line-height: 1.6; margin-bottom: 0;">
            This verification link is single-use and will expire in ${TOKEN_EXPIRY_HOURS} hours.<br/>
            If you did not request this registration, you can safely ignore this email.
          </p>
        </div>

        <div style="text-align: center; margin-top: 24px; color: #a19288; font-size: 11px; line-height: 1.6;">
          <p style="margin: 0;">Zen Café · Colombo, Sri Lanka</p>
          <p style="margin: 4px 0 0;">WhatsApp: +94 70 517 5174 · Email: bookings@zencafe.lk</p>
        </div>
      </div>
    `,
  }
}

/**
 * Send or simulate verification email
 */
async function deliverVerificationEmail({ name, email, rawToken, hostHeader }) {
  const creds = checkNotificationCredentials()
  const protocol = hostHeader?.includes('localhost') ? 'http' : 'https'
  const host = hostHeader || 'localhost:3000'
  const verifyUrl = `${protocol}://${host}/register?verify=${encodeURIComponent(rawToken)}`

  if (creds.email.configured) {
    const { subject, html } = buildBrandedVerificationEmail({ name, verifyUrl })
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: creds.email.from,
        to: [email],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[Resend Error] Status ${res.status}:`, errText)
      throw new Error(`Email provider error: ${res.status}`)
    }

    return {
      delivered: true,
      provider: 'Resend',
      recipient: email,
    }
  }

  // Safe dry-run / local development mode
  console.log(`\n======================================================`)
  console.log(`📧 [ZEN CAFÉ EMAIL TEST MODE] Verification link generated`)
  console.log(`   Recipient: ${email}`)
  console.log(`   Verify URL: ${verifyUrl}`)
  console.log(`======================================================\n`)

  return {
    delivered: false,
    simulated: true,
    recipient: email,
    devVerificationUrl: verifyUrl,
    message: 'Verification link generated (safe test mode active; RESEND_API_KEY not configured).',
  }
}

/**
 * Handle POST /api/auth/register
 */
export async function handleCustomerRegister(req, res, body) {
  const pool = await getDbPool()
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'

  const name = String(body.name || '').trim()
  const email = normalizeEmail(body.email)
  const phone = String(body.phone || '').trim()

  // Rate limiting check
  if (!checkRateLimit(`reg_ip_${clientIp}`) || !checkRateLimit(`reg_email_${email}`)) {
    return {
      status: 429,
      body: {
        success: false,
        error: 'Too many registration attempts. Please wait 15 minutes before trying again.',
      },
    }
  }

  // Input validation
  if (!isValidName(name)) {
    return {
      status: 400,
      body: { success: false, error: 'Please enter your full name (minimum 2 characters).' },
    }
  }
  if (!isValidEmail(email)) {
    return {
      status: 400,
      body: { success: false, error: 'Please enter a valid email address.' },
    }
  }
  if (!isValidPhone(phone)) {
    return {
      status: 400,
      body: { success: false, error: 'Please enter a valid phone number (7 to 15 digits).' },
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Check if user already exists
    const existingRes = await client.query(
      'SELECT id, name, email, email_verified_at, is_active FROM public.users WHERE LOWER(email) = LOWER($1)',
      [email]
    )

    let userId
    let isAlreadyVerified = false

    if (existingRes.rows.length > 0) {
      const existingUser = existingRes.rows[0]
      if (existingUser.email_verified_at) {
        // User already verified
        await client.query('ROLLBACK')
        return {
          status: 409,
          body: {
            success: false,
            error: 'This email is already registered and verified. Please proceed to the gallery or log in.',
            isVerified: true,
          },
        }
      }

      const password = typeof body.password === 'string' && body.password.length >= 6 ? body.password : null
      const passwordHash = password ? hashPasswordScrypt(password) : null

      // Existing unverified user: update name, phone, and optional password
      userId = existingUser.id
      if (passwordHash) {
        await client.query(
          `UPDATE public.users 
           SET name = $1, phone = $2, password_hash = $3, updated_at = NOW() 
           WHERE id = $4`,
          [name, phone, passwordHash, userId]
        )
      } else {
        await client.query(
          `UPDATE public.users 
           SET name = $1, phone = $2, updated_at = NOW() 
           WHERE id = $3`,
          [name, phone, userId]
        )
      }
    } else {
      const password = typeof body.password === 'string' && body.password.length >= 6 ? body.password : null
      const passwordHash = password ? hashPasswordScrypt(password) : null

      // Create new customer user
      const insertUserRes = await client.query(
        `INSERT INTO public.users (name, email, phone, password_hash, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'customer', true, NOW(), NOW())
         RETURNING id`,
        [name, email, phone, passwordHash]
      )
      userId = insertUserRes.rows[0].id
    }

    // Invalidate any existing unused tokens for this user
    await client.query(
      `UPDATE public.email_verification_tokens 
       SET used_at = NOW() 
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    )

    // Generate token
    const { rawToken, tokenHash } = generateVerificationToken()
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

    await client.query(
      `INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, tokenHash, expiresAt]
    )

    // Ensure gallery_access record exists (eligible immediately upon registration/verification)
    await client.query(
      `INSERT INTO public.gallery_access (user_id, eligible_at, max_uploads, created_at)
       VALUES ($1, NOW(), 2, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )

    await client.query('COMMIT')

    // Deliver email
    const delivery = await deliverVerificationEmail({
      name,
      email,
      rawToken,
      hostHeader: req.headers.host,
    })

    return {
      status: 201,
      body: {
        success: true,
        message: 'Registration successful! A verification link has been sent to your email address.',
        email,
        name,
        expiresInHours: TOKEN_EXPIRY_HOURS,
        delivery: {
          simulated: Boolean(delivery.simulated),
          devVerificationUrl: delivery.devVerificationUrl || undefined,
        },
      },
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Error in customer registration:', err)
    return {
      status: 500,
      body: { success: false, error: 'Registration failed due to a server error. Please try again.' },
    }
  } finally {
    client.release()
  }
}

/**
 * Handle GET or POST /api/auth/verify?token=...
 */
export async function handleCustomerVerify(req, res, rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    return {
      status: 400,
      body: { success: false, error: 'Verification token is required.' },
    }
  }

  const tokenHash = hashToken(rawToken)
  const pool = await getDbPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Lookup token
    const tokenRes = await client.query(
      `SELECT t.id, t.user_id, t.expires_at, t.used_at, u.name, u.email, u.phone, u.role, u.is_active, u.email_verified_at
       FROM public.email_verification_tokens t
       JOIN public.users u ON u.id = t.user_id
       WHERE t.token_hash = $1`,
      [tokenHash]
    )

    if (tokenRes.rows.length === 0) {
      await client.query('ROLLBACK')
      return {
        status: 400,
        body: { success: false, error: 'Invalid or unknown verification token.' },
      }
    }

    const tokenRow = tokenRes.rows[0]

    // Check single-use
    if (tokenRow.used_at) {
      await client.query('ROLLBACK')
      return {
        status: 400,
        body: {
          success: false,
          error: 'This verification link has already been used.',
          alreadyVerified: Boolean(tokenRow.email_verified_at),
        },
      }
    }

    // Check expiration
    const now = new Date()
    if (new Date(tokenRow.expires_at) < now) {
      await client.query('ROLLBACK')
      return {
        status: 400,
        body: {
          success: false,
          error: 'This verification link has expired. Please request a new verification email.',
          expired: true,
        },
      }
    }

    // Mark token as used
    await client.query(
      `UPDATE public.email_verification_tokens SET used_at = NOW() WHERE id = $1`,
      [tokenRow.id]
    )

    // Mark user as verified
    await client.query(
      `UPDATE public.users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [tokenRow.user_id]
    )

    // Ensure gallery access record is present (immediate upload upon verification)
    await client.query(
      `INSERT INTO public.gallery_access (user_id, eligible_at, max_uploads, created_at)
       VALUES ($1, NOW(), 2, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [tokenRow.user_id]
    )

    const accessRes = await client.query(
      `SELECT eligible_at, max_uploads FROM public.gallery_access WHERE user_id = $1`,
      [tokenRow.user_id]
    )

    await client.query('COMMIT')

    // Issue verified customer session token backed authoritatively by public.gallery_sessions
    const customerToken = 'zen_cust_' + crypto.randomBytes(32).toString('hex')
    const customerTokenHash = hashToken(customerToken)
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await client.query(
      `INSERT INTO public.gallery_sessions (user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [tokenRow.user_id, customerTokenHash, sessionExpiresAt]
    )

    await client.query('COMMIT')

    return {
      status: 200,
      body: {
        success: true,
        message: 'Email address verified successfully!',
        customer: {
          id: String(tokenRow.user_id),
          name: tokenRow.name,
          email: tokenRow.email,
          phone: tokenRow.phone,
          emailVerifiedAt: now.toISOString(),
          galleryEligibleAt: accessRes.rows[0]?.eligible_at || null,
        },
        token: customerToken,
        expiresAt: sessionExpiresAt,
      },
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Error verifying customer token:', err)
    return {
      status: 500,
      body: { success: false, error: 'Verification failed due to a server error.' },
    }
  } finally {
    client.release()
  }
}

/**
 * Handle POST /api/auth/resend-verification
 */
export async function handleResendVerification(req, res, body) {
  const pool = await getDbPool()
  const email = normalizeEmail(body.email)
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'

  if (!isValidEmail(email)) {
    return {
      status: 400,
      body: { success: false, error: 'Please enter a valid email address.' },
    }
  }

  // Rate limiting check
  if (!checkRateLimit(`resend_ip_${clientIp}`) || !checkRateLimit(`resend_email_${email}`)) {
    return {
      status: 429,
      body: {
        success: false,
        error: 'Too many resend attempts. Please wait 15 minutes before requesting another email.',
      },
    }
  }

  const client = await pool.connect()
  try {
    const userRes = await client.query(
      'SELECT id, name, email, email_verified_at, is_active FROM public.users WHERE LOWER(email) = LOWER($1)',
      [email]
    )

    // Prevent account enumeration by returning generic success if user does not exist
    if (userRes.rows.length === 0) {
      return {
        status: 200,
        body: {
          success: true,
          message: 'If an unverified account exists with this email address, a verification link has been sent.',
        },
      }
    }

    const user = userRes.rows[0]

    // If already verified, inform user
    if (user.email_verified_at) {
      return {
        status: 200,
        body: {
          success: true,
          message: 'Your email address is already verified.',
          isVerified: true,
        },
      }
    }

    await client.query('BEGIN')

    // Invalidate old tokens
    await client.query(
      `UPDATE public.email_verification_tokens 
       SET used_at = NOW() 
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    )

    // Issue new token
    const { rawToken, tokenHash } = generateVerificationToken()
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

    await client.query(
      `INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [user.id, tokenHash, expiresAt]
    )

    await client.query('COMMIT')

    const delivery = await deliverVerificationEmail({
      name: user.name,
      email: user.email,
      rawToken,
      hostHeader: req.headers.host,
    })

    return {
      status: 200,
      body: {
        success: true,
        message: 'A fresh verification link has been sent to your email address.',
        delivery: {
          simulated: Boolean(delivery.simulated),
          devVerificationUrl: delivery.devVerificationUrl || undefined,
        },
      },
    }
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {})
    console.error('Error resending verification:', err)
    return {
      status: 500,
      body: { success: false, error: 'Failed to resend verification email.' },
    }
  } finally {
    client.release()
  }
}

/**
 * Handle GET /api/auth/me (Current Customer Session Check)
 */
export async function handleCustomerMe(req, res) {
  const token = extractCustomerToken(req)
  if (!token) {
    return {
      status: 401,
      body: { authenticated: false, error: 'No customer session token provided.' },
    }
  }

  const session = await getCustomerSession(token)
  if (!session) {
    return {
      status: 401,
      body: { authenticated: false, error: 'Customer session has expired or is invalid.' },
    }
  }

  return {
    status: 200,
    body: {
      authenticated: true,
      customer: {
        id: session.userId,
        name: session.name,
        email: session.email,
        phone: session.phone,
        role: session.role,
        emailVerified: session.isVerified,
        emailVerifiedAt: session.emailVerifiedAt,
        galleryEligibleAt: session.eligibleAt,
      },
    },
  }
}

/**
 * Revokes a customer session by stamping revoked_at in public.gallery_sessions.
 */
export async function revokeCustomerSession(token) {
  if (!token || typeof token !== 'string') return false
  const tokenHash = hashToken(token.trim())
  try {
    const pool = await getDbPool()
    const res = await pool.query(
      'UPDATE public.gallery_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
      [tokenHash]
    )
    return (res.rowCount || 0) > 0
  } catch (err) {
    console.error('Error revoking customer session in PostgreSQL:', err.message)
    return false
  }
}

/**
 * Handle POST /api/auth/logout (Customer Logout)
 */
export async function handleCustomerLogout(req, res) {
  const token = extractCustomerToken(req)
  if (token) {
    await revokeCustomerSession(token)
  }
  return {
    status: 200,
    body: { success: true, message: 'Logged out successfully.' },
  }
}

/**
 * Handle POST /api/gallery/check-email
 * Gallery integration readiness: Determines if an email is genuinely verified in PostgreSQL.
 */
export async function handleGalleryCheckEmail(req, res, body) {
  const email = normalizeEmail(body?.email)
  if (!isValidEmail(email)) {
    return {
      status: 400,
      body: { success: false, registered: false, message: 'Please enter a valid email address.' },
    }
  }

  const pool = await getDbPool()
  try {
    const userRes = await pool.query(
      `SELECT u.id, u.name, u.email, u.email_verified_at, g.eligible_at, g.max_uploads
       FROM public.users u
       LEFT JOIN public.gallery_access g ON g.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1)`,
      [email]
    )

    if (userRes.rows.length === 0) {
      return {
        status: 200,
        body: {
          success: true,
          registered: false,
          isVerified: false,
          canUpload: false,
          message: 'Email not found. Please register and verify your email first.',
        },
      }
    }

    const user = userRes.rows[0]
    const isVerified = Boolean(user.email_verified_at)

    if (!isVerified) {
      return {
        status: 200,
        body: {
          success: true,
          registered: true,
          isVerified: false,
          canUpload: false,
          message: 'Your registration is pending email verification. Please check your inbox.',
        },
      }
    }

    // Check gallery cooldown
    const now = Date.now()
    const eligibleAt = user.eligible_at ? new Date(user.eligible_at).getTime() : now
    const cooldownRemaining = Math.max(0, eligibleAt - now)
    const canUpload = cooldownRemaining === 0
    const maxUploads = Number(user.max_uploads || 2)

    return {
      status: 200,
      body: {
        success: true,
        registered: true,
        isVerified: true,
        canUpload,
        maxUploads,
        nextUploadAt: cooldownRemaining > 0 ? new Date(eligibleAt).toISOString() : null,
        message: canUpload
          ? 'Registered and verified email found. You can upload photos now.'
          : '24-hour gallery cooldown active. You can upload once the timer completes.',
      },
    }
  } catch (err) {
    console.error('Error checking gallery email:', err)
    return {
      status: 500,
      body: { success: false, message: 'Server error checking gallery access.' },
    }
  }
}

/**
 * Extract customer token from Authorization header or cookie
 */
export function extractCustomerToken(req) {
  const authHeader = req.headers?.authorization || ''
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim()
  }
  const customHeader = req.headers?.['x-customer-token']
  if (customHeader) {
    return String(customHeader).trim()
  }
  return null
}

/**
 * Validate customer session token authoritatively against public.gallery_sessions in PostgreSQL.
 */
export async function getCustomerSession(token) {
  if (!token || typeof token !== 'string') return null
  const cleanToken = token.trim()
  const tokenHash = hashToken(cleanToken)

  try {
    const pool = await getDbPool()
    const res = await pool.query(
      `SELECT s.id, s.user_id, s.expires_at, s.revoked_at,
              u.name, u.email, u.phone, u.role, u.is_active, u.email_verified_at,
              g.eligible_at, g.max_uploads
       FROM public.gallery_sessions s
       JOIN public.users u ON u.id = s.user_id
       LEFT JOIN public.gallery_access g ON g.user_id = u.id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND u.is_active = true
       LIMIT 1`,
      [tokenHash]
    )

    if (res.rows.length === 0) {
      return null
    }

    const row = res.rows[0]
    return {
      id: String(row.user_id),
      userId: String(row.user_id),
      sessionId: String(row.id),
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      isVerified: Boolean(row.email_verified_at),
      emailVerifiedAt: row.email_verified_at,
      eligibleAt: row.eligible_at,
      maxUploads: row.max_uploads,
      expiresAt: new Date(row.expires_at).getTime(),
    }
  } catch (err) {
    console.error('Error fetching customer session from database:', err.message)
    return null
  }
}

/**
 * Helper to create a customer session in public.gallery_sessions (used in verification and testing).
 * Returns the session object containing raw token and metadata.
 */
export async function createCustomerSession(userData) {
  const customerToken = 'zen_cust_' + crypto.randomBytes(32).toString('hex')
  const customerTokenHash = hashToken(customerToken)
  const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  try {
    const pool = await getDbPool()
    await pool.query(
      `INSERT INTO public.gallery_sessions (user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (token_hash) DO NOTHING`,
      [userData.id, customerTokenHash, sessionExpiresAt]
    )
  } catch (err) {
    console.error('Failed to insert customer session in database:', err.message)
  }

  return {
    token: customerToken,
    expiresAt: sessionExpiresAt.getTime(),
    userId: String(userData.id),
    email: userData.email,
    name: userData.name,
    role: userData.role || 'customer',
  }
}
