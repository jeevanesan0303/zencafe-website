
import {
  useRef,
  useState,
} from 'react'

import {
  CalendarDays,
  Gamepad2,
  House,
  Image as ImageIcon,
  LogOut,
  Settings,
  Tags,
  UtensilsCrossed,
  X,
} from 'lucide-react'

import { mockLogout } from '../../admin-auth'

import type { AdminPage } from '../AdminApp'

import AdminAlert from '../utils/sweetAlert'

/* ==========================================
   ZEN CAFÉ — SIDEBAR TYPES
========================================== */

type Props = {
  page: AdminPage
  onNavigate: (page: AdminPage) => void
  open: boolean
  onClose: () => void
}

/* ==========================================
   SIDEBAR NAVIGATION LINKS
========================================== */

const links: {
  id: AdminPage
  label: string
  icon: typeof House
}[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: House,
  },
  {
    id: 'products',
    label: 'Menu / Products',
    icon: UtensilsCrossed,
  },
  {
    id: 'offers',
    label: 'Offers & Promotions',
    icon: Tags,
  },
  {
    id: 'games',
    label: 'Games & Rewards',
    icon: Gamepad2,
  },
  {
    id: 'bookings',
    label: 'Room Bookings',
    icon: CalendarDays,
  },
  {
    id: 'gallery',
    label: 'Community Gallery',
    icon: ImageIcon,
  },
]

/* ==========================================
   SIDEBAR COMPONENT
========================================== */

export default function Sidebar({
  page,
  onNavigate,
  open,
  onClose,
}: Props) {
  /* ==========================================
     STATE
  ========================================== */

  const [loggingOut, setLoggingOut] =
    useState(false)

  const logoutLockRef = useRef(false)

  /* ==========================================
     PAGE NAVIGATION
  ========================================== */

  function navigate(nextPage: AdminPage) {
    onNavigate(nextPage)

    // Close sidebar after selecting a page
    onClose()
  }

  /* ==========================================
     LOGOUT WITH SWEETALERT2
  ========================================== */

  async function logout() {
    if (logoutLockRef.current) {
      return
    }

    logoutLockRef.current = true

    try {
      const confirmed =
        await AdminAlert.confirm(
          'Logout Confirmation',
          'Are you sure you want to log out of Zen Café Admin?',
          'Yes, Logout'
        )

      if (!confirmed) {
        return
      }

      setLoggingOut(true)

      try {
        // Preserve existing authentication logout
        await mockLogout()

        // Close mobile sidebar
        onClose()
      } catch (error) {
        console.error(
          'Admin logout failed:',
          error
        )

        await AdminAlert.error(
          'Logout Failed',
          'Unable to log out of Zen Café Admin. Please try again.'
        )
      } finally {
        setLoggingOut(false)
      }
    } finally {
      logoutLockRef.current = false
    }
  }

  /* ==========================================
     SIDEBAR UI
  ========================================== */

  return (
    <>
      {/* ======================================
          MOBILE BACKDROP
      ====================================== */}

      {open && (
        <button
          type="button"
          className="za-backdrop"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}

      {/* ======================================
          SIDEBAR
      ====================================== */}

      <aside
        className={`za-sidebar ${
          open ? 'za-sidebar-open' : ''
        }`}
      >
        {/* ====================================
            MOBILE CLOSE BUTTON
        ==================================== */}

        <button
          type="button"
          className="za-close"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X size={22} />
        </button>

        {/* ====================================
            BRAND
        ==================================== */}

        <div className="za-brand">
          <div className="za-brand-logo">
            <img
              src="/assets/zen-logo.png"
              alt="Zen Café logo"
            />
          </div>

          <strong>ZEN CAFÉ</strong>

          <span>
            ADMIN PANEL
          </span>
        </div>

        {/* ====================================
            MAIN NAVIGATION
        ==================================== */}

        <nav
          className="za-nav"
          aria-label="Admin navigation"
        >
          {links.map(link => {
            const Icon = link.icon

            const isActive =
              page === link.id

            return (
              <button
                key={link.id}
                type="button"
                className={`za-nav-link ${
                  isActive
                    ? 'active'
                    : ''
                }`}
                onClick={() =>
                  navigate(link.id)
                }
                aria-current={
                  isActive
                    ? 'page'
                    : undefined
                }
              >
                <Icon
                  size={21}
                  strokeWidth={2.3}
                />

                <span>
                  {link.label}
                </span>
              </button>
            )
          })}
        </nav>

        {/* ====================================
            SETTINGS AND LOGOUT
        ==================================== */}

        <div className="za-sidebar-secondary">
          {/* SETTINGS */}

          <button
            type="button"
            className={`za-nav-link ${
              page === 'settings'
                ? 'active'
                : ''
            }`}
            onClick={() =>
              navigate('settings')
            }
            aria-current={
              page === 'settings'
                ? 'page'
                : undefined
            }
          >
            <Settings
              size={21}
              strokeWidth={2.3}
            />

            <span>
              Settings
            </span>
          </button>

          {/* LOGOUT */}

          <button
            type="button"
            className="za-nav-link"
            disabled={loggingOut}
            onClick={() => {
              void logout()
            }}
          >
            <LogOut
              size={21}
              strokeWidth={2.3}
            />

            <span>
              {loggingOut
                ? 'Logging out...'
                : 'Logout'}
            </span>
          </button>
        </div>

        {/* ====================================
            BOTANICAL ILLUSTRATION AND QUOTE
        ==================================== */}

        <div
          className="za-sidebar-bottom"
          aria-hidden="true"
        >
          <svg
            className="za-leaf-art"
            viewBox="0 0 180 250"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g
              stroke="#D98261"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
            >
              {/* MAIN STEM */}

              <path d="M-18 265 C25 224 40 162 95 55" />

              {/* LEFT LEAF */}

              <path d="M9 234 C-6 188 2 148 27 112 C46 155 37 194 9 234Z" />
              <path d="M9 234 C14 187 19 149 27 112" />

              {/* RIGHT LEAF */}

              <path d="M27 202 C36 154 64 119 106 100 C104 146 75 183 27 202Z" />
              <path d="M27 202 C51 157 77 124 106 100" />

              {/* UPPER LEFT LEAF */}

              <path d="M44 162 C35 122 44 88 69 56 C83 97 72 132 44 162Z" />
              <path d="M44 162 C51 119 59 89 69 56" />

              {/* UPPER RIGHT LEAF */}

              <path d="M67 115 C72 77 96 44 133 24 C132 68 108 98 67 115Z" />
              <path d="M67 115 C91 76 112 46 133 24" />

              {/* BOTTOM LEAF */}

              <path d="M-18 250 C19 220 54 209 89 213 C61 244 24 256 -18 250Z" />
              <path d="M-18 250 C21 234 55 222 89 213" />

              {/* FINE INNER VEINS */}

              <path d="M17 193 L5 174" />
              <path d="M21 172 L34 157" />
              <path d="M49 166 L74 155" />
              <path d="M59 146 L87 135" />
              <path d="M53 123 L43 107" />
              <path d="M58 102 L72 88" />
              <path d="M86 85 L102 76" />
              <path d="M104 61 L119 53" />
              <path d="M22 234 L36 226" />
              <path d="M43 228 L58 219" />
            </g>
          </svg>

          <p className="za-sidebar-quote">
            <span>
              Good Food
            </span>

            <span>
              Brings People
            </span>

            <span>
              Together <b>♥</b>
            </span>
          </p>
        </div>
      </aside>
    </>
  )
}
