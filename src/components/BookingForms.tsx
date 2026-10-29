
import { FormEvent, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Send,
} from 'lucide-react'

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
  guests: 1,
  duration: 2,
  occasion: 'Family gathering',
  note: '',
}

const ROOM_GUEST_OPTIONS = Array.from(
  { length: 20 },
  (_, index) => index + 1
)

const HOURS_12 = Array.from(
  { length: 12 },
  (_, index) => index + 1
)

const MINUTES = Array.from(
  { length: 60 },
  (_, index) => String(index).padStart(2, '0')
)

type Meridiem = 'AM' | 'PM'

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

function phoneLooksValid(value: string) {
  return value.replace(/\D/g, '').length >= 9
}

function emailLooksValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

// Convert 12-hour time to 24-hour format for the booking API.
// Example: 6:30 PM -> 18:30
function to24HourTime(
  hour: string,
  minute: string,
  meridiem: Meridiem
): string {
  if (!hour || !minute) return ''

  const parsedHour = Number(hour)

  if (
    !Number.isInteger(parsedHour) ||
    parsedHour < 1 ||
    parsedHour > 12
  ) {
    return ''
  }

  let hour24 = parsedHour % 12

  if (meridiem === 'PM') {
    hour24 += 12
  }

  return `${String(hour24).padStart(2, '0')}:${minute}`
}

// Convert API time to 12-hour display.
// Example: 18:30 -> 6:30 PM
function format12HourTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time)

  if (!match) return time

  const hour24 = Number(match[1])
  const minute = match[2]

  if (hour24 < 0 || hour24 > 23) return time

  const hour12 = hour24 % 12 || 12
  const meridiem = hour24 >= 12 ? 'PM' : 'AM'

  return `${hour12}:${minute} ${meridiem}`
}

function parse24HourTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(time)

  if (!match) return null

  const hour24 = Number(match[1])
  const minute = Number(match[2])

  if (
    hour24 < 0 ||
    hour24 > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null
  }

  return {
    hour: String(hour24 % 12 || 12),
    minute: String(minute).padStart(2, '0'),
    meridiem: (hour24 >= 12 ? 'PM' : 'AM') as Meridiem,
  }
}

