import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import dotenv from 'dotenv'

const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// Auto-load .env file if it exists
dotenv.config({ path: path.join(projectRoot, '.env') })

// Configure pg DATE parser (OID 1082) so date columns return ISO date strings ('YYYY-MM-DD')
// without erroneous local timezone shifts at midnight
if (pg && pg.types && typeof pg.types.setTypeParser === 'function') {
  pg.types.setTypeParser(1082, str => str)
}

export function formatDateYMD(val) {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  if (val instanceof Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(val)
  }
  return String(val).slice(0, 10)
}

let activePool = null
let isInMemory = false
let initPromise = null

const KNOWN_DRINK_CATEGORIES = new Set([
  'milkshake',
  'berry special',
  'chocolate',
  'mojito',
  'iced coffee',
  'hot drinks',
  'iced drinks',
  'smoothies',
  'fresh juices',
  'tea',
])

export function mapRowToMenuItem(row) {
  if (!row) return null

  const price =
    row.price !== null && row.price !== undefined
      ? Number(row.price)
      : undefined

  const category = String(row.category_name || row.category || 'Other')
  const lowerCat = category.toLowerCase().trim()
  const inferredKind = KNOWN_DRINK_CATEGORIES.has(lowerCat) ? 'drink' : 'food'
  const kind =
    row.kind === 'drink' || row.kind === 'food' ? row.kind : inferredKind

  const available =
    row.is_available !== undefined
      ? Boolean(row.is_available)
      : row.available !== false

  const featured =
    row.is_featured !== undefined
      ? Boolean(row.is_featured)
      : row.featured !== false

  return {
    id: String(row.id),
    slug: row.slug || undefined,
    kind,
    name: String(row.name || ''),
    category,
    description: String(row.description || ''),
    ingredients: String(row.ingredients || ''),
    serving: String(row.serving || ''),
    price: Number.isFinite(price) ? price : undefined,
    image: String(row.image_url || row.image || '/assets/menu-panda-main.png'),
    accent: String(row.accent || (kind === 'drink' ? '#4a9a68' : '#a32722')),
    available,
    featured,
    isNew: row.is_new === true,
    spiceLevel: row.spice_level || undefined,
    dietaryType: row.dietary_type || undefined,
    dairyType: row.dairy_type || undefined,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : new Date().toISOString(),
  }
}

export function mapRowToOffer(row) {
  if (!row) return null

  const discountValue =
    row.discount_value !== null && row.discount_value !== undefined
      ? Number(row.discount_value)
      : undefined

  const discountType =
    row.discount_type === 'percentage' || row.discount_type === 'fixed'
      ? row.discount_type
      : 'percentage'

  const active =
    row.is_active !== undefined
      ? Boolean(row.is_active)
      : row.active !== false

  const startDate = row.starts_at
    ? new Date(row.starts_at).toISOString().slice(0, 10)
    : ''

  const endDate = row.ends_at
    ? new Date(row.ends_at).toISOString().slice(0, 10)
    : ''

  const badge =
    discountType === 'percentage' && discountValue
      ? `${discountValue}% OFF`
      : discountValue
      ? `LKR ${discountValue.toLocaleString('en-LK')} OFF`
      : 'SPECIAL OFFER'

  const subtitle =
    row.subtitle ||
    (discountValue
      ? discountType === 'percentage'
        ? `${discountValue}% Discount Special`
        : `Save LKR ${discountValue.toLocaleString('en-LK')}`
      : 'Zen Café special')

  return {
    id: String(row.id),
    title: String(row.title || ''),
    description: String(row.description || ''),
    code: String(row.code || ''),
    discountType,
    discountValue: discountValue ?? 0,
    startDate,
    endDate,
    active,
    image: String(row.image_url || row.image || '/assets/menu-panda-main.png'),
    subtitle,
    badge,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : new Date().toISOString(),
  }
}

