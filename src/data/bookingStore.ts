
/* ==========================================
   ZEN CAFÉ
   POSTGRESQL ROOM BOOKINGS STORE

   Features:
   - Public customer bookings
   - Admin booking management
   - Availability checking
   - Manual room blocking
   - Timestamp normalization
   - Browser-tab synchronization
   - Stale response protection
========================================== */

import { getAdminAuthHeaders } from '../admin-auth'

/* ==========================================
   TYPES
========================================== */

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

export type CustomerBookingPayload = {
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
}

export type AdminBookingFilters = {
  status?: string
  date?: string
  search?: string
}

export type BookingModificationPayload = {
  proposedDate: string
  proposedStartTime: string
  duration?: number
  reason: string
}

export type BookingBlockPayload = {
  roomName: string
  blockDate: string
  startTime: string
  endTime: string
  reason?: string
}

/* ==========================================
   STORAGE AND EVENTS
========================================== */

const STORAGE_KEY =
  'zen-cafe-room-bookings-v1'

const UPDATE_EVENT =
  'zen-cafe-bookings-updated'

/*
  Public and admin API routes are preserved.
  No endpoint changes are required here.
*/

const API_BASE = '/api/bookings'

/* ==========================================
   IN-MEMORY STATE

   The revision prevents an older request from
   overwriting a newer booking action.
========================================== */

let bookingsCache: RoomBooking[] | null = null

let bookingsRevision = 0

let latestLoadSequence = 0

/* ==========================================
   BASIC HELPERS
========================================== */

type ApiRecord = Record<string, unknown>

function isRecord(
  value: unknown
): value is ApiRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function getField(
  record: ApiRecord,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    const value = record[key]

    if (value !== undefined && value !== null) {
      return value
    }
  }

  return undefined
}

function toStringValue(
  value: unknown,
  fallback = ''
): string {
  if (typeof value === 'string') {
    return value
  }

  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return String(value)
  }

  return fallback
}

function toNumberValue(
  value: unknown,
  fallback = 0
): number {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value
  }

  if (
    typeof value === 'string' &&
    value.trim()
  ) {
    const parsed = Number(value)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function toOptionalString(
  value: unknown
): string | null {
  if (value === undefined || value === null) {
    return null
  }

  const result = toStringValue(value)

  return result || null
}

/* ==========================================
   DATE NORMALIZATION

   PostgreSQL date fields may arrive as
   YYYY-MM-DD or full ISO timestamps.
========================================== */

function normalizeDate(
  value: unknown
): string {
  const text = toStringValue(value)

  if (!text) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10)
  }

  return text
}

/* ==========================================
   TIME NORMALIZATION

   Keeps HH:mm compatible with HTML time inputs.
========================================== */

