
import { getAdminAuthHeaders } from '../admin-auth'

/* ==========================================
   ZEN CAFÉ — ADMIN OFFER STORE
   File: src/data/adminOfferStore.ts

   Supports:
   - Existing promotional offers
   - Single-product offers
   - Multi-product combo offers
   - Product quantities
   - Original and discounted prices
   - Percentage / fixed discounts
   - Custom final offer prices
   - API synchronization
   - Local cache and subscriptions
========================================== */

/* ==========================================
   TYPES
========================================== */

export type OfferDiscountType =
  | 'percentage'
  | 'fixed'

export type OfferType =
  | 'general'
  | 'single'
  | 'combo'

export type OfferPricingMode =
  | 'discount'
  | 'custom'

export type OfferProductKind =
  | 'food'
  | 'drink'
  | 'snacks'

/**
 * A product included in an offer.
 *
 * Product ID links to the menu catalog.
 * Name and price are snapshots used to
 * describe the offer at creation time.
 *
 * The backend must validate the IDs,
 * quantities and prices independently.
 */
export type OfferProduct = {
  productId: string
  quantity: number

  name?: string
  kind?: OfferProductKind
  image?: string

  unitPrice: number
  lineTotal: number
}

/**
 * Existing fields are preserved.
 *
 * New fields are optional for backward
 * compatibility with older promotions.
 */
export type AdminOffer = {
  id: string

  title: string
  description: string
  code: string

  discountType: OfferDiscountType
  discountValue: number

  startDate: string
  endDate: string

  active: boolean
  createdAt: string

  image?: string

  // New product-linked offer information
  offerType?: OfferType
  products?: OfferProduct[]

  // Pricing information (LKR)
  pricingMode?: OfferPricingMode
  originalTotal?: number
  discountAmount?: number
  finalPrice?: number
}

/**
 * Payload used to create a promotion.
 *
 * Older general offers can omit the
 * product-specific fields.
 */
export type CreateAdminOfferInput =
  Omit<AdminOffer, 'id' | 'createdAt'>

/**
 * Existing partial-update behavior
 * remains available.
 */
export type UpdateAdminOfferInput =
  Partial<Omit<AdminOffer, 'id' | 'createdAt'>>

/* ==========================================
   STORAGE CONFIGURATION
========================================== */

const STORAGE_KEY =
  'zen-admin-promotions-v1'

const EVENT_NAME =
  'zen-admin-promotions-updated'

let offersCache: AdminOffer[] | null = null

let fetchInFlight:
  | Promise<AdminOffer[]>
  | null = null

/* ==========================================
   VALIDATION HELPERS
========================================== */

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function isFiniteNonNegative(
  value: unknown
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0
  )
}

function roundMoney(value: number): number {
  return Math.round(
    (value + Number.EPSILON) * 100
  ) / 100
}

function isOfferType(
  value: unknown
): value is OfferType {
  return (
    value === 'general' ||
    value === 'single' ||
    value === 'combo'
  )
}

function isPricingMode(
  value: unknown
): value is OfferPricingMode {
  return (
    value === 'discount' ||
    value === 'custom'
  )
}

function isProductKind(
  value: unknown
): value is OfferProductKind {
  return (
    value === 'food' ||
    value === 'drink' ||
    value === 'snacks'
  )
}

/* ==========================================
   PRODUCT NORMALIZATION

   Preserves older offers and handles
   optional product data safely.
========================================== */

function normalizeOfferProduct(
  value: unknown
): OfferProduct | null {
  if (!isRecord(value)) {
    return null
  }

  const productId =
    typeof value.productId === 'string'
      ? value.productId.trim()
      : ''

  if (!productId) {
    return null
  }

  const rawQuantity =
    Number(value.quantity)

  const quantity =
    Number.isSafeInteger(rawQuantity) &&
    rawQuantity > 0
      ? rawQuantity
      : 1

  const rawUnitPrice =
    Number(value.unitPrice)

  const unitPrice =
    Number.isFinite(rawUnitPrice) &&
    rawUnitPrice >= 0
      ? roundMoney(rawUnitPrice)
      : 0

  const lineTotal = roundMoney(
    unitPrice * quantity
  )

  const product: OfferProduct = {
    productId,
    quantity,
    unitPrice,
    lineTotal,
  }

  if (typeof value.name === 'string') {
    product.name = value.name
  }

  if (isProductKind(value.kind)) {
    product.kind = value.kind
  }

  if (typeof value.image === 'string') {
    product.image = value.image
  }

  return product
}

function normalizeOfferProducts(
  value: unknown
): OfferProduct[] {
  if (!Array.isArray(value)) {
    return []
  }

  const products: OfferProduct[] = []
  const seen = new Set<string>()

  for (const entry of value) {
    const product =
      normalizeOfferProduct(entry)

    if (!product) {
      continue
    }

    if (seen.has(product.productId)) {
      continue
    }

    seen.add(product.productId)
    products.push(product)
  }

  return products
}

