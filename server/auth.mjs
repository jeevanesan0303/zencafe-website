// server/auth.mjs
// Zen Café — Phase 7.2: Durable Administrator Authentication & Session Management

import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { getDbPool } from './db.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

dotenv.config({ path: path.join(projectRoot, '.env') })

// Default admin credentials configured via environment variables
const CONFIGURED_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@zencafe.com')
  .toLowerCase()
  .trim()

const ALLOWED_ADMIN_EMAILS = new Set([
  CONFIGURED_ADMIN_EMAIL,
  'admin@zencafe.com',
  'zen@cafe.com',
])

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123'

// Hash the configured password on startup using scrypt
const salt = crypto.randomBytes(16).toString('hex')
const passwordKey = crypto.scryptSync(ADMIN_PASSWORD, salt, 64).toString('hex')
let storedPasswordHash = `${salt}:${passwordKey}`

// Rate limiting tracker for admin login attempts
const adminRateLimitMap = new Map()
const ADMIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ADMIN_LOGIN_ATTEMPTS = 5

// Clean up expired rate-limit records periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of adminRateLimitMap.entries()) {
    if (now - entry.startTime > ADMIN_RATE_LIMIT_WINDOW_MS) {
      adminRateLimitMap.delete(key)
    }
  }
}, 5 * 60 * 1000).unref()

function checkAdminRateLimit(key) {
  const now = Date.now()
  const record = adminRateLimitMap.get(key)
  if (!record || now - record.startTime > ADMIN_RATE_LIMIT_WINDOW_MS) {
    adminRateLimitMap.set(key, { count: 1, startTime: now })
    return true
  }
  if (record.count >= MAX_ADMIN_LOGIN_ATTEMPTS) {
    return false
  }
  record.count++
  return true
}

export function verifyPassword(inputPassword) {
  if (typeof inputPassword !== 'string') return false
  const [storedSalt, storedHex] = storedPasswordHash.split(':')
  const inputKey = crypto.scryptSync(inputPassword, storedSalt, 64)
  const storedBuf = Buffer.from(storedHex, 'hex')
  if (inputKey.length !== storedBuf.length) return false
  return crypto.timingSafeEqual(inputKey, storedBuf)
}

export async function updateAdminPassword(newPassword, pool = null) {
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters long.')
  }
  const newSalt = crypto.randomBytes(16).toString('hex')
  const newKey = crypto.scryptSync(newPassword, newSalt, 64).toString('hex')
  storedPasswordHash = `${newSalt}:${newKey}`

  // Persist to PostgreSQL if pool is available and revoke all existing admin sessions
  const activePool = pool || (await getDbPool())
  if (activePool) {
    try {
      await activePool.query(
        "UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE role = 'admin' OR LOWER(email) = LOWER($2)",
        [storedPasswordHash, CONFIGURED_ADMIN_EMAIL]
      )

      // Authoritative PostgreSQL Session Revocation: Invalidate all active sessions for this admin user
      await activePool.query(
        `UPDATE public.admin_sessions 
         SET revoked_at = NOW() 
         WHERE user_id IN (SELECT id FROM public.users WHERE role = 'admin' OR LOWER(email) = LOWER($1))
           AND revoked_at IS NULL`,
        [CONFIGURED_ADMIN_EMAIL]
      )
    } catch (err) {
      console.warn('Note: Could not persist admin password hash or revoke sessions in database:', err.message)
    }
  }

  return true
}

export async function loadAdminPasswordFromDb(pool) {
  if (!pool) return
  try {
    const res = await pool.query(
      "SELECT password_hash FROM public.users WHERE (role = 'admin' OR LOWER(email) = LOWER($1)) AND password_hash IS NOT NULL LIMIT 1",
      [CONFIGURED_ADMIN_EMAIL]
    )
    if (res.rows.length > 0 && res.rows[0].password_hash && res.rows[0].password_hash.includes(':')) {
      storedPasswordHash = res.rows[0].password_hash
      console.log('🔒 [Zen Auth] Restored administrator password hash from PostgreSQL.')
    }
  } catch (err) {
    // Database or table not ready
  }
}

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Creates a durable admin session in public.admin_sessions.
 * Stores only SHA-256 token hashes and CSRF token hashes.
 * Returns the session object containing raw tokens and metadata.
 */
export async function createAdminSession(email) {
  const cleanEmail = (email || CONFIGURED_ADMIN_EMAIL).toLowerCase().trim()

  // Generate 256-bit cryptographically secure random session token and CSRF token
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  const rawCsrfToken = crypto.randomBytes(32).toString('hex')
  const csrfTokenHash = crypto.createHash('sha256').update(rawCsrfToken).digest('hex')

  const now = Date.now()
  const expiresAt = new Date(now + SESSION_TTL_MS)

  try {
    const pool = await getDbPool()
    let userRes = await pool.query(
      "SELECT id, name, email FROM public.users WHERE LOWER(email) = LOWER($1) AND is_active = true LIMIT 1",
      [cleanEmail]
    )

    if (userRes.rows.length === 0) {
      userRes = await pool.query(
        "SELECT id, name, email FROM public.users WHERE role = 'admin' AND is_active = true ORDER BY id ASC LIMIT 1"
      )
    }

    let userId = userRes.rows[0]?.id
    if (!userId) {
      const ins = await pool.query(
        "INSERT INTO public.users (name, email, role, is_active, password_hash, created_at, updated_at) VALUES ('Zen Café Administrator', $1, 'admin', true, $2, NOW(), NOW()) RETURNING id",
        [cleanEmail, storedPasswordHash]
      )
      userId = ins.rows[0].id
    }

    await pool.query(
      `INSERT INTO public.admin_sessions (token_hash, user_id, csrf_token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (token_hash) DO NOTHING`,
      [tokenHash, userId, csrfTokenHash, expiresAt]
    )
  } catch (err) {
    console.error('Failed to persist admin session in PostgreSQL:', err.message)
  }

  return {
    token: rawToken,
    csrfToken: rawCsrfToken,
    email: cleanEmail,
    expiresAt: expiresAt.getTime(),
  }
}