function normalizeTime(
  value: unknown
): string {
  const text = toStringValue(value)

  if (!text) {
    return ''
  }

  const match = text.match(
    /^(\d{1,2}):(\d{2})/
  )

  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`
  }

  return text
}

/* ==========================================
   TIMESTAMP NORMALIZATION

   IMPORTANT:
   Never substitute the reservation date for
   the booking submission timestamp.
========================================== */

function normalizeTimestamp(
  value: unknown
): string {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    const milliseconds =
      value < 100_000_000_000
        ? value * 1000
        : value

    const date = new Date(milliseconds)

    return Number.isFinite(date.getTime())
      ? date.toISOString()
      : ''
  }

  if (typeof value !== 'string') {
    return ''
  }

  const text = value.trim()

  if (!text) {
    return ''
  }

  const date = new Date(text)

  if (!Number.isFinite(date.getTime())) {
    return text
  }

  return date.toISOString()
}

/* ==========================================
   STATUS NORMALIZATION
========================================== */

function normalizeBookingStatus(
  value: unknown
): BookingStatus {
  const status = toStringValue(
    value,
    'pending'
  ).toLowerCase()

  switch (status) {
    case 'pending':
      return 'pending'

    case 'confirmed':
    case 'accepted':
      return 'confirmed'

    case 'rejected':
      return 'rejected'

    case 'modification_proposed':
    case 'modified':
      return 'modification_proposed'

    case 'cancelled':
    case 'canceled':
      return 'cancelled'

    case 'completed':
      return 'completed'

    default:
      return 'pending'
  }
}

/* ==========================================
   NORMALIZE BOOKING RECORD

   Supports camelCase and snake_case API data.
========================================== */

function normalizeBooking(
  value: unknown
): RoomBooking {
  if (!isRecord(value)) {
    throw new Error(
      'Invalid booking record returned by the server.'
    )
  }

  const id = toStringValue(
    getField(value, 'id', 'bookingId', 'booking_id')
  )

  if (!id) {
    throw new Error(
      'A booking record is missing its ID.'
    )
  }

  const bookingDate = normalizeDate(
    getField(
      value,
      'bookingDate',
      'booking_date',
      'date'
    )
  )

  const bookingTime = normalizeTime(
    getField(
      value,
      'bookingTime',
      'booking_time',
      'startTime',
      'start_time',
      'time'
    )
  )

  const startTime = normalizeTime(
    getField(
      value,
      'startTime',
      'start_time',
      'bookingTime',
      'booking_time'
    )
  )

  const endTime = normalizeTime(
    getField(
      value,
      'endTime',
      'end_time'
    )
  )

  const createdAt = normalizeTimestamp(
    getField(
      value,
      'createdAt',
      'created_at',
      'requestedAt',
      'requested_at',
      'submittedAt',
      'submitted_at'
    )
  )

  const updatedAt = normalizeTimestamp(
    getField(
      value,
      'updatedAt',
      'updated_at'
    )
  )

  return {
    id,

    customerId: toOptionalString(
      getField(
        value,
        'customerId',
        'customer_id'
      )
    ),

    customerName: toStringValue(
      getField(
        value,
        'customerName',
        'customer_name',
        'name'
      )
    ),

    email: toStringValue(
      getField(
        value,
        'email',
        'customerEmail',
        'customer_email'
      )
    ),

    phone: toStringValue(
      getField(
        value,
        'phone',
        'customerPhone',
        'customer_phone'
      )
    ),

    roomName: toStringValue(
      getField(
        value,
        'roomName',
        'room_name',
        'room'
      ),
      'Private Dining Room'
    ),

    bookingDate,
    bookingTime,

    startTime: startTime || undefined,
    endTime: endTime || undefined,

    guests: toNumberValue(
      getField(
        value,
        'guests',
        'guestCount',
        'guest_count'
      ),
      1
    ),

    duration: toNumberValue(
      getField(
        value,
        'duration',
        'durationHours',
        'duration_hours'
      ),
      2
    ),

    notes: toStringValue(
      getField(
        value,
        'notes',
        'occasion',
        'specialRequests',
        'special_requests'
      )
    ),

    status: normalizeBookingStatus(
      getField(value, 'status')
    ),

    adminReason: toOptionalString(
      getField(
        value,
        'adminReason',
        'admin_reason',
        'rejectionReason',
        'rejection_reason'
      )
    ),

    proposedDate: toOptionalString(
      normalizeDate(
        getField(
          value,
          'proposedDate',
          'proposed_date'
        )
      )
    ),

    proposedStartTime: toOptionalString(
      normalizeTime(
        getField(
          value,
          'proposedStartTime',
          'proposed_start_time'
        )
      )
    ),

    proposedEndTime: toOptionalString(
      normalizeTime(
        getField(
          value,
          'proposedEndTime',
          'proposed_end_time'
        )
      )
    ),

    reviewedBy: toOptionalString(
      getField(
        value,
        'reviewedBy',
        'reviewed_by'
      )
    ),

    reviewedAt: toOptionalString(
      normalizeTimestamp(
        getField(
          value,
          'reviewedAt',
          'reviewed_at'
        )
      )
    ),

    createdAt,

    updatedAt: updatedAt || undefined,
  }
}

/* ==========================================
   NORMALIZE MANUAL BLOCK
========================================== */

function normalizeBlock(
  value: unknown
): BookingBlock {
  if (!isRecord(value)) {
    throw new Error(
      'Invalid booking block returned by the server.'
    )
  }

  const id = toStringValue(
    getField(value, 'id', 'blockId', 'block_id')
  )

  if (!id) {
    throw new Error(
      'A booking block is missing its ID.'
    )
  }

  return {
    id,

    roomName: toStringValue(
      getField(
        value,
        'roomName',
        'room_name'
      ),
      'Private Dining Room'
    ),

    blockDate: normalizeDate(
      getField(
        value,
        'blockDate',
        'block_date',
        'date'
      )
    ),

    startTime: normalizeTime(
      getField(
        value,
        'startTime',
        'start_time'
      )
    ),

    endTime: normalizeTime(
      getField(
        value,
        'endTime',
        'end_time'
      )
    ),

    reason: toStringValue(
      getField(value, 'reason')
    ),

    createdBy: toOptionalString(
      getField(
        value,
        'createdBy',
        'created_by'
      )
    ),

    createdAt: normalizeTimestamp(
      getField(
        value,
        'createdAt',
        'created_at'
      )
    ),
  }
}

/* ==========================================
   BOOKING SORTING

   Pending first.
   Newest submitted requests first.
========================================== */

function bookingPriority(
  status: BookingStatus
): number {
  switch (status) {
    case 'pending':
      return 0

    case 'confirmed':
      return 1

    case 'modification_proposed':
      return 2

    case 'rejected':
      return 3

    case 'completed':
      return 4

    case 'cancelled':
      return 5

    default:
      return 6
  }
}

function timestampValue(
  value: string | undefined
): number | null {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)

  return Number.isFinite(timestamp)
    ? timestamp
    : null
}

export function sortRoomBookings(
  bookings: RoomBooking[]
): RoomBooking[] {
  return [...bookings].sort((a, b) => {
    const priority =
      bookingPriority(a.status) -
      bookingPriority(b.status)

    if (priority !== 0) {
      return priority
    }

    const aTime = timestampValue(a.createdAt)
    const bTime = timestampValue(b.createdAt)

    if (aTime !== null && bTime !== null) {
      if (aTime !== bTime) {
        return bTime - aTime
      }
    } else if (aTime !== null) {
      return -1
    } else if (bTime !== null) {
      return 1
    }

    return (
      `${b.bookingDate}T${b.bookingTime}`.localeCompare(
        `${a.bookingDate}T${a.bookingTime}`
      )
    )
  })
}

/* ==========================================
   LOCAL STORAGE HELPERS
========================================== */

function canUseBrowserStorage(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof localStorage !== 'undefined'
  )
}

function readStoredBookings(): RoomBooking[] {
  if (!canUseBrowserStorage()) {
    return []
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    const valid: RoomBooking[] = []

    for (const item of parsed) {
      try {
        valid.push(normalizeBooking(item))
      } catch {
        // Ignore invalid cached records.
      }
    }

    return sortRoomBookings(valid)
  } catch {
    return []
  }
}

/* ==========================================
   PUBLISH BOOKING CHANGES
========================================== */

function publishBookings(
  bookings: RoomBooking[]
): void {
  const sorted = sortRoomBookings(bookings)

  bookingsCache = sorted
  bookingsRevision += 1

  if (!canUseBrowserStorage()) {
    return
  }

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(sorted)
    )
  } catch {
    // Storage may be unavailable or full.
  }

  window.dispatchEvent(
    new Event(UPDATE_EVENT)
  )
}

/* ==========================================
   PUBLIC LOCAL CACHE API
========================================== */

export function readRoomBookings(): RoomBooking[] {
  if (bookingsCache !== null) {
    return [...bookingsCache]
  }

  bookingsCache = readStoredBookings()

  return [...bookingsCache]
}

export function saveRoomBookings(
  bookings: RoomBooking[]
): void {
  const normalized = bookings.map(
    booking => normalizeBooking(booking)
  )

  publishBookings(normalized)
}

/* ==========================================
   SUBSCRIBE TO BOOKING CHANGES
========================================== */

export function subscribeRoomBookings(
  callback: () => void
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  const handleChange = () => {
    callback()
  }

  const handleStorage = (
    event: StorageEvent
  ) => {
    if (event.key !== STORAGE_KEY) {
      return
    }

    /*
      Another browser tab changed the cache.
      Read its latest data before notifying.
    */

    bookingsCache = readStoredBookings()
    bookingsRevision += 1

    callback()
  }

  window.addEventListener(
    UPDATE_EVENT,
    handleChange
  )

  window.addEventListener(
    'storage',
    handleStorage
  )

  return () => {
    window.removeEventListener(
      UPDATE_EVENT,
      handleChange
    )

    window.removeEventListener(
      'storage',
      handleStorage
    )
  }
}

/* ==========================================
   API RESPONSE HELPERS
========================================== */

async function readJsonResponse(
  response: Response
): Promise<ApiRecord> {
  let payload: unknown

  try {
    payload = await response.json()
  } catch {
    throw new Error(
      'The server returned an invalid JSON response.'
    )
  }

  if (!isRecord(payload)) {
    throw new Error(
      'The server returned an unexpected response.'
    )
  }

  return payload
}

function getApiError(
  payload: ApiRecord,
  fallback: string
): string {
  const error = payload.error

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  if (isRecord(error)) {
    const message = getField(
      error,
      'message',
      'detail'
    )

    if (
      typeof message === 'string' &&
      message.trim()
    ) {
      return message
    }
  }

  const message = payload.message

  if (
    typeof message === 'string' &&
    message.trim()
  ) {
    return message
  }

  return fallback
}

function assertApiSuccess(
  response: Response,
  payload: ApiRecord,
  fallback: string
): void {
  if (
    !response.ok ||
    payload.success === false
  ) {
    throw new Error(
      getApiError(payload, fallback)
    )
  }
}

function getApiData(
  payload: ApiRecord
): unknown {
  return payload.data
}

/* ==========================================
   API FETCH HELPER
========================================== */

async function apiRequest(
  url: string,
  options: RequestInit = {},
  fallbackError = 'Request failed.'
): Promise<ApiRecord> {
  let response: Response

  try {
    response = await fetch(url, {
      ...options,
      cache: 'no-store',
    })
  } catch {
    throw new Error(
      'Unable to connect to the Zen Café server. Please check your internet connection.'
    )
  }

  const payload = await readJsonResponse(
    response
  )

  assertApiSuccess(
    response,
    payload,
    fallbackError
  )

  return payload
}

/* ==========================================
   PUBLIC ROOM AVAILABILITY
========================================== */

export async function fetchAvailability(
  date?: string,
  room?: string
): Promise<AvailabilityResponse> {
  const params = new URLSearchParams()

  if (date) {
    params.set('date', date)
  }

  if (room) {
    params.set('room', room)
  }

  const suffix = params.toString()

  const url = suffix
    ? `${API_BASE}/availability?${suffix}`
    : `${API_BASE}/availability`

  const payload = await apiRequest(
    url,
    {
      headers: {
        Accept: 'application/json',
      },
    },
    'Failed to check room availability.'
  )

  const source = isRecord(payload.data)
    ? payload.data
    : payload

  const rawIntervals = getField(
    source,
    'reservedIntervals',
    'reserved_intervals'
  )

  const intervals = Array.isArray(rawIntervals)
    ? rawIntervals
    : []

  const rawSlots = getField(
    source,
    'availableSlots',
    'available_slots'
  )

  const slots = Array.isArray(rawSlots)
    ? rawSlots
    : []

  return {
    success: true,

    date: normalizeDate(
      getField(source, 'date')
    ),

    roomName: toStringValue(
      getField(
        source,
        'roomName',
        'room_name'
      )
    ),

    openingTime: normalizeTime(
      getField(
        source,
        'openingTime',
        'opening_time'
      )
    ),

    closingTime: normalizeTime(
      getField(
        source,
        'closingTime',
        'closing_time'
      )
    ),

    defaultDuration: toNumberValue(
      getField(
        source,
        'defaultDuration',
        'default_duration'
      ),
      2
    ),

    reservedIntervals: intervals
      .filter(isRecord)
      .map(interval => ({
        type:
          getField(interval, 'type') === 'block'
            ? ('block' as const)
            : ('booking' as const),

        id: toStringValue(
          getField(interval, 'id')
        ) || undefined,

        startTime: normalizeTime(
          getField(
            interval,
            'startTime',
            'start_time'
          )
        ),

        endTime: normalizeTime(
          getField(
            interval,
            'endTime',
            'end_time'
          )
        ),

        reason: toStringValue(
          getField(interval, 'reason')
        ) || undefined,
      })),

    availableSlots: slots.map(
      slot => normalizeTime(slot)
    ),
  }
}

/* ==========================================
   PUBLIC CUSTOMER BOOKING REQUEST
========================================== */

export async function submitCustomerBooking(
  payload: CustomerBookingPayload
): Promise<RoomBooking> {
  const json = await apiRequest(
    API_BASE,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },

      body: JSON.stringify(payload),
    },
    'Failed to submit room booking request.'
  )

  const booking = normalizeBooking(
    getApiData(json)
  )

  /*
    Add to the local cache only if this browser
    already has a booking list.

    The admin endpoint remains the source of truth.
  */

  if (bookingsCache !== null) {
    publishBookings([
      booking,
      ...bookingsCache.filter(
        item => item.id !== booking.id
      ),
    ])
  }

  return booking
}

/* ==========================================
   LOAD ADMIN BOOKINGS

   PostgreSQL API is authoritative.

   Older responses cannot replace data changed
   by a newer successful booking action.
========================================== */

export async function loadAdminBookings(
  filters?: AdminBookingFilters
): Promise<RoomBooking[]> {
  const params = new URLSearchParams()

  if (
    filters?.status &&
    filters.status !== 'all'
  ) {
    params.set(
      'status',
      filters.status
    )
  }

  if (filters?.date) {
    params.set(
      'date',
      filters.date
    )
  }

  if (filters?.search) {
    params.set(
      'search',
      filters.search
    )
  }

  const suffix = params.toString()

  const url = suffix
    ? `${API_BASE}?${suffix}`
    : API_BASE

  const sequence = ++latestLoadSequence

  const startingRevision = bookingsRevision

  const json = await apiRequest(
    url,
    {
      headers: {
        ...getAdminAuthHeaders(),
        Accept: 'application/json',
      },
    },
    'Failed to load bookings from server.'
  )

  const rawData = getApiData(json)

  if (!Array.isArray(rawData)) {
    throw new Error(
      'The bookings API did not return a booking list.'
    )
  }

  const list = sortRoomBookings(
    rawData.map(item => normalizeBooking(item))
  )

  /*
    If an action changed the booking cache while
    this request was in progress, do not publish
    an older response.
  */

  const isLatestRequest =
    sequence === latestLoadSequence

  const cacheUnchanged =
    startingRevision === bookingsRevision

  if (!isLatestRequest || !cacheUnchanged) {
    return readRoomBookings()
  }

  /*
    A filtered API response must not overwrite
    the complete local booking cache.
  */

  const isFiltered =
    Boolean(
      filters?.status &&
      filters.status !== 'all'
    ) ||
    Boolean(filters?.date) ||
    Boolean(filters?.search)

  if (!isFiltered) {
    publishBookings(list)
  }

  return list
}

/* ==========================================
   UPDATE ONE BOOKING IN CACHE
========================================== */

function updateCachedBooking(
  booking: RoomBooking
): void {
  const current = readRoomBookings()

  const exists = current.some(
    item => item.id === booking.id
  )

  if (!exists) {
    /*
      Do not invent a complete admin list when
      the cache has not been loaded yet.
    */

    bookingsRevision += 1
    return
  }

  publishBookings(
    current.map(item =>
      item.id === booking.id
        ? booking
        : item
    )
  )
}

/* ==========================================
   ACCEPT BOOKING
========================================== */

export async function acceptAdminBooking(
  id: string
): Promise<RoomBooking> {
  const json = await apiRequest(
    `${API_BASE}/${encodeURIComponent(id)}/accept`,
    {
      method: 'POST',

      headers: {
        ...getAdminAuthHeaders(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
    'Failed to accept booking.'
  )

  const booking = normalizeBooking(
    getApiData(json)
  )

  updateCachedBooking(booking)

  return booking
}

/* ==========================================
   REJECT BOOKING
========================================== */

export async function rejectAdminBooking(
  id: string,
  reason: string
): Promise<RoomBooking> {
  const trimmedReason = reason.trim()

  if (!trimmedReason) {
    throw new Error(
      'A rejection reason is required.'
    )
  }

  const json = await apiRequest(
    `${API_BASE}/${encodeURIComponent(id)}/reject`,
    {
      method: 'POST',

      headers: {
        ...getAdminAuthHeaders(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },

      body: JSON.stringify({
        reason: trimmedReason,
      }),
    },
    'Failed to reject booking.'
  )

  const booking = normalizeBooking(
    getApiData(json)
  )

  updateCachedBooking(booking)

  return booking
}

/* ==========================================
   MODIFY BOOKING
========================================== */

export async function modifyAdminBooking(
  id: string,
  payload: BookingModificationPayload
): Promise<RoomBooking> {
  if (!payload.reason.trim()) {
    throw new Error(
      'A modification reason is required.'
    )
  }

  if (
    !payload.proposedDate ||
    !payload.proposedStartTime
  ) {
    throw new Error(
      'A proposed date and time are required.'
    )
  }

  const json = await apiRequest(
    `${API_BASE}/${encodeURIComponent(id)}/modify`,
    {
      method: 'POST',

      headers: {
        ...getAdminAuthHeaders(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },

      body: JSON.stringify({
        ...payload,
        reason: payload.reason.trim(),
      }),
    },
    'Failed to propose booking modification.'
  )

  const booking = normalizeBooking(
    getApiData(json)
  )

  updateCachedBooking(booking)

  return booking
}

/* ==========================================
   DELETE ADMIN BOOKING
========================================== */

export async function deleteAdminBooking(
  id: string
): Promise<void> {
  await apiRequest(
    `${API_BASE}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',

      headers: {
        ...getAdminAuthHeaders(),
        Accept: 'application/json',
      },
    },
    'Failed to delete booking.'
  )

  const current = readRoomBookings()

  publishBookings(
    current.filter(
      booking => booking.id !== id
    )
  )
}