/* ==========================================
   PRICING CALCULATIONS

   These calculations are used for
   frontend previews.

   The server must independently verify
   authoritative menu prices.
========================================== */

export type OfferPriceCalculation = {
  originalTotal: number
  discountAmount: number
  finalPrice: number
  savingsPercentage: number
}

export function calculateOfferPricing(
  products: OfferProduct[],
  discountType: OfferDiscountType,
  discountValue: number,
  pricingMode: OfferPricingMode = 'discount',
  customFinalPrice?: number
): OfferPriceCalculation {
  const originalTotal = roundMoney(
    products.reduce((total, product) => {
      const unitPrice =
        Number.isFinite(product.unitPrice)
          ? Math.max(0, product.unitPrice)
          : 0

      const quantity =
        Number.isSafeInteger(product.quantity) &&
        product.quantity > 0
          ? product.quantity
          : 1

      return total + unitPrice * quantity
    }, 0)
  )

  let finalPrice = originalTotal

  if (
    pricingMode === 'custom' &&
    customFinalPrice !== undefined &&
    Number.isFinite(customFinalPrice)
  ) {
    finalPrice = roundMoney(
      Math.min(
        originalTotal,
        Math.max(0, customFinalPrice)
      )
    )
  } else {
    const discount =
      Number.isFinite(discountValue)
        ? Math.max(0, discountValue)
        : 0

    const discountAmount =
      discountType === 'percentage'
        ? originalTotal *
          (Math.min(discount, 100) / 100)
        : Math.min(discount, originalTotal)

    finalPrice = roundMoney(
      Math.max(
        0,
        originalTotal - discountAmount
      )
    )
  }

  const discountAmount = roundMoney(
    originalTotal - finalPrice
  )

  const savingsPercentage =
    originalTotal > 0
      ? roundMoney(
          (discountAmount / originalTotal) *
            100
        )
      : 0

  return {
    originalTotal,
    discountAmount,
    finalPrice,
    savingsPercentage,
  }
}

/* ==========================================
   OFFER NORMALIZATION

   Keeps existing offer data compatible
   with the extended data structure.
========================================== */

function normalizeAdminOffer(
  value: unknown
): AdminOffer | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.id !== 'string' ||
    !value.id
  ) {
    return null
  }

  const discountType: OfferDiscountType =
    value.discountType === 'fixed'
      ? 'fixed'
      : 'percentage'

  const offer: AdminOffer = {
    id: value.id,

    title:
      typeof value.title === 'string'
        ? value.title
        : '',

    description:
      typeof value.description === 'string'
        ? value.description
        : '',

    code:
      typeof value.code === 'string'
        ? value.code
        : '',

    discountType,

    discountValue:
      typeof value.discountValue === 'number' &&
      Number.isFinite(value.discountValue)
        ? value.discountValue
        : 0,

    startDate:
      typeof value.startDate === 'string'
        ? value.startDate
        : '',

    endDate:
      typeof value.endDate === 'string'
        ? value.endDate
        : '',

    active: value.active === true,

    createdAt:
      typeof value.createdAt === 'string'
        ? value.createdAt
        : '',

    image:
      typeof value.image === 'string'
        ? value.image
        : '',
  }

  if (isOfferType(value.offerType)) {
    offer.offerType = value.offerType
  }

  if (Array.isArray(value.products)) {
    offer.products =
      normalizeOfferProducts(value.products)
  }

  if (isPricingMode(value.pricingMode)) {
    offer.pricingMode = value.pricingMode
  }

  if (isFiniteNonNegative(value.originalTotal)) {
    offer.originalTotal = value.originalTotal
  }

  if (isFiniteNonNegative(value.discountAmount)) {
    offer.discountAmount = value.discountAmount
  }

  if (isFiniteNonNegative(value.finalPrice)) {
    offer.finalPrice = value.finalPrice
  }

  return offer
}

function normalizeAdminOffers(
  value: unknown
): AdminOffer[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeAdminOffer)
    .filter(
      (offer): offer is AdminOffer =>
        offer !== null
    )
}

/* ==========================================
   LOCAL CACHE
========================================== */

function writeOffersCache(
  items: AdminOffer[]
): void {
  offersCache = items

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(items)
      )
    } catch {
      // Local storage may be unavailable.
    }

    window.dispatchEvent(
      new Event(EVENT_NAME)
    )
  }
}

/* ==========================================
   API RESPONSE HELPERS
========================================== */

async function readApiResponse(
  response: Response,
  fallback: string
): Promise<unknown> {
  const contentType =
    response.headers.get('content-type') || ''

  if (
    !contentType
      .toLowerCase()
      .includes('application/json')
  ) {
    throw new Error(
      'Offers API returned a non-JSON response.'
    )
  }

  let json: unknown

  try {
    json = await response.json()
  } catch {
    throw new Error(
      'Offers API returned invalid JSON.'
    )
  }

  if (!isRecord(json)) {
    throw new Error(fallback)
  }

  if (
    !response.ok ||
    json.success !== true
  ) {
    throw new Error(
      typeof json.error === 'string'
        ? json.error
        : `${fallback} (${response.status})`
    )
  }

  return json.data
}

