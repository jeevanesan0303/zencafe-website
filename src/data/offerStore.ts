
/* =========================================================
   ZEN CAFÉ — OFFER STORE
   Live API + Shared Cache + Synchronization

   PostgreSQL-backed API is the source of truth.
   Local cache is only for fast UI rendering.

   Existing exports preserved:
   - loadOffers
   - readOffers
   - writeOffers
   - subscribeOffers
   - activeOffers

   New exports:
   - refreshOffers
   - isOfferCurrentlyActive
========================================================= */

export type ZenOffer = {
  id: string
  title: string
  subtitle: string
  description: string
  badge: string
  image: string
  active: boolean
  createdAt: string
  code?: string
  discountType?: 'percentage' | 'fixed'
  discountValue?: number
  startDate?: string
  endDate?: string
}

/* =========================================================
   CONSTANTS
========================================================= */

const OFFER_KEY = 'zen-cafe-offers-v72'
const OFFER_EVENT = 'zen-cafe-offers-changed'

const OFFER_API = '/api/offers'

const CACHE_TTL_MS = 15_000

/* =========================================================
   INTERNAL STATE
========================================================= */

let offersCache: ZenOffer[] | null = null

let lastFetchedAt = 0

let fetchInFlight: Promise<ZenOffer[]> | null = null

let initialized = false

/* =========================================================
   HELPERS
========================================================= */

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function normalizeOffer(value: unknown): ZenOffer | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null
  }

  const item = value as Record<string, unknown>

  const id = String(item.id ?? '').trim()

  if (!id) return null

  const title = String(item.title ?? '').trim()

  return {
    id,
    title,
    subtitle: String(item.subtitle ?? ''),
    description: String(item.description ?? ''),
    badge: String(item.badge ?? ''),
    image: String(item.image ?? ''),
    active:
      item.active === true ||
      item.active === 1 ||
      item.active === 'true',
    createdAt: String(
      item.createdAt ?? item.created_at ?? '',
    ),
    code:
      item.code == null
        ? undefined
        : String(item.code),
    discountType:
      item.discountType === 'percentage' ||
      item.discountType === 'fixed'
        ? item.discountType
        : undefined,
    discountValue:
      typeof item.discountValue === 'number'
        ? item.discountValue
        : undefined,
    startDate:
      item.startDate == null
        ? undefined
        : String(item.startDate),
    endDate:
      item.endDate == null
        ? undefined
        : String(item.endDate),
  }
}

function normalizeOffers(value: unknown): ZenOffer[] {
  if (!Array.isArray(value)) return []

  return value
    .map(normalizeOffer)
    .filter(
      (offer): offer is ZenOffer =>
        offer !== null,
    )
}

function notifySubscribers(): void {
  if (!isBrowser()) return

  window.dispatchEvent(
    new CustomEvent(OFFER_EVENT),
  )
}

function persistCache(offers: ZenOffer[]): void {
  if (!isBrowser()) return

  try {
    localStorage.setItem(
      OFFER_KEY,
      JSON.stringify(offers),
    )
  } catch {
    // Storage may be disabled or full.
  }
}

function readStoredCache(): ZenOffer[] | null {
  if (!isBrowser()) return null

  try {
    const raw = localStorage.getItem(OFFER_KEY)

    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)

    if (!Array.isArray(parsed)) return null

    return normalizeOffers(parsed)
  } catch {
    return null
  }
}

function updateCache(
  offers: ZenOffer[],
  fetchedFromServer: boolean,
): void {
  offersCache = offers

  if (fetchedFromServer) {
    lastFetchedAt = Date.now()
  } else {
    lastFetchedAt = 0
  }

  persistCache(offers)
  notifySubscribers()
}

/* =========================================================
   FETCH OFFERS FROM API

   Concurrent callers share one request.
========================================================= */

