import { getAdminAuthHeaders } from '../admin-auth'

export type AdminOffer = {
  id: string
  title: string
  description: string
  code: string
  discountType: 'percentage' | 'fixed'
  discountValue: number
  startDate: string
  endDate: string
  active: boolean
  createdAt: string
  image?: string
}

const STORAGE_KEY = 'zen-admin-promotions-v1'
const EVENT_NAME = 'zen-admin-promotions-updated'

let offersCache: AdminOffer[] | null = null
let fetchInFlight: Promise<AdminOffer[]> | null = null

export async function loadAdminOffers(): Promise<AdminOffer[]> {
  const response = await fetch('/api/offers?all=true', {
    headers: {
      Accept: 'application/json',
      ...getAdminAuthHeaders(),
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

  const items = Array.isArray(json.data) ? (json.data as AdminOffer[]) : []
  offersCache = items
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore quota errors
  }

  window.dispatchEvent(new Event(EVENT_NAME))
  return items
}

export function readAdminOffers(): AdminOffer[] {
  if (offersCache !== null) {
    return offersCache
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        offersCache = parsed as AdminOffer[]
        return offersCache
      }
    }
  } catch {
    // Ignore parse errors
  }

  if (typeof window !== 'undefined' && !fetchInFlight) {
    fetchInFlight = loadAdminOffers()
      .catch(() => [])
      .finally(() => {
        fetchInFlight = null
      })
  }

  return []
}

export async function createAdminOffer(
  offer: Omit<AdminOffer, 'id' | 'createdAt'>
): Promise<AdminOffer> {
  const response = await fetch('/api/offers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify(offer),
  })

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Server returned non-JSON response while creating offer.')
  }

  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.error || `Failed to create offer (${response.status})`)
  }

  const saved = json.data as AdminOffer
  const current = readAdminOffers()
  const next = [saved, ...current.filter(i => i.id !== saved.id)]
  offersCache = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore quota errors
  }
  window.dispatchEvent(new Event(EVENT_NAME))
  return saved
}

export async function updateAdminOffer(
  id: string,
  updates: Partial<AdminOffer>
): Promise<AdminOffer> {
  const response = await fetch(`/api/offers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify(updates),
  })

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Server returned non-JSON response while updating offer.')
  }

  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.error || `Failed to update offer (${response.status})`)
  }

  const updated = json.data as AdminOffer
  const current = readAdminOffers()
  const next = current.map(item => (item.id === id ? updated : item))
  offersCache = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore quota errors
  }
  window.dispatchEvent(new Event(EVENT_NAME))
  return updated
}

export async function deleteAdminOffer(id: string): Promise<void> {
  const response = await fetch(`/api/offers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      ...getAdminAuthHeaders(),
    },
  })

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Server returned non-JSON response while deleting offer.')
  }

  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.error || `Failed to delete offer (${response.status})`)
  }

  const current = readAdminOffers()
  const next = current.filter(item => item.id !== id)
  offersCache = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore quota errors
  }
  window.dispatchEvent(new Event(EVENT_NAME))
}

export function saveAdminOffers(offers: AdminOffer[]): void {
  offersCache = offers
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offers))
  } catch {
    // Ignore quota errors
  }
  window.dispatchEvent(new Event(EVENT_NAME))
}

export function subscribeAdminOffers(
  callback: () => void
): () => void {
  const onChange = () => callback()

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback()
  }

  window.addEventListener(EVENT_NAME, onChange)
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(EVENT_NAME, onChange)
    window.removeEventListener('storage', onStorage)
  }
}