/* ==========================================
   LOAD MANUAL BOOKING BLOCKS
========================================== */

export async function loadBookingBlocks(
  room?: string,
  date?: string
): Promise<BookingBlock[]> {
  const params = new URLSearchParams()

  if (room) {
    params.set('room', room)
  }

  if (date) {
    params.set('date', date)
  }

  const suffix = params.toString()

  const url = suffix
    ? `${API_BASE}/blocks?${suffix}`
    : `${API_BASE}/blocks`

  const json = await apiRequest(
    url,
    {
      headers: {
        ...getAdminAuthHeaders(),
        Accept: 'application/json',
      },
    },
    'Failed to load manual booking blocks.'
  )

  const data = getApiData(json)

  if (!Array.isArray(data)) {
    throw new Error(
      'The server returned an invalid block list.'
    )
  }

  return data.map(
    block => normalizeBlock(block)
  )
}

/* ==========================================
   CREATE MANUAL BOOKING BLOCK
========================================== */

export async function createBookingBlock(
  payload: BookingBlockPayload
): Promise<BookingBlock> {
  if (!payload.roomName.trim()) {
    throw new Error(
      'Room name is required.'
    )
  }

  if (
    !payload.blockDate ||
    !payload.startTime ||
    !payload.endTime
  ) {
    throw new Error(
      'Date and time are required.'
    )
  }

  if (
    payload.startTime >= payload.endTime
  ) {
    throw new Error(
      'End time must be after start time.'
    )
  }

  const json = await apiRequest(
    `${API_BASE}/blocks`,
    {
      method: 'POST',

      headers: {
        ...getAdminAuthHeaders(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },

      body: JSON.stringify({
        ...payload,
        roomName: payload.roomName.trim(),
        reason: payload.reason?.trim(),
      }),
    },
    'Failed to create manual booking block.'
  )

  return normalizeBlock(
    getApiData(json)
  )
}

/* ==========================================
   DELETE MANUAL BOOKING BLOCK
========================================== */

export async function deleteBookingBlock(
  id: string
): Promise<void> {
  await apiRequest(
    `${API_BASE}/blocks/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',

      headers: {
        ...getAdminAuthHeaders(),
        Accept: 'application/json',
      },
    },
    'Failed to remove manual block.'
  )
}

/* ==========================================
   LEGACY COMPATIBILITY HELPERS

   These preserve older frontend imports.

   IMPORTANT:
   Local cache updates are not PostgreSQL writes.
========================================== */

export async function addRoomBooking(
  booking: RoomBooking
): Promise<void> {
  const normalized = normalizeBooking(booking)

  const current = readRoomBookings()

  publishBookings([
    normalized,
    ...current.filter(
      item => item.id !== normalized.id
    ),
  ])
}

export async function updateRoomBooking(
  id: string,
  updates: Partial<RoomBooking>
): Promise<void> {
  const current = readRoomBookings()

  const next = current.map(booking => {
    if (booking.id !== id) {
      return booking
    }

    return normalizeBooking({
      ...booking,
      ...updates,
    })
  })

  publishBookings(next)
}

export async function deleteRoomBooking(
  id: string
): Promise<void> {
  /*
    Unlike the previous implementation,
    never silently remove a booking locally
    when the PostgreSQL delete request fails.
  */

  await deleteAdminBooking(id)
}
