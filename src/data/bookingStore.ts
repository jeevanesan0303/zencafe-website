// src/data/bookingStore.ts
// Zen Café — Phase 3: PostgreSQL-backed Room Bookings & Availability Store

import { getAdminAuthHeaders } from '../admin-auth'

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'modification_proposed'
  | 'cancelled'
  | 'completed'

export type RoomBooking = {
  id: string
  customerId?: string | null
  customerName: string
  email: string
  phone: string
  roomName: string
  bookingDate: string
  bookingTime: string
  startTime?: string
  endTime?: string
  guests: number
  duration: number
  notes: string
  status: BookingStatus
  adminReason?: string | null
  proposedDate?: string | null
  proposedStartTime?: string | null
  proposedEndTime?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | null
  createdAt: string
  updatedAt?: string
}

export type BookingBlock = {
  id: string
  roomName: string
  blockDate: string
  startTime: string
  endTime: string
  reason: string
  createdBy?: string | null
  createdAt: string
}

export type AvailabilityResponse = {
  success: boolean
  date: string
  roomName: string
  openingTime: string
  closingTime: string
  defaultDuration: number
  reservedIntervals: Array<{
    type: 'booking' | 'block'
    id?: string
    startTime: string
    endTime: string
    reason?: string
  }>
  availableSlots: string[]
}

const STORAGE_KEY = 'zen-cafe-room-bookings-v1'
const UPDATE_EVENT = 'zen-cafe-bookings-updated'

/* ==========================================
   LOCAL CACHE & SYNC HELPERS
========================================== */

export function readRoomBookings(): RoomBooking[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RoomBooking[]) : []
  } catch {
    return []
  }
}

export function saveRoomBookings(bookings: RoomBooking[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings))
    window.dispatchEvent(new Event(UPDATE_EVENT))
  } catch {
    // Quota or storage unavailable
  }
}

export function subscribeRoomBookings(callback: () => void): () => void {
  const handleChange = () => callback()
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback()
  }

  window.addEventListener(UPDATE_EVENT, handleChange)
  window.addEventListener('storage', handleStorage)

  return () => {
    window.removeEventListener(UPDATE_EVENT, handleChange)
    window.removeEventListener('storage', handleStorage)
  }
}

/* ==========================================
   REAL POSTGRESQL API CALLS
========================================== */

/**
 * Fetch availability for a specific room and date
 */
export async function fetchAvailability(
  date?: string,
  room?: string
): Promise<AvailabilityResponse> {
  const params = new URLSearchParams()
  if (date) params.set('date', date)
  if (room) params.set('room', room)

  const res = await fetch(`/api/bookings/availability?${params.toString()}`)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to check room availability.')
  }
  return res.json()
}

/**
 * Public customer booking request
 */
export async function submitCustomerBooking(payload: {
  customerName: string
  phone: string
  email?: string
  date: string
  time: string
  duration?: number
  guests?: number
  occasion?: string
  notes?: string
  roomName?: string
}): Promise<RoomBooking> {
  const res = await fetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to submit room booking request.')
  }

  return json.data
}

/**
 * Load admin bookings from PostgreSQL API
 */
export async function loadAdminBookings(filters?: {
  status?: string
  date?: string
  search?: string
}): Promise<RoomBooking[]> {
  const params = new URLSearchParams()
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status)
  if (filters?.date) params.set('date', filters.date)
  if (filters?.search) params.set('search', filters.search)

  const res = await fetch(`/api/bookings?${params.toString()}`, {
    headers: {
      ...getAdminAuthHeaders(),
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to load bookings from server.')
  }

  const json = await res.json()
  const list: RoomBooking[] = json.data || []
  saveRoomBookings(list)
  return list
}

/**
 * Accept a booking (sets status to 'confirmed')
 */
export async function acceptAdminBooking(id: string): Promise<RoomBooking> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(id)}/accept`, {
    method: 'POST',
    headers: {
      ...getAdminAuthHeaders(),
      'Content-Type': 'application/json',
    },
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to accept booking.')
  }

  const current = readRoomBookings()
  saveRoomBookings(current.map(b => (b.id === id ? json.data : b)))
  return json.data
}

/**
 * Reject a booking with mandatory reason (sets status to 'rejected')
 */
export async function rejectAdminBooking(
  id: string,
  reason: string
): Promise<RoomBooking> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: {
      ...getAdminAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to reject booking.')
  }

  const current = readRoomBookings()
  saveRoomBookings(current.map(b => (b.id === id ? json.data : b)))
  return json.data
}

/**
 * Propose modification with mandatory reason
 */
export async function modifyAdminBooking(
  id: string,
  payload: {
    proposedDate: string
    proposedStartTime: string
    duration?: number
    reason: string
  }
): Promise<RoomBooking> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(id)}/modify`, {
    method: 'POST',
    headers: {
      ...getAdminAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to propose booking modification.')
  }

  const current = readRoomBookings()
  saveRoomBookings(current.map(b => (b.id === id ? json.data : b)))
  return json.data
}

/**
 * Delete a booking
 */
export async function deleteAdminBooking(id: string): Promise<void> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAdminAuthHeaders(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to delete booking.')
  }

  const current = readRoomBookings()
  saveRoomBookings(current.filter(b => b.id !== id))
}

/**
 * Load manual booking blocks
 */
export async function loadBookingBlocks(
  room?: string,
  date?: string
): Promise<BookingBlock[]> {
  const params = new URLSearchParams()
  if (room) params.set('room', room)
  if (date) params.set('date', date)

  const res = await fetch(`/api/bookings/blocks?${params.toString()}`, {
    headers: getAdminAuthHeaders(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to load manual blocks.')
  }

  const json = await res.json()
  return json.data || []
}

/**
 * Create a manual block
 */
export async function createBookingBlock(payload: {
  roomName: string
  blockDate: string
  startTime: string
  endTime: string
  reason?: string
}): Promise<BookingBlock> {
  const res = await fetch('/api/bookings/blocks', {
    method: 'POST',
    headers: {
      ...getAdminAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to create manual block.')
  }

  return json.data
}

/**
 * Delete a manual block
 */
export async function deleteBookingBlock(id: string): Promise<void> {
  const res = await fetch(`/api/bookings/blocks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAdminAuthHeaders(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to remove manual block.')
  }
}

// Backward-compatibility wrappers for legacy code
export const addRoomBooking = async (b: RoomBooking): Promise<void> => {
  saveRoomBookings([b, ...readRoomBookings()])
}

export const updateRoomBooking = async (
  id: string,
  updates: Partial<RoomBooking>
): Promise<void> => {
  const current = readRoomBookings()
  saveRoomBookings(current.map(b => (b.id === id ? { ...b, ...updates } : b)))
}

export const deleteRoomBooking = async (id: string): Promise<void> => {
  await deleteAdminBooking(id).catch(() => {
    saveRoomBookings(readRoomBookings().filter(b => b.id !== id))
  })
}
