
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import Swal from 'sweetalert2'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Mail,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import ThemeToggle from './ThemeToggle'

/* =========================================================
   ZEN CAFÉ — CUSTOMER REGISTRATION

   Workflow:
   1. Customer registers once.
   2. Customer verifies their email.
   3. Verified details remain in PostgreSQL.
   4. Customer can return to the gallery anytime.
   5. Gallery checks the registered email directly.
   6. No Returning Customer tab or sign-in flow.

   IMPORTANT:
   Local storage is only for convenient form prefilling.
   The backend remains responsible for checking registration,
   verification, and upload cooldown.
========================================================= */

const CUSTOMER_PROFILE_KEY =
  'zen-cafe-customer-registration-v149'

type Customer = {
  id?: string
  name?: string
  email?: string
  phone?: string
  emailVerified?: boolean
  emailVerifiedAt?: string | null
  galleryEligibleAt?: string | null
}

type ApiResponse = {
  success?: boolean
  error?: string
  message?: string
  token?: string
  customer?: Customer
  delivery?: {
    simulated?: boolean
    devVerificationUrl?: string
  }
}

type SavedCustomerProfile = {
  name: string
  email: string
  phone: string
  verified: boolean
}

const normalizeEmail = (value: string): string =>
  value.trim().toLowerCase()

const validEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    normalizeEmail(value),
  )

const validName = (value: string): boolean =>
  value.trim().length >= 2

const validPhone = (value: string): boolean => {
  const digits = value.replace(/\D/g, '')

  return digits.length >= 7 && digits.length <= 15
}

async function readJson(
  response: Response,
): Promise<ApiResponse> {
  const contentType =
    response.headers.get('content-type') || ''

  if (!contentType.includes('application/json')) {
    throw new Error(
      'The registration service is unavailable. Please try again.',
    )
  }

  const data: unknown = await response.json()

  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    throw new Error(
      'The server returned an invalid response.',
    )
  }

  return data as ApiResponse
}

function saveCustomerProfile(
  profile: SavedCustomerProfile,
): void {
  try {
    localStorage.setItem(
      CUSTOMER_PROFILE_KEY,
      JSON.stringify(profile),
    )
  } catch {
    // Local storage is optional.
    // PostgreSQL remains the source of truth.
  }
}

function readCustomerProfile():
  | SavedCustomerProfile
  | null {
  try {
    const raw = localStorage.getItem(
      CUSTOMER_PROFILE_KEY,
    )

    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return null
    }

    const profile =
      parsed as Partial<SavedCustomerProfile>

    if (
      typeof profile.email !== 'string' ||
      !validEmail(profile.email)
    ) {
      return null
    }

    return {
      name:
        typeof profile.name === 'string'
          ? profile.name
          : '',
      email: normalizeEmail(profile.email),
      phone:
        typeof profile.phone === 'string'
          ? profile.phone
          : '',
      verified: profile.verified === true,
    }
  } catch {
    return null
  }
}

function clearVerificationTokenFromUrl(): void {
  const url = new URL(window.location.href)

  url.searchParams.delete('verify')

  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  )
}

