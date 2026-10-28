// server/api/auth.mjs
// Zen Café — Customer Registration, Email Verification,
// Gallery Email Sign-In and Session Management

import crypto from 'node:crypto'
import { getDbPool } from '../db.mjs'
import { checkNotificationCredentials } from '../notification_dispatcher.mjs'

const RESEND_API_URL = 'https://api.resend.com/emails'

const TOKEN_EXPIRY_HOURS = 24
const GALLERY_LOGIN_LINK_MINUTES = 15
const CUSTOMER_SESSION_DAYS = 7

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS_PER_WINDOW = 5

const PUBLIC_WEBSITE_URL = (
  process.env.ZEN_CAFE_PUBLIC_URL ||
  'https://zencafe-website.purple-forest-fa52.workers.dev'
).replace(/\/+$/, '')

/* =========================================================
   RATE LIMITING
========================================================= */

const rateLimitMap = new Map()

const rateLimitCleanup = setInterval(() => {
  const now = Date.now()

  for (const [key, record] of rateLimitMap.entries()) {
    if (now - record.startTime > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(key)
    }
  }
}, 5 * 60 * 1000)

rateLimitCleanup.unref?.()

function checkRateLimit(key) {
  const now = Date.now()
  const record = rateLimitMap.get(key)

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, {
      count: 1,
      startTime: now,
    })

    return true
  }

  if (record.count >= MAX_ATTEMPTS_PER_WINDOW) {
    return false
  }

  record.count += 1
  return true
}

function getClientIp(req) {
  return String(
    req.headers?.['cf-connecting-ip'] ||
    req.headers?.['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    'unknown'
  )
    .split(',')[0]
    .trim()
}

/* =========================================================
   COMMON HELPERS
========================================================= */

function hashPasswordScrypt(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const key = crypto.scryptSync(password, salt, 64).toString('hex')

  return `scrypt:${salt}:${key}`
}

export function generateVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString('hex')

  return {
    rawToken,
    tokenHash: hashToken(rawToken),
  }
}

export function hashToken(rawToken) {
  return crypto
    .createHash('sha256')
    .update(String(rawToken))
    .digest('hex')
}

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

function escapeEmailHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function createSessionToken() {
  return 'zen_cust_' + crypto.randomBytes(32).toString('hex')
}

function createSessionExpiry() {
  return new Date(
    Date.now() + CUSTOMER_SESSION_DAYS * 24 * 60 * 60 * 1000
  )
}

