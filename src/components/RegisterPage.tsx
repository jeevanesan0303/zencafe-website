import { FormEvent, useEffect, useState } from 'react'
import Swal from 'sweetalert2'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import ThemeToggle from './ThemeToggle'

const ACCESS_KEY = 'zen-cafe-gallery-email-access-v32'
const PROFILE_KEY = 'zen-cafe-customer-registration-v149'
const SESSION_TOKEN_KEY = 'zen-cafe-customer-session-token-v1'
const WAIT_MS = 24 * 60 * 60 * 1000

type AccessRecord = {
  registeredAt: number
  emailVerified?: boolean
  emailVerifiedAt?: string | null
  galleryEligibleAt?: string | null
}

type CustomerProfile = {
  name: string
  email: string
  phone: string
  registeredAt: number
  emailVerified?: boolean
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
const validName = (value: string) => value.trim().length >= 2
const validPhone = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

const readAccessMap = () => {
  try {
    return JSON.parse(localStorage.getItem(ACCESS_KEY) || '{}') as Record<string, AccessRecord>
  } catch {
    return {}
  }
}

const readProfiles = () => {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') as Record<string, CustomerProfile>
  } catch {
    return {}
  }
}

const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [record, setRecord] = useState<AccessRecord | null>(null)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [verifiedNow, setVerifiedNow] = useState(false)
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  // Clock tick for 24h countdown
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Check URL query parameters for ?verify=<token>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const verifyToken = params.get('verify')
    if (verifyToken) {
      setLoading(true)
      fetch(`/api/auth/verify?token=${encodeURIComponent(verifyToken)}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.customer) {
            setVerifiedNow(true)
            setName(data.customer.name || '')
            setEmail(data.customer.email || '')
            setPhone(data.customer.phone || '')
            setIsError(false)
            setMessage('Email verified successfully! Your Zen Café customer access is now active.')

            if (data.token) {
              localStorage.setItem(SESSION_TOKEN_KEY, data.token)
            }

            const key = normalizeEmail(data.customer.email)
            const accessMap = readAccessMap()
            const registeredAt = Date.now()
            const access: AccessRecord = {
              registeredAt,
              emailVerified: true,
              emailVerifiedAt: data.customer.emailVerifiedAt,
              galleryEligibleAt: data.customer.galleryEligibleAt,
            }
            accessMap[key] = access
            setRecord(access)

            try {
              localStorage.setItem(ACCESS_KEY, JSON.stringify(accessMap))
            } catch {
              // Ignore
            }

            Swal.fire({
              title: 'Email Verified!',
              text: 'Welcome to Zen Café! Your customer access is now active. Redirecting to the community gallery...',
              icon: 'success',
              confirmButtonColor: '#a32722',
              confirmButtonText: 'Open Gallery Now',
              timer: 3500,
              timerProgressBar: true,
            }).then(() => {
              window.location.href = '/#gallery'
            })
          } else {
            setIsError(true)
            setMessage(data.error || 'Verification token is invalid or has expired.')
            Swal.fire({
              title: 'Verification Failed',
              text: data.error || 'Verification token is invalid or has expired.',
              icon: 'error',
              confirmButtonColor: '#a32722',
            })
          }
        })
        .catch(() => {
          setIsError(true)
          setMessage('Unable to verify email due to network error.')
        })
        .finally(() => setLoading(false))
    }
  }, [])

  // Auto-fill from local cache when email changes
  useEffect(() => {
    if (!validEmail(email)) {
      setRecord(null)
      return
    }
    const key = normalizeEmail(email)
    const cached = readAccessMap()[key] || null
    setRecord(cached)

    const saved = readProfiles()[key]
    if (saved) {
      if (!name) setName(saved.name || '')
      if (!phone) setPhone(saved.phone || '')
    }

    // Check PostgreSQL gallery readiness status
    fetch('/api/gallery/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: key }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.registered && data.isVerified) {
          setRecord(prev => ({
            ...(prev || { registeredAt: Date.now() }),
            emailVerified: true,
          }))
        }
      })
      .catch(() => {})
  }, [email])

  // Submit registration to backend
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validName(name)) {
      setIsError(true)
      setMessage('Enter your full name (at least 2 letters).')
      return
    }
    if (!validEmail(email)) {
      setIsError(true)
      setMessage('Enter a valid email address.')
      return
    }
    if (!validPhone(phone)) {
      setIsError(true)
      setMessage('Enter a valid phone number (at least 7 digits).')
      return
    }
    if (password && password.length < 6) {
      setIsError(true)
      setMessage('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    setMessage('')
    setIsError(false)
    setDevVerifyUrl(null)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: normalizeEmail(email),
          phone: phone.trim(),
          ...(password ? { password } : {}),
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setIsError(true)
        setMessage(data.error || 'Registration failed. Please try again.')
        Swal.fire({
          title: 'Registration Notice',
          text: data.error || 'Registration failed. Please try again.',
          icon: 'warning',
          confirmButtonColor: '#a32722',
        })
        return
      }

      const key = normalizeEmail(email)
      const accessMap = readAccessMap()
      const access: AccessRecord = {
        registeredAt: Date.now(),
        emailVerified: false,
      }
      accessMap[key] = access

      const profiles = readProfiles()
      profiles[key] = {
        name: name.trim(),
        email: key,
        phone: phone.trim(),
        registeredAt: access.registeredAt,
        emailVerified: false,
      }

      try {
        localStorage.setItem(ACCESS_KEY, JSON.stringify(accessMap))
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles))
      } catch {
        // LocalStorage quota
      }

      setRecord(access)
      setIsError(false)
      setMessage(data.message || 'Registration saved! Please check your email for your verification link.')

      Swal.fire({
        title: 'Registration Received!',
        text: 'Please check your email and click the verification link to activate your customer access.',
        icon: 'success',
        confirmButtonColor: '#a32722',
        confirmButtonText: 'Understood',
      })

      if (data.delivery?.devVerificationUrl) {
        setDevVerifyUrl(data.delivery.devVerificationUrl)
      }
    } catch {
      setIsError(true)
      setMessage('Connection error: Unable to contact registration server.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Resend Verification
  const handleResend = async () => {
    if (!validEmail(email)) {
      setIsError(true)
      setMessage('Enter your registered email address first.')
      return
    }

    setResending(true)
    setMessage('')
    setIsError(false)

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizeEmail(email) }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setIsError(false)
        setMessage(data.message || 'Verification link sent! Check your inbox.')
        if (data.delivery?.devVerificationUrl) {
          setDevVerifyUrl(data.delivery.devVerificationUrl)
        }
      } else {
        setIsError(true)
        setMessage(data.error || 'Failed to resend verification.')
      }
    } catch {
      setIsError(true)
      setMessage('Connection error while requesting email resend.')
    } finally {
      setResending(false)
    }
  }

  const remaining = record ? Math.max(0, record.registeredAt + WAIT_MS - now) : WAIT_MS
  const isVerified = Boolean(record?.emailVerified || verifiedNow)
  const ready = isVerified && remaining === 0

  return (
    <main className="zen-register-page min-h-screen">
      <header className="zen-standalone-header">
        <a href="/" className="zen-standalone-back" aria-label="Back to Zen Café">
          <ArrowLeft size={18} />
        </a>
        <a href="/" className="zen-standalone-brand">
          <img src="/assets/zen-logo.png" alt="Zen Café" />
          <span>
            <b>ZEN CAFÉ</b>
            <small>Customer registration</small>
          </span>
        </a>
        <ThemeToggle />
      </header>

      <section className="zen-register-hero">
        <div className="zen-register-orb orb-a" />
        <div className="zen-register-orb orb-b" />

        <div className="zen-register-copy">
          <p className="kicker">
            <Sparkles size={13} /> Customer Access & Verification
          </p>
          <h1>
            Register once.<br />
            <span>Stay connected.</span>
          </h1>
          <p>
            Add your name, email and phone number. Verifying your email grants you genuine customer access
            and starts the 24-hour community gallery timer, so you can share up to two Zen moments.
          </p>
        </div>

        <form onSubmit={submit} className="zen-register-card zen-customer-register-card">
          <div className="zen-register-icon">
            <UserRound size={25} />
          </div>
          <p className="kicker">Customer registration</p>
          <h2>Your details</h2>

          <div className="zen-register-fields">
            <label className="field-label">
              Full name
              <div className="zen-register-input">
                <UserRound size={17} />
                <input
                  value={name}
                  disabled={loading}
                  onChange={e => {
                    setName(e.target.value)
                    setMessage('')
                  }}
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                />
              </div>
            </label>
</div>
            <label className="field-label">
              Phone number
              <div className="zen-register-input">
                <Phone size={17} />
                <input
                  value={phone}
                  disabled={loading}
                  onChange={e => {
                    setPhone(e.target.value)
                    setMessage('')
                  }}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+94 77 123 4567"
                />
              </div>
            </label>

            <label className="field-label zen-register-field-full">
              Email address
              <div className="zen-register-input">
                <Mail size={17} />
                <input
                  value={email}
                  disabled={loading}
                  onChange={e => {
                    setEmail(e.target.value)
                    setMessage('')
                  }}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>
            </label>

          <button
            className="primary-pill zen-register-submit"
            type="submit"
            disabled={loading}
          >
            <ShieldCheck size={15} />
            {loading ? 'Connecting...' : isVerified ? 'Update registration' : record ? 'Re-send or Update Details' : 'Register Customer'}
          </button>

          {message && (
            <div
              className={`zen-register-message mt-3 p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                isError
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
              role="status"
            >
              {isError ? <ShieldAlert size={14} /> : <CheckCircle2 size={14} />}
              <span>{message}</span>
            </div>
          )}

          {/* Dev test link when in local mode */}
          {devVerifyUrl && (
            <div className="mt-3 p-3 rounded-2xl bg-[#fff8ef] border border-[#a32722]/15 text-xs text-[#695950]">
              <span className="font-bold text-[#a32722] block mb-1">Simulated Email Delivery (Test Mode):</span>
              <a
                href={devVerifyUrl}
                className="inline-flex items-center gap-1.5 font-semibold text-[#a32722] underline break-all"
              >
                Click here to verify email now →
              </a>
            </div>
          )}

          {/* Unverified Resend Option */}
          {record && !isVerified && (
            <button
              type="button"
              disabled={resending}
              onClick={handleResend}
              className="mt-3 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-[#a32722] hover:underline w-full py-1.5"
            >
              <RefreshCw size={12} className={resending ? 'animate-spin' : ''} />
              {resending ? 'Sending link...' : 'Resend verification email'}
            </button>
          )}

          <div
            className={`zen-register-status ${record ? 'is-registered' : ''} ${
              ready ? 'is-ready' : ''
            }`}
          >
            <span>{ready ? <CheckCircle2 size={19} /> : <Clock3 size={19} />}</span>
            <div>
              <b>
                {ready
                  ? 'Gallery upload access ready'
                  : isVerified
                  ? 'Email verified · Cooldown active'
                  : record
                  ? 'Pending email verification'
                  : 'Not registered yet'}
              </b>
              <small>
                {ready
                  ? 'You can now open the gallery and upload up to 2 photos.'
                  : isVerified
                  ? `Gallery unlocks in ${formatRemaining(remaining)}.`
                  : record
                  ? 'Please click the verification link sent to your email.'
                  : 'Register your details to start the 24-hour gallery timer.'}
              </small>
            </div>
          </div>

          <a className="secondary-pill zen-register-gallery-link" href="/#gallery">
            Open Gallery
          </a>
        </form>
      </section>
    </main>
  )
}
