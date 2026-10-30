
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { FormEvent } from 'react'

import Swal from 'sweetalert2'

import {
  Ban,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DoorOpen,
  LockKeyhole,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'

import type { AdminPage } from '../AdminApp'

import {
  acceptAdminBooking,
  createBookingBlock,
  deleteAdminBooking,
  deleteBookingBlock,
  loadAdminBookings,
  loadBookingBlocks,
  modifyAdminBooking,
  rejectAdminBooking,
  subscribeRoomBookings,
  type BookingBlock,
  type BookingStatus,
  type RoomBooking,
} from '../../data/bookingStore'

import AdminAlert from '../utils/sweetAlert'

/* ==========================================
   TYPES
========================================== */

type Props = {
  onNavigate: (page: AdminPage) => void
  query?: string
}

type Filter =
  | 'all'
  | 'pending'
  | 'confirmed'
  | 'modification_proposed'
  | 'rejected'
  | 'completed'
  | 'cancelled'

type PageSize = 10 | 25 | 50

type ModifyDraft = {
  bookingId: string
  customerName: string
  originalDate: string
  originalTime: string
  proposedDate: string
  proposedStartTime: string
  duration: number
  reason: string
}

type BlockDraft = {
  roomName: string
  blockDate: string
  startTime: string
  endTime: string
  reason: string
}

/* ==========================================
   CONSTANTS
========================================== */

const PAGE_SIZES: PageSize[] = [10, 25, 50]

const REFRESH_INTERVAL = 30_000

const FILTERS: {
  value: Filter
  label: string
}[] = [
  { value: 'all', label: 'All Bookings' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Accepted' },
  {
    value: 'modification_proposed',
    label: 'Modified',
  },
  { value: 'rejected', label: 'Rejected' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

/* ==========================================
   DATE AND TIME HELPERS
========================================== */

function formatDate(value: string): string {
  if (!value) return '—'

  const parts = value.slice(0, 10).split('-')

  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number)

    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day)
    ) {
      return new Date(
        year,
        month - 1,
        day
      ).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    }
  }

  return value
}

function formatTime(value: string): string {
  if (!value) return '—'

  const [hour, minute] = value.split(':').map(Number)

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return value
  }

  return new Date(
    2000,
    0,
    1,
    hour,
    minute
  ).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getLocalToday(): string {
  try {
    const parts = new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }
    ).formatToParts(new Date())

    const year = parts.find(
      part => part.type === 'year'
    )?.value

    const month = parts.find(
      part => part.type === 'month'
    )?.value

    const day = parts.find(
      part => part.type === 'day'
    )?.value

    if (year && month && day) {
      return `${year}-${month}-${day}`
    }
  } catch {
    // Fallback below.
  }

  const now = new Date()

  return new Date(
    now.getTime() -
      now.getTimezoneOffset() * 60_000
  ).toISOString().slice(0, 10)
}

/* ==========================================
   BOOKING STATUS HELPERS
========================================== */

function statusBadgeLabel(
  status: BookingStatus
): string {
  switch (status) {
    case 'pending':
      return 'Pending'

    case 'confirmed':
      return 'Accepted'

    case 'rejected':
      return 'Rejected'

    case 'modification_proposed':
      return 'Modified'

    case 'completed':
      return 'Completed'

    case 'cancelled':
      return 'Cancelled'

    default:
      return status
  }
}

function reviewedMessage(
  status: BookingStatus
): string {
  switch (status) {
    case 'confirmed':
      return 'Booking accepted and reserved'

    case 'rejected':
      return 'Booking request rejected'

    case 'modification_proposed':
      return 'Alternative time proposed'

    case 'completed':
      return 'Booking completed'

    case 'cancelled':
      return 'Booking cancelled'

    default:
      return 'Booking reviewed'
  }
}

/* ==========================================
   BOOKING PRIORITY

   Pending requests always appear first.
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

/* ==========================================
   BOOKING SUBMISSION TIMESTAMP

   Supports common backend timestamp fields.
========================================== */

function bookingCreatedTimestamp(
  booking: RoomBooking
): number | null {
  const record = booking as RoomBooking &
    Record<string, unknown>

  const candidates = [
    record.createdAt,
    record.created_at,
    record.requestedAt,
    record.requested_at,
    record.submittedAt,
    record.submitted_at,
  ]

  for (const value of candidates) {
    if (
      typeof value !== 'string' &&
      typeof value !== 'number'
    ) {
      continue
    }

    const timestamp =
      typeof value === 'number'
        ? value < 100_000_000_000
          ? value * 1000
          : value
        : Date.parse(value)

    if (Number.isFinite(timestamp)) {
      return timestamp
    }
  }

  return null
}

/* ==========================================
   SORT BOOKINGS

   1. Pending first
   2. Newest submission first
   3. Reservation date as fallback
========================================== */

function compareBookings(
  a: RoomBooking,
  b: RoomBooking
): number {
  const priority =
    bookingPriority(a.status) -
    bookingPriority(b.status)

  if (priority !== 0) {
    return priority
  }

  const aCreated = bookingCreatedTimestamp(a)
  const bCreated = bookingCreatedTimestamp(b)

  if (aCreated !== null && bCreated !== null) {
    if (aCreated !== bCreated) {
      return bCreated - aCreated
    }
  } else if (aCreated !== null) {
    return -1
  } else if (bCreated !== null) {
    return 1
  }

  return (
    `${b.bookingDate}T${b.bookingTime}`.localeCompare(
      `${a.bookingDate}T${a.bookingTime}`
    )
  )
}

