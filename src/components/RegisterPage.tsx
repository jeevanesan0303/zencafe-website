
import { FormEvent, useEffect, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
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

const SESSION_TOKEN_KEY = 'zen-cafe-customer-session-token-v1'

type Customer = {
  id?: string
  name: string
  email: string
  phone?: string
  emailVerifiedAt?: string | null
  galleryEligibleAt?: string | null
}

type GalleryStatus = {
  authenticated: boolean
  verified: boolean
  canUpload: boolean
  nextUploadAt: string | null
  customer: Customer | null
}

type ApiResponse = {
  success?: boolean
  authenticated?: boolean
  error?: string
  message?: string
  token?: string
  expiresAt?: string
  customer?: Customer
  delivery?: {
    simulated?: boolean
    devVerificationUrl?: string
  }
}

const normalizeEmail = (value: string) =>
  value.trim().toLowerCase()

const validEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))

const validName = (value: string) =>
  value.trim().length >= 2

const validPhone = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  return [
    hours,
    minutes,
    seconds,
  ]
    .map(value => String(value).padStart(2, '0'))
    .join(':')
}

async function readJson(response: Response): Promise<ApiResponse> {
  const data = await response.json().catch(() => null)

  if (!data || typeof data !== 'object') {
    throw new Error('The server returned an invalid response.')
  }

  return data as ApiResponse
}

function saveSession(token: string) {
  localStorage.setItem(SESSION_TOKEN_KEY, token)
}

function getSessionToken() {
  return localStorage.getItem(SESSION_TOKEN_KEY)
}

function clearSession() {
  localStorage.removeItem(SESSION_TOKEN_KEY)
}

function clearUrlToken() {
  const url = new URL(window.location.href)

  url.searchParams.delete('verify')
  url.searchParams.delete('gallery_login')

  window.history.replaceState(
    {},
    '',
    `${url.pathname}${url.search}${url.hash}`
  )
}