async function insertCustomerSession(client, userId) {
  const token = createSessionToken()
  const expiresAt = createSessionExpiry()

  await client.query(
    `INSERT INTO public.gallery_sessions
       (user_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [userId, hashToken(token), expiresAt]
  )

  return {
    token,
    expiresAt,
  }
}

/* =========================================================
   EMAIL TEMPLATES
========================================================= */

function buildBrandedVerificationEmail({ name, verifyUrl }) {
  return {
    subject: 'Verify your email — Zen Café',

    html: `
      <div style="
        font-family:Arial,sans-serif;
        max-width:580px;
        margin:0 auto;
        padding:32px 24px;
        border:1px solid #f0e2d5;
        border-radius:20px;
        background:#fffcf8;
        color:#241713;
      ">
        <div style="text-align:center;margin-bottom:28px;">
          <h1 style="
            color:#a32722;
            font-family:Georgia,serif;
            font-size:32px;
            margin:0;
            font-weight:600;
          ">
            ZEN CAFÉ
          </h1>

          <p style="
            color:#8c786c;
            font-size:11px;
            text-transform:uppercase;
            letter-spacing:0.14em;
          ">
            Good Food Brings People Together
          </p>
        </div>

        <div style="
          background:#ffffff;
          border:1px solid #f3e7dc;
          border-radius:16px;
          padding:28px 24px;
        ">
          <h2 style="font-size:20px;">
            Welcome, ${escapeEmailHtml(name || 'Valued Guest')}!
          </h2>

          <p style="
            color:#6c5b51;
            font-size:14px;
            line-height:1.7;
          ">
            Thank you for registering with Zen Café.
            Please verify your email address to access
            the Community Gallery.
          </p>

          <p style="
            color:#6c5b51;
            font-size:14px;
            line-height:1.7;
          ">
            Once verified, you can upload 1–2 photos.
            Your 24-hour cooldown begins only after
            a successful photo upload.
          </p>

          <div style="text-align:center;margin:30px 0;">
            <a
              href="${verifyUrl}"
              style="
                display:inline-block;
                background:#a32722;
                color:#ffffff;
                text-decoration:none;
                font-size:14px;
                font-weight:bold;
                padding:14px 32px;
                border-radius:999px;
              "
            >
              Verify Email Address
            </a>
          </div>

          <p style="
            color:#9e8e84;
            font-size:12px;
            line-height:1.6;
          ">
            This link expires in ${TOKEN_EXPIRY_HOURS} hours
            and can only be used once.
          </p>

          <p style="font-size:12px;color:#9e8e84;">
            If you did not register, ignore this email.
          </p>
        </div>

        <div style="
          text-align:center;
          margin-top:24px;
          color:#a19288;
          font-size:11px;
        ">
          <p>Zen Café</p>
          <p>Good Food Brings People Together</p>
        </div>
      </div>
    `,
  }
}

function buildGalleryLoginEmail({ name, loginUrl }) {
  return {
    subject: 'Your Zen Café Community Gallery Sign-In Link',

    html: `
      <div style="
        font-family:Arial,sans-serif;
        max-width:580px;
        margin:0 auto;
        padding:32px 24px;
        background:#fffcf8;
        color:#241713;
        border:1px solid #f0e2d5;
        border-radius:20px;
      ">
        <div style="text-align:center;margin-bottom:28px;">
          <h1 style="
            color:#a32722;
            font-family:Georgia,serif;
            font-size:32px;
          ">
            ZEN CAFÉ
          </h1>

          <p style="
            color:#8c786c;
            font-size:11px;
            text-transform:uppercase;
            letter-spacing:0.14em;
          ">
            Community Gallery
          </p>
        </div>

        <h2>Welcome back!</h2>

        <p>Hello ${escapeEmailHtml(name || 'Valued Guest')},</p>

        <p style="line-height:1.7;color:#6c5b51;">
          Click below to securely sign in to the
          Zen Café Community Gallery.
        </p>

        <div style="text-align:center;margin:32px 0;">
          <a
            href="${loginUrl}"
            style="
              display:inline-block;
              background:#a32722;
              color:#ffffff;
              text-decoration:none;
              padding:14px 28px;
              border-radius:30px;
              font-weight:bold;
            "
          >
            Access Community Gallery
          </a>
        </div>

        <p style="font-size:13px;color:#6c5b51;">
          This sign-in link expires in 15 minutes
          and can only be used once.
        </p>

        <p style="font-size:12px;color:#9e8e84;">
          If you did not request this email,
          you can safely ignore it.
        </p>
      </div>
    `,
  }
}

/* =========================================================
   RESEND EMAIL DELIVERY
========================================================= */

async function sendResendEmail({ email, subject, html }) {
  const credentials = checkNotificationCredentials()

  if (!credentials.email.configured) {
    return {
      delivered: false,
      simulated: true,
    }
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',

    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },

    body: JSON.stringify({
      from: credentials.email.from,
      to: [email],
      subject,
      html,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()

    console.error(
      '[Zen Café Resend Error]',
      response.status,
      errorText
    )

    throw new Error(`Email provider error: ${response.status}`)
  }

  return {
    delivered: true,
    simulated: false,
    provider: 'Resend',
    recipient: email,
  }
}

async function deliverVerificationEmail({
  name,
  email,
  rawToken,
}) {
  const verifyUrl =
    `${PUBLIC_WEBSITE_URL}/register.html?verify=` +
    encodeURIComponent(rawToken)

  const template = buildBrandedVerificationEmail({
    name,
    verifyUrl,
  })

  const delivery = await sendResendEmail({
    email,
    subject: template.subject,
    html: template.html,
  })

  if (delivery.simulated) {
    console.log('[ZEN CAFÉ EMAIL TEST MODE]')
    console.log('Recipient:', email)
    console.log('Verification URL:', verifyUrl)
  }

  return {
    ...delivery,
    ...(delivery.simulated
      ? { devVerificationUrl: verifyUrl }
      : {}),
  }
}

/* =========================================================
   CUSTOMER REGISTRATION
   POST /api/auth/register
========================================================= */

export async function handleCustomerRegister(req, res, body) {
  const name = String(body?.name || '').trim()
  const email = normalizeEmail(body?.email)
  const phone = String(body?.phone || '').trim()

  if (!isValidName(name)) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Please enter your full name (minimum 2 characters).',
      },
    }
  }

  if (!isValidEmail(email)) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Please enter a valid email address.',
      },
    }
  }

  if (!isValidPhone(phone)) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Please enter a valid phone number (7 to 15 digits).',
      },
    }
  }

  const clientIp = getClientIp(req)

  if (
    !checkRateLimit(`reg_ip_${clientIp}`) ||
    !checkRateLimit(`reg_email_${email}`)
  ) {
    return {
      status: 429,
      body: {
        success: false,
        error:
          'Too many registration attempts. Please wait 15 minutes.',
      },
    }
  }

  const pool = await getDbPool()
  const client = await pool.connect()

  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true

    const existingRes = await client.query(
      `SELECT id, name, email, email_verified_at, is_active
       FROM public.users
       WHERE LOWER(email) = LOWER($1)
       FOR UPDATE`,
      [email]
    )

    let userId

    if (existingRes.rows.length > 0) {
      const existingUser = existingRes.rows[0]

      if (existingUser.email_verified_at) {
        await client.query('ROLLBACK')
        transactionOpen = false

        return {
          status: 409,
          body: {
            success: false,
            isVerified: true,
            error:
              'This email is already registered and verified. Please sign in to the gallery.',
          },
        }
      }

      userId = existingUser.id

      const password =
        typeof body?.password === 'string' &&
        body.password.length >= 6
          ? body.password
          : null

      const passwordHash = password
        ? hashPasswordScrypt(password)
        : null

      if (passwordHash) {
        await client.query(
          `UPDATE public.users
           SET name = $1,
               phone = $2,
               password_hash = $3,
               updated_at = NOW()
           WHERE id = $4`,
          [name, phone, passwordHash, userId]
        )
      } else {
        await client.query(
          `UPDATE public.users
           SET name = $1,
               phone = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [name, phone, userId]
        )
      }
    } else {
      const password =
        typeof body?.password === 'string' &&
        body.password.length >= 6
          ? body.password
          : null

      const passwordHash = password
        ? hashPasswordScrypt(password)
        : null

      const insertedUser = await client.query(
        `INSERT INTO public.users
           (
             name,
             email,
             phone,
             password_hash,
             role,
             is_active,
             created_at,
             updated_at
           )
         VALUES
           ($1, $2, $3, $4, 'customer', TRUE, NOW(), NOW())
         RETURNING id`,
        [name, email, phone, passwordHash]
      )

      userId = insertedUser.rows[0].id
    }

    await client.query(
      `UPDATE public.email_verification_tokens
       SET used_at = NOW()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [userId]
    )

    const { rawToken, tokenHash } =
      generateVerificationToken()

    const expiresAt = new Date(
      Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
    )

    await client.query(
      `INSERT INTO public.email_verification_tokens
         (user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, tokenHash, expiresAt]
    )

    await client.query(
      `INSERT INTO public.gallery_access
         (user_id, eligible_at, max_uploads, created_at)
       VALUES ($1, NOW(), 2, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )

    await client.query('COMMIT')
    transactionOpen = false

    const delivery = await deliverVerificationEmail({
      name,
      email,
      rawToken,
    })

    return {
      status: 201,
      body: {
        success: true,
        message:
          'Registration successful! A verification link has been sent to your email address.',
        name,
        email,
        expiresInHours: TOKEN_EXPIRY_HOURS,
        delivery: {
          simulated: Boolean(delivery.simulated),
          devVerificationUrl:
            delivery.devVerificationUrl || undefined,
        },
      },
    }
  } catch (err) {
    if (transactionOpen) {
      await client.query('ROLLBACK').catch(() => {})
    }

    console.error('Customer registration error:', err)

    return {
      status: 500,
      body: {
        success: false,
        error:
          'Registration could not be completed. Please try again.',
      },
    }
  } finally {
    client.release()
  }
}

/* =========================================================
   VERIFY CUSTOMER EMAIL
   GET /api/auth/verify
   POST /api/auth/verify
========================================================= */

export async function handleCustomerVerify(req, res, rawToken) {
  if (
    typeof rawToken !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(rawToken.trim())
  ) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Invalid verification token.',
      },
    }
  }

  const tokenHash = hashToken(rawToken.trim())

  const pool = await getDbPool()
  const client = await pool.connect()

  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true

    const tokenRes = await client.query(
      `SELECT
         t.id,
         t.user_id,
         t.expires_at,
         t.used_at,
         u.name,
         u.email,
         u.phone,
         u.role,
         u.is_active,
         u.email_verified_at
       FROM public.email_verification_tokens t
       JOIN public.users u
         ON u.id = t.user_id
       WHERE t.token_hash = $1
       FOR UPDATE OF t`,
      [tokenHash]
    )

    if (tokenRes.rows.length === 0) {
      await client.query('ROLLBACK')
      transactionOpen = false

      return {
        status: 400,
        body: {
          success: false,
          error: 'Invalid or unknown verification token.',
        },
      }
    }

    const tokenRow = tokenRes.rows[0]

    if (tokenRow.used_at) {
      await client.query('ROLLBACK')
      transactionOpen = false

      return {
        status: 400,
        body: {
          success: false,
          error: 'This verification link has already been used.',
          alreadyVerified: Boolean(
            tokenRow.email_verified_at
          ),
        },
      }
    }

    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK')
      transactionOpen = false

      return {
        status: 400,
        body: {
          success: false,
          expired: true,
          error:
            'This verification link has expired. Please request a new verification email.',
        },
      }
    }

    if (!tokenRow.is_active) {
      await client.query('ROLLBACK')
      transactionOpen = false

      return {
        status: 403,
        body: {
          success: false,
          error: 'This customer account is inactive.',
        },
      }
    }

    await client.query(
      `UPDATE public.email_verification_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [tokenRow.id]
    )

    await client.query(
      `UPDATE public.users
       SET email_verified_at =
             COALESCE(email_verified_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [tokenRow.user_id]
    )

    await client.query(
      `INSERT INTO public.gallery_access
         (user_id, eligible_at, max_uploads, created_at)
       VALUES ($1, NOW(), 2, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [tokenRow.user_id]
    )

    const accessRes = await client.query(
      `SELECT eligible_at, max_uploads
       FROM public.gallery_access
       WHERE user_id = $1`,
      [tokenRow.user_id]
    )

    const session = await insertCustomerSession(
      client,
      tokenRow.user_id
    )

    // Verification and session creation commit together.
    await client.query('COMMIT')
    transactionOpen = false

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
          emailVerifiedAt:
            tokenRow.email_verified_at ||
            new Date().toISOString(),
          galleryEligibleAt:
            accessRes.rows[0]?.eligible_at || null,
        },
        token: session.token,
        expiresAt: session.expiresAt,
      },
    }
  } catch (err) {
    if (transactionOpen) {
      await client.query('ROLLBACK').catch(() => {})
    }

    console.error('Customer verification error:', err)

    return {
      status: 500,
      body: {
        success: false,
        error:
          'Verification failed due to a server error.',
      },
    }
  } finally {
    client.release()
  }
}

