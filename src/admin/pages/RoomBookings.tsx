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
  Clock3,
  DoorOpen,
  Mail,
  Pencil,
  Phone,
  Plus,
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
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      const date = new Date(y, m - 1, d)
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    }
  }
  return value
}

function formatTime(value: string) {
  if (!value) return '—'
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value
  }
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', {
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
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    const now = new Date()
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 10)
  }
}

/* ==========================================
   ROOM BOOKINGS COMPONENT
========================================== */

export default function Bookings({ onNavigate, query = '' }: Props) {
  const [bookings, setBookings] = useState<RoomBooking[]>([])
  const [blocks, setBlocks] = useState<BookingBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  // Modify dialog state
  const [modifyModalOpen, setModifyModalOpen] = useState(false)
  const [modifyDraft, setModifyDraft] = useState<ModifyDraft | null>(null)
  const [modifying, setModifying] = useState(false)
  const [modifyError, setModifyError] = useState('')

  // Manual Block dialog state
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockDraft, setBlockDraft] = useState<BlockDraft>({
    roomName: 'Private Dining Room',
    blockDate: getLocalToday(),
    startTime: '12:00',
    endTime: '15:00',
    reason: '',
  })
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState('')

  const actionLockRef = useRef(false)

  /* ==========================================
     DATA LOADING
  ========================================== */

  async function refreshData() {
    try {
      setLoading(true)
      setError('')
      const [bList, blkList] = await Promise.all([
        loadAdminBookings(),
        loadBookingBlocks().catch(() => []),
      ])
      setBookings(bList)
      setBlocks(blkList)
    } catch (err) {
      console.error('Failed to load bookings:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'Could not connect to the bookings database.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshData()
    return subscribeRoomBookings(() => {
      // Local cache update listener
    })
  }, [])

  /* ==========================================
     STATISTICS
  ========================================== */

  const stats = useMemo(
    () => ({
      total: bookings.length,
      pending: bookings.filter(b => b.status === 'pending').length,
      confirmed: bookings.filter(b => b.status === 'confirmed').length,
      modified: bookings.filter(b => b.status === 'modification_proposed').length,
      rejected: bookings.filter(b => b.status === 'rejected').length,
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
          filter === 'all' || booking.status === filter

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
     1. ACCEPT BOOKING
  ========================================== */

  async function handleAccept(booking: RoomBooking) {
    if (booking.status === 'confirmed' || busyId !== null || actionLockRef.current) {
      return
    }

    const confirmed = await AdminAlert.confirm(
      'Accept Room Booking?',
      `Confirm and exclusively reserve "${booking.roomName}" for ${booking.customerName} on ${formatDate(
        booking.bookingDate
      )} at ${formatTime(booking.bookingTime)}?`,
      'Yes, Accept Booking'
    )
    if (!confirmed) return

    actionLockRef.current = true
    setBusyId(booking.id)
    try {
      const updated = await acceptAdminBooking(booking.id)
      setBookings(prev => prev.map(b => (b.id === booking.id ? updated : b)))
      await AdminAlert.success(
        'Booking Accepted!',
        `The reservation for ${booking.customerName} is now confirmed and room availability is reserved.`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to accept booking.'
      await AdminAlert.error('Cannot Accept Booking', msg)
    } finally {
      setBusyId(null)
      actionLockRef.current = false
    }
  }

  /* ==========================================
     2. REJECT BOOKING (WITH REASON)
  ========================================== */

  async function handleReject(booking: RoomBooking) {
    if (busyId !== null || actionLockRef.current) return

    const { value: reason, isConfirmed } = await Swal.fire({
      title: 'Reject Room Booking',
      text: `Please enter the reason for rejecting ${booking.customerName}'s request (customer will be notified):`,
      input: 'textarea',
      inputPlaceholder: 'e.g. Room is undergoing scheduled maintenance / fully booked...',
      inputAttributes: {
        'aria-label': 'Rejection reason',
        rows: '3',
      },
      showCancelButton: true,
      confirmButtonText: 'Confirm Rejection',
      confirmButtonColor: '#b42318',
      cancelButtonText: 'Cancel',
      inputValidator: val => {
        if (!val || !val.trim()) {
          return 'A rejection reason is required.'
        }
        return null
      },
    })

    if (!isConfirmed || !reason) return

    actionLockRef.current = true
    setBusyId(booking.id)
    try {
      const updated = await rejectAdminBooking(booking.id, reason.trim())
      setBookings(prev => prev.map(b => (b.id === booking.id ? updated : b)))
      await AdminAlert.success(
        'Booking Rejected',
        `The booking for ${booking.customerName} has been rejected and the rejection notification is queued.`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reject booking.'
      await AdminAlert.error('Rejection Failed', msg)
    } finally {
      setBusyId(null)
      actionLockRef.current = false
    }
  }

  /* ==========================================
     3. MODIFY BOOKING (PREMIUM MODAL)
  ========================================== */

  function openModifyModal(booking: RoomBooking) {
    setModifyDraft({
      bookingId: booking.id,
      customerName: booking.customerName,
      originalDate: booking.bookingDate,
      originalTime: booking.bookingTime,
      proposedDate: booking.proposedDate || booking.bookingDate,
      proposedStartTime: booking.proposedStartTime || booking.bookingTime,
      duration: booking.duration || 2,
      reason: booking.adminReason || '',
    })
    setModifyError('')
    setModifyModalOpen(true)
  }

  async function submitModify(e: FormEvent) {
    e.preventDefault()
    if (!modifyDraft || modifying) return

    if (!modifyDraft.reason.trim()) {
      setModifyError('A reason for the proposed change is required.')
      return
    }
    if (!modifyDraft.proposedDate) {
      setModifyError('Please select a proposed date.')
      return
    }
    if (!modifyDraft.proposedStartTime) {
      setModifyError('Please select a proposed time.')
      return
    }

    setModifying(true)
    setModifyError('')
    try {
      const updated = await modifyAdminBooking(modifyDraft.bookingId, {
        proposedDate: modifyDraft.proposedDate,
        proposedStartTime: modifyDraft.proposedStartTime,
        duration: modifyDraft.duration,
        reason: modifyDraft.reason.trim(),
      })

      setBookings(prev =>
        prev.map(b => (b.id === modifyDraft.bookingId ? updated : b))
      )
      setModifyModalOpen(false)
      await AdminAlert.success(
        'Modification Proposed!',
        `The proposed time has been saved as "Modification Proposed" and queued for customer notification.`
      )
    } catch (err) {
      setModifyError(
        err instanceof Error ? err.message : 'Failed to propose modification.'
      )
    } finally {
      setModifying(false)
    }
  }

  /* ==========================================
     4. DELETE BOOKING
  ========================================== */

  async function removeBooking(booking: RoomBooking) {
    if (actionLockRef.current || busyId !== null) return

    const confirmed = await AdminAlert.confirmDelete(
      `booking for "${booking.customerName}"`
    )
    if (!confirmed) return

    actionLockRef.current = true
    setBusyId(booking.id)
    try {
      await deleteAdminBooking(booking.id)
      setBookings(prev => prev.filter(b => b.id !== booking.id))
      await AdminAlert.success(
        'Booking Deleted',
        `The booking record has been permanently removed.`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete booking.'
      await AdminAlert.error('Deletion Failed', msg)
    } finally {
      setBusyId(null)
      actionLockRef.current = false
    }
  }

  /* ==========================================
     5. MANUAL BLOCKING
  ========================================== */

  async function submitBlock(e: FormEvent) {
    e.preventDefault()
    if (blocking) return

    if (!blockDraft.blockDate || !blockDraft.startTime || !blockDraft.endTime) {
      setBlockError('Please fill in date, start time, and end time.')
      return
    }
    if (blockDraft.startTime >= blockDraft.endTime) {
      setBlockError('End time must be after start time.')
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
        reason: blockDraft.reason.trim() || undefined,
      })

      setBlocks(prev => [newBlock, ...prev])
      setBlockModalOpen(false)
      await AdminAlert.success(
        'Slot Blocked Successfully!',
        `${blockDraft.roomName} is now blocked on ${formatDate(
          blockDraft.blockDate
        )} from ${formatTime(blockDraft.startTime)} to ${formatTime(
          blockDraft.endTime
        )}.`
      )
    } catch (err) {
      setBlockError(
        err instanceof Error ? err.message : 'Failed to block time slot.'
      )
    } finally {
      setBlocking(false)
    }
  }

  async function removeBlock(block: BookingBlock) {
    const confirmed = await AdminAlert.confirm(
      'Remove Manual Block?',
      `Unblock ${block.roomName} on ${formatDate(block.blockDate)} (${formatTime(
        block.startTime
      )} - ${formatTime(block.endTime)})? This will make the slot available again.`,
      'Yes, Unblock'
    )
    if (!confirmed) return

    try {
      await deleteBookingBlock(block.id)
      setBlocks(prev => prev.filter(b => b.id !== block.id))
      await AdminAlert.success('Slot Unblocked', 'The time slot is now available.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove block.'
      await AdminAlert.error('Unblock Failed', msg)
    }
  }

  /* ==========================================
     RENDER
  ========================================== */

  return (
    <div className="za-bookings-page">
      {/* BREADCRUMB */}
      <div className="za-products-breadcrumb">
        <button type="button" onClick={() => onNavigate('dashboard')}>
          Dashboard
        </button>
        <span>/</span>
        <strong>Room Bookings</strong>
      </div>

      {/* PAGE HEADER */}
      <div className="za-products-page-head">
        <div>
          <p className="za-kicker">RESERVATION MANAGEMENT</p>
          <h1>Room Bookings & Availability</h1>
          <p>
            Review customer booking requests, accept reservations to block availability,
            reject, or propose alternative times.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="za-row-action !h-10 !w-auto !px-4 !rounded-full !border !border-[#513226]/15 bg-white font-bold"
            onClick={refreshData}
            title="Refresh from PostgreSQL"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span className="ml-1.5 text-xs">Refresh</span>
          </button>

          <button
            type="button"
            className="za-action-btn za-action-reject !px-4 !py-2.5 !rounded-full"
            onClick={() => {
              setBlockDraft({
                roomName: 'Private Dining Room',
                blockDate: getLocalToday(),
                startTime: '12:00',
                endTime: '15:00',
                reason: '',
              })
              setBlockError('')
              setBlockModalOpen(true)
            }}
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
          <small>All reservations in PostgreSQL</small>
        </div>

        <div className="za-product-summary-card">
          <span>Pending Review</span>
          <strong>{stats.pending}</strong>
          <small>Awaiting admin action</small>
        </div>

        <div className="za-product-summary-card">
          <span>Confirmed (Accepted)</span>
          <strong style={{ color: '#257039' }}>{stats.confirmed}</strong>
          <small>Active room reservations</small>
        </div>

        <div className="za-product-summary-card">
          <span>Modified / Proposed</span>
          <strong style={{ color: '#b3531b' }}>{stats.modified}</strong>
          <small>Pending customer response</small>
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <p className="za-add-feedback za-add-error" role="alert">
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
              Use the action buttons below to <strong>Accept</strong> (locks slot),{' '}
              <strong>Reject</strong> (with reason), or <strong>Modify</strong> (propose alternative date/time).
            </p>
          </div>

          <span className="za-products-count">{filtered.length} bookings</span>
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
                className={filter === value ? 'active' : ''}
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
              onChange={e => setSearch(e.target.value)}
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
                <th>Review Actions (Accept | Reject | Modify)</th>
                <th>Delete</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(booking => {
                const isConfirmed = booking.status === 'confirmed'
                const isRejected = booking.status === 'rejected'
                const isModified = booking.status === 'modification_proposed'

                return (
                  <tr key={booking.id}>
                    {/* CUSTOMER */}
                    <td>
                      <div className="za-booking-customer">
                        <div className="za-booking-avatar">
                          {booking.customerName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong>{booking.customerName}</strong>
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
                            <small className="italic text-[#76665d] line-clamp-1 max-w-[200px]" title={booking.notes}>
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
                        <strong>{formatDate(booking.bookingDate)}</strong>
                        <small>
                          <Clock3 size={13} />
                          {formatTime(booking.bookingTime)}
                          {booking.endTime ? ` – ${formatTime(booking.endTime)}` : ''}
                        </small>
                        <small>{booking.duration} hr(s)</small>

                        {/* If modified, show proposed date/time */}
                        {isModified && booking.proposedDate && (
                          <div className="mt-1 rounded bg-[#fff0e6] p-1 text-[10px] text-[#b3531b]">
                            <strong>Proposed:</strong> {formatDate(booking.proposedDate)} at{' '}
                            {formatTime(booking.proposedStartTime || '')}
                            {booking.adminReason && (
                              <div className="italic">"{booking.adminReason}"</div>
                            )}
                          </div>
                        )}

                        {/* If rejected, show rejection reason */}
                        {isRejected && booking.adminReason && (
                          <div className="mt-1 rounded bg-[#fdf2f2] p-1 text-[10px] text-[#b42318]">
                            <strong>Reason:</strong> {booking.adminReason}
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

                    {/* STATUS BADGE */}
                    <td>
                      <span className={`za-booking-status za-booking-status-${booking.status} inline-block`}>
                        {statusBadgeLabel(booking.status)}
                      </span>
                    </td>

                    {/* 3 VISIBLE PREMIUM BUTTONS: Accept | Reject | Modify */}
                    <td>
                      <div className="za-booking-action-buttons">
                        {/* ACCEPT BUTTON */}
                        <button
                          type="button"
                          className="za-action-btn za-action-accept"
                          disabled={isConfirmed || busyId === booking.id}
                          onClick={() => handleAccept(booking)}
                          title="Accept and reserve this room slot"
                        >
                          <Check size={13} />
                          Accept
                        </button>

                        {/* REJECT BUTTON */}
                        <button
                          type="button"
                          className="za-action-btn za-action-reject"
                          disabled={isRejected || busyId === booking.id}
                          onClick={() => handleReject(booking)}
                          title="Reject booking with reason"
                        >
                          <X size={13} />
                          Reject
                        </button>

                        {/* MODIFY BUTTON */}
                        <button
                          type="button"
                          className="za-action-btn za-action-modify"
                          disabled={busyId === booking.id}
                          onClick={() => openModifyModal(booking)}
                          title="Propose alternative date or time"
                        >
                          <CalendarClock size={13} />
                          Modify
                        </button>
                      </div>
                    </td>

                    {/* DELETE */}
                    <td>
                      <div className="za-table-actions">
                        <button
                          type="button"
                          className="za-row-action za-delete"
                          title="Delete booking"
                          disabled={busyId === booking.id}
                          onClick={() => removeBooking(booking)}
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
                  : 'Customer booking requests will appear here in real time.'}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ACTIVE MANUAL BLOCKS SECTION */}
      {blocks.length > 0 && (
        <section className="za-product-management-card za-blocks-panel">
          <div className="za-product-management-top">
            <div>
              <h2 className="flex items-center gap-2">
                <Ban size={20} className="text-[#a32722]" />
                Active Manual Blocks ({blocks.length})
              </h2>
              <p>These time slots are manually blocked from customer bookings.</p>
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
                      <strong>{block.roomName}</strong>
                    </td>
                    <td>{formatDate(block.blockDate)}</td>
                    <td>
                      <span className="font-semibold text-[#a32722]">
                        {formatTime(block.startTime)} – {formatTime(block.endTime)}
                      </span>
                    </td>
                    <td>{block.reason || 'Admin block'}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => removeBlock(block)}
                        className="za-action-btn za-action-reject"
                        title="Remove block"
                      >
                        <Trash2 size={13} /> Unblock
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
        <div className="za-edit-overlay" role="presentation">
          <div className="za-edit-dialog za-booking-dialog" role="dialog" aria-modal="true">
            <div className="za-edit-dialog-head">
              <div>
                <p className="za-kicker">PROPOSE ALTERNATIVE TIME</p>
                <h2>Modify Booking for {modifyDraft.customerName}</h2>
              </div>
              <button
                type="button"
                className="za-icon-button"
                disabled={modifying}
                onClick={() => setModifyModalOpen(false)}
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={submitModify} noValidate>
              <div className="za-booking-form-section">
                <div className="rounded-[14px] bg-[#fff8f2] p-3 text-xs text-[#695950]">
                  <strong>Current Requested Slot:</strong> {formatDate(modifyDraft.originalDate)} at{' '}
                  {formatTime(modifyDraft.originalTime)}
                </div>

                <div className="za-booking-form-grid mt-4">
                  <label>
                    Proposed Date *
                    <input
                      type="date"
                      required
                      value={modifyDraft.proposedDate}
                      min={getLocalToday()}
                      disabled={modifying}
                      onChange={e =>
                        setModifyDraft(prev => (prev ? { ...prev, proposedDate: e.target.value } : null))
                      }
                    />
                  </label>

                  <label>
                    Proposed Start Time *
                    <input
                      type="time"
                      required
                      value={modifyDraft.proposedStartTime}
                      disabled={modifying}
                      onChange={e =>
                        setModifyDraft(prev =>
                          prev ? { ...prev, proposedStartTime: e.target.value } : null
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
                    onChange={e =>
                      setModifyDraft(prev => (prev ? { ...prev, reason: e.target.value } : null))
                    }
                  />
                </label>
              </div>

              {modifyError && (
                <p className="za-add-feedback za-add-error" role="alert">
                  {modifyError}
                </p>
              )}

              <div className="za-edit-dialog-actions">
                <button
                  type="button"
                  className="za-edit-cancel"
                  disabled={modifying}
                  onClick={() => setModifyModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="za-primary"
                  disabled={modifying}
                  style={{ background: '#b3531b', borderColor: '#b3531b' }}
                >
                  <CalendarClock size={16} />
                  {modifying ? 'Proposing...' : 'Save & Queue Notification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANUAL BLOCK DATE/TIME MODAL */}
      {blockModalOpen && (
        <div className="za-edit-overlay" role="presentation">
          <div className="za-edit-dialog za-booking-dialog" role="dialog" aria-modal="true">
            <div className="za-edit-dialog-head">
              <div>
                <p className="za-kicker">AVAILABILITY MANAGEMENT</p>
                <h2>Manually Block Room Date / Time</h2>
              </div>
              <button
                type="button"
                className="za-icon-button"
                disabled={blocking}
                onClick={() => setBlockModalOpen(false)}
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={submitBlock} noValidate>
              <div className="za-booking-form-section">
                <label>
                  Room Name
                  <input
                    value={blockDraft.roomName}
                    disabled={blocking}
                    onChange={e =>
                      setBlockDraft(prev => ({ ...prev, roomName: e.target.value }))
                    }
                  />
                </label>

                <div className="za-booking-form-grid">
                  <label>
                    Block Date *
                    <input
                      type="date"
                      required
                      value={blockDraft.blockDate}
                      disabled={blocking}
                      onChange={e =>
                        setBlockDraft(prev => ({ ...prev, blockDate: e.target.value }))
                      }
                    />
                  </label>

                  <label>
                    Start Time *
                    <input
                      type="time"
                      required
                      value={blockDraft.startTime}
                      disabled={blocking}
                      onChange={e =>
                        setBlockDraft(prev => ({ ...prev, startTime: e.target.value }))
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
                    onChange={e =>
                      setBlockDraft(prev => ({ ...prev, endTime: e.target.value }))
                    }
                  />
                </label>

                <label className="mt-3">
                  Reason (Optional)
                  <input
                    placeholder="e.g. Private corporate event, deep cleaning, maintenance..."
                    value={blockDraft.reason}
                    disabled={blocking}
                    onChange={e =>
                      setBlockDraft(prev => ({ ...prev, reason: e.target.value }))
                    }
                  />
                </label>
              </div>

              {blockError && (
                <p className="za-add-feedback za-add-error" role="alert">
                  {blockError}
                </p>
              )}

              <div className="za-edit-dialog-actions">
                <button
                  type="button"
                  className="za-edit-cancel"
                  disabled={blocking}
                  onClick={() => setBlockModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="za-primary" disabled={blocking}>
                  <Ban size={16} />
                  {blocking ? 'Blocking...' : 'Confirm Block'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