/* ==========================================
   DEFAULT BLOCK FORM
========================================== */

function createDefaultBlockDraft(): BlockDraft {
  return {
    roomName: 'Private Dining Room',
    blockDate: getLocalToday(),
    startTime: '12:00',
    endTime: '15:00',
    reason: '',
  }
}

/* ==========================================
   ROOM BOOKINGS COMPONENT
========================================== */

export default function Bookings({
  onNavigate,
  query = '',
}: Props) {
  /* ==========================================
     STATE
  ========================================== */

  const [bookings, setBookings] = useState<
    RoomBooking[]
  >([])

  const [blocks, setBlocks] = useState<
    BookingBlock[]
  >([])

  const [loading, setLoading] = useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [filter, setFilter] =
    useState<Filter>('all')

  const [search, setSearch] = useState('')

  const [error, setError] = useState('')

  const [busyId, setBusyId] = useState<
    string | null
  >(null)

  /* PAGINATION */

  const [currentPage, setCurrentPage] =
    useState(1)

  const [pageSize, setPageSize] =
    useState<PageSize>(10)

  /* MODIFY MODAL */

  const [modifyModalOpen, setModifyModalOpen] =
    useState(false)

  const [modifyDraft, setModifyDraft] =
    useState<ModifyDraft | null>(null)

  const [modifying, setModifying] =
    useState(false)

  const [modifyError, setModifyError] =
    useState('')

  /* BLOCK MODAL */

  const [blockModalOpen, setBlockModalOpen] =
    useState(false)

  const [blockDraft, setBlockDraft] =
    useState<BlockDraft>(
      createDefaultBlockDraft
    )

  const [blocking, setBlocking] =
    useState(false)

  const [blockError, setBlockError] =
    useState('')

  /* ==========================================
     REFS
  ========================================== */

  const mountedRef = useRef(false)

  const actionLockRef = useRef(false)

  const refreshSequenceRef = useRef(0)

  const refreshInProgressRef = useRef(false)

  const bookingsRef = useRef<RoomBooking[]>([])

  const initialLoadRef = useRef(true)

  const modifyOpenRef = useRef(false)

  const blockOpenRef = useRef(false)

  /* ==========================================
     KEEP MODAL REFS UPDATED
  ========================================== */

  useEffect(() => {
    modifyOpenRef.current = modifyModalOpen
  }, [modifyModalOpen])

  useEffect(() => {
    blockOpenRef.current = blockModalOpen
  }, [blockModalOpen])

  /* ==========================================
     LOCAL BOOKING STATE UPDATE
  ========================================== */

  function updateBookings(
    updater: (
      previous: RoomBooking[]
    ) => RoomBooking[]
  ): void {
    const next = updater(bookingsRef.current)

    bookingsRef.current = next

    if (mountedRef.current) {
      setBookings(next)
    }
  }

  /* ==========================================
     REFRESH DATA FROM BACKEND
  ========================================== */

  const refreshData = useCallback(
    async (
      options: {
        silent?: boolean
      } = {}
    ): Promise<void> => {
      if (
        actionLockRef.current ||
        modifyOpenRef.current ||
        blockOpenRef.current ||
        refreshInProgressRef.current
      ) {
        return
      }

      const sequence =
        ++refreshSequenceRef.current

      const silent = options.silent === true

      refreshInProgressRef.current = true

      if (mountedRef.current) {
        if (silent) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }
      }

      try {
        const [bookingResult, blockResult] =
          await Promise.allSettled([
            loadAdminBookings(),
            loadBookingBlocks(),
          ])

        if (
          !mountedRef.current ||
          sequence !== refreshSequenceRef.current ||
          actionLockRef.current
        ) {
          return
        }

        if (bookingResult.status === 'fulfilled') {
          bookingsRef.current =
            bookingResult.value

          setBookings(bookingResult.value)

          setError('')
        } else {
          const message =
            bookingResult.reason instanceof Error
              ? bookingResult.reason.message
              : 'Could not load room bookings.'

          setError(message)

          console.error(
            '[Zen Café] Booking refresh failed:',
            bookingResult.reason
          )
        }

        if (blockResult.status === 'fulfilled') {
          setBlocks(blockResult.value)
        } else {
          console.warn(
            '[Zen Café] Availability blocks refresh failed:',
            blockResult.reason
          )
        }
      } finally {
        if (sequence === refreshSequenceRef.current) {
          refreshInProgressRef.current = false
        }

        if (mountedRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    []
  )

  /* ==========================================
     INITIAL LOAD AND AUTO REFRESH
  ========================================== */

  useEffect(() => {
    mountedRef.current = true

    if (initialLoadRef.current) {
      initialLoadRef.current = false

      void refreshData()
    }

    const interval = window.setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        !actionLockRef.current &&
        !modifyOpenRef.current &&
        !blockOpenRef.current
      ) {
        void refreshData({ silent: true })
      }
    }, REFRESH_INTERVAL)

    const handleFocus = () => {
      if (
        !actionLockRef.current &&
        !modifyOpenRef.current &&
        !blockOpenRef.current
      ) {
        void refreshData({ silent: true })
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleFocus()
      }
    }

    window.addEventListener(
      'focus',
      handleFocus
    )

    document.addEventListener(
      'visibilitychange',
      handleVisibility
    )

    const unsubscribe = subscribeRoomBookings(
      () => {
        // Server polling remains authoritative.
      }
    )

    return () => {
      mountedRef.current = false

      refreshSequenceRef.current += 1

      refreshInProgressRef.current = false

      window.clearInterval(interval)

      window.removeEventListener(
        'focus',
        handleFocus
      )

      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      )

      unsubscribe()
    }
  }, [refreshData])

  /* ==========================================
     STATISTICS
  ========================================== */

  const stats = useMemo(() => {
    return {
      total: bookings.length,

      pending: bookings.filter(
        booking => booking.status === 'pending'
      ).length,

      confirmed: bookings.filter(
        booking => booking.status === 'confirmed'
      ).length,

      modified: bookings.filter(
        booking =>
          booking.status ===
          'modification_proposed'
      ).length,

      rejected: bookings.filter(
        booking => booking.status === 'rejected'
      ).length,
    }
  }, [bookings])

  /* ==========================================
     FILTER AND SORT BOOKINGS
  ========================================== */

  const filtered = useMemo(() => {
    const local = search.trim().toLowerCase()

    const global = query.trim().toLowerCase()

    return [...bookings]
      .filter(booking => {
        const matchesStatus =
          filter === 'all' ||
          booking.status === filter

        const searchable = [
          booking.customerName,
          booking.email,
          booking.phone,
          booking.roomName,
          booking.bookingDate,
          booking.bookingTime,
          booking.status,
          booking.notes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return (
          matchesStatus &&
          (!local || searchable.includes(local)) &&
          (!global || searchable.includes(global))
        )
      })
      .sort(compareBookings)
  }, [bookings, filter, search, query])

  /* ==========================================
     PAGINATION
  ========================================== */

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / pageSize)
  )

  const safePage = Math.min(
    Math.max(1, currentPage),
    totalPages
  )

  const firstRowIndex =
    (safePage - 1) * pageSize

  const paginatedBookings = useMemo(() => {
    return filtered.slice(
      firstRowIndex,
      firstRowIndex + pageSize
    )
  }, [filtered, firstRowIndex, pageSize])

  const firstVisibleRow =
    filtered.length === 0
      ? 0
      : firstRowIndex + 1

  const lastVisibleRow = Math.min(
    firstRowIndex + pageSize,
    filtered.length
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [filter, search, query, pageSize])

  /* ==========================================
     VERIFY BOOKING CAN BE REVIEWED
  ========================================== */

  function canReviewBooking(
    booking: RoomBooking
  ): boolean {
    const latest = bookingsRef.current.find(
      item => item.id === booking.id
    )

    return (
      latest !== undefined &&
      latest.status === 'pending' &&
      !actionLockRef.current &&
      busyId === null &&
      !modifying
    )
  }

  /* ==========================================
     APPLY BOOKING DECISION
  ========================================== */

  function applyBookingDecision(
    bookingId: string,
    updated: RoomBooking
  ): void {
    refreshSequenceRef.current += 1

    updateBookings(previous =>
      previous.map(booking =>
        booking.id === bookingId
          ? updated
          : booking
      )
    )

    setLoading(false)
  }

  /* ==========================================
     ACCEPT BOOKING
  ========================================== */

  async function handleAccept(
    booking: RoomBooking
  ): Promise<void> {
    if (!canReviewBooking(booking)) return

    const confirmed = await AdminAlert.confirm(
      'Accept Room Booking?',
      `Confirm and exclusively reserve "${booking.roomName}" for ${booking.customerName} on ${formatDate(booking.bookingDate)} at ${formatTime(booking.bookingTime)}?`,
      'Yes, Accept Booking'
    )

    if (!confirmed || !canReviewBooking(booking)) {
      return
    }

    actionLockRef.current = true
    refreshSequenceRef.current += 1

    setBusyId(booking.id)

    try {
      const updated = await acceptAdminBooking(
        booking.id
      )

      applyBookingDecision(
        booking.id,
        updated
      )

      await AdminAlert.success(
        'Booking Accepted!',
        `The reservation for ${booking.customerName} is now confirmed and the room slot is reserved.`
      )
    } catch (err) {
      await AdminAlert.error(
        'Cannot Accept Booking',
        err instanceof Error
          ? err.message
          : 'Failed to accept booking.'
      )
    } finally {
      setBusyId(null)
      actionLockRef.current = false
    }
  }

  /* ==========================================
     REJECT BOOKING
  ========================================== */

  async function handleReject(
    booking: RoomBooking
  ): Promise<void> {
    if (!canReviewBooking(booking)) return

    const { value: reason, isConfirmed } =
      await Swal.fire({
        title: 'Reject Room Booking',

        text: `Please enter the reason for rejecting ${booking.customerName}'s request. The customer will be notified.`,

        input: 'textarea',

        inputPlaceholder:
          'Enter the reason for rejection...',

        inputAttributes: {
          'aria-label': 'Rejection reason',
          rows: '3',
        },

        showCancelButton: true,

        confirmButtonText: 'Confirm Rejection',

        confirmButtonColor: '#b42318',

        cancelButtonText: 'Cancel',

        inputValidator: value => {
          if (!value || !value.trim()) {
            return 'A rejection reason is required.'
          }

          return null
        },
      })

    if (
      !isConfirmed ||
      !reason ||
      !canReviewBooking(booking)
    ) {
      return
    }

    actionLockRef.current = true
    refreshSequenceRef.current += 1

    setBusyId(booking.id)

    try {
      const updated = await rejectAdminBooking(
        booking.id,
        reason.trim()
      )

      applyBookingDecision(
        booking.id,
        updated
      )

      await AdminAlert.success(
        'Booking Rejected',
        `The booking for ${booking.customerName} has been rejected. The customer notification is queued.`
      )
    } catch (err) {
      await AdminAlert.error(
        'Rejection Failed',
        err instanceof Error
          ? err.message
          : 'Failed to reject booking.'
      )
    } finally {
      setBusyId(null)
      actionLockRef.current = false
    }
  }

  /* ==========================================
     OPEN MODIFY MODAL
  ========================================== */

  function openModifyModal(
    booking: RoomBooking
  ): void {
    if (!canReviewBooking(booking)) return

    setModifyDraft({
      bookingId: booking.id,
      customerName: booking.customerName,
      originalDate: booking.bookingDate,
      originalTime: booking.bookingTime,
      proposedDate:
        booking.proposedDate ||
        booking.bookingDate,
      proposedStartTime:
        booking.proposedStartTime ||
        booking.bookingTime,
      duration: booking.duration || 2,
      reason: booking.adminReason || '',
    })

    modifyOpenRef.current = true
    setModifyError('')
    setModifyModalOpen(true)
  }

  /* ==========================================
     SUBMIT MODIFICATION
  ========================================== */

  async function submitModify(
    event: FormEvent
  ): Promise<void> {
    event.preventDefault()

    if (
      !modifyDraft ||
      modifying ||
      actionLockRef.current
    ) {
      return
    }

    const currentBooking =
      bookingsRef.current.find(
        booking =>
          booking.id === modifyDraft.bookingId
      )

    if (
      !currentBooking ||
      currentBooking.status !== 'pending'
    ) {
      setModifyError(
        'This booking has already been reviewed.'
      )
      return
    }

    if (!modifyDraft.reason.trim()) {
      setModifyError(
        'A reason for the proposed change is required.'
      )
      return
    }

    if (
      !modifyDraft.proposedDate ||
      !modifyDraft.proposedStartTime
    ) {
      setModifyError(
        'Please select a proposed date and time.'
      )
      return
    }

    if (
      modifyDraft.proposedDate < getLocalToday()
    ) {
      setModifyError(
        'The proposed date cannot be in the past.'
      )
      return
    }

    actionLockRef.current = true
    refreshSequenceRef.current += 1

    setModifying(true)
    setBusyId(modifyDraft.bookingId)
    setModifyError('')

    try {
      const updated = await modifyAdminBooking(
        modifyDraft.bookingId,
        {
          proposedDate: modifyDraft.proposedDate,
          proposedStartTime:
            modifyDraft.proposedStartTime,
          duration: modifyDraft.duration,
          reason: modifyDraft.reason.trim(),
        }
      )

      applyBookingDecision(
        modifyDraft.bookingId,
        updated
      )

      modifyOpenRef.current = false
      setModifyModalOpen(false)
      setModifyDraft(null)

      await AdminAlert.success(
        'Modification Proposed!',
        'The proposed date and time have been saved and the customer notification is queued.'
      )
    } catch (err) {
      setModifyError(
        err instanceof Error
          ? err.message
          : 'Failed to propose modification.'
      )
    } finally {
      setModifying(false)
      setBusyId(null)
      actionLockRef.current = false
    }
  }

  /* ==========================================
     DELETE BOOKING
  ========================================== */

  async function removeBooking(
    booking: RoomBooking
  ): Promise<void> {
    if (
      actionLockRef.current ||
      busyId !== null
    ) {
      return
    }

    const confirmed =
      await AdminAlert.confirmDelete(
        `booking for "${booking.customerName}"`
      )

    if (!confirmed || actionLockRef.current) {
      return
    }

    actionLockRef.current = true
    refreshSequenceRef.current += 1

    setBusyId(booking.id)

    try {
      await deleteAdminBooking(booking.id)

      refreshSequenceRef.current += 1

      updateBookings(previous =>
        previous.filter(
          item => item.id !== booking.id
        )
      )

      await AdminAlert.success(
        'Booking Deleted',
        'The booking record has been permanently removed.'
      )
    } catch (err) {
      await AdminAlert.error(
        'Deletion Failed',
        err instanceof Error
          ? err.message
          : 'Failed to delete booking.'
      )
    } finally {
      setBusyId(null)
      actionLockRef.current = false
    }
  }

  /* ==========================================
     OPEN MANUAL BLOCK MODAL
  ========================================== */

  function openBlockModal(): void {
    blockOpenRef.current = true

    setBlockDraft(
      createDefaultBlockDraft()
    )

    setBlockError('')
    setBlockModalOpen(true)
  }

  /* ==========================================
     CREATE MANUAL BLOCK
  ========================================== */

  async function submitBlock(
    event: FormEvent
  ): Promise<void> {
    event.preventDefault()

    if (
      blocking ||
      actionLockRef.current
    ) {
      return
    }

    if (
      !blockDraft.roomName.trim() ||
      !blockDraft.blockDate ||
      !blockDraft.startTime ||
      !blockDraft.endTime
    ) {
      setBlockError(
        'Please complete all required fields.'
      )
      return
    }

    if (
      blockDraft.startTime >= blockDraft.endTime
    ) {
      setBlockError(
        'End time must be after start time.'
      )
      return
    }

    if (
      blockDraft.blockDate < getLocalToday()
    ) {
      setBlockError(
        'The block date cannot be in the past.'
      )
      return
    }

    actionLockRef.current = true
    setBlocking(true)
    setBlockError('')

    try {
      const newBlock = await createBookingBlock({
        roomName: blockDraft.roomName.trim(),
        blockDate: blockDraft.blockDate,
        startTime: blockDraft.startTime,
        endTime: blockDraft.endTime,
        reason:
          blockDraft.reason.trim() || undefined,
      })

      setBlocks(previous => [
        newBlock,
        ...previous.filter(
          item => item.id !== newBlock.id
        ),
      ])

      blockOpenRef.current = false
      setBlockModalOpen(false)

      await AdminAlert.success(
        'Slot Blocked Successfully!',
        `${blockDraft.roomName} is now blocked on ${formatDate(blockDraft.blockDate)} from ${formatTime(blockDraft.startTime)} to ${formatTime(blockDraft.endTime)}.`
      )
    } catch (err) {
      setBlockError(
        err instanceof Error
          ? err.message
          : 'Failed to block time slot.'
      )
    } finally {
      setBlocking(false)
      actionLockRef.current = false
    }
  }

  /* ==========================================
     REMOVE MANUAL BLOCK
  ========================================== */

  async function removeBlock(
    block: BookingBlock
  ): Promise<void> {
    if (actionLockRef.current) return

    const confirmed = await AdminAlert.confirm(
      'Remove Manual Block?',
      `Unblock ${block.roomName} on ${formatDate(block.blockDate)} (${formatTime(block.startTime)} - ${formatTime(block.endTime)})?`,
      'Yes, Unblock'
    )

    if (!confirmed || actionLockRef.current) {
      return
    }

    actionLockRef.current = true

    try {
      await deleteBookingBlock(block.id)

      setBlocks(previous =>
        previous.filter(
          item => item.id !== block.id
        )
      )

      await AdminAlert.success(
        'Slot Unblocked',
        'The time slot is now available.'
      )
    } catch (err) {
      await AdminAlert.error(
        'Unblock Failed',
        err instanceof Error
          ? err.message
          : 'Failed to remove block.'
      )
    } finally {
      actionLockRef.current = false
    }
  }

  /* ==========================================
     RENDER
  ========================================== */

  return (
    <div className="za-bookings-page">

      {/* BREADCRUMB */}

      <div className="za-products-breadcrumb">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
        >
          Dashboard
        </button>

        <span>/</span>

        <strong>Room Bookings</strong>
      </div>

      {/* PAGE HEADER */}

      <div className="za-products-page-head">
        <div>
          <p className="za-kicker">
            RESERVATION MANAGEMENT
          </p>

          <h1>
            Room Bookings & Availability
          </h1>

          <p>
            Manage reservation requests,
            review pending bookings and
            control room availability.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="za-row-action !h-10 !w-auto !rounded-full !border !border-[#513226]/15 !px-4 bg-white font-bold"
            onClick={() =>
              void refreshData({ silent: true })
            }
            disabled={
              loading ||
              refreshing ||
              busyId !== null
            }
          >
            <RefreshCw
              size={15}
              className={
                loading || refreshing
                  ? 'animate-spin'
                  : ''
              }
            />

            <span className="ml-1.5 text-xs">
              {refreshing
                ? 'Refreshing...'
                : 'Refresh'}
            </span>
          </button>

          <button
            type="button"
            className="za-action-btn za-action-reject !rounded-full !px-4 !py-2.5"
            onClick={openBlockModal}
            disabled={blocking || busyId !== null}
          >
            <Ban size={15} />
            Block Date / Time
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}

      <div className="za-product-summary">
        <div className="za-product-summary-card">
          <span>Total Requests</span>
          <strong>{stats.total}</strong>
          <small>All loaded reservations</small>
        </div>

        <div className="za-product-summary-card">
          <span>Pending Review</span>
          <strong>{stats.pending}</strong>
          <small>Awaiting admin action</small>
        </div>

        <div className="za-product-summary-card">
          <span>Confirmed (Accepted)</span>

          <strong style={{ color: '#257039' }}>
            {stats.confirmed}
          </strong>

          <small>Active room reservations</small>
        </div>

        <div className="za-product-summary-card">
          <span>Modified / Proposed</span>

          <strong style={{ color: '#b3531b' }}>
            {stats.modified}
          </strong>

          <small>Pending customer response</small>
        </div>
      </div>

      {/* ERROR */}

      {error && (
        <p
          className="za-add-feedback za-add-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* RESERVATION TABLE */}

      <section className="za-product-management-card">

        <div className="za-product-management-top">
          <div>
            <h2>
              <CalendarDays size={24} />
              Reservation Requests
            </h2>

            <p>
              Pending requests appear first.
              Review using <strong>Accept</strong>,{' '}
              <strong>Reject</strong>, or{' '}
              <strong>Modify</strong>.
            </p>
          </div>

          <span className="za-products-count">
            {filtered.length} bookings
          </span>
        </div>

        {/* FILTERS */}

        <div className="za-product-management-filters">
          <div className="za-filter-pills">
            {FILTERS.map(item => (
              <button
                key={item.value}
                type="button"
                className={
                  filter === item.value
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setFilter(item.value)
                }
                aria-pressed={
                  filter === item.value
                }
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="za-product-search za-management-search">
            <Search size={17} />

            <input
              type="search"
              placeholder="Search by name, phone, email..."
              value={search}
              onChange={event =>
                setSearch(event.target.value)
              }
            />
          </label>
        </div>

        {/* TABLE */}

        <div className="za-table-wrap">
          <table className="za-table za-management-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Room</th>
                <th>Date & Time</th>
                <th>Guests</th>
                <th>Status</th>
                <th>Review Actions</th>
                <th>Delete</th>
              </tr>
            </thead>

            <tbody>
              {paginatedBookings.map(booking => {
                const isPending =
                  booking.status === 'pending'

                const isConfirmed =
                  booking.status === 'confirmed'

                const isRejected =
                  booking.status === 'rejected'

                const isModified =
                  booking.status ===
                  'modification_proposed'

                const isBusy =
                  busyId === booking.id

                return (
                  <tr key={booking.id}>

                    {/* CUSTOMER */}

                    <td>
                      <div className="za-booking-customer">
                        <div className="za-booking-avatar">
                          {booking.customerName
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div>
                          <strong>
                            {booking.customerName}
                          </strong>

                          <small>
                            <Phone size={12} />
                            {booking.phone}
                          </small>

                          {booking.email && (
                            <small>
                              <Mail size={12} />
                              {booking.email}
                            </small>
                          )}

                          {booking.notes && (
                            <small
                              className="italic text-[#76665d] line-clamp-1 max-w-[200px]"
                              title={booking.notes}
                            >
                              {booking.notes}
                            </small>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* ROOM */}

                    <td>
                      <div className="za-booking-room">
                        <DoorOpen size={16} />
                        {booking.roomName}
                      </div>
                    </td>

                    {/* DATE AND TIME */}

                    <td>
                      <div className="za-booking-date">
                        <strong>
                          {formatDate(
                            booking.bookingDate
                          )}
                        </strong>

                        <small>
                          <Clock3 size={13} />

                          {formatTime(
                            booking.bookingTime
                          )}

                          {booking.endTime
                            ? ` – ${formatTime(
                                booking.endTime
                              )}`
                            : ''}
                        </small>

                        <small>
                          {booking.duration} hr(s)
                        </small>

                        {isModified &&
                          booking.proposedDate && (
                            <div className="mt-1 rounded bg-[#fff0e6] p-1 text-[10px] text-[#b3531b]">
                              <strong>
                                Proposed:
                              </strong>{' '}

                              {formatDate(
                                booking.proposedDate
                              )}{' '}
                              at{' '}
                              {formatTime(
                                booking.proposedStartTime ||
                                  ''
                              )}

                              {booking.adminReason && (
                                <div className="italic">
                                  "{booking.adminReason}"
                                </div>
                              )}
                            </div>
                          )}

                        {isRejected &&
                          booking.adminReason && (
                            <div className="mt-1 rounded bg-[#fdf2f2] p-1 text-[10px] text-[#b42318]">
                              <strong>
                                Reason:
                              </strong>{' '}
                              {booking.adminReason}
                            </div>
                          )}
                      </div>
                    </td>

                    {/* GUESTS */}

                    <td>
                      <span className="za-booking-guests">
                        <Users size={15} />
                        {booking.guests}
                      </span>
                    </td>

                    {/* STATUS */}

                    <td>
                      <span
                        className={`za-booking-status za-booking-status-${booking.status} inline-block`}
                      >
                        {statusBadgeLabel(
                          booking.status
                        )}
                      </span>
                    </td>

                    {/* REVIEW ACTIONS */}

                    <td>
                      {isPending ? (
                        <div className="za-booking-action-buttons">
                          <button
                            type="button"
                            className="za-action-btn za-action-accept"
                            disabled={
                              isBusy ||
                              busyId !== null
                            }
                            onClick={() =>
                              void handleAccept(
                                booking
                              )
                            }
                          >
                            <Check size={13} />
                            Accept
                          </button>

                          <button
                            type="button"
                            className="za-action-btn za-action-reject"
                            disabled={
                              isBusy ||
                              busyId !== null
                            }
                            onClick={() =>
                              void handleReject(
                                booking
                              )
                            }
                          >
                            <X size={13} />
                            Reject
                          </button>

                          <button
                            type="button"
                            className="za-action-btn za-action-modify"
                            disabled={
                              isBusy ||
                              busyId !== null
                            }
                            onClick={() =>
                              openModifyModal(
                                booking
                              )
                            }
                          >
                            <CalendarClock size={13} />
                            Modify
                          </button>
                        </div>
                      ) : (
                        <div
                          className="inline-flex items-center gap-2 rounded-full border border-[#e8e0d8] bg-[#faf8f5] px-3 py-2 text-xs font-medium text-[#786a60]"
                          title="Booking already reviewed"
                        >
                          {isConfirmed ? (
                            <CheckCircle2
                              size={15}
                              className="text-[#257039]"
                            />
                          ) : (
                            <LockKeyhole
                              size={14}
                              className={
                                isRejected
                                  ? 'text-[#b42318]'
                                  : isModified
                                    ? 'text-[#b3531b]'
                                    : 'text-[#786a60]'
                              }
                            />
                          )}

                          <span>
                            {reviewedMessage(
                              booking.status
                            )}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* DELETE */}

                    <td>
                      <div className="za-table-actions">
                        <button
                          type="button"
                          className="za-row-action za-delete"
                          title="Delete booking"
                          disabled={
                            isBusy ||
                            busyId !== null
                          }
                          onClick={() =>
                            void removeBooking(
                              booking
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>

          {!loading && filtered.length === 0 && (
            <div className="za-management-empty">
              <CalendarDays size={32} />

              <h3>No bookings found</h3>

              <p>
                {search || query || filter !== 'all'
                  ? 'No reservation requests match your filters.'
                  : 'Customer booking requests will appear here when available.'}
              </p>
            </div>
          )}

          {loading && bookings.length === 0 && (
            <div className="za-management-empty">
              <RefreshCw
                size={28}
                className="animate-spin"
              />

              <h3>Loading reservations...</h3>

              <p>
                Fetching room bookings from the server.
              </p>
            </div>
          )}
        </div>

        {/* PAGINATION */}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#e8e0d8] px-5 py-4">

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-[#786a60]">
              Showing {firstVisibleRow}–
              {lastVisibleRow} of{' '}
              {filtered.length} bookings
            </span>

            <label className="flex items-center gap-2 text-xs text-[#786a60]">
              Rows per page

              <select
                value={pageSize}
                onChange={event =>
                  setPageSize(
                    Number(
                      event.target.value
                    ) as PageSize
                  )
                }
                className="rounded-lg border border-[#e8e0d8] bg-white px-3 py-2 text-xs font-semibold text-[#513226] outline-none focus:border-[#a32722]"
                aria-label="Bookings per page"
              >
                {PAGE_SIZES.map(size => (
                  <option
                    key={size}
                    value={size}
                  >
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-[#e8e0d8] bg-white px-3 py-2 text-xs font-semibold text-[#513226] disabled:opacity-40"
              disabled={safePage <= 1}
              onClick={() =>
                setCurrentPage(previous =>
                  Math.max(1, previous - 1)
                )
              }
            >
              <ChevronLeft size={15} />
              Previous
            </button>

            <span className="min-w-[80px] text-center text-xs font-semibold text-[#513226]">
              {safePage} / {totalPages}
            </span>

            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-[#e8e0d8] bg-white px-3 py-2 text-xs font-semibold text-[#513226] disabled:opacity-40"
              disabled={safePage >= totalPages}
              onClick={() =>
                setCurrentPage(previous =>
                  Math.min(
                    totalPages,
                    previous + 1
                  )
                )
              }
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

      </section>

      {/* ACTIVE MANUAL BLOCKS */}

      {blocks.length > 0 && (
        <section className="za-product-management-card za-blocks-panel">
          <div className="za-product-management-top">
            <div>
              <h2 className="flex items-center gap-2">
                <Ban
                  size={20}
                  className="text-[#a32722]"
                />

                Active Manual Blocks (
                {blocks.length})
              </h2>

              <p>
                These time slots are manually blocked
                from customer bookings.
              </p>
            </div>
          </div>

          <div className="za-table-wrap">
            <table className="za-table za-management-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Date</th>
                  <th>Blocked Hours</th>
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {blocks.map(block => (
                  <tr key={block.id}>
                    <td>
                      <strong>
                        {block.roomName}
                      </strong>
                    </td>

                    <td>
                      {formatDate(
                        block.blockDate
                      )}
                    </td>

                    <td>
                      <span className="font-semibold text-[#a32722]">
                        {formatTime(
                          block.startTime
                        )}{' '}
                        –{' '}
                        {formatTime(
                          block.endTime
                        )}
                      </span>
                    </td>

                    <td>
                      {block.reason ||
                        'Admin block'}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="za-action-btn za-action-reject"
                        title="Remove block"
                        onClick={() =>
                          void removeBlock(block)
                        }
                      >
                        <Trash2 size={13} />
                        Unblock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODIFY BOOKING MODAL */}

      {modifyModalOpen && modifyDraft && (
        <div
          className="za-edit-overlay"
          role="presentation"
        >
          <div
            className="za-edit-dialog za-booking-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Modify booking"
          >
            <div className="za-edit-dialog-head">
              <div>
                <p className="za-kicker">
                  PROPOSE ALTERNATIVE TIME
                </p>

                <h2>
                  Modify Booking for{' '}
                  {modifyDraft.customerName}
                </h2>
              </div>

              <button
                type="button"
                className="za-icon-button"
                disabled={modifying}
                onClick={() => {
                  modifyOpenRef.current = false
                  setModifyModalOpen(false)
                }}
                aria-label="Close modification dialog"
              >
                <X size={22} />
              </button>
            </div>

            <form
              onSubmit={submitModify}
              noValidate
            >
              <div className="za-booking-form-section">

                <div className="rounded-[14px] bg-[#fff8f2] p-3 text-xs text-[#695950]">
                  <strong>
                    Current Requested Slot:
                  </strong>{' '}

                  {formatDate(
                    modifyDraft.originalDate
                  )}{' '}
                  at{' '}
                  {formatTime(
                    modifyDraft.originalTime
                  )}
                </div>

                <div className="za-booking-form-grid mt-4">

                  <label>
                    Proposed Date *

                    <input
                      type="date"
                      required
                      value={
                        modifyDraft.proposedDate
                      }
                      min={getLocalToday()}
                      disabled={modifying}
                      onChange={event =>
                        setModifyDraft(previous =>
                          previous
                            ? {
                                ...previous,
                                proposedDate:
                                  event.target.value,
                              }
                            : null
                        )
                      }
                    />
                  </label>

                  <label>
                    Proposed Start Time *

                    <input
                      type="time"
                      required
                      value={
                        modifyDraft.proposedStartTime
                      }
                      disabled={modifying}
                      onChange={event =>
                        setModifyDraft(previous =>
                          previous
                            ? {
                                ...previous,
                                proposedStartTime:
                                  event.target.value,
                              }
                            : null
                        )
                      }
                    />
                  </label>

                </div>

                <label className="mt-3">
                  Reason for Proposed Modification *

                  <textarea
                    rows={3}
                    required
                    placeholder="Explain the proposed change..."
                    value={modifyDraft.reason}
                    disabled={modifying}
                    onChange={event =>
                      setModifyDraft(previous =>
                        previous
                          ? {
                              ...previous,
                              reason:
                                event.target.value,
                            }
                          : null
                      )
                    }
                  />
                </label>
              </div>

              {modifyError && (
                <p
                  className="za-add-feedback za-add-error"
                  role="alert"
                >
                  {modifyError}
                </p>
              )}

              <div className="za-edit-dialog-actions">
                <button
                  type="button"
                  className="za-edit-cancel"
                  disabled={modifying}
                  onClick={() => {
                    modifyOpenRef.current = false
                    setModifyModalOpen(false)
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="za-primary"
                  disabled={modifying}
                  style={{
                    background: '#b3531b',
                    borderColor: '#b3531b',
                  }}
                >
                  <CalendarClock size={16} />

                  {modifying
                    ? 'Proposing...'
                    : 'Save & Queue Notification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANUAL BLOCK MODAL */}

      {blockModalOpen && (
        <div
          className="za-edit-overlay"
          role="presentation"
        >
          <div
            className="za-edit-dialog za-booking-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Block room availability"
          >
            <div className="za-edit-dialog-head">
              <div>
                <p className="za-kicker">
                  AVAILABILITY MANAGEMENT
                </p>

                <h2>
                  Manually Block Room Date / Time
                </h2>
              </div>

              <button
                type="button"
                className="za-icon-button"
                disabled={blocking}
                onClick={() => {
                  blockOpenRef.current = false
                  setBlockModalOpen(false)
                }}
                aria-label="Close block dialog"
              >
                <X size={22} />
              </button>
            </div>

            <form
              onSubmit={submitBlock}
              noValidate
            >
              <div className="za-booking-form-section">

                <label>
                  Room Name

                  <input
                    value={blockDraft.roomName}
                    disabled={blocking}
                    onChange={event =>
                      setBlockDraft(previous => ({
                        ...previous,
                        roomName:
                          event.target.value,
                      }))
                    }
                  />
                </label>

                <div className="za-booking-form-grid">

                  <label>
                    Block Date *

                    <input
                      type="date"
                      required
                      value={
                        blockDraft.blockDate
                      }
                      min={getLocalToday()}
                      disabled={blocking}
                      onChange={event =>
                        setBlockDraft(previous => ({
                          ...previous,
                          blockDate:
                            event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Start Time *

                    <input
                      type="time"
                      required
                      value={
                        blockDraft.startTime
                      }
                      disabled={blocking}
                      onChange={event =>
                        setBlockDraft(previous => ({
                          ...previous,
                          startTime:
                            event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <label className="mt-3">
                  End Time *

                  <input
                    type="time"
                    required
                    value={blockDraft.endTime}
                    disabled={blocking}
                    onChange={event =>
                      setBlockDraft(previous => ({
                        ...previous,
                        endTime:
                          event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="mt-3">
                  Reason (Optional)

                  <input
                    placeholder="e.g. Private event, maintenance..."
                    value={blockDraft.reason}
                    disabled={blocking}
                    onChange={event =>
                      setBlockDraft(previous => ({
                        ...previous,
                        reason:
                          event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              {blockError && (
                <p
                  className="za-add-feedback za-add-error"
                  role="alert"
                >
                  {blockError}
                </p>
              )}

              <div className="za-edit-dialog-actions">
                <button
                  type="button"
                  className="za-edit-cancel"
                  disabled={blocking}
                  onClick={() => {
                    blockOpenRef.current = false
                    setBlockModalOpen(false)
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="za-primary"
                  disabled={blocking}
                >
                  <Ban size={16} />

                  {blocking
                    ? 'Blocking...'
                    : 'Confirm Block'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
