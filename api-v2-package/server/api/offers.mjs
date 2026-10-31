
/**
 * Zen Café — Offers & Promotions API
 * Supports:
 * - General promotions (legacy compatible)
 * - Single product offers
 * - Combo offers
 * - Product quantities
 * - Percentage and fixed discounts
 * - Custom final prices
 * - Server-side PostgreSQL price calculations
 */

import { getDbPool, mapRowToOffer } from '../db.mjs'
import { verifyAdminRequest } from '../auth.mjs'

const OFFER_TYPES = ['general', 'single', 'combo']
const PRICING_MODES = ['discount', 'custom']
const DISCOUNT_TYPES = ['percentage', 'fixed']
const MAX_PRODUCTS = 50
const MAX_QUANTITY = 100

function reply(status, body) {
  return { status, body }
}

function badRequest(message) {
  return reply(400, {
    success: false,
    error: message,
  })
}

function unauthorized() {
  return reply(401, {
    success: false,
    error: 'Unauthorized: Admin authentication required.',
  })
}

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function validMoney(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0
}

function numericId(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function normalizeDate(value, field) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new Error(`${field} must be a valid date.`)
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid date.`)
  }

  return date.toISOString()
}

function normalizeProducts(value) {
  if (!Array.isArray(value)) {
    throw new Error('Products must be an array.')
  }

  if (value.length > MAX_PRODUCTS) {
    throw new Error(`Maximum ${MAX_PRODUCTS} products allowed.`)
  }

  const seen = new Set()

  return value.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid selected product.')
    }

    const id = numericId(
      item.productId ?? item.product_id ?? item.id
    )

    const quantity = Number(item.quantity ?? 1)

    if (!id) {
      throw new Error('Every selected product needs a valid ID.')
    }

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY
    ) {
      throw new Error(
        `Quantity must be between 1 and ${MAX_QUANTITY}.`
      )
    }

    if (seen.has(id)) {
      throw new Error(
        'Duplicate products are not allowed. Increase the quantity instead.'
      )
    }

    seen.add(id)

    return {
      productId: String(id),
      quantity,
    }
  })
}

function parseStoredProducts(value) {
  if (Array.isArray(value)) return value

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

function mapOffer(row) {
  const mapped = mapRowToOffer(row)

  return {
    ...mapped,
    offerType: row.offer_type || 'general',
    pricingMode: row.pricing_mode || 'discount',
    products: parseStoredProducts(row.products),
    originalTotal: Number(row.original_total || 0),
    discountAmount: Number(row.discount_amount || 0),
    finalPrice: Number(row.final_price || 0),
  }
}

async function calculateProducts(pool, products) {
  const ids = products.map((item) => Number(item.productId))

  const result = await pool.query(
    `
      SELECT id, name, kind, price, is_available
      FROM public.products
      WHERE id = ANY($1::bigint[])
    `,
    [ids]
  )

  const byId = new Map(
    result.rows.map((row) => [String(row.id), row])
  )

  let totalCents = 0

  const selected = products.map((item) => {
    const product = byId.get(String(item.productId))

    if (!product) {
      throw new Error(
        `Product ${item.productId} does not exist.`
      )
    }

    if (!product.is_available) {
      throw new Error(
        `${product.name} is unavailable.`
      )
    }

    if (!['food', 'drink', 'snacks'].includes(product.kind)) {
      throw new Error(
        `${product.name} has an unsupported product type.`
      )
    }

    const price = Number(product.price)

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(
        `${product.name} must have a price greater than zero.`
      )
    }

    const unitCents = Math.round(price * 100)
    const lineCents = unitCents * item.quantity

    if (!Number.isSafeInteger(lineCents)) {
      throw new Error('Product total exceeds supported limits.')
    }

    totalCents += lineCents

    return {
      productId: String(product.id),
      quantity: item.quantity,
      name: product.name,
      kind: product.kind,
      unitPrice: roundMoney(price),
      lineTotal: roundMoney(lineCents / 100),
    }
  })

  if (!Number.isSafeInteger(totalCents)) {
    throw new Error('Offer total exceeds supported limits.')
  }

  const originalTotal = totalCents / 100

  if (originalTotal > 9999999999.99) {
    throw new Error('Offer total is too large.')
  }

  return {
    products: selected,
    originalTotal,
  }
}

function normalizeOffer(body, current = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid offer request.')
  }

  const title = has(body, 'title')
    ? String(body.title ?? '').trim()
    : String(current?.title ?? '').trim()

  if (!title || title.length > 200) {
    throw new Error('Offer title must contain 1–200 characters.')
  }

  const description = has(body, 'description')
    ? String(body.description ?? '').trim()
    : String(current?.description ?? '').trim()

  const code = has(body, 'code')
    ? String(body.code ?? '').trim().toUpperCase()
    : String(current?.code ?? '').trim().toUpperCase()

  if (code.length > 50) {
    throw new Error('Promo code cannot exceed 50 characters.')
  }

  const discountType = has(body, 'discountType')
    ? body.discountType
    : current?.discount_type || 'percentage'

  if (!DISCOUNT_TYPES.includes(discountType)) {
    throw new Error('Invalid discount type.')
  }

  const rawDiscount = has(body, 'discountValue')
    ? body.discountValue
    : current?.discount_value

  const discountValue =
    rawDiscount === null ||
    rawDiscount === undefined ||
    rawDiscount === ''
      ? 0
      : Number(rawDiscount)

  if (
    !validMoney(discountValue) ||
    discountValue > 9999999999.99
  ) {
    throw new Error('Invalid discount value.')
  }

  if (discountType === 'percentage' && discountValue > 100) {
    throw new Error('Percentage discount cannot exceed 100%.')
  }

  const offerType = has(body, 'offerType')
    ? body.offerType
    : current?.offer_type || 'general'

  if (!OFFER_TYPES.includes(offerType)) {
    throw new Error('Invalid offer type.')
  }

  const pricingMode = has(body, 'pricingMode')
    ? body.pricingMode
    : current?.pricing_mode || 'discount'

  if (!PRICING_MODES.includes(pricingMode)) {
    throw new Error('Invalid pricing mode.')
  }

  const rawProducts = has(body, 'products')
    ? body.products
    : parseStoredProducts(current?.products)

  const products = normalizeProducts(rawProducts ?? [])

  if (offerType === 'single' && products.length !== 1) {
    throw new Error(
      'Single Product Offer requires exactly one product.'
    )
  }

  if (offerType === 'combo' && products.length < 2) {
    throw new Error(
      'Combo Offer requires at least two different products.'
    )
  }

  if (offerType === 'general' && products.length > 0) {
    throw new Error(
      'General promotions cannot contain selected products.'
    )
  }

  const startValue = has(body, 'startDate')
    ? body.startDate
    : has(body, 'startsAt')
      ? body.startsAt
      : current?.starts_at

  const endValue = has(body, 'endDate')
    ? body.endDate
    : has(body, 'endsAt')
      ? body.endsAt
      : current?.ends_at

  const startsAt = normalizeDate(startValue, 'Start date')
  const endsAt = normalizeDate(endValue, 'End date')

  if (
    startsAt &&
    endsAt &&
    new Date(endsAt) < new Date(startsAt)
  ) {
    throw new Error('End date cannot be before start date.')
  }

  const imageValue = has(body, 'image')
    ? body.image
    : has(body, 'imageUrl')
      ? body.imageUrl
      : has(body, 'image_url')
        ? body.image_url
        : current?.image_url

  const imageUrl =
    imageValue === null || imageValue === undefined
      ? null
      : String(imageValue).trim() || null

  const active = has(body, 'active')
    ? body.active
    : current?.is_active ?? true

  if (typeof active !== 'boolean') {
    throw new Error('Active must be true or false.')
  }

  const customPrice = has(body, 'finalPrice')
    ? body.finalPrice
    : current?.final_price

  return {
    title,
    description,
    code,
    discountType,
    discountValue,
    offerType,
    pricingMode,
    products,
    startsAt,
    endsAt,
    imageUrl,
    active,
    customPrice,
  }
}

async function preparePricing(pool, offer) {
  if (offer.offerType === 'general') {
    if (offer.pricingMode === 'custom') {
      throw new Error(
        'Custom pricing is only available for product offers.'
      )
    }

    return {
      ...offer,
      products: [],
      originalTotal: 0,
      discountAmount: 0,
      finalPrice: 0,
    }
  }

  const calculated = await calculateProducts(
    pool,
    offer.products
  )

  const originalTotal = calculated.originalTotal

  let finalPrice

  if (offer.pricingMode === 'custom') {
    if (
      offer.customPrice === null ||
      offer.customPrice === undefined ||
      offer.customPrice === '' ||
      !validMoney(offer.customPrice)
    ) {
      throw new Error('Enter a valid custom final price.')
    }

    finalPrice = roundMoney(Number(offer.customPrice))

    if (finalPrice > originalTotal) {
      throw new Error(
        'Custom final price cannot exceed original total.'
      )
    }
  } else if (offer.discountType === 'percentage') {
    finalPrice = roundMoney(
      originalTotal * (1 - offer.discountValue / 100)
    )
  } else {
    finalPrice = roundMoney(
      Math.max(0, originalTotal - offer.discountValue)
    )
  }

  const discountAmount = roundMoney(
    originalTotal - finalPrice
  )

  return {
    ...offer,
    products: calculated.products,
    originalTotal,
    discountAmount,
    finalPrice,
  }
}

async function prepareOffer(pool, body, current = null) {
  const normalized = normalizeOffer(body, current)
  return preparePricing(pool, normalized)
}

function offerValues(offer) {
  return [
    offer.title,
    offer.description || null,
    offer.discountType,
    offer.discountValue,
    offer.startsAt,
    offer.endsAt,
    offer.active,
    offer.imageUrl,
    offer.code || null,
    offer.offerType,
    offer.pricingMode,
    JSON.stringify(offer.products),
    offer.originalTotal,
    offer.discountAmount,
    offer.finalPrice,
  ]
}

/**
 * GET /api/offers
 * Public: currently active promotions
 * Admin: ?all=true
 */
export async function handleGetOffers(url, req) {
  const wantsAll = url.searchParams.get('all') === 'true'

  if (wantsAll && !(await verifyAdminRequest(req))) {
    return unauthorized()
  }

  const pool = await getDbPool()

  const result = wantsAll
    ? await pool.query(`
        SELECT *
        FROM public.offers
        ORDER BY id DESC
      `)
    : await pool.query(`
        SELECT *
        FROM public.offers
        WHERE is_active = TRUE
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (ends_at IS NULL OR ends_at::date >= CURRENT_DATE)
        ORDER BY id DESC
      `)

  return reply(200, {
    success: true,
    count: result.rows.length,
    data: result.rows.map(mapOffer),
  })
}

/**
 * GET /api/offers/:id
 */
export async function handleGetOfferById(id) {
  const offerId = numericId(id)

  if (!offerId) {
    return badRequest('Invalid offer ID.')
  }

  const pool = await getDbPool()

  const result = await pool.query(
    'SELECT * FROM public.offers WHERE id = $1',
    [offerId]
  )

  if (!result.rows.length) {
    return reply(404, {
      success: false,
      error: 'Offer not found.',
    })
  }

  return reply(200, {
    success: true,
    data: mapOffer(result.rows[0]),
  })
}

/**
 * POST /api/offers
 */
export async function handleCreateOffer(body, req) {
  if (!(await verifyAdminRequest(req))) {
    return unauthorized()
  }

  const pool = await getDbPool()

  let offer

  try {
    offer = await prepareOffer(pool, body)
  } catch (error) {
    return badRequest(error.message)
  }

  const values = offerValues(offer)

  const result = await pool.query(
    `
      INSERT INTO public.offers (
        title,
        description,
        discount_type,
        discount_value,
        starts_at,
        ends_at,
        is_active,
        image_url,
        code,
        offer_type,
        pricing_mode,
        products,
        original_total,
        discount_amount,
        final_price,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12::jsonb, $13, $14, $15,
        NOW(), NOW()
      )
      RETURNING *
    `,
    values
  )

  return reply(201, {
    success: true,
    data: mapOffer(result.rows[0]),
  })
}

/**
 * PUT /api/offers/:id
 */
export async function handleUpdateOffer(id, body, req) {
  if (!(await verifyAdminRequest(req))) {
    return unauthorized()
  }

  const offerId = numericId(id)

  if (!offerId) {
    return badRequest('Invalid offer ID.')
  }

  const pool = await getDbPool()

  const existing = await pool.query(
    'SELECT * FROM public.offers WHERE id = $1',
    [offerId]
  )

  if (!existing.rows.length) {
    return reply(404, {
      success: false,
      error: 'Offer not found.',
    })
  }

  let offer

  try {
    offer = await prepareOffer(
      pool,
      body,
      existing.rows[0]
    )
  } catch (error) {
    return badRequest(error.message)
  }

  const values = offerValues(offer)

  const result = await pool.query(
    `
      UPDATE public.offers
      SET
        title = $2,
        description = $3,
        discount_type = $4,
        discount_value = $5,
        starts_at = $6,
        ends_at = $7,
        is_active = $8,
        image_url = $9,
        code = $10,
        offer_type = $11,
        pricing_mode = $12,
        products = $13::jsonb,
        original_total = $14,
        discount_amount = $15,
        final_price = $16,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [offerId, ...values]
  )

  return reply(200, {
    success: true,
    data: mapOffer(result.rows[0]),
  })
}

/**
 * DELETE /api/offers/:id
 */
export async function handleDeleteOffer(id, req) {
  if (!(await verifyAdminRequest(req))) {
    return unauthorized()
  }

  const offerId = numericId(id)

  if (!offerId) {
    return badRequest('Invalid offer ID.')
  }

  const pool = await getDbPool()

  const result = await pool.query(
    `
      DELETE FROM public.offers
      WHERE id = $1
      RETURNING id
    `,
    [offerId]
  )

  if (!result.rows.length) {
    return reply(404, {
      success: false,
      error: 'Offer not found.',
    })
  }

  return reply(200, {
    success: true,
    id: String(offerId),
    message: 'Offer deleted successfully.',
  })
}
