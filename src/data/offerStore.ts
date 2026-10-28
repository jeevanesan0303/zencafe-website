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

const OFFER_KEY = 'zen-cafe-offers-v72'
const OFFER_EVENT = 'zen-cafe-offers-changed'

let offersCache: ZenOffer[] | null = null
let fetchInFlight: Promise<ZenOffer[]> | null = null

export async function loadOffers(): Promise<ZenOffer[]> {
  const response = await fetch('/api/offers', {
    headers: {
      Accept: 'application/json',
    },
  })

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Offers API unreachable.')
  }

  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.error || `Server error: ${response.status}`)
  }

  const items = Array.isArray(json.data) ? (json.data as ZenOffer[]) : []
  offersCache = items

  try {
    localStorage.setItem(OFFER_KEY, JSON.stringify(items))
  } catch {
    // Ignore storage quota
  }

  window.dispatchEvent(new CustomEvent(OFFER_EVENT))
  return items
}

export function readOffers(): ZenOffer[] {
  if (offersCache !== null) {
    return offersCache
  }

  try {
    const raw = localStorage.getItem(OFFER_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        offersCache = parsed as ZenOffer[]
        return offersCache
      }
    }
  } catch {
    // Ignore parse error
  }

  // Trigger background load if running in browser
  if (typeof window !== 'undefined' && !fetchInFlight) {
    fetchInFlight = loadOffers()
      .catch(() => [])
      .finally(() => {
        fetchInFlight = null
      })
  }

  return []
}

export function writeOffers(offers: ZenOffer[]) {
  offersCache = offers
  try {
    localStorage.setItem(OFFER_KEY, JSON.stringify(offers))
  } catch {
    // Ignore storage quota
  }
  window.dispatchEvent(new CustomEvent(OFFER_EVENT))
}

export function subscribeOffers(callback: () => void) {
  const onCustom = () => callback()
  const onStorage = (event: StorageEvent) => {
    if (event.key === OFFER_KEY) callback()
  }
  window.addEventListener(OFFER_EVENT, onCustom)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(OFFER_EVENT, onCustom)
    window.removeEventListener('storage', onStorage)
  }
}

export function activeOffers(): ZenOffer[] {
  return readOffers().filter(offer => offer.active)
}