export async function loadOffers(): Promise<ZenOffer[]> {
  if (fetchInFlight) {
    return fetchInFlight
  }

  const request = async (): Promise<ZenOffer[]> => {
    const response = await fetch(OFFER_API, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    const contentType =
      response.headers.get('content-type') || ''

    if (
      !contentType
        .toLowerCase()
        .includes('application/json')
    ) {
      throw new Error(
        'Offers API returned a non-JSON response.',
      )
    }

    const json: unknown = await response.json()

    if (
      !json ||
      typeof json !== 'object' ||
      Array.isArray(json)
    ) {
      throw new Error(
        'Offers API returned an invalid response.',
      )
    }

    const result =
      json as Record<string, unknown>

    if (!response.ok || result.success === false) {
      throw new Error(
        typeof result.error === 'string'
          ? result.error
          : `Offers API error: ${response.status}`,
      )
    }

    if (!Array.isArray(result.data)) {
      throw new Error(
        'Offers API response is missing its data array.',
      )
    }

    const offers = normalizeOffers(result.data)

    updateCache(offers, true)

    return offers
  }

  fetchInFlight = request().finally(() => {
    fetchInFlight = null
  })

  return fetchInFlight
}

/* =========================================================
   REFRESH OFFERS

   - Reuse recent server results
   - Force server request when needed
========================================================= */

export async function refreshOffers(
  force = false,
): Promise<ZenOffer[]> {
  if (fetchInFlight) {
    return fetchInFlight
  }

  const cacheIsFresh =
    offersCache !== null &&
    lastFetchedAt > 0 &&
    Date.now() - lastFetchedAt < CACHE_TTL_MS

  if (!force && cacheIsFresh) {
    return offersCache ?? []
  }

  return loadOffers()
}

/* =========================================================
   READ OFFERS SYNCHRONOUSLY

   Useful for React initial state.
   Cached values are displayed immediately.

   Stale cache triggers a background refresh.
========================================================= */

export function readOffers(): ZenOffer[] {
  if (!initialized) {
    initialized = true

    if (offersCache === null) {
      offersCache = readStoredCache()
    }
  }

  const cacheIsStale =
    lastFetchedAt === 0 ||
    Date.now() - lastFetchedAt >= CACHE_TTL_MS

  if (isBrowser() && cacheIsStale && !fetchInFlight) {
    void loadOffers().catch((error: unknown) => {
      console.error(
        '[Zen Offers] Background refresh failed:',
        error,
      )
    })
  }

  return offersCache ?? []
}

/* =========================================================
   WRITE OFFERS

   This updates the UI cache only.

   Actual create/edit/delete operations must be sent
   to the backend API first.

   After successful API mutation:
     await refreshOffers(true)
========================================================= */

export function writeOffers(offers: ZenOffer[]): void {
  updateCache(normalizeOffers(offers), false)

  if (isBrowser() && !fetchInFlight) {
    void loadOffers().catch((error: unknown) => {
      console.error(
        '[Zen Offers] Synchronization failed:',
        error,
      )
    })
  }
}

/* =========================================================
   SUBSCRIBE TO OFFER CHANGES
========================================================= */

export function subscribeOffers(
  callback: () => void,
): () => void {
  if (!isBrowser()) {
    return () => {}
  }

  const onCustom = () => {
    callback()
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== OFFER_KEY) return

    offersCache = readStoredCache()

    lastFetchedAt = 0

    callback()

    void refreshOffers(true).catch((error: unknown) => {
      console.error(
        '[Zen Offers] Cross-tab refresh failed:',
        error,
      )
    })
  }

  window.addEventListener(
    OFFER_EVENT,
    onCustom,
  )

  window.addEventListener(
    'storage',
    onStorage,
  )

  return () => {
    window.removeEventListener(
      OFFER_EVENT,
      onCustom,
    )

    window.removeEventListener(
      'storage',
      onStorage,
    )
  }
}

/* =========================================================
   CHECK WHETHER AN OFFER IS CURRENTLY ACTIVE

   Uses local calendar dates.

   Active when:
   - active === true
   - startDate is not in the future
   - endDate has not passed
========================================================= */

export function isOfferCurrentlyActive(
  offer: ZenOffer,
  now = new Date(),
): boolean {
  if (!offer.active) return false

  const year = now.getFullYear()

  const month = String(
    now.getMonth() + 1,
  ).padStart(2, '0')

  const day = String(
    now.getDate(),
  ).padStart(2, '0')

  const today = `${year}-${month}-${day}`

  const start = offer.startDate?.slice(0, 10)

  const end = offer.endDate?.slice(0, 10)

  if (start && today < start) return false

  if (end && today > end) return false

  return true
}

/* =========================================================
   ACTIVE OFFERS

   Same shared cache used by Dashboard and Offers page.
========================================================= */

export function activeOffers(): ZenOffer[] {
  return readOffers().filter(
    (offer) => isOfferCurrentlyActive(offer),
  )
}