/* ==========================================
   LOAD OFFERS FROM DATABASE
========================================== */

export async function loadAdminOffers():
  Promise<AdminOffer[]> {
  if (fetchInFlight) {
    return fetchInFlight
  }

  const request = async (): Promise<
    AdminOffer[]
  > => {
    const response = await fetch(
      '/api/offers?all=true',
      {
        headers: {
          Accept: 'application/json',
          ...getAdminAuthHeaders(),
        },
      }
    )

    const data = await readApiResponse(
      response,
      'Unable to load offers.'
    )

    if (!Array.isArray(data)) {
      throw new Error(
        'Offers API returned an invalid offer list.'
      )
    }

    const items =
      normalizeAdminOffers(data)

    writeOffersCache(items)

    return items
  }

  fetchInFlight = request().finally(() => {
    fetchInFlight = null
  })

  return fetchInFlight
}

/* ==========================================
   READ CACHED OFFERS

   Retains the original synchronous
   read behavior.
========================================== */

export function readAdminOffers():
  AdminOffer[] {
  if (offersCache !== null) {
    return offersCache
  }

  if (typeof window !== 'undefined') {
    try {
      const raw =
        window.localStorage.getItem(
          STORAGE_KEY
        )

      if (raw) {
        const parsed: unknown =
          JSON.parse(raw)

        if (Array.isArray(parsed)) {
          offersCache =
            normalizeAdminOffers(parsed)

          return offersCache
        }
      }
    } catch {
      // Ignore invalid cached data.
    }

    if (!fetchInFlight) {
      void loadAdminOffers().catch(() => {
        // The page handles API errors.
      })
    }
  }

  return []
}

/* ==========================================
   CREATE OFFER
========================================== */

export async function createAdminOffer(
  offer: CreateAdminOfferInput
): Promise<AdminOffer> {
  const response = await fetch(
    '/api/offers',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify(offer),
    }
  )

  const data = await readApiResponse(
    response,
    'Failed to create offer.'
  )

  const saved =
    normalizeAdminOffer(data)

  if (!saved) {
    throw new Error(
      'Server returned an invalid saved offer.'
    )
  }

  const current = readAdminOffers()

  const next = [
    saved,
    ...current.filter(
      item => item.id !== saved.id
    ),
  ]

  writeOffersCache(next)

  return saved
}

/* ==========================================
   UPDATE OFFER
========================================== */

export async function updateAdminOffer(
  id: string,
  updates: UpdateAdminOfferInput
): Promise<AdminOffer> {
  const response = await fetch(
    `/api/offers/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify(updates),
    }
  )

  const data = await readApiResponse(
    response,
    'Failed to update offer.'
  )

  const updated =
    normalizeAdminOffer(data)

  if (!updated) {
    throw new Error(
      'Server returned an invalid updated offer.'
    )
  }

  const current = readAdminOffers()

  const next = current.some(
    item => item.id === id
  )
    ? current.map(item =>
        item.id === id ? updated : item
      )
    : [updated, ...current]

  writeOffersCache(next)

  return updated
}

/* ==========================================
   DELETE OFFER
========================================== */

export async function deleteAdminOffer(
  id: string
): Promise<void> {
  const response = await fetch(
    `/api/offers/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        ...getAdminAuthHeaders(),
      },
    }
  )

  await readApiResponse(
    response,
    'Failed to delete offer.'
  )

  const current = readAdminOffers()

  const next = current.filter(
    item => item.id !== id
  )

  writeOffersCache(next)
}

/* ==========================================
   SAVE OFFERS TO LOCAL CACHE

   This function preserves the original
   export for existing components.

   It does not write to the database.
========================================== */

export function saveAdminOffers(
  offers: AdminOffer[]
): void {
  writeOffersCache(
    normalizeAdminOffers(offers)
  )
}

/* ==========================================
   SUBSCRIBE TO OFFER UPDATES
========================================== */

export function subscribeAdminOffers(
  callback: () => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const onChange = () => {
    callback()
  }

  const onStorage = (
    event: StorageEvent
  ) => {
    if (event.key === STORAGE_KEY) {
      // Refresh the in-memory cache when
      // another tab updates local storage.
      try {
        offersCache = event.newValue
          ? normalizeAdminOffers(
              JSON.parse(event.newValue)
            )
          : null
      } catch {
        offersCache = null
      }

      callback()
    }
  }

  window.addEventListener(
    EVENT_NAME,
    onChange
  )

  window.addEventListener(
    'storage',
    onStorage
  )

  return () => {
    window.removeEventListener(
      EVENT_NAME,
      onChange
    )

    window.removeEventListener(
      'storage',
      onStorage
    )
  }
}