export function mapRowToBooking(row) {
  if (!row) return null

  const bookingDate = formatDateYMD(row.booking_date)
  const startTime = row.start_time ? String(row.start_time).slice(0, 5) : ''
  const endTime = row.end_time ? String(row.end_time).slice(0, 5) : ''

  let duration = 2
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    if (Number.isFinite(sh) && Number.isFinite(eh)) {
      const diffMinutes = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))
      if (diffMinutes > 0) {
        duration = Math.round((diffMinutes / 60) * 10) / 10
      }
    }
  }

  const proposedDate = row.proposed_date ? formatDateYMD(row.proposed_date) : null
  const proposedStartTime = row.proposed_start_time
    ? String(row.proposed_start_time).slice(0, 5)
    : null

  const proposedEndTime = row.proposed_end_time
    ? String(row.proposed_end_time).slice(0, 5)
    : null

  return {
    id: String(row.id),
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerName: String(row.customer_name || ''),
    email: String(row.customer_email || ''),
    phone: String(row.customer_phone || ''),
    roomName: String(row.room_name || 'Private Dining Room'),
    bookingDate,
    bookingTime: startTime,
    startTime,
    endTime,
    guests: Number(row.guest_count) || 1,
    duration,
    status: String(row.status || 'pending'),
    notes: String(row.notes || ''),
    adminReason: row.admin_reason || null,
    proposedDate,
    proposedStartTime,
    proposedEndTime,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : new Date().toISOString(),
    updatedAt: row.updated_at
      ? new Date(row.updated_at).toISOString()
      : new Date().toISOString(),
  }
}

export function mapRowToBookingBlock(row) {
  if (!row) return null

  const blockDate = formatDateYMD(row.block_date)

  return {
    id: String(row.id),
    roomName: String(row.room_name || 'Private Dining Room'),
    blockDate,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : '',
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : '',
    reason: row.reason || '',
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : new Date().toISOString(),
  }
}