/**
 * Authoritatively verifies an admin session token against public.admin_sessions in PostgreSQL.
 * Checks expiration, revocation, user role ('admin'), and account active state (is_active).
 * Validates CSRF token if provided.
 */
export async function verifyAdminSessionToken(token, csrfToken = null) {
  if (!token || typeof token !== 'string') return false
  const cleanToken = token.trim()
  if (cleanToken.length < 16) return false

  const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex')

  try {
    const pool = await getDbPool()
    const res = await pool.query(
      `SELECT s.token_hash, s.user_id, s.csrf_token_hash, s.expires_at, s.revoked_at,
              u.name, u.email, u.role, u.is_active
       FROM public.admin_sessions s
       JOIN public.users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND u.is_active = true
         AND u.role = 'admin'
       LIMIT 1`,
      [tokenHash]
    )

    if (res.rows.length === 0) {
      return false
    }

    const row = res.rows[0]

    // Verify CSRF binding if provided
    if (csrfToken && typeof csrfToken === 'string') {
      const inputCsrfHash = crypto.createHash('sha256').update(csrfToken.trim()).digest('hex')
      if (inputCsrfHash !== row.csrf_token_hash) {
        return false
      }
    }

    return {
      userId: String(row.user_id),
      email: row.email,
      name: row.name,
      role: row.role,
      csrfTokenHash: row.csrf_token_hash,
      expiresAt: new Date(row.expires_at).getTime(),
    }
  } catch (err) {
    console.error('Error verifying admin session in database:', err.message)
    return false
  }
}

/**
 * Revokes an admin session in PostgreSQL by stamping revoked_at = NOW().
 */
export async function revokeAdminSessionToken(token) {
  if (!token || typeof token !== 'string') return false
  const cleanToken = token.trim()
  const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex')

  try {
    const pool = await getDbPool()
    const res = await pool.query(
      'UPDATE public.admin_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
      [tokenHash]
    )
    return res.rowCount > 0
  } catch (err) {
    console.error('Error revoking admin session in database:', err.message)
    return false
  }
}

export function extractBearerToken(req) {
  const authHeader =
    req.headers?.['authorization'] ||
    req.headers?.['x-admin-token'] ||
    ''

  if (!authHeader) return null

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim()
  }

  return authHeader.trim()
}

export function extractCsrfToken(req) {
  return (
    req.headers?.['x-csrf-token'] ||
    req.headers?.['csrf-token'] ||
    null
  )
}

/**
 * Authoritatively verifies an incoming admin HTTP request.
 */
export async function verifyAdminRequest(req) {
  const token = extractBearerToken(req)
  if (!token) return false
  const csrfToken = extractCsrfToken(req)
  const session = await verifyAdminSessionToken(token, csrfToken)
  return Boolean(session)
}

/**
 * Handle POST /api/admin/login
 */
export async function handleAdminLogin(body, req = null) {
  const email = (body?.email || '').toLowerCase().trim()
  const password = body?.password || ''

  if (!email || !password) {
    return {
      status: 400,
      body: { success: false, error: 'Email and password are required.' },
    }
  }

  // Rate limiting check
  const clientIp = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown'
  if (!checkAdminRateLimit(`admin_ip_${clientIp}`) || !checkAdminRateLimit(`admin_email_${email}`)) {
    return {
      status: 429,
      body: {
        success: false,
        error: 'Too many admin login attempts. Please wait 15 minutes before trying again.',
      },
    }
  }

  const emailAllowed = ALLOWED_ADMIN_EMAILS.has(email)
  const passwordValid = verifyPassword(password)

  if (!emailAllowed || !passwordValid) {
    return {
      status: 401,
      body: { success: false, error: 'Invalid email or password.' },
    }
  }

  const session = await createAdminSession(email)
  return {
    status: 200,
    body: {
      success: true,
      message: 'Admin authentication successful',
      token: session.token,
      csrfToken: session.csrfToken,
      email: session.email,
      expiresAt: session.expiresAt,
    },
  }
}

/**
 * Handle POST /api/admin/logout
 */
export async function handleAdminLogout(req) {
  const token = extractBearerToken(req)
  if (token) {
    await revokeAdminSessionToken(token)
  }
  return {
    status: 200,
    body: { success: true, message: 'Logged out successfully.' },
  }
}

/**
 * Handle GET /api/admin/check
 */
export async function handleAdminCheck(req) {
  const token = extractBearerToken(req)
  const csrfToken = extractCsrfToken(req)
  const session = token ? await verifyAdminSessionToken(token, csrfToken) : null
  if (!session) {
    return {
      status: 401,
      body: { authenticated: false, error: 'Not authenticated or session expired.' },
    }
  }
  return {
    status: 200,
    body: { authenticated: true, email: session.email, expiresAt: session.expiresAt },
  }
}