function redirectToGallery(): void {
  window.location.replace('/#gallery')
}

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const [registrationSubmitted, setRegistrationSubmitted] =
    useState(false)

  const [verifiedCustomer, setVerifiedCustomer] =
    useState(false)

  const [devVerifyUrl, setDevVerifyUrl] =
    useState<string | null>(null)

  const verificationProcessed = useRef(false)

  /* =======================================================
     LOAD SAVED CUSTOMER DETAILS

     Only prefill the registration form.
     Never treat localStorage as server verification.
  ======================================================= */

  useEffect(() => {
    const profile = readCustomerProfile()

    if (!profile) return

    setName(profile.name)
    setEmail(profile.email)
    setPhone(profile.phone)

    // Verification is always confirmed by the server
    // when the customer opens the email verification link.
  }, [])

  /* =======================================================
     HANDLE EMAIL VERIFICATION LINK

     Example:
     /register?verify=TOKEN

     The token is sent to the backend and removed
     from the browser URL immediately.
  ======================================================= */

  useEffect(() => {
    if (verificationProcessed.current) return

    verificationProcessed.current = true

    const params = new URLSearchParams(
      window.location.search,
    )

    const verifyToken = params.get('verify')

    if (!verifyToken) return

    clearVerificationTokenFromUrl()

    let active = true

    const verifyEmail = async (): Promise<void> => {
      setVerifying(true)
      setLoading(true)
      setMessage('')
      setIsError(false)

      try {
        const response = await fetch(
          '/api/auth/verify',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              token: verifyToken,
            }),
          },
        )

        const data = await readJson(response)

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ||
              data.message ||
              'The verification link is invalid or expired.',
          )
        }

        if (!active) return

        const customer = data.customer

        if (
          !customer ||
          !customer.email ||
          !validEmail(customer.email)
        ) {
          throw new Error(
            'Email verification succeeded, but the customer details were not returned.',
          )
        }

        const verifiedName =
          customer.name || name.trim()

        const verifiedEmail = normalizeEmail(
          customer.email,
        )

        const verifiedPhone =
          customer.phone || phone.trim()

        setName(verifiedName)
        setEmail(verifiedEmail)
        setPhone(verifiedPhone)

        saveCustomerProfile({
          name: verifiedName,
          email: verifiedEmail,
          phone: verifiedPhone,
          verified: true,
        })

        setVerifiedCustomer(true)
        setRegistrationSubmitted(false)

        setIsError(false)
        setMessage(
          'Your email has been verified successfully. You can now visit the Community Gallery and check your registered email to upload photos.',
        )

        const result = await Swal.fire({
          title: 'Email Verified!',
          text:
            'Your Zen Café registration is complete. Open the Community Gallery, check your registered email, and share your photos.',
          icon: 'success',
          confirmButtonColor: '#a32722',
          confirmButtonText: 'Open Gallery',
          timer: 4500,
          timerProgressBar: true,
          allowOutsideClick: false,
        })

        if (active && result) {
          redirectToGallery()
        }
      } catch (error) {
        if (!active) return

        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Unable to verify your email.'

        setIsError(true)
        setMessage(errorMessage)

        await Swal.fire({
          title: 'Email Verification Failed',
          text: errorMessage,
          icon: 'error',
          confirmButtonColor: '#a32722',
          confirmButtonText: 'Understood',
        })
      } finally {
        if (active) {
          setVerifying(false)
          setLoading(false)
        }
      }
    }

    void verifyEmail()

    return () => {
      active = false
    }
  }, [])

  /* =======================================================
     CUSTOMER REGISTRATION

     POST /api/auth/register
  ======================================================= */

  const submitRegistration = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()

    if (loading || resending || verifying) return

    if (!validName(name)) {
      setIsError(true)
      setMessage(
        'Please enter your full name (at least 2 characters).',
      )
      return
    }

    if (!validEmail(email)) {
      setIsError(true)
      setMessage(
        'Please enter a valid email address.',
      )
      return
    }

    if (!validPhone(phone)) {
      setIsError(true)
      setMessage(
        'Please enter a valid phone number (7 to 15 digits).',
      )
      return
    }

    setLoading(true)
    setIsError(false)
    setMessage('')
    setDevVerifyUrl(null)
    setRegistrationSubmitted(false)

    try {
      const response = await fetch(
        '/api/auth/register',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            email: normalizeEmail(email),
            phone: phone.trim(),
          }),
        },
      )

      const data = await readJson(response)

      if (!response.ok || !data.success) {
        if (response.status === 409) {
          setIsError(false)

          setMessage(
            'This email is already registered. If you have verified it, open the Community Gallery and check your registered email. You do not need to register again.',
          )

          await Swal.fire({
            title: 'Already Registered',
            text:
              'Your email is already registered. If it is verified, go directly to the Community Gallery and check your email to upload photos.',
            icon: 'info',
            confirmButtonColor: '#a32722',
            confirmButtonText: 'Open Gallery',
            showCancelButton: true,
            cancelButtonText: 'Stay Here',
          }).then(result => {
            if (result.isConfirmed) {
              redirectToGallery()
            }
          })

          return
        }

        throw new Error(
          data.error ||
            data.message ||
            'Registration failed. Please try again.',
        )
      }

      const registeredName = name.trim()
      const registeredEmail = normalizeEmail(email)
      const registeredPhone = phone.trim()

      saveCustomerProfile({
        name: registeredName,
        email: registeredEmail,
        phone: registeredPhone,
        verified: false,
      })

      setRegistrationSubmitted(true)

      setMessage(
        data.message ||
          'Registration received. Please check your email for the verification link.',
      )

      if (data.delivery?.devVerificationUrl) {
        setDevVerifyUrl(
          data.delivery.devVerificationUrl,
        )
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

  /* =======================================================
     RESEND EMAIL VERIFICATION

     POST /api/auth/resend-verification
  ======================================================= */

  const handleResend = async (): Promise<void> => {
    if (loading || resending || verifying) return

    if (!validEmail(email)) {
      setIsError(true)
      setMessage(
        'Enter your registered email address first.',
      )
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
            Accept: 'application/json',
          },
          body: JSON.stringify({
            email: normalizeEmail(email),
          }),
        },
      )

      const data = await readJson(response)

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            data.message ||
            'Unable to resend the verification email.',
        )
      }

      setMessage(
        data.message ||
          'If your email is awaiting verification, a new verification link will be sent.',
      )

      if (data.delivery?.devVerificationUrl) {
        setDevVerifyUrl(
          data.delivery.devVerificationUrl,
        )
      }

      await Swal.fire({
        title: 'Request Received',
        text:
          'If your email is awaiting verification, please check your inbox for a new verification link.',
        icon: 'success',
        confirmButtonColor: '#a32722',
        confirmButtonText: 'Understood',
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

  /* =======================================================
     RENDER
  ======================================================= */

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

        <a
          href="/"
          className="zen-standalone-brand"
        >
          <img
            src="/assets/zen-logo.png"
            alt="Zen Café"
          />

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
            <Sparkles size={13} />
            Customer Access & Verification
          </p>

          <h1>
            Share your moments.
            <br />
            <span>Stay connected.</span>
          </h1>

          <p>
            Join the Zen Café community, verify your
            email, and share up to two photos from your
            café experience. Your photos appear in the
            gallery after a successful upload. You can
            upload again after 24 hours.
          </p>
        </div>

        <div className="zen-register-card zen-customer-register-card">
          <div className="zen-register-icon">
            {verifiedCustomer ? (
              <ShieldCheck size={25} />
            ) : (
              <UserRound size={25} />
            )}
          </div>

          <p className="kicker">
            Customer registration
          </p>

          <h2>
            {verifiedCustomer
              ? 'Email verified'
              : registrationSubmitted
                ? 'Check your inbox'
                : 'Your details'}
          </h2>

          {verifiedCustomer && (
            <div className="mb-5 mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              <div className="flex items-center gap-2 text-sm font-bold">
                <CheckCircle2 size={17} />
                Registration complete
              </div>

              <p className="mt-1 text-xs">
                Your email has been verified.
                You can now access the Community Gallery.
              </p>

              <a
                href="/#gallery"
                className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#a32722] underline"
              >
                Open Community Gallery
              </a>
            </div>
          )}

          <form onSubmit={submitRegistration}>
            <div className="zen-register-fields">
              <label className="field-label">
                Full name

                <div className="zen-register-input">
                  <UserRound size={17} />

                  <input
                    value={name}
                    disabled={
                      loading ||
                      resending ||
                      verifying
                    }
                    onChange={event => {
                      setName(event.target.value)
                      setMessage('')
                    }}
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    maxLength={100}
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
                    disabled={
                      loading ||
                      resending ||
                      verifying
                    }
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
                    disabled={
                      loading ||
                      resending ||
                      verifying
                    }
                    onChange={event => {
                      setEmail(event.target.value)
                      setMessage('')
                    }}
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    maxLength={254}
                    required
                  />
                </div>
              </label>
            </div>

            <button
              className="primary-pill zen-register-submit"
              type="submit"
              disabled={
                loading ||
                resending ||
                verifying
              }
            >
              <ShieldCheck size={15} />

              {verifying
                ? 'Verifying email...'
                : loading
                  ? 'Registering...'
                  : 'Register Customer'}
            </button>

            <button
              type="button"
              disabled={
                resending ||
                loading ||
                verifying
              }
              onClick={() => {
                void handleResend()
              }}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 py-1.5 text-xs font-bold text-[#a32722] hover:underline disabled:opacity-50"
            >
              <RefreshCw
                size={12}
                className={
                  resending
                    ? 'animate-spin'
                    : ''
                }
              />

              {resending
                ? 'Sending link...'
                : 'Resend verification email'}
            </button>
          </form>

          {message && (
            <div
              className={`zen-register-message mt-3 flex items-center gap-2 rounded-xl p-2.5 text-xs ${
                isError
                  ? 'border border-red-200 bg-red-50 text-red-800'
                  : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
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
            <div className="mt-3 rounded-2xl border border-[#a32722]/15 bg-[#fff8ef] p-3 text-xs text-[#695950]">
              <span className="mb-1 block font-bold text-[#a32722]">
                Local Email Test
              </span>

              <a
                href={devVerifyUrl}
                className="break-all font-semibold text-[#a32722] underline"
              >
                Open verification link
              </a>
            </div>
          )}

          <div
            className={`zen-register-status ${
              verifiedCustomer
                ? 'is-registered is-ready'
                : ''
            }`}
          >
            <span>
              {verifiedCustomer ? (
                <CheckCircle2 size={19} />
              ) : (
                <Clock3 size={19} />
              )}
            </span>

            <div>
              <b>
                {verifying
                  ? 'Verifying your email'
                  : verifiedCustomer
                    ? 'Registration completed'
                    : registrationSubmitted
                      ? 'Email verification pending'
                      : 'Email verification required'}
              </b>

              <small>
                {verifying
                  ? 'Please wait while we confirm your verification link.'
                  : verifiedCustomer
                    ? 'Open the gallery and check your registered email to upload photos.'
                    : registrationSubmitted
                      ? 'Click the verification link sent to your email address.'
                      : 'Register and verify your email once. After that, you can return to the gallery anytime.'}
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
