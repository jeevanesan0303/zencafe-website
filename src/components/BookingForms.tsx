
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gift,
  Mail,
  MessageSquareText,
  Phone,
  Send,
  Snowflake,
  Sparkles,
  Users,
  X,
} from 'lucide-react'

import {
  fetchAvailability,
  submitCustomerBooking,
  type AvailabilityResponse,
} from '../data/bookingStore'

type ToastFn = (message: string) => void
type Meridiem = 'AM' | 'PM'

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

const ROOM_NAME = 'Private Dining Room'

const EMPTY_FORM: RoomForm = {
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

const GUEST_OPTIONS = [10, 11, 12, 13, 14, 15]
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = ['00', '15', '30', '45']

const OCCASIONS = [
  'Family gathering',
  'Birthday',
  'Friends meetup',
  'Business meeting',
  'Private celebration',
]

function localDateInputValue(date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)

    const part = (type: string) =>
      parts.find(item => item.type === type)?.value ?? ''

    return `${part('year')}-${part('month')}-${part('day')}`
  } catch {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}

function sanitizePhone(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10)
}

function phoneLooksValid(value: string): boolean {
  return /^[0-9]{10}$/.test(value)
}

function emailLooksValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function to24HourTime(
  hour: string,
  minute: string,
  meridiem: Meridiem
): string {
  if (!hour || !minute) return ''

  const h = Number(hour)
  const m = Number(minute)

  if (
    !Number.isInteger(h) ||
    h < 1 ||
    h > 12 ||
    !Number.isInteger(m) ||
    m < 0 ||
    m > 59
  ) {
    return ''
  }

  const hour24 = (h % 12) + (meridiem === 'PM' ? 12 : 0)

  return (
    `${String(hour24).padStart(2, '0')}:` +
    `${String(m).padStart(2, '0')}`
  )
}

