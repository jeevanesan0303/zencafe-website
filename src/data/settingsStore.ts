
import { getAdminAuthHeaders } from '../admin-auth'

export type CafeSettings = {
  cafeName: string
  tagline: string
  email: string
  phone: string
  address: string
  openingTime: string
  closingTime: string
  currency: string

  bookingsEnabled: boolean
  autoConfirmBookings: boolean
  maxGuests: number
  defaultBookingDuration: number

  emailNotifications: boolean
  bookingNotifications: boolean
  promotionNotifications: boolean

  adminName: string
  adminEmail: string
  adminAvatar: string
}

export const DEFAULT_CAFE_SETTINGS: CafeSettings = {
  cafeName: 'Zen Café',
  tagline: 'Good Food Brings People Together',
  email: 'admin@zencafe.com',
  phone: '',
  address: '',
  openingTime: '09:00',
  closingTime: '22:00',
  currency: 'LKR',

  bookingsEnabled: true,
  autoConfirmBookings: false,
  maxGuests: 20,
  defaultBookingDuration: 2,

  emailNotifications: true,
  bookingNotifications: true,
  promotionNotifications: false,

  adminName: 'Admin',
  adminEmail: 'admin@zencafe.com',
  adminAvatar: '',
}

const STORAGE_KEY = 'zen-cafe-admin-settings-v1'
const UPDATE_EVENT = 'zen-cafe-settings-updated'

export function readCafeSettings(): CafeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) return { ...DEFAULT_CAFE_SETTINGS }

    const parsed: unknown = JSON.parse(raw)

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return { ...DEFAULT_CAFE_SETTINGS }
    }

    return {
      ...DEFAULT_CAFE_SETTINGS,
      ...parsed,
    }
  } catch {
    return { ...DEFAULT_CAFE_SETTINGS }
  }
}

export async function fetchCafeSettings(
  isAdmin: boolean = false
): Promise<CafeSettings> {
  try {
    const endpoint = isAdmin ? '/api/settings/admin' : '/api/settings'
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(isAdmin ? getAdminAuthHeaders() : {}),
    }

    const res = await fetch(endpoint, { headers })
    if (res.ok) {
      const data = await res.json()
      const serverSettings = data.settings || data
      const merged: CafeSettings = {
        ...readCafeSettings(),
        ...serverSettings,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      window.dispatchEvent(new Event(UPDATE_EVENT))
      return merged
    }
  } catch (err) {
    console.warn('Unable to fetch café settings from API:', err)
  }
  return readCafeSettings()
}

export async function saveCafeSettings(
  settings: CafeSettings
): Promise<void> {
  // Optimistic local update
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(settings)
  )

  window.dispatchEvent(new Event(UPDATE_EVENT))

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...getAdminAuthHeaders(),
  }

  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers,
    body: JSON.stringify(settings),
  })

  if (!res.ok) {
    let errMsg = 'Failed to persist settings.'
    try {
      const errData = await res.json()
      if (errData.error || errData.message) {
        errMsg = errData.error || errData.message
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errMsg)
  }

  try {
    const result = await res.json()
    if (result.settings) {
      const finalSettings: CafeSettings = {
        ...DEFAULT_CAFE_SETTINGS,
        ...result.settings,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finalSettings))
    }
  } catch {
    // ignore
  }
}

export function subscribeCafeSettings(
  callback: () => void
): () => void {
  const onUpdate = () => callback()

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback()
    }
  }

  window.addEventListener(UPDATE_EVENT, onUpdate)
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(UPDATE_EVENT, onUpdate)
    window.removeEventListener('storage', onStorage)
  }
}
