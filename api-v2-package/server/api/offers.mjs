// server/api/offers.mjs
// Zen Café — Offers & Promotions REST API endpoints

import { getDbPool, mapRowToOffer } from '../db.mjs'
import { verifyAdminRequest } from '../auth.mjs'

/**
 * GET /api/offers
 * - Public: returns active offers within valid date period
 * - Admin (?all=true): returns all offers, requires valid session
 */
export async function handleGetOffers(url, req) {
  const pool = await getDbPool()
  const wantsAll = url.searchParams.get('all') === 'true'

  if (wantsAll) {
    if (!(await verifyAdminRequest(req))) {
      return {
        status: 401,
        body: {
          success: false,
          error: 'Unauthorized: Admin authentication required.',
        },
      }
    }

    const result = await pool.query(`
      SELECT *
      FROM public.offers
      ORDER BY id DESC
    `)

    return {
      status: 200,
      body: {
        success: true,
        count: result.rows.length,
        data: result.rows.map(mapRowToOffer),
      },
    }
  }

  // Public: only active offers whose date range is current (or open-ended)
  // starts_at is null or in the past/today
  // ends_at is null or in the future/today
  const result = await pool.query(`
    SELECT *
    FROM public.offers
    WHERE is_active = TRUE
      AND (starts_at IS NULL OR starts_at <= NOW())
      AND (ends_at IS NULL OR ends_at::date >= CURRENT_DATE)
    ORDER BY id DESC
  `)

  return {
    status: 200,
    body: {
      success: true,
      count: result.rows.length,
      data: result.rows.map(mapRowToOffer),
    },
  }
}

/**
 * GET /api/offers/:id
 */
export async function handleGetOfferById(id) {
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return {
      status: 400,
      body: { success: false, error: 'Invalid offer ID.' },
    }
  }

  const pool = await getDbPool()
  const result = await pool.query(
    'SELECT * FROM public.offers WHERE id = $1',
    [numericId]
  )

  if (result.rows.length === 0) {
    return {
      status: 404,
      body: { success: false, error: 'Offer not found.' },
    }
  }

  return {
    status: 200,
    body: { success: true, data: mapRowToOffer(result.rows[0]) },
  }
}

/**
 * POST /api/offers
 * Creates a new offer (Admin only)
 */
export async function handleCreateOffer(body, req) {
  if (!(await verifyAdminRequest(req))) {
    return {
      status: 401,
      body: {
        success: false,
        error: 'Unauthorized: Admin authentication required.',
      },
    }
  }

  const title = (body.title || '').trim()
  if (!title) {
    return {
      status: 400,
      body: { success: false, error: 'Offer title is required.' },
    }
  }
  if (title.length > 200) {
    return {
      status: 400,
      body: { success: false, error: 'Offer title cannot exceed 200 characters.' },
    }
  }

  const description = (body.description || '').trim()
  const discountType =
    body.discountType === 'percentage' || body.discountType === 'fixed'
      ? body.discountType
      : 'percentage'

  let discountValue = null
  if (body.discountValue !== undefined && body.discountValue !== null && body.discountValue !== '') {
    discountValue = Number(body.discountValue)
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      return {
        status: 400,
        body: { success: false, error: 'Discount value must be a positive number.' },
      }
    }
    if (discountType === 'percentage' && discountValue > 100) {
      return {
        status: 400,
        body: { success: false, error: 'Percentage discount cannot exceed 100%.' },
      }
    }
  }

  const code = (body.code || '').trim().toUpperCase().slice(0, 50) || null
  const imageUrl = (body.image || body.imageUrl || body.image_url || '').trim() || null

  let startsAt = null
  if (body.startDate || body.startsAt) {
    const d = new Date(body.startDate || body.startsAt)
    if (!Number.isNaN(d.getTime())) {
      startsAt = d.toISOString()
    }
  }

  let endsAt = null
  if (body.endDate || body.endsAt) {
    const d = new Date(body.endDate || body.endsAt)
    if (!Number.isNaN(d.getTime())) {
      endsAt = d.toISOString()
    }
  }

  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    return {
      status: 400,
      body: { success: false, error: 'Offer end date cannot be before start date.' },
    }
  }

  const isActive = body.active !== undefined ? Boolean(body.active) : true

  const pool = await getDbPool()
  const result = await pool.query(`
    INSERT INTO public.offers (
      title, description, discount_type, discount_value,
      starts_at, ends_at, is_active, image_url, code,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    RETURNING *
  `, [
    title,
    description || null,
    discountType,
    discountValue,
    startsAt,
    endsAt,
    isActive,
    imageUrl,
    code,
  ])

  return {
    status: 201,
    body: {
      success: true,
      data: mapRowToOffer(result.rows[0]),
    },
  }
}

