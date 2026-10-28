import { FormEvent, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, Send } from 'lucide-react'
import {
  fetchAvailability,
  submitCustomerBooking,
  type AvailabilityResponse,
} from '../data/bookingStore'

type ToastFn = (message: string) => void

type RoomForm = {
  name: string
  phone: string
  email: string
  date: string
  time: string
  guests: number
  duration: number
  occasion: string
  note: string
}

const emptyRoom: RoomForm = {
  name: '',
  phone: '',
  email: '',
  date: '',
  time: '',
  guests: 10,
  duration: 2,
  occasion: 'Family gathering',
  note: '',
}

const WHATSAPP_URL = 'https://wa.me/94705175174'
const ROOM_GUEST_OPTIONS = [10, 11, 12, 13, 14, 15] as const

function localDateInputValue(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
}

const openWhatsApp = (text: string) =>
  window.open(
    `${WHATSAPP_URL}?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer'
  )

function phoneLooksValid(value: string) {
  return value.replace(/\D/g, '').length >= 9
}

export function RoomBooking({ toast }: { toast: ToastFn }) {
  const [form, setForm] = useState<RoomForm>(emptyRoom)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverMessage, setServerMessage] = useState('')
  const [bookingId, setBookingId] = useState('')
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null)
  const [loadingAvailability, setLoadingAvailability] = useState(false)

  const update = <K extends keyof RoomForm>(key: K, value: RoomForm[K]) => {
    setSubmitted(false)
    setServerMessage('')
    setForm(v => ({ ...v, [key]: value }))
  }

  // Fetch live availability whenever the selected date changes
  useEffect(() => {
    if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setAvailability(null)
      return
    }

    let active = true
    setLoadingAvailability(true)
    fetchAvailability(form.date, 'Private Dining Room')
      .then(res => {
        if (active) setAvailability(res)
      })
      .catch(() => {
        if (active) setAvailability(null)
      })
      .finally(() => {
        if (active) setLoadingAvailability(false)
      })

    return () => {
      active = false
    }
  }, [form.date])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return

    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = 'Enter your name.'
    if (!phoneLooksValid(form.phone)) next.phone = 'Enter a valid phone number.'
    const minDate = localDateInputValue()
    if (!form.date) next.date = 'Choose a date.'
    else if (form.date < minDate) next.date = 'Choose today or a future date.'
    if (!form.time) next.time = 'Choose a time.'

    setErrors(next)
    if (Object.keys(next).length) {
      toast('Please complete the required booking fields.')
      return
    }

    setSubmitting(true)
    setServerMessage('')

    try {
      const created = await submitCustomerBooking({
        customerName: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        date: form.date,
        time: form.time,
        duration: form.duration,
        guests: form.guests,
        occasion: form.occasion,
        notes: form.note.trim() || undefined,
        roomName: 'Private Dining Room',
      })

      setSubmitted(true)
      setBookingId(created.id)
      setServerMessage(
        'Your room booking request has been submitted and is currently pending admin review.'
      )
      toast('Booking request saved! Status: Pending review.')

      // Clear form except name/phone
      setForm(prev => ({
        ...emptyRoom,
        name: prev.name,
        phone: prev.phone,
        email: prev.email,
      }))
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Could not submit your room booking request.'
      setServerMessage(msg)
      toast(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenWhatsApp = () => {
    openWhatsApp(
      [
        'Hello Zen Cafe, I have submitted a private room booking request.',
        '',
        bookingId ? `Booking ID: #${bookingId}` : '',
        `Name: ${form.name}`,
        `Phone: ${form.phone}`,
        `Date: ${form.date}`,
        `Time: ${form.time}`,
        `Guests: ${form.guests}`,
        `Duration: ${form.duration} hour(s)`,
        `Occasion: ${form.occasion}`,
        form.note ? `Note: ${form.note}` : '',
        '',
        'Please confirm availability. Thank you!',
      ]
        .filter(Boolean)
        .join('\n')
    )
  }

  return (
    <div className="room-booking-layout room-booking-layout-v121">
      <form
        onSubmit={submit}
        className="room-booking-form room-booking-form-v121 panel p-6 sm:p-8"
      >
        <div className="room-form-head mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-serif text-[31px] leading-none sm:text-[36px]">
              Booking details.
            </h3>
            <p className="mt-1 text-[11px] text-[#76665d]">
              Requests are reviewed by our team. Accepted bookings reserve the room exclusively.
            </p>
          </div>
          <span className="room-form-icon-v121 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#a32722]/10 text-[#a32722]">
            <Send size={19} />
          </span>
        </div>

        <div className="room-fields-grid grid gap-4 sm:grid-cols-2">
          <label className="field-label">
            Name *
            <input
              value={form.name}
              onChange={e => update('name', e.target.value)}
              className={`field-input ${errors.name ? 'field-error' : ''}`}
              placeholder="Your name"
            />
            {errors.name && <span className="error-copy">{errors.name}</span>}
          </label>

          <label className="field-label">
            Phone *
            <input
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              className={`field-input ${errors.phone ? 'field-error' : ''}`}
              placeholder="077 000 0000"
            />
            {errors.phone && <span className="error-copy">{errors.phone}</span>}
          </label>

          <label className="field-label sm:col-span-2">
            Email (for booking confirmation)
            <input
              type="email"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              className="field-input"
              placeholder="name@example.com"
            />
          </label>

          <label className="field-label">
            Date *
            <input
              value={form.date}
              onChange={e => update('date', e.target.value)}
              type="date"
              min={localDateInputValue()}
              className={`field-input ${errors.date ? 'field-error' : ''}`}
            />
            {errors.date && <span className="error-copy">{errors.date}</span>}
          </label>

          <label className="field-label">
            Time *
            <input
              value={form.time}
              onChange={e => update('time', e.target.value)}
              type="time"
              className={`field-input ${errors.time ? 'field-error' : ''}`}
            />
            {errors.time && <span className="error-copy">{errors.time}</span>}
          </label>

          {/* Real-time availability indicator for chosen date */}
          {availability && (
            <div className="sm:col-span-2 rounded-[18px] border border-[#a32722]/10 bg-[#fffaf5] p-3 text-[11px] text-[#695950]">
              <div className="flex items-center gap-2 font-bold text-[#a32722]">
                <Clock size={14} />
                <span>Available slots for {form.date}:</span>
              </div>
              {availability.availableSlots.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {availability.availableSlots.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => update('time', slot)}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                        form.time === slot
                          ? 'bg-[#a32722] text-white'
                          : 'border border-[#513226]/15 bg-white text-[#513226] hover:bg-[#a32722]/5'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[10px] text-[#a32722]">
                  No slots currently available for this date.
                </p>
              )}
            </div>
          )}

          <label className="field-label">
            Guests
            <select
              value={form.guests}
              onChange={e => update('guests', Number(e.target.value))}
              className="field-input"
            >
              {ROOM_GUEST_OPTIONS.map(value => (
                <option key={value} value={value}>
                  {value} guests
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Duration
            <select
              value={form.duration}
              onChange={e => update('duration', Number(e.target.value))}
              className="field-input"
            >
              <option value={1}>1 hour</option>
              <option value={2}>2 hours</option>
              <option value={3}>3 hours — maximum</option>
            </select>
          </label>

          <label className="field-label room-occasion-v121 sm:col-span-2">
            Occasion
            <select
              value={form.occasion}
              onChange={e => update('occasion', e.target.value)}
              className="field-input"
            >
              <option>Family gathering</option>
              <option>Birthday</option>
              <option>Friends meetup</option>
              <option>Business meeting</option>
              <option>Private celebration</option>
            </select>
          </label>
        </div>

        <label className="room-note-field field-label mt-4">
          Special note
          <textarea
            value={form.note}
            onChange={e => update('note', e.target.value)}
            className="field-input min-h-[110px] resize-y"
            placeholder="Decoration, seating or food preferences…"
          />
        </label>

        {serverMessage && !submitted && (
          <div className="mt-4 flex items-center gap-2 rounded-[16px] border border-[#a32722]/20 bg-[#fdf2f2] p-3 text-[11px] text-[#a32722]">
            <AlertCircle size={16} className="shrink-0" />
            <span>{serverMessage}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="room-submit-btn primary-pill mt-6 disabled:opacity-50"
        >
          <Send size={16} />
          {submitting ? 'Submitting request…' : 'Submit room request'}
        </button>

        {submitted && (
          <div className="room-success-v121 mt-4 space-y-3 rounded-[20px] border border-[#2f7d55]/15 bg-[#eaf6ef] p-4 text-[#315b46]">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <div>
                <strong>Request Saved in PostgreSQL!</strong>
                <p className="mt-1 text-[11px]">
                  {serverMessage ||
                    'Your room request is recorded with Status: Pending. We will review and confirm availability.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="inline-flex items-center gap-2 rounded-full bg-[#2f7d55] px-4 py-2 text-[11px] font-bold text-white transition hover:bg-[#256544]"
            >
              Open WhatsApp for Instant Confirmation
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