/* =========================================================
   RESEND VERIFICATION EMAIL
   POST /api/auth/resend-verification
========================================================= */

export async function handleResendVerification(req, res, body) {
  const email = normalizeEmail(body?.email)

  if (!isValidEmail(email)) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Please enter a valid email address.',
      },
    }
  }

  const clientIp = getClientIp(req)

  if (
    !checkRateLimit(`resend_ip_${clientIp}`) ||
    !checkRateLimit(`resend_email_${email}`)
  ) {
    return {
      status: 429,
      body: {
        success: false,
        error:
          'Too many resend attempts. Please wait 15 minutes.',
      },
    }
  }

  const genericResponse = {
    status: 200,
    body: {
      success: true,
      message:
        'If this email belongs to an unverified customer, a verification link will be sent.',
    },
  }

  const pool = await getDbPool()
  const client = await pool.connect()

  let transactionOpen = false

  try {
    const userRes = await client.query(
      `SELECT
         id,
         name,
         email,
         email_verified_at,
         is_active
       FROM public.users
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    )

    if (userRes.rows.length === 0) {
      return genericResponse
    }

    const user = userRes.rows[0]

    if (user.email_verified_at || !user.is_active) {
      return genericResponse
    }

    await client.query('BEGIN')
    transactionOpen = true

    await client.query(
      `UPDATE public.email_verification_tokens
       SET used_at = NOW()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [user.id]
    )

    const { rawToken, tokenHash } =
      generateVerificationToken()

    const expiresAt = new Date(
      Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
    )

    await client.query(
      `INSERT INTO public.email_verification_tokens
         (user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [user.id, tokenHash, expiresAt]
    )

    await client.query('COMMIT')
    transactionOpen = false

    const delivery = await deliverVerificationEmail({
      name: user.name,
      email: user.email,
      rawToken,
    })

    return {
      status: 200,
      body: {
        ...genericResponse.body,
        delivery: {
          simulated: Boolean(delivery.simulated),
          devVerificationUrl:
            delivery.devVerificationUrl || undefined,
        },
      },
    }
  } catch (err) {
    if (transactionOpen) {
      await client.query('ROLLBACK').catch(() => {})
    }

    console.error('Resend verification error:', err)

    return {
      status: 500,
      body: {
        success: false,
        error: 'Failed to resend verification email.',
      },
    }
  } finally {
    client.release()
  }
}

/* =========================================================
   CUSTOMER SESSION TOKEN EXTRACTION
========================================================= */

export function extractCustomerToken(req) {
  const authHeader = String(
    req.headers?.authorization || ''
  )

  if (/^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, '').trim()
  }

  const customHeader =
    req.headers?.['x-customer-token']

  if (customHeader) {
    return String(customHeader).trim()
  }

  return null
}

/* =========================================================
   VALIDATE CUSTOMER SESSION
========================================================= */

export async function getCustomerSession(token) {
  if (!token || typeof token !== 'string') {
    return null
  }

  const cleanToken = token.trim()

  if (!cleanToken) {
    return null
  }

  try {
    const pool = await getDbPool()

    const result = await pool.query(
      `SELECT
         s.id,
         s.user_id,
         s.expires_at,
         s.revoked_at,
         u.name,
         u.email,
         u.phone,
         u.role,
         u.is_active,
         u.email_verified_at,
         g.eligible_at,
         g.max_uploads
       FROM public.gallery_sessions s
       JOIN public.users u
         ON u.id = s.user_id
       LEFT JOIN public.gallery_access g
         ON g.user_id = u.id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND u.is_active = TRUE
         AND u.email_verified_at IS NOT NULL
       LIMIT 1`,
      [hashToken(cleanToken)]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]

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
    console.error(
      'Error fetching customer session:',
      err
    )

    return null
  }
}

/* =========================================================
   CREATE CUSTOMER SESSION
========================================================= */

export async function createCustomerSession(userData) {
  if (!userData?.id) {
    throw new Error('A valid customer ID is required.')
  }

  const pool = await getDbPool()

  const session = await insertCustomerSession(
    pool,
    userData.id
  )

  // The token is returned only after PostgreSQL
  // confirms the session INSERT succeeded.
  return {
    token: session.token,
    expiresAt: session.expiresAt.getTime(),
    userId: String(userData.id),
    email: userData.email,
    name: userData.name,
    role: userData.role || 'customer',
  }
}

/* =========================================================
   GET CURRENT CUSTOMER
   GET /api/auth/me
========================================================= */

export async function handleCustomerMe(req, res) {
  const token = extractCustomerToken(req)

  if (!token) {
    return {
      status: 401,
      body: {
        authenticated: false,
        error: 'No customer session token provided.',
      },
    }
  }

  const session = await getCustomerSession(token)

  if (!session) {
    return {
      status: 401,
      body: {
        authenticated: false,
        error:
          'Customer session has expired or is invalid.',
      },
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

/* =========================================================
   REVOKE CUSTOMER SESSION
========================================================= */

export async function revokeCustomerSession(token) {
  if (!token || typeof token !== 'string') {
    return false
  }

  try {
    const pool = await getDbPool()

    const result = await pool.query(
      `UPDATE public.gallery_sessions
       SET revoked_at = NOW()
       WHERE token_hash = $1
         AND revoked_at IS NULL`,
      [hashToken(token.trim())]
    )

    return (result.rowCount || 0) > 0
  } catch (err) {
    console.error('Error revoking customer session:', err)
    return false
  }
}

/* =========================================================
   CUSTOMER LOGOUT
   POST /api/auth/logout
========================================================= */

export async function handleCustomerLogout(req, res) {
  const token = extractCustomerToken(req)

  if (token) {
    await revokeCustomerSession(token)
  }

  return {
    status: 200,
    body: {
      success: true,
      message: 'Logged out successfully.',
    },
  }
}

/* =========================================================
   GALLERY EMAIL CHECK
   POST /api/gallery/check-email
========================================================= */

export async function handleGalleryCheckEmail(req, res, body) {
  const email = normalizeEmail(body?.email)

  if (!isValidEmail(email)) {
    return {
      status: 400,
      body: {
        success: false,
        registered: false,
        message: 'Please enter a valid email address.',
      },
    }
  }

  const pool = await getDbPool()

  try {
    const userRes = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.email_verified_at,
         u.is_active,
         g.eligible_at,
         g.max_uploads
       FROM public.users u
       LEFT JOIN public.gallery_access g
         ON g.user_id = u.id
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
          message:
            'Email not found. Please register and verify your email first.',
        },
      }
    }

    const user = userRes.rows[0]

    const isVerified =
      Boolean(user.email_verified_at) &&
      Boolean(user.is_active)

    if (!isVerified) {
      return {
        status: 200,
        body: {
          success: true,
          registered: true,
          isVerified: false,
          canUpload: false,
          message:
            'Your registration is pending email verification.',
        },
      }
    }

    const now = Date.now()

    const eligibleAt = user.eligible_at
      ? new Date(user.eligible_at).getTime()
      : now

    const cooldownRemaining = Math.max(
      0,
      eligibleAt - now
    )

    const canUpload = cooldownRemaining === 0

    return {
      status: 200,
      body: {
        success: true,
        registered: true,
        isVerified: true,
        canUpload,
        maxUploads: Number(user.max_uploads || 2),
        nextUploadAt:
          cooldownRemaining > 0
            ? new Date(eligibleAt).toISOString()
            : null,
        message: canUpload
          ? 'Verified email found. You can upload photos now.'
          : '24-hour gallery cooldown active.',
      },
    }
  } catch (err) {
    console.error('Gallery email check error:', err)

    return {
      status: 500,
      body: {
        success: false,
        message: 'Server error checking gallery access.',
      },
    }
  }
}

/* =========================================================
   REQUEST GALLERY EMAIL SIGN-IN
   POST /api/auth/gallery-login/request

   - Verified customers only
   - No password
   - No OTP
   - Single-use email link
   - 15-minute expiry
========================================================= */

export async function handleGalleryLoginRequest(req, res, body) {
  const email = normalizeEmail(body?.email)

  if (!isValidEmail(email)) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Please enter a valid email address.',
      },
    }
  }

  const genericResponse = {
    status: 200,
    body: {
      success: true,
      message:
        'If this email belongs to a verified customer, a secure sign-in link will be sent shortly.',
    },
  }

  const clientIp = getClientIp(req)

  if (
    !checkRateLimit(`gallery_login_ip_${clientIp}`) ||
    !checkRateLimit(`gallery_login_email_${email}`)
  ) {
    return genericResponse
  }

  try {
    const pool = await getDbPool()

    const userRes = await pool.query(
      `SELECT id, name, email
       FROM public.users
       WHERE LOWER(email) = LOWER($1)
         AND email_verified_at IS NOT NULL
         AND is_active = TRUE
         AND role = 'customer'
       LIMIT 1`,
      [email]
    )

    if (userRes.rows.length === 0) {
      return genericResponse
    }

    const user = userRes.rows[0]

    const credentials = checkNotificationCredentials()

    if (!credentials.email.configured) {
      console.error(
        'Gallery sign-in email service is not configured.'
      )

      return genericResponse
    }

    const { rawToken, tokenHash } =
      generateVerificationToken()

    const expiresAt = new Date(
      Date.now() + GALLERY_LOGIN_LINK_MINUTES * 60 * 1000
    )

    const client = await pool.connect()
    let transactionOpen = false

    try {
      await client.query('BEGIN')
      transactionOpen = true

      await client.query(
        `UPDATE public.gallery_login_tokens
         SET used_at = NOW()
         WHERE user_id = $1
           AND used_at IS NULL`,
        [user.id]
      )

      await client.query(
        `INSERT INTO public.gallery_login_tokens
           (user_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [user.id, tokenHash, expiresAt]
      )

      await client.query('COMMIT')
      transactionOpen = false
    } catch (err) {
      if (transactionOpen) {
        await client.query('ROLLBACK').catch(() => {})
      }

      throw err
    } finally {
      client.release()
    }

    const loginUrl = new URL(
      '/register.html',
      PUBLIC_WEBSITE_URL
    )

    loginUrl.searchParams.set(
      'gallery_login',
      rawToken
    )

    const template = buildGalleryLoginEmail({
      name: user.name,
      loginUrl: loginUrl.toString(),
    })

    await sendResendEmail({
      email: user.email,
      subject: template.subject,
      html: template.html,
    })

    return genericResponse
  } catch (err) {
    console.error('Gallery sign-in request error:', err)

    // Keep the public response generic.
    return genericResponse
  }
}

