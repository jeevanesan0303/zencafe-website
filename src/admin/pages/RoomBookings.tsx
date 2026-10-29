
import {
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
   HELPERS
========================================== */

function formatDate(value: string) {
  if (!value) return '—'

  const parts = value.slice(0, 10).split('-')

  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number)

    if (
      Number.isFinite(y) &&
      Number.isFinite(m) &&
      Number.isFinite(d)
    ) {
      return new Date(y, m - 1, d).toLocaleDateString(
        'en-GB',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }
      )
    }
  }

  return value
}

function formatTime(value: string) {
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

function statusBadgeLabel(status: BookingStatus) {
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

function getLocalToday() {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())

    const year = parts.find(p => p.type === 'year')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value

    if (year && month && day) {
      return `${year}-${month}-${day}`
    }
  } catch {
    // Use local date fallback.
  }

  const now = new Date()
  const local = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  )

  return local.toISOString().slice(0, 10)
}

function isPendingBooking(booking: RoomBooking) {
  return booking.status === 'pending'
}

function reviewedMessage(status: BookingStatus) {
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
   ROOM BOOKINGS COMPONENT
========================================== */

export default function Bookings({
  onNavigate,
  query = '',
}: Props) {
  const [bookings, setBookings] = useState<RoomBooking[]>([])
  const [blocks, setBlocks] = useState<BookingBlock[]>([])

  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const [busyId, setBusyId] = useState<string | null>(
    null
  )

  const [modifyModalOpen, setModifyModalOpen] =
    useState(false)

  const [modifyDraft, setModifyDraft] =
    useState<ModifyDraft | null>(null)

  const [modifying, setModifying] = useState(false)
  const [modifyError, setModifyError] = useState('')

  const [blockModalOpen, setBlockModalOpen] =
    useState(false)

  const [blockDraft, setBlockDraft] =
    useState<BlockDraft>({
      roomName: 'Private Dining Room',
      blockDate: getLocalToday(),
      startTime: '12:00',
      endTime: '15:00',
      reason: '',
    })

  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState('')

  const actionLockRef = useRef(false)

  /*
   * Prevent stale refresh responses from restoring
   * booking actions after a successful admin decision.
   */
  const refreshSequenceRef = useRef(0)

  const bookingsRef = useRef<RoomBooking[]>([])

  function updateBookings(
    updater: (previous: RoomBooking[]) => RoomBooking[]
  ) {
    const next = updater(bookingsRef.current)
    bookingsRef.current = next
    setBookings(next)
  }

  /* ==========================================
     DATA LOADING
  ========================================== */

  async function refreshData() {
    const sequence = ++refreshSequenceRef.current

    try {
      setLoading(true)
      setError('')

      const [bookingList, blockList] = await Promise.all([
        loadAdminBookings(),
        loadBookingBlocks().catch(() => []),
      ])

      if (sequence !== refreshSequenceRef.current) {
        return
      }

      bookingsRef.current = bookingList
      setBookings(bookingList)
      setBlocks(blockList)
    } catch (err) {
      if (sequence !== refreshSequenceRef.current) {
        return
      }

      console.error('Failed to load bookings:', err)

      setError(
        err instanceof Error
          ? err.message
          : 'Could not connect to the bookings database.'
      )
    } finally {
      if (sequence === refreshSequenceRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    void refreshData()

    const unsubscribe = subscribeRoomBookings(() => {
      // The booking store may update its local cache.
      // Server refresh remains available via Refresh.
    })

    return () => {
      refreshSequenceRef.current += 1
      unsubscribe()
    }
  }, [])

  /* ==========================================
     STATISTICS
  ========================================== */

  const stats = useMemo(
    () => ({
      total: bookings.length,

      pending: bookings.filter(
        booking => booking.status === 'pending'
      ).length,

      confirmed: bookings.filter(
        booking => booking.status === 'confirmed'
      ).length,

      modified: bookings.filter(
        booking =>
          booking.status === 'modification_proposed'
      ).length,

      rejected: bookings.filter(
        booking => booking.status === 'rejected'
      ).length,
    }),
    [bookings]
  )

  /* ==========================================
     FILTERED BOOKINGS
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
          booking.status,
          booking.notes,
        ]
          .join(' ')
          .toLowerCase()

        return (
          matchesStatus &&
          (!local || searchable.includes(local)) &&
          (!global || searchable.includes(global))
        )
      })
      .sort((a, b) =>
        `${b.bookingDate}T${b.bookingTime}`.localeCompare(
          `${a.bookingDate}T${a.bookingTime}`
        )
      )
  }, [bookings, filter, search, query])

  /* ==========================================
     VERIFY BOOKING IS STILL PENDING
  ========================================== */

  function canReviewBooking(booking: RoomBooking) {
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

  function applyBookingDecision(
    bookingId: string,
    updated: RoomBooking
  ) {
    // Invalidate any refresh started before this action.
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
     1. ACCEPT BOOKING
  ========================================== */

  async function handleAccept(booking: RoomBooking) {
    if (!canReviewBooking(booking)) {
      return
    }

    const confirmed = await AdminAlert.confirm(
      'Accept Room Booking?',
      `Confirm and exclusively reserve "${booking.roomName}" for ${booking.customerName} on ${formatDate(
        booking.bookingDate
      )} at ${formatTime(booking.bookingTime)}?`,
      'Yes, Accept Booking'
    )

    if (!confirmed || !canReviewBooking(booking)) {
      return
    }

    actionLockRef.current = true
    setBusyId(booking.id)

    try {
      const updated = await acceptAdminBooking(
        booking.id
      )

      applyBookingDecision(booking.id, updated)

      await AdminAlert.success(
        'Booking Accepted!',
        `The reservation for ${booking.customerName} is now confirmed and the room slot is reserved.`
      )
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to accept booking.'

      await AdminAlert.error(
        'Cannot Accept Booking',
        message
      )
    } finally {
      setBusyId(null)
      actionLockRef.current = false
    }
  }

  /* ==========================================
     2. REJECT BOOKING
  ========================================== */

  async function handleReject(booking: RoomBooking) {
    if (!canReviewBooking(booking)) {
      return
    }

    const { value: reason, isConfirmed } =
      await Swal.fire({
        title: 'Reject Room Booking',

        text: `Please enter the reason for rejecting ${booking.customerName}'s request. The customer will be notified.`,

        input: 'textarea',

        inputPlaceholder:
          'e.g. Room unavailable due to scheduled maintenance...',

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
    setBusyId(booking.id)

    try {
      const updated = await rejectAdminBooking(
        booking.id,
        reason.trim()
      )

      applyBookingDecision(booking.id, updated)

      await AdminAlert.success(
        'Booking Rejected',
        `The booking for ${booking.customerName} has been rejected. The customer notification is queued.`
      )
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to reject booking.'

      await AdminAlert.error(
        'Rejection Failed',
        message
      )
    } finally {
      setBusyId(null)
      actionLockRef.current = false
    }
  }

  /* ==========================================
     3. MODIFY BOOKING
  ========================================== */

  function openModifyModal(booking: RoomBooking) {
    if (!canReviewBooking(booking)) {
      return
    }

    setModifyDraft({
      bookingId: booking.id,
      customerName: booking.customerName,
      originalDate: booking.bookingDate,
      originalTime: booking.bookingTime,
      proposedDate:
        booking.proposedDate || booking.bookingDate,
      proposedStartTime:
        booking.proposedStartTime ||
        booking.bookingTime,
      duration: booking.duration || 2,
      reason: booking.adminReason || '',
    })

    setModifyError('')
    setModifyModalOpen(true)
  }

  async function submitModify(event: FormEvent) {
    event.preventDefault()

    if (
      !modifyDraft ||
      modifying ||
      actionLockRef.current
    ) {
      return
    }

    const currentBooking = bookingsRef.current.find(
      booking => booking.id === modifyDraft.bookingId
    )

    if (
      !currentBooking ||
      !isPendingBooking(currentBooking)
    ) {
      setModifyError(
        'This booking has already been reviewed. Refresh the bookings list.'
      )
      return
    }

    if (!modifyDraft.reason.trim()) {
      setModifyError(
        'A reason for the proposed change is required.'
      )
      return
    }

    if (!modifyDraft.proposedDate) {
      setModifyError(
        'Please select a proposed date.'
      )
      return
    }

    if (!modifyDraft.proposedStartTime) {
      setModifyError(
        'Please select a proposed time.'
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
     4. DELETE BOOKING
  ========================================== */

  async function removeBooking(booking: RoomBooking) {
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

    if (
      !confirmed ||
      actionLockRef.current
    ) {
      return
    }

    actionLockRef.current = true
    setBusyId(booking.id)

    try {
      await deleteAdminBooking(booking.id)

      refreshSequenceRef.current += 1

      updateBookings(previous =>
        previous.filter(
          item => item.id !== booking.id
        )
      )

      setLoading(false)

      await AdminAlert.success(
        'Booking Deleted',
        'The booking record has been permanently removed.'
      )
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to delete booking.'

      await AdminAlert.error(
        'Deletion Failed',
        message
      )
    } finally {
      setBusyId(null)
      actionLockRef.current = false
    }
  }

  /* ==========================================
     5. MANUAL DATE / TIME BLOCKING
  ========================================== */

  function openBlockModal() {
    setBlockDraft({
      roomName: 'Private Dining Room',
      blockDate: getLocalToday(),
      startTime: '12:00',
      endTime: '15:00',
      reason: '',
    })

    setBlockError('')
    setBlockModalOpen(true)
  }

  async function submitBlock(event: FormEvent) {
    event.preventDefault()

    if (blocking) {
      return
    }

    if (
      !blockDraft.blockDate ||
      !blockDraft.startTime ||
      !blockDraft.endTime
    ) {
      setBlockError(
        'Please fill in date, start time, and end time.'
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

    setBlocking(true)
    setBlockError('')

    try {
      const newBlock = await createBookingBlock({
        roomName: blockDraft.roomName,
        blockDate: blockDraft.blockDate,
        startTime: blockDraft.startTime,
        endTime: blockDraft.endTime,
        reason:
          blockDraft.reason.trim() || undefined,
      })

      setBlocks(previous => [
        newBlock,
        ...previous,
      ])

      setBlockModalOpen(false)

      await AdminAlert.success(
        'Slot Blocked Successfully!',
        `${blockDraft.roomName} is now blocked on ${formatDate(
          blockDraft.blockDate
        )} from ${formatTime(
          blockDraft.startTime
        )} to ${formatTime(blockDraft.endTime)}.`
      )
    } catch (err) {
      setBlockError(
        err instanceof Error
          ? err.message
          : 'Failed to block time slot.'
      )
    } finally {
      setBlocking(false)
    }
  }

  async function removeBlock(block: BookingBlock) {
    const confirmed = await AdminAlert.confirm(
      'Remove Manual Block?',
      `Unblock ${block.roomName} on ${formatDate(
        block.blockDate
      )} (${formatTime(
        block.startTime
      )} - ${formatTime(
        block.endTime
      )})? This will make the slot available again.`,
      'Yes, Unblock'
    )

    if (!confirmed) {
      return
    }

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
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to remove block.'

      await AdminAlert.error(
        'Unblock Failed',
        message
      )
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
            Review pending booking requests, confirm
            reservations, reject requests, or propose
            alternative dates and times.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">

          <button
            type="button"
            className="za-row-action !h-10 !w-auto !px-4 !rounded-full !border !border-[#513226]/15 bg-white font-bold"
            onClick={() => void refreshData()}
            disabled={loading || busyId !== null}
            title="Refresh from PostgreSQL"
          >
            <RefreshCw
              size={15}
              className={
                loading ? 'animate-spin' : ''
              }
            />

            <span className="ml-1.5 text-xs">
              Refresh
            </span>
          </button>

          <button
            type="button"
            className="za-action-btn za-action-reject !px-4 !py-2.5 !rounded-full"
            onClick={openBlockModal}
          >
            <Ban size={15} />
            Block Date / Time
          </button>

        </div>
      </div>

      {/* STATISTICS */}

      <div className="za-product-summary">

        <div className="za-product-summary-card">
          <span>Total Requests</span>
          <strong>{stats.total}</strong>
          <small>
            All reservations in PostgreSQL
          </small>
        </div>

        <div className="za-product-summary-card">
          <span>Pending Review</span>
          <strong>{stats.pending}</strong>
          <small>
            Awaiting admin action
          </small>
        </div>

        <div className="za-product-summary-card">
          <span>Confirmed (Accepted)</span>

          <strong style={{ color: '#257039' }}>
            {stats.confirmed}
          </strong>

          <small>
            Active room reservations
          </small>
        </div>

        <div className="za-product-summary-card">
          <span>Modified / Proposed</span>

          <strong style={{ color: '#b3531b' }}>
            {stats.modified}
          </strong>

          <small>
            Pending customer response
          </small>
        </div>

      </div>

      {/* ERROR BANNER */}

      {error && (
        <p
          className="za-add-feedback za-add-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* MAIN RESERVATIONS CARD */}

      <section className="za-product-management-card">

        <div className="za-product-management-top">
          <div>
            <h2>
              <CalendarDays size={24} />
              Reservation Requests
            </h2>

            <p>
              Review pending requests using{' '}
              <strong>Accept</strong>,{' '}
              <strong>Reject</strong>, or{' '}
              <strong>Modify</strong>. Once reviewed,
              only the booking status will remain.
            </p>
          </div>

          <span className="za-products-count">
            {filtered.length} bookings
          </span>
        </div>

        {/* FILTERS */}

        <div className="za-product-management-filters">

          <div className="za-filter-pills">
            {(
              [
                ['all', 'All Bookings'],
                ['pending', 'Pending'],
                ['confirmed', 'Accepted'],
                ['modification_proposed', 'Modified'],
                ['rejected', 'Rejected'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  filter === value ? 'active' : ''
                }
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
              >
                {label}
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

        {/* BOOKINGS TABLE */}

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
              {filtered.map(booking => {
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

                    {/* DATE & TIME */}

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

                        {/* MODIFIED DETAILS */}

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

                        {/* REJECTION REASON */}

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

                        /*
                         * IMPORTANT:
                         * Show the three buttons ONLY
                         * while status is pending.
                         */

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
                            title="Accept and reserve this room slot"
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
                            title="Reject booking with reason"
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
                            title="Propose alternative date or time"
                          >
                            <CalendarClock size={13} />
                            Modify
                          </button>

                        </div>

                      ) : (

                        /*
                         * COMPLETED REVIEW:
                         * No Accept, Reject, or Modify.
                         * Display status information only.
                         */

                        <div
                          className="inline-flex items-center gap-2 rounded-full border border-[#e8e0d8] bg-[#faf8f5] px-3 py-2 text-xs font-medium text-[#786a60]"
                          title="This booking has already been reviewed"
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

          {filtered.length === 0 && (
            <div className="za-management-empty">

              <CalendarDays size={32} />

              <h3>No bookings found</h3>

              <p>
                {search || filter !== 'all'
                  ? 'No reservation requests match your filters.'
                  : 'Customer booking requests will appear here when available.'}
              </p>

            </div>
          )}

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
                        onClick={() =>
                          void removeBlock(
                            block
                          )
                        }
                        className="za-action-btn za-action-reject"
                        title="Remove block"
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
                onClick={() =>
                  setModifyModalOpen(false)
                }
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
                        setModifyDraft(
                          previous =>
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
                        setModifyDraft(
                          previous =>
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
                    placeholder="e.g. The requested 2:00 PM slot is fully booked; proposing 4:00 PM instead..."
                    value={modifyDraft.reason}
                    disabled={modifying}
                    onChange={event =>
                      setModifyDraft(
                        previous =>
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
                  onClick={() =>
                    setModifyModalOpen(false)
                  }
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

      {/* MANUAL BLOCK DATE / TIME MODAL */}

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
                onClick={() =>
                  setBlockModalOpen(false)
                }
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
                      disabled={blocking}
                      onChange={event =>
                        setBlockDraft(
                          previous => ({
                            ...previous,
                            blockDate:
                              event.target.value,
                          })
                        )
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
                        setBlockDraft(
                          previous => ({
                            ...previous,
                            startTime:
                              event.target.value,
                          })
                        )
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
                      setBlockDraft(
                        previous => ({
                          ...previous,
                          endTime:
                            event.target.value,
                        })
                      )
                    }
                  />
                </label>

                <label className="mt-3">
                  Reason (Optional)

                  <input
                    placeholder="e.g. Private event, maintenance, cleaning..."
                    value={blockDraft.reason}
                    disabled={blocking}
                    onChange={event =>
                      setBlockDraft(
                        previous => ({
                          ...previous,
                          reason:
                            event.target.value,
                        })
                      )
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
                  onClick={() =>
                    setBlockModalOpen(false)
                  }
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