/**
 * PUT /api/offers/:id
 * Updates an existing offer (Admin only)
 */
export async function handleUpdateOffer(id, body, req) {
  if (!(await verifyAdminRequest(req))) {
    return {
      status: 401,
      body: {
        success: false,
        error: 'Unauthorized: Admin authentication required.',
      },
    }
  }

  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return {
      status: 400,
      body: { success: false, error: 'Invalid offer ID.' },
    }
  }

  const pool = await getDbPool()
  const existing = await pool.query(
    'SELECT * FROM public.offers WHERE id = $1',
    [numericId]
  )

  if (existing.rows.length === 0) {
    return {
      status: 404,
      body: { success: false, error: 'Offer not found.' },
    }
  }

  const current = existing.rows[0]

  const title =
    body.title !== undefined
      ? body.title.trim()
      : current.title

  if (!title) {
    return {
      status: 400,
      body: { success: false, error: 'Offer title cannot be empty.' },
    }
  }

  const description =
    body.description !== undefined
      ? body.description.trim()
      : current.description

  const discountType =
    body.discountType !== undefined
      ? body.discountType === 'fixed'
        ? 'fixed'
        : 'percentage'
      : current.discount_type || 'percentage'

  let discountValue = current.discount_value
  if (body.discountValue !== undefined) {
    if (body.discountValue === '' || body.discountValue === null) {
      discountValue = null
    } else {
      discountValue = Number(body.discountValue)
      if (!Number.isFinite(discountValue) || discountValue < 0) {
        return {
          status: 400,
          body: { success: false, error: 'Discount value must be positive.' },
        }
      }
      if (discountType === 'percentage' && discountValue > 100) {
        return {
          status: 400,
          body: { success: false, error: 'Percentage discount cannot exceed 100%.' },
        }
      }
    }
  }

  const code =
    body.code !== undefined
      ? body.code.trim().toUpperCase().slice(0, 50) || null
      : current.code

  const imageUrl =
    body.image !== undefined || body.imageUrl !== undefined
      ? (body.image || body.imageUrl || '').trim() || null
      : current.image_url

  let startsAt = current.starts_at
  if (body.startDate !== undefined || body.startsAt !== undefined) {
    const val = body.startDate || body.startsAt
    if (!val) {
      startsAt = null
    } else {
      const d = new Date(val)
      if (!Number.isNaN(d.getTime())) startsAt = d.toISOString()
    }
  }

  let endsAt = current.ends_at
  if (body.endDate !== undefined || body.endsAt !== undefined) {
    const val = body.endDate || body.endsAt
    if (!val) {
      endsAt = null
    } else {
      const d = new Date(val)
      if (!Number.isNaN(d.getTime())) endsAt = d.toISOString()
    }
  }

  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    return {
      status: 400,
      body: { success: false, error: 'Offer end date cannot be before start date.' },
    }
  }

  const isActive =
    body.active !== undefined
      ? Boolean(body.active)
      : current.is_active

  const result = await pool.query(`
    UPDATE public.offers
    SET title = $2,
        description = $3,
        discount_type = $4,
        discount_value = $5,
        starts_at = $6,
        ends_at = $7,
        is_active = $8,
        image_url = $9,
        code = $10,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    numericId,
    title,
    description || null,
    discountType,
    discountValue,
    startsAt,
    endsAt,
    isActive,
    imageUrl,
    code,
  ])

  return {
    status: 200,
    body: {
      success: true,
      data: mapRowToOffer(result.rows[0]),
    },
  }
}

/**
 * DELETE /api/offers/:id
 * Deletes an offer (Admin only)
 */
export async function handleDeleteOffer(id, req) {
  if (!(await verifyAdminRequest(req))) {
    return {
      status: 401,
      body: {
        success: false,
        error: 'Unauthorized: Admin authentication required.',
      },
    }
  }

  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return {
      status: 400,
      body: { success: false, error: 'Invalid offer ID.' },
    }
  }

  const pool = await getDbPool()
  const result = await pool.query(
    'DELETE FROM public.offers WHERE id = $1 RETURNING id',
    [numericId]
  )

  if (result.rows.length === 0) {
    return {
      status: 404,
      body: { success: false, error: 'Offer not found.' },
    }
  }

  return {
    status: 200,
    body: {
      success: true,
      id: String(numericId),
      message: 'Offer deleted successfully.',
    },
  }
}