function redirectToGallery() {
  window.location.replace('/#gallery')
}

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [mode, setMode] = useState<'register' | 'signin'>('register')

  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null)

  const [now, setNow] = useState(Date.now())

  const [galleryStatus, setGalleryStatus] = useState<GalleryStatus>({
    authenticated: false,
    verified: false,
    canUpload: false,
    nextUploadAt: null,
    customer: null,
  })

  const linkProcessed = useRef(false)

  const authenticated = galleryStatus.authenticated
  const verified = galleryStatus.verified

  const cooldownRemaining = galleryStatus.nextUploadAt
    ? Math.max(
        0,
        new Date(galleryStatus.nextUploadAt).getTime() - now
      )
    : 0

  const ready =
    authenticated &&
    verified &&
    cooldownRemaining === 0

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  /**
   * Validate an existing session against PostgreSQL.
   * The local token is not treated as proof of verification.
   */
  const checkExistingSession = async () => {
    const token = getSessionToken()

    if (!token) {
      setCheckingSession(false)
      return
    }

    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      })

      const data = await response.json()

      if (
        !response.ok ||
        !data.authenticated ||
        !data.customer?.emailVerified
      ) {
        clearSession()
        setCheckingSession(false)
        return
      }

      const customer = data.customer

      setName(customer.name || '')
      setEmail(customer.email || '')
      setPhone(customer.phone || '')

      setGalleryStatus({
        authenticated: true,
        verified: true,
        canUpload: true,
        nextUploadAt: customer.galleryEligibleAt || null,
        customer,
      })
    } catch {
      // Keep the stored token for a later retry if the network fails.
    } finally {
      setCheckingSession(false)
    }
  }

  /**
   * Handle new-customer verification links and
   * returning-customer gallery sign-in links.
   */
  useEffect(() => {
    if (linkProcessed.current) return

    linkProcessed.current = true

    const params = new URLSearchParams(window.location.search)

    const verifyToken = params.get('verify')
    const galleryLoginToken = params.get('gallery_login')

    if (!verifyToken && !galleryLoginToken) {
      void checkExistingSession()
      return
    }

    const processEmailLink = async () => {
      setLoading(true)
      setCheckingSession(true)
      setMessage('')

      // Remove the sensitive token from the visible URL immediately.
      clearUrlToken()

      try {
        let response: Response

        if (galleryLoginToken) {
          response = await fetch('/api/auth/gallery-login/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              token: galleryLoginToken,
            }),
          })
        } else {
          response = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              token: verifyToken,
            }),
          })
        }

        const data = await readJson(response)

        if (
          !response.ok ||
          !data.success ||
          !data.token ||
          !data.customer
        ) {
          throw new Error(
            data.error ||
            'The email link is invalid, expired, or already used.'
          )
        }

        saveSession(data.token)

        const customer = data.customer

        setName(customer.name || '')
        setEmail(customer.email || '')
        setPhone(customer.phone || '')

        setGalleryStatus({
          authenticated: true,
          verified: true,
          canUpload: true,
          nextUploadAt: customer.galleryEligibleAt || null,
          customer,
        })

        setIsError(false)

        setMessage(
          galleryLoginToken
            ? 'Welcome back! Your gallery session is now active.'
            : 'Email verified successfully! Your gallery access is now active.'
        )

        await Swal.fire({
          title: galleryLoginToken
            ? 'Welcome Back!'
            : 'Email Verified!',
          text:
            'Your Community Gallery access is ready. You can now continue to the gallery.',
          icon: 'success',
          confirmButtonColor: '#a32722',
          confirmButtonText: 'Open Gallery',
          timer: 3500,
          timerProgressBar: true,
        })

        redirectToGallery()
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Unable to verify the email link.'

        setIsError(true)
        setMessage(errorMessage)

        await Swal.fire({
          title: 'Link Verification Failed',
          text: errorMessage,
          icon: 'error',
          confirmButtonColor: '#a32722',
        })

        setMode(galleryLoginToken ? 'signin' : 'register')
        await checkExistingSession()
      } finally {
        setLoading(false)
        setCheckingSession(false)
      }
    }

    void processEmailLink()
  }, [])

  /**
   * Register a new customer.
   */
  const submitRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

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
      setMessage('Enter a valid phone number (7 to 15 digits).')
      return
    }

    setLoading(true)
    setIsError(false)
    setMessage('')
    setDevVerifyUrl(null)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          email: normalizeEmail(email),
          phone: phone.trim(),
        }),
      })

      const data = await readJson(response)

      if (!response.ok || !data.success) {
        if (data.error && response.status === 409) {
          setMode('signin')
          setMessage(
            'This email is already registered. Use the returning-customer sign-in option.'
          )
          setIsError(false)
          return
        }

        throw new Error(
          data.error || 'Registration failed. Please try again.'
        )
      }

      setMessage(
        data.message ||
        'Registration received. Check your email for the verification link.'
      )

      if (data.delivery?.devVerificationUrl) {
        setDevVerifyUrl(data.delivery.devVerificationUrl)
      }

      await Swal.fire({
        title: 'Registration Received!',
        text:
          'Please check your inbox and click the verification link to activate your Community Gallery access.',
        icon: 'success',
        confirmButtonColor: '#a32722',
        confirmButtonText: 'Understood',
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unable to contact the registration server.'

      setIsError(true)
      setMessage(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Returning customers request a 15-minute
   * single-use email sign-in link.
   */
  const requestGallerySignIn = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault()

    if (!validEmail(email)) {
      setIsError(true)
      setMessage('Enter your registered email address.')
      return
    }

    setLoading(true)
    setIsError(false)
    setMessage('')
    setDevVerifyUrl(null)

    try {
      const response = await fetch(
        '/api/auth/gallery-login/request',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: normalizeEmail(email),
          }),
        }
      )

      const data = await readJson(response)

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || 'Unable to request a sign-in link.'
        )
      }

      setMessage(
        data.message ||
        'If this email is registered and verified, a sign-in link will arrive shortly.'
      )

      await Swal.fire({
        title: 'Check Your Inbox',
        text:
          'If your email is registered and verified, we will send you a secure gallery sign-in link valid for 15 minutes.',
        icon: 'success',
        confirmButtonColor: '#a32722',
        confirmButtonText: 'Understood',
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unable to request a sign-in link.'

      setIsError(true)
      setMessage(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Resend verification for an unverified customer.
   */
  const handleResend = async () => {
    if (!validEmail(email)) {
      setIsError(true)
      setMessage('Enter your registered email address first.')
      return
    }

    setResending(true)
    setIsError(false)
    setMessage('')
    setDevVerifyUrl(null)

    try {
      const response = await fetch(
        '/api/auth/resend-verification',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: normalizeEmail(email),
          }),
        }
      )

      const data = await readJson(response)

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || 'Unable to resend the verification email.'
        )
      }

      setMessage(
        data.message ||
        'If your account is awaiting verification, a new link will be sent.'
      )

      if (data.delivery?.devVerificationUrl) {
        setDevVerifyUrl(data.delivery.devVerificationUrl)
      }

      await Swal.fire({
        title: 'Request Received',
        text:
          'If your account is awaiting verification, please check your inbox for a new link.',
        icon: 'success',
        confirmButtonColor: '#a32722',
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unable to resend the verification email.'

      setIsError(true)
      setMessage(errorMessage)
    } finally {
      setResending(false)
    }
  }

  const switchMode = (nextMode: 'register' | 'signin') => {
    setMode(nextMode)
    setMessage('')
    setIsError(false)
    setDevVerifyUrl(null)
  }

  return (
    <main className="zen-register-page min-h-screen">
      <header className="zen-standalone-header">
        <a
          href="/"
          className="zen-standalone-back"
          aria-label="Back to Zen Café"
        >
          <ArrowLeft size={18} />
        </a>

        <a href="/" className="zen-standalone-brand">
          <img src="/assets/zen-logo.png" alt="Zen Café" />
          <span>
            <b>ZEN CAFÉ</b>
            <small>
              {mode === 'signin'
                ? 'Customer sign-in'
                : 'Customer registration'}
            </small>
          </span>
        </a>

        <ThemeToggle />
      </header>

      <section className="zen-register-hero">
        <div className="zen-register-orb orb-a" />
        <div className="zen-register-orb orb-b" />

        <div className="zen-register-copy">
          <p className="kicker">
            <Sparkles size={13} />
            Customer Access & Verification
          </p>

          <h1>
            Share your moments.
            <br />
            <span>Stay connected.</span>
          </h1>

          <p>
            Join the Zen Café community, verify your email,
            and share up to two photos from your café experience.
            Your photos appear in the gallery after a successful upload.
            You can upload again after 24 hours.
          </p>
        </div>

        <div className="zen-register-card zen-customer-register-card">
          <div className="zen-register-icon">
            {mode === 'signin' ? (
              <ShieldCheck size={25} />
            ) : (
              <UserRound size={25} />
            )}
          </div>

          <p className="kicker">
            {mode === 'signin'
              ? 'Returning customer'
              : 'Customer registration'}
          </p>

          <h2>
            {mode === 'signin'
              ? 'Welcome back'
              : 'Your details'}
          </h2>

          <div className="flex gap-2 mt-4 mb-5">
            <button
              type="button"
              disabled={loading}
              onClick={() => switchMode('register')}
              className={`flex-1 rounded-full px-3 py-2.5 text-xs font-bold transition-colors ${
                mode === 'register'
                  ? 'bg-[#a32722] text-white'
                  : 'border border-[#a32722]/20 text-[#a32722]'
              }`}
            >
              New Customer
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => switchMode('signin')}
              className={`flex-1 rounded-full px-3 py-2.5 text-xs font-bold transition-colors ${
                mode === 'signin'
                  ? 'bg-[#a32722] text-white'
                  : 'border border-[#a32722]/20 text-[#a32722]'
              }`}
            >
              Returning Customer
            </button>
          </div>

          {authenticated && verified && (
            <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              <div className="flex items-center gap-2 text-sm font-bold">
                <CheckCircle2 size={17} />
                You're signed in
              </div>

              <p className="mt-1 text-xs">
                {galleryStatus.customer?.email}
              </p>

              <a
                href="/#gallery"
                className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#a32722] underline"
              >
                Open Community Gallery
              </a>
            </div>
          )}

          {mode === 'register' ? (
            <form onSubmit={submitRegistration}>
              <div className="zen-register-fields">
                <label className="field-label">
                  Full name
                  <div className="zen-register-input">
                    <UserRound size={17} />
                    <input
                      value={name}
                      disabled={loading}
                      onChange={event => {
                        setName(event.target.value)
                        setMessage('')
                      }}
                      type="text"
                      autoComplete="name"
                      placeholder="Your name"
                      required
                    />
                  </div>
                </label>

                <label className="field-label">
                  Phone number
                  <div className="zen-register-input">
                    <Phone size={17} />
                    <input
                      value={phone}
                      disabled={loading}
                      onChange={event => {
                        setPhone(event.target.value)
                        setMessage('')
                      }}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+94 77 123 4567"
                      required
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
                      onChange={event => {
                        setEmail(event.target.value)
                        setMessage('')
                      }}
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </label>
              </div>

              <button
                className="primary-pill zen-register-submit"
                type="submit"
                disabled={loading || checkingSession}
              >
                <ShieldCheck size={15} />
                {loading
                  ? 'Registering...'
                  : 'Register Customer'}
              </button>

              <button
                type="button"
                disabled={resending || loading}
                onClick={handleResend}
                className="mt-3 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-[#a32722] hover:underline w-full py-1.5"
              >
                <RefreshCw
                  size={12}
                  className={resending ? 'animate-spin' : ''}
                />
                {resending
                  ? 'Sending link...'
                  : 'Resend verification email'}
              </button>
            </form>
          ) : (
            <form onSubmit={requestGallerySignIn}>
              <p className="text-sm mb-5 opacity-75">
                Already registered and verified? Enter your email
                and we'll send you a secure sign-in link.
                No password required.
              </p>

              <div className="zen-register-fields">
                <label className="field-label zen-register-field-full">
                  Registered email address
                  <div className="zen-register-input">
                    <Mail size={17} />
                    <input
                      value={email}
                      disabled={loading}
                      onChange={event => {
                        setEmail(event.target.value)
                        setMessage('')
                      }}
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </label>
              </div>

              <button
                className="primary-pill zen-register-submit"
                type="submit"
                disabled={loading || checkingSession}
              >
                <Send size={15} />
                {loading
                  ? 'Sending sign-in link...'
                  : 'Email Me a Sign-In Link'}
              </button>

              <p className="text-xs text-center mt-3 opacity-65">
                Your sign-in link is valid for 15 minutes
                and can only be used once.
              </p>
            </form>
          )}

          {message && (
            <div
              className={`zen-register-message mt-3 p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                isError
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
              role="status"
            >
              {isError ? (
                <ShieldAlert size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}
              <span>{message}</span>
            </div>
          )}

          {devVerifyUrl && (
            <div className="mt-3 p-3 rounded-2xl bg-[#fff8ef] border border-[#a32722]/15 text-xs text-[#695950]">
              <span className="font-bold text-[#a32722] block mb-1">
                Local Email Test
              </span>
              <a
                href={devVerifyUrl}
                className="font-semibold text-[#a32722] underline break-all"
              >
                Open verification link
              </a>
            </div>
          )}

          <div
            className={`zen-register-status ${
              authenticated ? 'is-registered' : ''
            } ${ready ? 'is-ready' : ''}`}
          >
            <span>
              {ready ? (
                <CheckCircle2 size={19} />
              ) : (
                <Clock3 size={19} />
              )}
            </span>

            <div>
              <b>
                {checkingSession
                  ? 'Checking customer access'
                  : ready
                  ? 'Gallery upload access ready'
                  : authenticated && verified
                  ? '24-hour gallery cooldown active'
                  : mode === 'signin'
                  ? 'Secure email sign-in'
                  : 'Email verification required'}
              </b>

              <small>
                {checkingSession
                  ? 'Please wait while we verify your session.'
                  : ready
                  ? 'You can upload up to 2 photos.'
                  : authenticated && verified
                  ? `You can upload again in ${formatRemaining(
                      cooldownRemaining
                    )}.`
                  : mode === 'signin'
                  ? 'Use your verified email to receive a sign-in link.'
                  : 'Register and verify your email to upload immediately.'}
              </small>
            </div>
          </div>

          <a
            className="secondary-pill zen-register-gallery-link"
            href="/#gallery"
          >
            Open Gallery
          </a>
        </div>
      </section>
    </main>
  )
}