/* =========================================================
   VERIFY GALLERY EMAIL SIGN-IN
   POST /api/auth/gallery-login/verify

   - Validates token
   - Checks expiry
   - Locks token row
   - Consumes token once
   - Creates seven-day session
   - Commits both operations together
========================================================= */

export async function handleGalleryLoginVerify(req, res, body) {
  const rawToken = String(body?.token || '').trim()

  if (!/^[a-f0-9]{64}$/i.test(rawToken)) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Invalid gallery sign-in link.',
      },
    }
  }

  const pool = await getDbPool()
  const client = await pool.connect()

  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true

    const tokenRes = await client.query(
      `SELECT
         t.id,
         t.user_id,
         u.name,
         u.email,
         u.phone
       FROM public.gallery_login_tokens t
       JOIN public.users u
         ON u.id = t.user_id
       WHERE t.token_hash = $1
         AND t.used_at IS NULL
         AND t.expires_at > NOW()
         AND u.is_active = TRUE
         AND u.email_verified_at IS NOT NULL
         AND u.role = 'customer'
       FOR UPDATE OF t`,
      [hashToken(rawToken)]
    )

    if (tokenRes.rows.length === 0) {
      await client.query('ROLLBACK')
      transactionOpen = false

      return {
        status: 400,
        body: {
          success: false,
          error:
            'This sign-in link is invalid, expired, or already used.',
        },
      }
    }

    const user = tokenRes.rows[0]

    // Consume the token inside the transaction.
    await client.query(
      `UPDATE public.gallery_login_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [user.id]
    )

    // Create the customer session in the same transaction.
    const session = await insertCustomerSession(
      client,
      user.user_id
    )

    await client.query('COMMIT')
    transactionOpen = false

    return {
      status: 200,
      body: {
        success: true,
        message:
          'Gallery access activated successfully.',
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
        customer: {
          id: String(user.user_id),
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
      },
    }
  } catch (err) {
    if (transactionOpen) {
      await client.query('ROLLBACK').catch(() => {})
    }

    console.error(
      'Gallery sign-in verification error:',
      err
    )

    return {
      status: 500,
      body: {
        success: false,
        error: 'Unable to activate gallery access.',
      },
    }
  } finally {
    client.release()
  }
}