function format12HourTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!match) return time

  const hour = Number(match[1])
  if (hour < 0 || hour > 23) return time

  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`
}

function parse24HourTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2])

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return {
    hour: String(hour % 12 || 12),
    minute: String(minute).padStart(2, '0'),
    meridiem: (hour >= 12 ? 'PM' : 'AM') as Meridiem,
  }
}

function formatDate(value: string): string {
  if (!value) return ''

  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const inputClass =
  'w-full min-w-0 rounded-2xl border border-[#e6d8c9] ' +
  'bg-[#fffdf9] px-4 py-3.5 text-[14px] text-[#352820] ' +
  'outline-none transition-all duration-200 ' +
  'placeholder:text-[#a79a8d] ' +
  'focus:border-[#a83d2b] focus:ring-4 focus:ring-[#a83d2b]/10'

const labelClass =
  'mb-2 block text-[11px] font-bold uppercase tracking-[0.09em] text-[#6c5345]'

const errorClass = 'mt-1.5 block text-[11px] text-[#b12e28]'

export function RoomBooking({ toast }: { toast: ToastFn }) {
  const [form, setForm] = useState<RoomForm>({ ...EMPTY_FORM })

  const [selectedHour, setSelectedHour] = useState('')
  const [selectedMinute, setSelectedMinute] = useState('00')
  const [selectedMeridiem, setSelectedMeridiem] =
    useState<Meridiem>('PM')

  const [today, setToday] = useState(localDateInputValue)
  const [modalOpen, setModalOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [availability, setAvailability] =
    useState<AvailabilityResponse | null>(null)

  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverMessage, setServerMessage] = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)

  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const submitLockRef = useRef(false)

  const phoneValid = phoneLooksValid(form.phone)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setToday(localDateInputValue())
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!modalOpen) return

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitLockRef.current) {
        setModalOpen(false)
        return
      }

      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), ' +
          'input:not([disabled]), ' +
          'select:not([disabled]), ' +
          'textarea:not([disabled]), ' +
          '[tabindex]:not([tabindex="-1"])'
        )
      )

      if (!focusable.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [modalOpen])

  const update = <K extends keyof RoomForm>(
    key: K,
    value: RoomForm[K]
  ) => {
    setForm(previous => ({
      ...previous,
      [key]: value,
    }))

    setErrors(previous => ({
      ...previous,
      [key]: '',
    }))

    setServerMessage('')
    setSubmitted(false)
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

  // Existing live availability API: unchanged.
  useEffect(() => {
    if (
      !form.date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(form.date) ||
      form.date < today
    ) {
      setAvailability(null)
      setLoadingAvailability(false)
      setAvailabilityError('')
      return
    }

    let active = true

    setAvailability(null)
    setLoadingAvailability(true)
    setAvailabilityError('')

    fetchAvailability(form.date, ROOM_NAME)
      .then(response => {
        if (active) setAvailability(response)
      })
      .catch(error => {
        if (!active) return

        setAvailability(null)
        setAvailabilityError(
          error instanceof Error
            ? error.message
            : 'Unable to check room availability.'
        )
      })
      .finally(() => {
        if (active) setLoadingAvailability(false)
      })

    return () => {
      active = false
    }
  }, [form.date, today])

  const validateFirstStep = (): boolean => {
    const nextErrors: Record<string, string> = {}
    const currentDate = localDateInputValue()

    if (!form.date) {
      nextErrors.date = 'Please select a booking date.'
    } else if (
      !/^\d{4}-\d{2}-\d{2}$/.test(form.date) ||
      form.date < currentDate
    ) {
      nextErrors.date = 'Choose today or a future date.'
    }

    if (!form.time) {
      nextErrors.time = 'Please select a booking time.'
    }

    if (
      !Number.isInteger(form.guests) ||
      form.guests < 10 ||
      form.guests > 15
    ) {
      nextErrors.guests =
        'The private room accommodates 10–15 guests.'
    }

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      toast('Please complete your booking details.')
      return false
    }

    return true
  }

  const openBookingModal = () => {
    if (!validateFirstStep()) return

    setServerMessage('')
    setSubmitted(false)
    setModalOpen(true)
  }

  const closeBookingModal = () => {
    if (submitLockRef.current) return
    setModalOpen(false)
    setServerMessage('')
  }

  const validateSecondStep = (): boolean => {
    const nextErrors: Record<string, string> = {}

    if (!form.name.trim()) {
      nextErrors.name = 'Please enter your full name.'
    }

    if (!form.phone) {
      nextErrors.phone = 'Please enter your phone number.'
    } else if (!phoneLooksValid(form.phone)) {
      nextErrors.phone =
        'Phone number must contain exactly 10 digits.'
    }

    if (!form.email.trim()) {
      nextErrors.email = 'Please enter your email address.'
    } else if (!emailLooksValid(form.email)) {
      nextErrors.email = 'Enter a valid email address.'
    }

    if (
      !Number.isInteger(form.duration) ||
      form.duration < 1 ||
      form.duration > 3
    ) {
      nextErrors.duration =
        'Duration must be between 1 and 3 hours.'
    }

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      setPhoneTouched(true)
      toast('Please complete the required fields.')
      return false
    }

    return true
  }

  // Backend contract and payload remain exactly the same.
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (submitLockRef.current || submitting) return
    if (!validateFirstStep()) return
    if (!validateSecondStep()) return

    submitLockRef.current = true
    setSubmitting(true)
    setServerMessage('')
    setSubmitted(false)

    try {
      await submitCustomerBooking({
        customerName: form.name.trim(),
        phone: form.phone,
        email: form.email.trim(),
        date: form.date,
        time: form.time,
        duration: form.duration,
        guests: form.guests,
        occasion: form.occasion,
        notes: form.note.trim() || undefined,
        roomName: ROOM_NAME,
      })

      setSubmitted(true)
      setModalOpen(false)
      setErrors({})
      setPhoneTouched(false)

      toast('Your booking request was submitted successfully!')

      setForm(previous => ({
        ...EMPTY_FORM,
        name: previous.name,
        phone: previous.phone,
        email: previous.email,
      }))

      setSelectedHour('')
      setSelectedMinute('00')
      setSelectedMeridiem('PM')
      setAvailability(null)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to submit your booking. Please try again.'

      setServerMessage(message)
      toast(message)
    } finally {
      submitLockRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <section className="w-full">
      {/* MAIN PARTY ROOM CARD */}
      <div className="overflow-hidden rounded-[30px] border border-[#e8d9c9] bg-[#fffaf3] shadow-[0_30px_85px_rgba(68,36,21,0.10)]">

        <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
          {/* ROOM PHOTOGRAPH */}
          <div className="relative min-h-[420px] overflow-hidden bg-[#2d211b] sm:min-h-[480px] lg:min-h-[640px]">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage:
                  "linear-gradient(180deg,rgba(25,15,10,0.06) 20%,rgba(25,15,10,0.80) 100%),url('/images/zen-private-room.jpg')",
              }}
            />

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#dba36c]/10 via-transparent to-black/20" />

            <div className="absolute left-6 top-6 flex items-center gap-2 rounded-full border border-white/30 bg-[#21130e]/40 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.17em] text-white backdrop-blur-lg">
              <Sparkles size={14} />
              Zen Café · Private Celebrations
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-7 text-white sm:p-10 lg:p-12">
              <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#f2d1a9]">
                <span className="h-px w-9 bg-[#f2d1a9]" />
                Your private escape
              </div>

              <h3 className="max-w-[520px] font-serif text-[clamp(38px,4.2vw,64px)] leading-[0.98] tracking-[-0.035em]">
                Beautiful moments.
                <br />
                Better together.
              </h3>

              <p className="mt-5 max-w-[430px] text-[13px] leading-7 text-white/85">
                A warm, intimate setting for birthdays,
                family gatherings and every occasion
                worth celebrating.
              </p>

              <div className="mt-7 flex flex-wrap gap-2.5">
                <span className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-[11px] backdrop-blur-md">
                  10–15 guests
                </span>
                <span className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-[11px] backdrop-blur-md">
                  Up to 3 hours
                </span>
              </div>
            </div>
          </div>

          {/* FIRST STEP: THREE FIELDS ONLY */}
          <div className="flex flex-col justify-center bg-[#fffaf3] p-6 sm:p-9 lg:p-12">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#a83d2b] text-[12px] font-bold text-white">
                01
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a83d2b]">
                Plan your gathering
              </span>
            </div>

            <h3 className="font-serif text-[clamp(36px,3.8vw,54px)] leading-[1.02] tracking-[-0.035em] text-[#30231e]">
              Your occasion.
              <br />
              <span className="text-[#a83d2b]">Our special space.</span>
            </h3>

            <p className="mt-5 max-w-[420px] text-[13px] leading-7 text-[#766457]">
              Pick your preferred date, arrival time and
              number of guests. We'll take care of the rest
              of your booking request in the next step.
            </p>

            <div className="my-7 grid grid-cols-3 gap-2 border-y border-[#e9ddd0] py-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <Gift size={22} strokeWidth={1.5} className="text-[#a83d2b]" />
                <span className="text-[10px] text-[#776456]">
                  Private space
                </span>
              </div>
              <div className="flex flex-col items-center gap-2 border-x border-[#e9ddd0] text-center">
                <Snowflake size={22} strokeWidth={1.5} className="text-[#a83d2b]" />
                <span className="text-[10px] text-[#776456]">
                  Air conditioned
                </span>
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <Sparkles size={22} strokeWidth={1.5} className="text-[#a83d2b]" />
                <span className="text-[10px] text-[#776456]">
                  Celebration
                </span>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="zen-booking-date" className={labelClass}>
                  <CalendarDays size={14} className="mr-2 inline text-[#a83d2b]" />
                  Select date *
                </label>
                <input
                  id="zen-booking-date"
                  type="date"
                  min={today}
                  value={form.date}
                  onChange={event => update('date', event.target.value)}
                  className={inputClass}
                  aria-invalid={Boolean(errors.date)}
                />
                {errors.date && (
                  <span className={errorClass}>{errors.date}</span>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  <Clock3 size={14} className="mr-2 inline text-[#a83d2b]" />
                  Preferred time *
                </label>

                <div className="grid grid-cols-3 gap-2">
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
                    className={`${inputClass} px-2 sm:px-3`}
                  >
                    <option value="">Hour</option>
                    {HOURS.map(hour => (
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
                    className={`${inputClass} px-2 sm:px-3`}
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
                    className={`${inputClass} px-2 sm:px-3`}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>

                {errors.time && (
                  <span className={errorClass}>{errors.time}</span>
                )}
              </div>

              <div>
                <label htmlFor="zen-booking-guests" className={labelClass}>
                  <Users size={14} className="mr-2 inline text-[#a83d2b]" />
                  Number of guests *
                </label>
                <select
                  id="zen-booking-guests"
                  value={form.guests}
                  onChange={event =>
                    update('guests', Number(event.target.value))
                  }
                  className={inputClass}
                >
                  {GUEST_OPTIONS.map(guests => (
                    <option key={guests} value={guests}>
                      {guests} guests
                    </option>
                  ))}
                </select>
                {errors.guests && (
                  <span className={errorClass}>{errors.guests}</span>
                )}
              </div>
            </div>

            {/* LIVE AVAILABILITY */}
            {loadingAvailability && (
              <div className="mt-4 flex items-center gap-2 text-[12px] text-[#75665b]">
                <Clock3 size={15} className="animate-pulse" />
                Checking room availability...
              </div>
            )}

            {availabilityError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-xl border border-[#dca9a2] bg-[#fff0ed] p-3 text-[12px] text-[#9f3327]"
              >
                <AlertCircle size={16} className="shrink-0" />
                <span>{availabilityError}</span>
              </div>
            )}

            {availability && (
              <div className="mt-4 rounded-2xl border border-[#e7d5c2] bg-white/80 p-4">
                <p className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#8f3c2e]">
                  <Clock3 size={15} />
                  Available time slots
                </p>

                {availability.availableSlots.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {availability.availableSlots.map(slot => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => selectAvailableSlot(slot)}
                        className={
                          'rounded-full border px-3 py-2 text-[11px] font-semibold transition ' +
                          (form.time === slot
                            ? 'border-[#aa3d2d] bg-[#aa3d2d] text-white'
                            : 'border-[#e4d3c3] bg-white text-[#654e41] hover:border-[#aa3d2d]')
                        }
                      >
                        {format12HourTime(slot)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#a63d2b]">
                    No available slots were returned for this date.
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={openBookingModal}
              className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#a83d2b] px-5 py-4 text-[14px] font-bold text-white shadow-[0_14px_30px_rgba(148,50,36,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#8e3022] hover:shadow-[0_18px_36px_rgba(148,50,36,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a83d2b]"
            >
              Book Your Party Room
              <ArrowRight size={19} />
            </button>

            <p className="mt-4 flex items-center justify-center gap-2 text-center text-[11px] text-[#8a796c]">
              <Mail size={14} />
              Booking requests are confirmed after approval.
            </p>
          </div>
        </div>
      </div>

      {/* SUCCESS MESSAGE */}
      {submitted && (
        <div
          role="status"
          aria-live="polite"
          className="mt-6 rounded-2xl border border-[#b9dac5] bg-[#eff9f0] p-6 text-[#315b46]"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 size={25} className="shrink-0" />
            <div>
              <h4 className="font-serif text-[24px]">
                Booking request received!
              </h4>
              <p className="mt-2 text-[13px] leading-6">
                Thank you for choosing Zen Café. Your request
                has been submitted and is awaiting review.
                You'll receive confirmation after approval.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECOND STEP: CUSTOMER DETAILS POPUP */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-[#170d09]/75 p-3 backdrop-blur-[7px] sm:p-6"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              closeBookingModal()
            }
          }}
        >
          <div
            ref={dialogRef}
            id="zen-room-booking-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="zen-room-dialog-title"
            className="relative my-auto flex max-h-[calc(100dvh-24px)] w-full max-w-[760px] flex-col overflow-hidden rounded-[26px] border border-[#e3c9b5] bg-[#fffaf3] shadow-[0_35px_110px_rgba(0,0,0,0.40)] sm:max-h-[calc(100dvh-48px)]"
          >
            {/* POPUP HEADER */}
            <div className="relative shrink-0 overflow-hidden border-b border-[#ead9c7] bg-[#f8eddf] px-6 py-6 sm:px-9">
              <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full border-[25px] border-[#b64a32]/5" />

              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeBookingModal}
                disabled={submitting}
                aria-label="Close booking form"
                className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-[#e0c7b7] bg-white text-[#6e4435] transition hover:bg-[#b3422e] hover:text-white disabled:opacity-50"
              >
                <X size={19} />
              </button>

              <p className="mb-2 pr-12 text-[10px] font-bold uppercase tracking-[0.22em] text-[#a43b2a]">
                Step 02 · Complete your request
              </p>

              <h2
                id="zen-room-dialog-title"
                className="pr-8 font-serif text-[clamp(30px,4vw,43px)] leading-[1.1] text-[#34231d]"
              >
                Almost time to celebrate.
              </h2>

              <p className="mt-2 text-[12px] leading-6 text-[#796357]">
                Just a few more details and your booking
                request will be ready.
              </p>
            </div>

            {/* COMPACT READ-ONLY BOOKING SUMMARY */}
            <div className="shrink-0 border-b border-[#ead8c7] bg-[#f6e7d9] px-5 py-3.5 sm:px-9">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-semibold text-[#8e392a]">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={15} />
                  {formatDate(form.date)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 size={15} />
                  {format12HourTime(form.time)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users size={15} />
                  {form.guests} guests
                </span>
              </div>
            </div>

            {/* CUSTOMER DETAILS */}
            <form
              onSubmit={submit}
              noValidate
              className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-9 sm:py-8"
            >
              <div className="mb-6 flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#a83d2b]/10 text-[#a83d2b]">
                  <Users size={18} />
                </span>
                <div>
                  <h3 className="font-serif text-[24px] leading-none text-[#34231d]">
                    Your details
                  </h3>
                  <p className="mt-1 text-[11px] text-[#8a7769]">
                    How can we reach you?
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="zen-customer-name" className={labelClass}>
                    Full name *
                  </label>
                  <input
                    id="zen-customer-name"
                    type="text"
                    value={form.name}
                    onChange={event =>
                      update('name', event.target.value)
                    }
                    placeholder="Enter your full name"
                    autoComplete="name"
                    className={inputClass}
                    aria-invalid={Boolean(errors.name)}
                  />
                  {errors.name && (
                    <span className={errorClass}>{errors.name}</span>
                  )}
                </div>

                <div>
                  <label htmlFor="zen-customer-phone" className={labelClass}>
                    Phone number *
                  </label>
                  <div className="relative">
                    <Phone
                      size={16}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9a806f]"
                    />
                    <input
                      id="zen-customer-phone"
                      type="tel"
                      inputMode="numeric"
                      value={form.phone}
                      maxLength={10}
                      onChange={event => {
                        update('phone', sanitizePhone(event.target.value))
                        setPhoneTouched(true)
                      }}
                      onBlur={() => setPhoneTouched(true)}
                      placeholder="0771234567"
                      autoComplete="tel-national"
                      className={`${inputClass} pl-11`}
                      aria-invalid={
                        Boolean(errors.phone) ||
                        (phoneTouched &&
                          form.phone.length > 0 &&
                          !phoneValid)
                      }
                    />
                  </div>

                  {errors.phone ? (
                    <span className={errorClass}>{errors.phone}</span>
                  ) : phoneTouched &&
                    form.phone.length > 0 &&
                    !phoneValid ? (
                    <span className={errorClass}>
                      Enter exactly 10 digits.
                    </span>
                  ) : phoneValid ? (
                    <span className="mt-1.5 flex items-center gap-1 text-[11px] text-[#387b52]">
                      <CheckCircle2 size={13} />
                      Valid phone number
                    </span>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="zen-customer-email" className={labelClass}>
                    Email address *
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9a806f]"
                    />
                    <input
                      id="zen-customer-email"
                      type="email"
                      value={form.email}
                      onChange={event =>
                        update('email', event.target.value)
                      }
                      placeholder="you@example.com"
                      autoComplete="email"
                      className={`${inputClass} pl-11`}
                      aria-invalid={Boolean(errors.email)}
                    />
                  </div>
                  {errors.email && (
                    <span className={errorClass}>{errors.email}</span>
                  )}
                </div>
              </div>

              <div className="my-7 border-t border-[#e9ddd0]" />

              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#a83d2b]/10 text-[#a83d2b]">
                  <Gift size={18} />
                </span>
                <div>
                  <h3 className="font-serif text-[24px] leading-none text-[#34231d]">
                    Your celebration
                  </h3>
                  <p className="mt-1 text-[11px] text-[#8a7769]">
                    Tell us a little about your occasion.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="zen-room-duration" className={labelClass}>
                    Duration *
                  </label>
                  <select
                    id="zen-room-duration"
                    value={form.duration}
                    onChange={event =>
                      update('duration', Number(event.target.value))
                    }
                    className={inputClass}
                  >
                    <option value={1}>1 hour</option>
                    <option value={2}>2 hours</option>
                    <option value={3}>3 hours — maximum</option>
                  </select>
                  {errors.duration && (
                    <span className={errorClass}>{errors.duration}</span>
                  )}
                </div>

                <div>
                  <label htmlFor="zen-room-occasion" className={labelClass}>
                    Occasion
                  </label>
                  <select
                    id="zen-room-occasion"
                    value={form.occasion}
                    onChange={event =>
                      update('occasion', event.target.value)
                    }
                    className={inputClass}
                  >
                    {OCCASIONS.map(occasion => (
                      <option key={occasion} value={occasion}>
                        {occasion}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-5">
                <label
                  htmlFor="zen-room-special-requests"
                  className={labelClass}
                >
                  <MessageSquareText
                    size={14}
                    className="mr-2 inline text-[#a83d2b]"
                  />
                  Special requests (optional)
                </label>
                <textarea
                  id="zen-room-special-requests"
                  value={form.note}
                  onChange={event =>
                    update('note', event.target.value)
                  }
                  rows={3}
                  maxLength={1000}
                  placeholder="Decorations, seating preferences, dietary requirements or anything else..."
                  className={`${inputClass} min-h-[105px] resize-y`}
                />
              </div>

              {serverMessage && (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-2 rounded-xl border border-[#e5b3aa] bg-[#fff0ed] p-4 text-[12px] text-[#a3372b]"
                >
                  <AlertCircle size={17} className="shrink-0" />
                  <span>{serverMessage}</span>
                </div>
              )}

              <div className="mt-7 border-t border-[#e9ddd0] pt-6">
                <p className="mb-5 text-center text-[11px] leading-5 text-[#8a7769]">
                  Your request will be reviewed by our team.
                  Confirmation will be sent to your email after approval.
                </p>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeBookingModal}
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d9c3b2] bg-white px-6 py-3.5 text-[12px] font-semibold text-[#755044] transition hover:bg-[#f7e9df] disabled:opacity-50"
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#a83d2b] px-7 py-3.5 text-[12px] font-bold text-white shadow-[0_10px_25px_rgba(155,54,37,0.20)] transition hover:bg-[#8f3022] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Send size={16} />
                    {submitting
                      ? 'Submitting request...'
                      : 'Send Booking Request'}
                    {!submitting && <ArrowRight size={16} />}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