export function RoomBooking({ toast }: { toast: ToastFn }) {
  const [form, setForm] = useState<RoomForm>(emptyRoom)

  const [errors, setErrors] = useState<Record<string, string>>({})

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverMessage, setServerMessage] = useState('')

  const [availability, setAvailability] =
    useState<AvailabilityResponse | null>(null)

  const [loadingAvailability, setLoadingAvailability] =
    useState(false)

  // Separate values for the 12-hour time picker.
  const [selectedHour, setSelectedHour] = useState('')
  const [selectedMinute, setSelectedMinute] = useState('00')
  const [selectedMeridiem, setSelectedMeridiem] =
    useState<Meridiem>('AM')

  const update = <K extends keyof RoomForm>(
    key: K,
    value: RoomForm[K]
  ) => {
    setSubmitted(false)
    setServerMessage('')

    setErrors(previous => ({
      ...previous,
      [key]: '',
    }))

    setForm(previous => ({
      ...previous,
      [key]: value,
    }))
  }

  const updateTime = (
    hour: string,
    minute: string,
    meridiem: Meridiem
  ) => {
    setSelectedHour(hour)
    setSelectedMinute(minute)
    setSelectedMeridiem(meridiem)

    update('time', to24HourTime(hour, minute, meridiem))
  }

  const selectAvailableSlot = (slot: string) => {
    const parsed = parse24HourTime(slot)

    if (!parsed) return

    updateTime(
      parsed.hour,
      parsed.minute,
      parsed.meridiem
    )
  }

  // Fetch availability whenever the date changes.
  useEffect(() => {
    if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setAvailability(null)
      setLoadingAvailability(false)
      return
    }

    let active = true

    setAvailability(null)
    setLoadingAvailability(true)

    fetchAvailability(form.date, 'Private Dining Room')
      .then(response => {
        if (active) {
          setAvailability(response)
        }
      })
      .catch(() => {
        if (active) {
          setAvailability(null)
        }
      })
      .finally(() => {
        if (active) {
          setLoadingAvailability(false)
        }
      })

    return () => {
      active = false
    }
  }, [form.date])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (submitting) return

    const nextErrors: Record<string, string> = {}

    if (!form.name.trim()) {
      nextErrors.name = 'Enter your name.'
    }

    if (!phoneLooksValid(form.phone)) {
      nextErrors.phone = 'Enter a valid phone number.'
    }

    if (!form.email.trim()) {
      nextErrors.email = 'Enter your email address.'
    } else if (!emailLooksValid(form.email)) {
      nextErrors.email = 'Enter a valid email address.'
    }

    const minDate = localDateInputValue()

    if (!form.date) {
      nextErrors.date = 'Choose a date.'
    } else if (form.date < minDate) {
      nextErrors.date = 'Choose today or a future date.'
    }

    if (!form.time) {
      nextErrors.time = 'Choose a time.'
    }

    if (form.guests < 1 || form.guests > 20) {
      nextErrors.guests = 'Choose between 1 and 20 guests.'
    }

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      toast('Please complete the required booking fields.')
      return
    }

    setSubmitting(true)
    setSubmitted(false)
    setServerMessage('')

    try {
      await submitCustomerBooking({
        customerName: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        date: form.date,

        // Send 24-hour time to the existing backend.
        time: form.time,

        duration: form.duration,
        guests: form.guests,
        occasion: form.occasion,
        notes: form.note.trim() || undefined,
        roomName: 'Private Dining Room',
      })

      setSubmitted(true)
      setServerMessage('')

      toast('Your booking request was submitted successfully!')

      setForm(previous => ({
        ...emptyRoom,
        name: previous.name,
        phone: previous.phone,
        email: previous.email,
      }))

      setSelectedHour('')
      setSelectedMinute('00')
      setSelectedMeridiem('AM')
      setAvailability(null)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not submit your booking request. Please try again.'

      setSubmitted(false)
      setServerMessage(message)
      toast(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="room-booking-layout room-booking-layout-v121">
      <form
        onSubmit={submit}
        className="room-booking-form room-booking-form-v121 zen-booking-select-fix panel p-6 sm:p-8"
      >
        <div className="room-form-head mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-serif text-[31px] leading-none sm:text-[36px]">
              Booking details.
            </h3>

            <p className="mt-1 text-[11px] text-[#76665d]">
              Requests are reviewed by our team. Accepted bookings
              reserve the room exclusively.
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
              onChange={event =>
                update('name', event.target.value)
              }
              className={`field-input ${
                errors.name ? 'field-error' : ''
              }`}
              placeholder="Your name"
              autoComplete="name"
            />

            {errors.name && (
              <span className="error-copy">
                {errors.name}
              </span>
            )}
          </label>

          <label className="field-label">
            Phone *

            <input
              type="tel"
              value={form.phone}
              onChange={event =>
                update('phone', event.target.value)
              }
              className={`field-input ${
                errors.phone ? 'field-error' : ''
              }`}
              placeholder="077 000 0000"
              autoComplete="tel"
            />

            {errors.phone && (
              <span className="error-copy">
                {errors.phone}
              </span>
            )}
          </label>

          <label className="field-label sm:col-span-2">
            Email (for booking confirmation) *

            <input
              type="email"
              value={form.email}
              onChange={event =>
                update('email', event.target.value)
              }
              className={`field-input ${
                errors.email ? 'field-error' : ''
              }`}
              placeholder="name@example.com"
              autoComplete="email"
            />

            {errors.email && (
              <span className="error-copy">
                {errors.email}
              </span>
            )}
          </label>

          <label className="field-label">
            Date *

            <input
              value={form.date}
              onChange={event =>
                update('date', event.target.value)
              }
              type="date"
              min={localDateInputValue()}
              className={`field-input ${
                errors.date ? 'field-error' : ''
              }`}
            />

            {errors.date && (
              <span className="error-copy">
                {errors.date}
              </span>
            )}
          </label>

          {/* 12-HOUR TIME PICKER */}
          <div className="field-label">
            <span>Time *</span>

            <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
              <select
                aria-label="Booking hour"
                value={selectedHour}
                onChange={event =>
                  updateTime(
                    event.target.value,
                    selectedMinute,
                    selectedMeridiem
                  )
                }
                className={`field-input min-w-0 ${
                  errors.time ? 'field-error' : ''
                }`}
              >
                <option value="">Hour</option>

                {HOURS_12.map(hour => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, '0')}
                  </option>
                ))}
              </select>

              <select
                aria-label="Booking minute"
                value={selectedMinute}
                onChange={event =>
                  updateTime(
                    selectedHour,
                    event.target.value,
                    selectedMeridiem
                  )
                }
                className={`field-input min-w-0 ${
                  errors.time ? 'field-error' : ''
                }`}
              >
                {MINUTES.map(minute => (
                  <option key={minute} value={minute}>
                    {minute}
                  </option>
                ))}
              </select>

              <select
                aria-label="AM or PM"
                value={selectedMeridiem}
                onChange={event =>
                  updateTime(
                    selectedHour,
                    selectedMinute,
                    event.target.value as Meridiem
                  )
                }
                className={`field-input min-w-0 ${
                  errors.time ? 'field-error' : ''
                }`}
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>

            {errors.time && (
              <span className="error-copy">
                {errors.time}
              </span>
            )}
          </div>

          {/* LIVE AVAILABILITY */}
          {loadingAvailability && (
            <div className="sm:col-span-2 flex items-center gap-2 text-[11px] text-[#76665d]">
              <Clock size={14} />
              Checking available time slots...
            </div>
          )}

          {availability && (
            <div className="sm:col-span-2 rounded-[18px] border border-[#a32722]/10 bg-[#fffaf5] p-3 text-[11px] text-[#695950]">
              <div className="flex items-center gap-2 font-bold text-[#a32722]">
                <Clock size={14} />

                <span>
                  Available slots for {form.date}:
                </span>
              </div>

              {availability.availableSlots.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {availability.availableSlots.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() =>
                        selectAvailableSlot(slot)
                      }
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                        form.time === slot
                          ? 'bg-[#a32722] text-white'
                          : 'border border-[#513226]/15 bg-white text-[#513226] hover:bg-[#a32722]/5'
                      }`}
                    >
                      {format12HourTime(slot)}
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

          {/* GUESTS: 1 TO 20 */}
          <label className="field-label">
            Guests

            <select
              value={form.guests}
              onChange={event =>
                update('guests', Number(event.target.value))
              }
              className={`field-input ${
                errors.guests ? 'field-error' : ''
              }`}
            >
              {ROOM_GUEST_OPTIONS.map(value => (
                <option key={value} value={value}>
                  {value} {value === 1 ? 'guest' : 'guests'}
                </option>
              ))}
            </select>

            {errors.guests && (
              <span className="error-copy">
                {errors.guests}
              </span>
            )}
          </label>

          <label className="field-label">
            Duration

            <select
              value={form.duration}
              onChange={event =>
                update('duration', Number(event.target.value))
              }
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
              onChange={event =>
                update('occasion', event.target.value)
              }
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
            onChange={event =>
              update('note', event.target.value)
            }
            className="field-input min-h-[110px] resize-y"
            placeholder="Decoration, seating or food preferences…"
          />
        </label>

        {serverMessage && !submitted && (
          <div className="mt-4 flex items-center gap-2 rounded-[16px] border border-[#a32722]/20 bg-[#fdf2f2] p-3 text-[11px] text-[#a32722]">
            <AlertCircle
              size={16}
              className="shrink-0"
            />

            <span>{serverMessage}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="room-submit-btn primary-pill mt-6 disabled:opacity-50"
        >
          <Send size={16} />

          {submitting
            ? 'Submitting request…'
            : 'Submit room request'}
        </button>

        {submitted && (
          <div
            role="status"
            aria-live="polite"
            className="room-success-v121 mt-5 rounded-[20px] border border-[#2f7d55]/15 bg-[#eaf6ef] p-5 text-[#315b46]"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2
                size={22}
                className="mt-0.5 shrink-0"
              />

              <div className="space-y-2">
                <h4 className="text-[15px] font-bold leading-snug">
                  Booking Request Submitted Successfully!
                </h4>

                <p className="text-[12px] leading-relaxed">
                  Thank you for choosing Zen Café!
                  Your room booking request has been
                  received successfully.
                </p>

                <p className="text-[12px] leading-relaxed">
                  Please wait for confirmation from our
                  team and check your email for your
                  booking confirmation.
                </p>

                <p className="text-[11px] font-semibold text-[#48705a]">
                  Your booking is currently awaiting review.
                </p>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