// In-memory PostgreSQL engine for automated test suites ONLY (when ZEN_TEST_MODE=true or NODE_ENV=test)
async function createInMemoryTestDb() {
  const { newDb } = await import('pg-mem')
  const db = newDb()

  db.public.registerFunction({
    name: 'now',
    returns: 'timestamptz',
    implementation: () => new Date(),
  })

  db.public.registerFunction({
    name: 'hashtext',
    args: ['text'],
    returns: 'int4',
    implementation: (str) => {
      let hash = 0
      for (let i = 0; i < str.length; i++) {
        hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0
      }
      return hash
    },
  })

  db.public.registerFunction({
    name: 'pg_advisory_xact_lock',
    args: ['int4'],
    implementation: () => {},
  })

  // Schema matching public.categories, public.products, public.offers, public.bookings, public.booking_blocks
  db.public.none(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(120) NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
      name VARCHAR(200) NOT NULL,
      slug VARCHAR(220) NOT NULL UNIQUE,
      description TEXT,
      price NUMERIC NOT NULL,
      image_key TEXT,
      image_url TEXT,
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      kind VARCHAR(20) DEFAULT 'food',
      ingredients TEXT,
      serving VARCHAR(100),
      accent VARCHAR(20) DEFAULT '#a32722',
      is_new BOOLEAN DEFAULT FALSE,
      spice_level VARCHAR(20),
      dietary_type VARCHAR(20),
      dairy_type VARCHAR(20),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS offers (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      image_key TEXT,
      image_url TEXT,
      discount_type VARCHAR(20),
      discount_value NUMERIC,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      code VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      customer_id BIGINT,
      customer_name VARCHAR(200) NOT NULL,
      customer_email VARCHAR(200),
      customer_phone VARCHAR(50),
      booking_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME,
      guest_count INTEGER NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      notes TEXT,
      room_name VARCHAR(100) NOT NULL DEFAULT 'Private Dining Room',
      admin_reason TEXT,
      proposed_date DATE,
      proposed_start_time TIME,
      proposed_end_time TIME,
      reviewed_by BIGINT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS booking_blocks (
      id SERIAL PRIMARY KEY,
      room_name VARCHAR(100) NOT NULL DEFAULT 'Private Dining Room',
      block_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      reason TEXT,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_notifications (
      id SERIAL PRIMARY KEY,
      type VARCHAR(100) NOT NULL,
      title VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      booking_id BIGINT,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notification_outbox (
      id SERIAL PRIMARY KEY,
      booking_id BIGINT,
      channel VARCHAR(50) NOT NULL,
      recipient TEXT NOT NULL,
      template_key VARCHAR(100) NOT NULL,
      payload TEXT DEFAULT '{}',
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(200) NOT NULL,
      password_hash TEXT,
      role VARCHAR(50) NOT NULL DEFAULT 'customer',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      phone VARCHAR(50),
      email_verified_at TIMESTAMPTZ,
      gallery_eligible_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id SERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gallery_access (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      eligible_at TIMESTAMPTZ,
      max_uploads INTEGER NOT NULL DEFAULT 2,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gallery (
      id SERIAL PRIMARY KEY,
      uploaded_by BIGINT REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200),
      description TEXT,
      image_key TEXT NOT NULL,
      image_url TEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gallery_sessions (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS game_settings (
      game_key VARCHAR(100) PRIMARY KEY,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_enabled BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS website_settings (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO users (name, email, role, is_active, created_at, updated_at)
    VALUES 
      ('Zen Cafe Test Customer', 'jeevanesanjj@gmail.com', 'customer', true, NOW(), NOW()),
      ('Zen Café Administrator', 'zen@cafe.com', 'admin', true, NOW(), NOW());
  `)

  isInMemory = true
  console.log('⚡ [Zen DB] Test mode active: Initialized in-memory PostgreSQL engine (pg-mem).')

  const pgAdapter = db.adapters.createPg()
  return new pgAdapter.Pool()
}

export async function getDbPool() {
  if (activePool) return activePool
  if (initPromise) return initPromise

  initPromise = (async () => {
    const isTestMode =
      process.env.NODE_ENV === 'test' ||
      process.env.ZEN_TEST_MODE === 'true'

    const connectionString =
      process.env.DATABASE_URL || process.env.POSTGRES_URL

    const hasExplicitPgConfig = Boolean(
      connectionString || process.env.PGHOST
    )

    // In normal development and production modes, we REQUIRE PostgreSQL connectivity.
    // Silent fallback to pg-mem is strictly prohibited to prevent data desynchronization.
    if (!isTestMode && !hasExplicitPgConfig) {
      throw new Error(
        '[Zen DB] FATAL: PostgreSQL configuration missing (DATABASE_URL or PGHOST is not defined in .env). ' +
        'Silent in-memory database fallback is disabled in development and production environments.'
      )
    }

    // 1. Connect to live PostgreSQL if configured
    if (hasExplicitPgConfig) {
      const ssl =
        process.env.PGSSLMODE === 'disable'
          ? false
          : process.env.NODE_ENV === 'production' ||
            (connectionString && connectionString.includes('sslmode=require'))
          ? { rejectUnauthorized: false }
          : false

      const pool = new Pool(
        connectionString
          ? { connectionString, ssl }
          : {
              host: process.env.PGHOST,
              port: Number(process.env.PGPORT || 55432),
              user: process.env.PGUSER || 'zencafe_app',
              password: process.env.PGPASSWORD,
              database: process.env.PGDATABASE || 'zencafe_db',
              ssl,
              connectionTimeoutMillis: 5000,
            }
      )

      try {
        const client = await pool.connect()
        try {
          // Read-only verification check against public.products and public.categories
          // NEVER run DDL migrations automatically on startup!
          const res = await client.query(`
            SELECT 
              to_regclass('public.products') AS products_table,
              to_regclass('public.categories') AS categories_table,
              current_database() AS db_name,
              current_user AS auth_user
          `)
          const row = res.rows[0]
          if (!row?.products_table) {
            console.warn(
              "⚠️ [Zen DB] Table 'public.products' was not found in database '" +
                row.db_name +
                "'."
            )
          } else {
            console.log(
              `✅ [Zen DB] Successfully connected to PostgreSQL: ${row.db_name} as ${row.auth_user} (verified table public.products).`
            )
          }
        } finally {
          client.release()
        }

        activePool = pool
        import('./auth.mjs').then(({ loadAdminPasswordFromDb }) => {
          loadAdminPasswordFromDb(activePool).catch(() => {})
        }).catch(() => {})
        return activePool
      } catch (err) {
        // Discard failed pool so it does not leak handles
        await pool.end().catch(() => {})

        if (!isTestMode) {
          const target = connectionString
            ? connectionString.replace(/:[^:]*@/, ':****@')
            : `${process.env.PGHOST || '127.0.0.1'}:${process.env.PGPORT || 55432}/${process.env.PGDATABASE || 'zencafe_db'}`

          throw new Error(
            `[Zen DB] FATAL: Unable to connect to PostgreSQL database at ${target} (${err.message}). ` +
            `Ensure the SSH tunnel is active: ssh -N -L 55432:127.0.0.1:5432 root@200.141.10.226. ` +
            `Silent in-memory fallback is disabled in development and production modes.`
          )
        }
        console.warn(`[Zen DB] Test mode active: PostgreSQL unreachable (${err.message}), using in-memory engine (pg-mem).`)
      }
    }

    // 2. Fall back to pg-mem ONLY in test mode
    activePool = await createInMemoryTestDb()
    import('./auth.mjs').then(({ loadAdminPasswordFromDb }) => {
      loadAdminPasswordFromDb(activePool).catch(() => {})
    }).catch(() => {})
    return activePool
  })().catch(err => {
    initPromise = null // Allow retry on subsequent requests
    throw err
  })

  return initPromise
}

export async function query(text, params = []) {
  const pool = await getDbPool()
  return pool.query(text, params)
}

export function isDbInMemory() {
  return isInMemory
}
