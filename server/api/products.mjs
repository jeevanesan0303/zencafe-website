import { query, mapRowToMenuItem } from '../db.mjs'
import { verifyAdminRequest } from '../auth.mjs'

export async function verifyAdminAuth(req) {
  return await verifyAdminRequest(req)
}

const VALID_KINDS = new Set(['food', 'drink'])
const VALID_SPICE_LEVELS = new Set(['none', 'mild', 'medium', 'hot'])
const VALID_DIETARY_TYPES = new Set(['veg', 'non-veg'])
const VALID_DAIRY_TYPES = new Set(['milk', 'milk-powder', 'dairy-free'])

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product'
}

export async function getOrCreateCategoryId(categoryName) {
  const name = String(categoryName || '').trim() || 'Signature'
  const slug = slugify(name)

  const existing = await query(
    'SELECT id, name FROM public.categories WHERE slug = $1 OR LOWER(name) = LOWER($2) LIMIT 1',
    [slug, name]
  )

  if (existing.rows.length > 0) {
    return existing.rows[0].id
  }

  const inserted = await query(
    `INSERT INTO public.categories (name, slug, sort_order, is_active, created_at, updated_at)
     VALUES ($1, $2, 0, TRUE, NOW(), NOW())
     RETURNING id`,
    [name, slug]
  )

  return inserted.rows[0].id
}

const SELECT_PRODUCT_FIELDS = `
  p.id,
  p.category_id,
  p.name,
  p.slug,
  p.description,
  p.price,
  p.image_key,
  p.image_url,
  p.is_available,
  p.is_featured,
  p.sort_order,
  p.kind,
  p.ingredients,
  p.serving,
  p.accent,
  p.is_new,
  p.spice_level,
  p.dietary_type,
  p.dairy_type,
  p.created_at,
  p.updated_at,
  c.name AS category_name,
  c.slug AS category_slug
`

export async function handleGetProducts(url, req) {
  const isAdmin = verifyAdminAuth(req)
  const showAll = isAdmin && url.searchParams.get('all') === 'true'
  const kindFilter = url.searchParams.get('kind')

  let sql = `
    SELECT ${SELECT_PRODUCT_FIELDS}
    FROM public.products p
    LEFT JOIN public.categories c ON p.category_id = c.id
  `

  const params = []
  const conditions = []

  if (!showAll) {
    conditions.push('p.is_available = TRUE')
  }

  if (kindFilter && VALID_KINDS.has(kindFilter)) {
    params.push(kindFilter)
    conditions.push(`p.kind = $${params.length}`)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }

  sql += ' ORDER BY p.is_featured DESC, p.sort_order ASC, p.created_at ASC'

  const result = await query(sql, params)
  const items = result.rows.map(mapRowToMenuItem)

  return {
    status: 200,
    body: {
      success: true,
      data: items,
      count: items.length,
    },
  }
}

export async function handleGetProductById(id) {
  const result = await query(
    `SELECT ${SELECT_PRODUCT_FIELDS}
     FROM public.products p
     LEFT JOIN public.categories c ON p.category_id = c.id
     WHERE (p.id::text = $1 OR p.slug = $1)
     LIMIT 1`,
    [String(id)]
  )

  if (result.rows.length === 0) {
    return {
      status: 404,
      body: { success: false, error: 'Product not found' },
    }
  }

  return {
    status: 200,
    body: {
      success: true,
      data: mapRowToMenuItem(result.rows[0]),
    },
  }
}

