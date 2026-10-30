
import React, {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'

import ReactDOM from 'react-dom/client'

import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
} from 'lucide-react'

import Swal from 'sweetalert2'

import {
  isAdminLoggedIn,
  mockLogin,
} from './admin-auth'

import './index.css'

/* ==========================================
   ZEN CAFÉ — ADMIN AUTHENTICATION
========================================== */

type AuthView = 'login' | 'forgot-password'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* ==========================================
   SWEETALERT THEME
========================================== */

const authAlert = Swal.mixin({
  background: '#fffaf6',
  color: '#271c18',
  confirmButtonColor: '#a62521',
  cancelButtonColor: '#87756c',
  customClass: {
    popup: 'zen-sweet-alert',
    title: 'zen-sweet-title',
    confirmButton: 'zen-sweet-confirm',
    cancelButton: 'zen-sweet-cancel',
  },
})

/* ==========================================
   ADMIN LOGIN COMPONENT
========================================== */

function AdminLogin() {
  const [view, setView] = useState<AuthView>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')

  // Password must be hidden by default.
  const [showPassword, setShowPassword] = useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const passwordInputRef = useRef<HTMLInputElement>(null)

  /* ========================================
     CHECK EXISTING SESSION
  ======================================== */

  useEffect(() => {
    if (isAdminLoggedIn()) {
      window.location.replace('/admin')
    }
  }, [])

  /* ========================================
     PASSWORD VISIBILITY
  ======================================== */

  function togglePasswordVisibility() {
    setShowPassword(previous => !previous)

    // Keep the input focused after clicking the icon.
    requestAnimationFrame(() => {
      passwordInputRef.current?.focus({
        preventScroll: true,
      })
    })
  }

  /* ========================================
     FORGOT PASSWORD NAVIGATION
  ======================================== */

  function openForgotPassword() {
    setRecoveryEmail(email.trim())
    setError('')
    setShowPassword(false)
    setView('forgot-password')
  }

  function backToLogin() {
    setView('login')
    setError('')
    setShowPassword(false)
  }

  /* ========================================
     LOGIN HANDLER
  ======================================== */

  async function handleLogin(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()

    if (loading) return

    setError('')

    const normalizedEmail = email.trim().toLowerCase()

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      const message =
        'Please enter a valid administrator email address.'

      setError(message)

      await authAlert.fire({
        icon: 'warning',
        title: 'Invalid Email Address',
        text: message,
        confirmButtonText: 'OK',
      })

      return
    }

    if (!password) {
      const message =
        'Please enter your administrator password.'

      setError(message)

      await authAlert.fire({
        icon: 'warning',
        title: 'Password Required',
        text: message,
        confirmButtonText: 'OK',
      })

      return
    }

    setLoading(true)

    try {
      const authenticated = await mockLogin(
        normalizedEmail,
        password,
      )

      if (!authenticated) {
        const message = 'Invalid email or password.'

        setError(message)

        await authAlert.fire({
          icon: 'error',
          title: 'Login Failed',
          text: message,
          confirmButtonText: 'Try Again',
        })

        return
      }

      // Clear the password before navigation.
      setShowPassword(false)
      setPassword('')

      window.location.replace('/admin')
    } catch (caughtError) {
      console.error('Admin login failed:', caughtError)

      const message =
        caughtError instanceof Error &&
        caughtError.message
          ? caughtError.message
          : 'Unable to sign in. Please try again.'

      setError(message)

      await authAlert.fire({
        icon: 'error',
        title: 'Login Error',
        text: message,
        confirmButtonText: 'OK',
      })
    } finally {
      setLoading(false)
    }
  }

  /* ========================================
     PASSWORD RECOVERY
  ======================================== */

  async function handleForgotPassword(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()

    if (loading) return

    setError('')

    const normalizedEmail = recoveryEmail
      .trim()
      .toLowerCase()

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      const message = 'Please enter a valid email address.'

      setError(message)

      await authAlert.fire({
        icon: 'warning',
        title: 'Invalid Email Address',
        text: message,
        confirmButtonText: 'OK',
      })

      return
    }

    // Do not claim that an email was sent without
    // a configured password recovery endpoint.
    await authAlert.fire({
      icon: 'info',
      title: 'Password Recovery',
      text:
        'Password reset emails are not configured yet. Please contact your system administrator to recover access.',
      confirmButtonText: 'Understood',
    })
  }

  /* ========================================
     SHARED STYLES
  ======================================== */

  const inputWrapperClass =
    'flex items-center gap-3 rounded-xl border border-[#e6d8ce] bg-white px-4 transition-colors focus-within:border-[#a62521] focus-within:ring-1 focus-within:ring-[#a62521]/20'

  const inputClass =
    'min-w-0 w-full bg-transparent py-4 text-sm text-[#271c18] outline-none placeholder:text-[#a99b93]'

  const labelClass =
    'mb-2 block text-sm font-semibold text-[#59463e]'

  const primaryButtonClass =
    'flex w-full items-center justify-center gap-3 rounded-xl bg-[#a62521] px-5 py-4 text-sm font-bold text-white transition hover:bg-[#831b18] disabled:cursor-not-allowed disabled:opacity-60'

  /* ========================================
     LOGIN PAGE
  ======================================== */

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5ece4] px-4 py-12">
      <div className="w-full max-w-[440px] rounded-[32px] bg-[#fffaf6] p-8 shadow-[0_20px_65px_rgba(65,36,25,0.12)] sm:p-12">

        {/* ==================================
            BRAND
        ================================== */}

        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#a62521] bg-white shadow-sm">
            <span className="font-serif text-3xl font-bold text-[#271c18]">
              ZEN
            </span>
          </div>

          <p className="text-xs font-bold tracking-[0.24em] text-[#a62521]">
            ZEN CAFÉ
          </p>

          <h1 className="mt-3 font-serif text-4xl font-bold uppercase text-[#271c18]">
            {view === 'login'
              ? 'Admin Login'
              : 'Forgot Password'}
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#87756c]">
            {view === 'login'
              ? 'Welcome back. Sign in to your dashboard.'
              : 'Enter your administrator email to begin account recovery.'}
          </p>
        </div>

        {/* ==================================
            LOGIN FORM
        ================================== */}

        {view === 'login' && (
          <form
            onSubmit={handleLogin}
            noValidate
            className="mt-9 space-y-5"
          >
            {/* EMAIL */}

            <div>
              <label
                htmlFor="admin-email"
                className={labelClass}
              >
                Email Address
              </label>

              <div className={inputWrapperClass}>
                <Mail
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 text-[#9a8175]"
                />

                <input
                  id="admin-email"
                  type="email"
                  name="email"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={event => {
                    setEmail(event.target.value)
                    setError('')
                  }}
                  placeholder="Enter admin email"
                  className={inputClass}
                />
              </div>
            </div>

            {/* PASSWORD */}

            <div>
              <label
                htmlFor="admin-password"
                className={labelClass}
              >
                Password
              </label>

              <div className={inputWrapperClass}>
                <LockKeyhole
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 text-[#9a8175]"
                />

                <input
                  ref={passwordInputRef}
                  id="admin-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  spellCheck={false}
                  autoCapitalize="none"
                  value={password}
                  onChange={event => {
                    setPassword(event.target.value)
                    setError('')
                  }}
                  placeholder="Enter password"
                  className={inputClass}
                />

                {/* PASSWORD VISIBILITY BUTTON */}

                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  disabled={loading}
                  aria-label={
                    showPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                  aria-pressed={showPassword}
                  title={
                    showPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#87756c] transition-colors hover:bg-[#f8ebe6] hover:text-[#a62521] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a62521] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {showPassword ? (
                    // VISIBLE: OPEN EYE
                    <Eye
                      size={19}
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  ) : (
                    // HIDDEN: CROSSED EYE
                    <EyeOff
                      size={19}
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </div>

              {/* FORGOT PASSWORD */}

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={openForgotPassword}
                  className="text-sm font-semibold text-[#a62521] transition hover:text-[#831b18] hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
            </div>

            {/* ERROR MESSAGE */}

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            {/* SIGN IN */}

            <button
              type="submit"
              disabled={loading}
              className={primaryButtonClass}
            >
              {loading ? 'Signing in...' : 'Sign In'}

              <ArrowRight
                size={18}
                aria-hidden="true"
              />
            </button>
          </form>
        )}

        {/* ==================================
            FORGOT PASSWORD FORM
        ================================== */}

        {view === 'forgot-password' && (
          <form
            onSubmit={handleForgotPassword}
            noValidate
            className="mt-9 space-y-5"
          >
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f8e9e5] text-[#a62521]">
                <KeyRound
                  size={30}
                  aria-hidden="true"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="recovery-email"
                className={labelClass}
              >
                Administrator Email Address
              </label>

              <div className={inputWrapperClass}>
                <Mail
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 text-[#9a8175]"
                />

                <input
                  id="recovery-email"
                  name="recoveryEmail"
                  type="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={recoveryEmail}
                  onChange={event => {
                    setRecoveryEmail(event.target.value)
                    setError('')
                  }}
                  placeholder="Enter your registered email"
                  className={inputClass}
                />
              </div>

              <p className="mt-3 text-xs leading-5 text-[#87756c]">
                Password recovery requires a configured
                authentication service.
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={primaryButtonClass}
            >
              {loading
                ? 'Checking...'
                : 'Continue Recovery'}

              <ArrowRight
                size={18}
                aria-hidden="true"
              />
            </button>

            <button
              type="button"
              onClick={backToLogin}
              className="flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold text-[#a62521] transition hover:underline"
            >
              <ArrowLeft
                size={17}
                aria-hidden="true"
              />
              Back to Login
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

/* ==========================================
   REACT APPLICATION ENTRY
========================================== */

ReactDOM.createRoot(
  document.getElementById('root')!,
).render(
  <React.StrictMode>
    <AdminLogin />
  </React.StrictMode>,
)