export async function handleCreateProduct(body, req) {
  if (!(await verifyAdminAuth(req))) {
    return {
      status: 401,
      body: {
        success: false,
        error: 'Unauthorized. Admin credentials required.',
      },
    }
  }

  const {
    name,
    category,
    description = '',
    price,
    image,
    available = true,
    featured = false,
    kind = 'food',
    ingredients = '',
    serving = '',
    accent = '#a32722',
    isNew = false,
    spiceLevel,
    dietaryType,
    dairyType,
  } = body || {}

  if (!name || typeof name !== 'string' || !name.trim()) {
    return {
      status: 400,
      body: { success: false, error: 'Product name is required.' },
    }
  }

  if (!category || typeof category !== 'string' || !category.trim()) {
    return {
      status: 400,
      body: { success: false, error: 'Product category is required.' },
    }
  }

  const numericPrice =
    typeof price === 'number' && Number.isFinite(price) && price >= 0
      ? price
      : price !== '' && price !== undefined && price !== null
      ? Number(price)
      : null

  if (numericPrice === null || !Number.isFinite(numericPrice) || numericPrice < 0) {
    return {
      status: 400,
      body: { success: false, error: 'Price is required and must be a positive number in LKR.' },
    }
  }

  // Validate enumeration fields
  const cleanKind = kind === 'drink' ? 'drink' : 'food'

  if (spiceLevel && !VALID_SPICE_LEVELS.has(spiceLevel)) {
    return {
      status: 400,
      body: { success: false, error: `Invalid spice level: ${spiceLevel}. Allowed: none, mild, medium, hot.` },
    }
  }

  if (dietaryType && !VALID_DIETARY_TYPES.has(dietaryType)) {
    return {
      status: 400,
      body: { success: false, error: `Invalid dietary type: ${dietaryType}. Allowed: veg, non-veg.` },
    }
  }

  if (dairyType && !VALID_DAIRY_TYPES.has(dairyType)) {
    return {
      status: 400,
      body: { success: false, error: `Invalid dairy type: ${dairyType}. Allowed: milk, milk-powder, dairy-free.` },
    }
  }

  const cleanAccent =
    typeof accent === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(accent.trim())
      ? accent.trim()
      : cleanKind === 'drink'
      ? '#4a9a68'
      : '#a32722'

  // Get or create category
  const categoryId = await getOrCreateCategoryId(category)

  // Generate unique slug
  let productSlug = slugify(name)
  const existingSlug = await query('SELECT id FROM public.products WHERE slug = $1 LIMIT 1', [productSlug])
  if (existingSlug.rows.length > 0) {
    productSlug = `${productSlug}-${Date.now().toString(36)}`
  }

  const imageUrl = String(image || body.image_url || '/assets/menu-panda-main.png').trim()

  const insertSql = `
    INSERT INTO public.products (
      category_id,
      name,
      slug,
      description,
      price,
      image_url,
      is_available,
      is_featured,
      sort_order,
      kind,
      ingredients,
      serving,
      accent,
      is_new,
      spice_level,
      dietary_type,
      dairy_type,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16, $17,
      NOW(), NOW()
    )
    RETURNING id
  `

  const insertParams = [
    categoryId,
    name.trim(),
    productSlug,
    description.trim(),
    numericPrice,
    imageUrl,
    available !== false,
    featured === true,
    0,
    cleanKind,
    ingredients ? String(ingredients).trim() : null,
    serving ? String(serving).trim() : null,
    cleanAccent,
    Boolean(isNew),
    spiceLevel || null,
    dietaryType || null,
    dairyType || null,
  ]

  const insertRes = await query(insertSql, insertParams)
  const insertedId = insertRes.rows[0].id

  const created = await handleGetProductById(insertedId)
  return {
    status: 201,
    body: created.body,
  }
}

export async function handleUpdateProduct(id, body, req) {
  if (!(await verifyAdminAuth(req))) {
    return {
      status: 401,
      body: {
        success: false,
        error: 'Unauthorized. Admin credentials required.',
      },
    }
  }

  const existingRes = await query(
    'SELECT * FROM public.products WHERE (id::text = $1 OR slug = $1) LIMIT 1',
    [String(id)]
  )

  if (existingRes.rows.length === 0) {
    return {
      status: 404,
      body: { success: false, error: 'Product not found' },
    }
  }

  const existing = existingRes.rows[0]
  const updates = []
  const params = []

  if (body.name !== undefined && typeof body.name === 'string' && body.name.trim()) {
    params.push(body.name.trim())
    updates.push(`name = $${params.length}`)
  }

  if (body.description !== undefined) {
    params.push(String(body.description || '').trim())
    updates.push(`description = $${params.length}`)
  }

  if (body.price !== undefined) {
    const numPrice = Number(body.price)
    if (Number.isFinite(numPrice) && numPrice >= 0) {
      params.push(numPrice)
      updates.push(`price = $${params.length}`)
    }
  }

  if (body.image !== undefined || body.image_url !== undefined) {
    const img = String(body.image || body.image_url || '').trim()
    if (img) {
      params.push(img)
      updates.push(`image_url = $${params.length}`)
    }
  }

  if (body.available !== undefined) {
    params.push(Boolean(body.available))
    updates.push(`is_available = $${params.length}`)
  }

  if (body.featured !== undefined) {
    params.push(Boolean(body.featured))
    updates.push(`is_featured = $${params.length}`)
  }

  if (body.category !== undefined && typeof body.category === 'string' && body.category.trim()) {
    const newCatId = await getOrCreateCategoryId(body.category)
    params.push(newCatId)
    updates.push(`category_id = $${params.length}`)
  }

  if (body.kind !== undefined && VALID_KINDS.has(body.kind)) {
    params.push(body.kind)
    updates.push(`kind = $${params.length}`)
  }

  if (body.ingredients !== undefined) {
    params.push(body.ingredients ? String(body.ingredients).trim() : null)
    updates.push(`ingredients = $${params.length}`)
  }

  if (body.serving !== undefined) {
    params.push(body.serving ? String(body.serving).trim() : null)
    updates.push(`serving = $${params.length}`)
  }

  if (body.accent !== undefined) {
    const acc = String(body.accent || '').trim()
    if (/^#[0-9a-fA-F]{3,8}$/.test(acc)) {
      params.push(acc)
      updates.push(`accent = $${params.length}`)
    }
  }

  if (body.isNew !== undefined || body.is_new !== undefined) {
    const isNewVal = body.isNew !== undefined ? body.isNew : body.is_new
    params.push(Boolean(isNewVal))
    updates.push(`is_new = $${params.length}`)
  }

  if (body.spiceLevel !== undefined || body.spice_level !== undefined) {
    const sl = body.spiceLevel || body.spice_level
    if (sl === null || sl === '' || VALID_SPICE_LEVELS.has(sl)) {
      params.push(sl || null)
      updates.push(`spice_level = $${params.length}`)
    }
  }

  if (body.dietaryType !== undefined || body.dietary_type !== undefined) {
    const dt = body.dietaryType || body.dietary_type
    if (dt === null || dt === '' || VALID_DIETARY_TYPES.has(dt)) {
      params.push(dt || null)
      updates.push(`dietary_type = $${params.length}`)
    }
  }

  if (body.dairyType !== undefined || body.dairy_type !== undefined) {
    const dyt = body.dairyType || body.dairy_type
    if (dyt === null || dyt === '' || VALID_DAIRY_TYPES.has(dyt)) {
      params.push(dyt || null)
      updates.push(`dairy_type = $${params.length}`)
    }
  }

  if (updates.length > 0) {
    updates.push('updated_at = NOW()')
    params.push(existing.id)
    const updateSql = `UPDATE public.products SET ${updates.join(', ')} WHERE id = $${params.length}`
    await query(updateSql, params)
  }

  return handleGetProductById(existing.id)
}

export async function handleDeleteProduct(id, req) {
  if (!(await verifyAdminAuth(req))) {
    return {
      status: 401,
      body: {
        success: false,
        error: 'Unauthorized. Admin credentials required.',
      },
    }
  }

  const result = await query(
    'DELETE FROM public.products WHERE (id::text = $1 OR slug = $1) RETURNING id',
    [String(id)]
  )

  if (result.rows.length === 0) {
    return {
      status: 404,
      body: { success: false, error: 'Product not found' },
    }
  }

  return {
    status: 200,
    body: {
      success: true,
      message: 'Product deleted successfully',
      id: String(result.rows[0].id),
    },
  }
}
