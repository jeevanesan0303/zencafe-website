
import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  Bell,
  CalendarDays,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Settings,
  UserRound,
  X,
} from 'lucide-react'

import type { AdminPage } from '../AdminApp'

import {
  readCafeSettings,
  subscribeCafeSettings,
} from '../../data/settingsStore'

import {
  readRoomBookings,
  subscribeRoomBookings,
} from '../../data/bookingStore'

import AdminAlert from '../utils/sweetAlert'

/* ==========================================
   TYPES
========================================== */

type SettingsDestination =
  | 'profile'
  | 'security'

type Props = {
  onMenu: () => void

  query: string

  onQuery: (query: string) => void

  page: AdminPage

  onNavigate?: (
    page: AdminPage
  ) => void

  onOpenSettings?: (
    tab: SettingsDestination
  ) => void

  // Logout confirmation and authentication
  // are handled by AdminLayout.
  onLogout?: () => void | Promise<void>
}

/* ==========================================
   HEADER COMPONENT
========================================== */

export default function Header({
  onMenu,
  query,
  onQuery,
  page,
  onNavigate,
  onOpenSettings,
  onLogout,
}: Props) {
  /* ==========================================
     STATE
  ========================================== */

  const [settings, setSettings] =
    useState(
      () => readCafeSettings()
    )

  const [
    pendingBookings,
    setPendingBookings,
  ] = useState(() =>
    readRoomBookings().filter(
      booking =>
        booking.status === 'pending'
    ).length
  )

  const [
    profileOpen,
    setProfileOpen,
  ] = useState(false)

  const [
    notificationsOpen,
    setNotificationsOpen,
  ] = useState(false)

  const [loggingOut, setLoggingOut] =
    useState(false)

  /* ==========================================
     REFS
  ========================================== */

  const profileRef =
    useRef<HTMLDivElement>(null)

  const notificationRef =
    useRef<HTMLDivElement>(null)

  /* ==========================================
     SETTINGS SUBSCRIPTION
  ========================================== */

  useEffect(() => {
    return subscribeCafeSettings(() => {
      setSettings(
        readCafeSettings()
      )
    })
  }, [])

  /* ==========================================
     BOOKING NOTIFICATION SUBSCRIPTION
  ========================================== */

  useEffect(() => {
    return subscribeRoomBookings(() => {
      const count =
        readRoomBookings().filter(
          booking =>
            booking.status === 'pending'
        ).length

      setPendingBookings(count)
    })
  }, [])

  /* ==========================================
     CLOSE DROPDOWNS ON OUTSIDE CLICK
  ========================================== */

  useEffect(() => {
    function handleOutsideClick(
      event: MouseEvent
    ) {
      const target =
        event.target as Node

      if (
        profileRef.current &&
        !profileRef.current.contains(target)
      ) {
        setProfileOpen(false)
      }

      if (
        notificationRef.current &&
        !notificationRef.current.contains(target)
      ) {
        setNotificationsOpen(false)
      }
    }

    function handleEscape(
      event: KeyboardEvent
    ) {
      if (event.key === 'Escape') {
        setProfileOpen(false)
        setNotificationsOpen(false)
      }
    }

    document.addEventListener(
      'mousedown',
      handleOutsideClick
    )

    document.addEventListener(
      'keydown',
      handleEscape
    )

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick
      )

      document.removeEventListener(
        'keydown',
        handleEscape
      )
    }
  }, [])

  /* ==========================================
     CLOSE DROPDOWNS
  ========================================== */

  function closeDropdowns() {
    setProfileOpen(false)
    setNotificationsOpen(false)
  }

  /* ==========================================
     PAGE NAVIGATION
  ========================================== */

  function navigateTo(
    pageName: AdminPage
  ) {
    closeDropdowns()

    onNavigate?.(pageName)
  }

  /* ==========================================
     SETTINGS NAVIGATION
  ========================================== */

  function openSettingsTab(
    tab: SettingsDestination
  ) {
    closeDropdowns()

    if (onOpenSettings) {
      onOpenSettings(tab)
    } else {
      onNavigate?.('settings')
    }
  }

  /* ==========================================
     LOGOUT
  ========================================== */

  async function handleLogout() {
    if (loggingOut) return

    closeDropdowns()

    if (!onLogout) {
      await AdminAlert.warning(
        'Logout Not Connected',
        'The administrator logout function has not been connected yet.'
      )

      return
    }

    setLoggingOut(true)

    try {
      // AdminLayout handles SweetAlert
      // confirmation and the real logout.
      await onLogout()
    } catch (error) {
      console.error(
        'Header logout error:',
        error
      )

      await AdminAlert.error(
        'Logout Failed',
        'Unable to complete the logout request.'
      )
    } finally {
      setLoggingOut(false)
    }
  }

  /* ==========================================
     ADMIN PROFILE INFORMATION
  ========================================== */

  const adminName =
    settings.adminName?.trim() ||
    'Admin'

  const adminEmail =
    settings.adminEmail?.trim() ||
    'admin@zencafe.com'

  const initials = adminName
    .split(/\s+/)
    .map(part =>
      part.charAt(0)
    )
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const adminAvatar =
    settings.adminAvatar || ''

  /* ==========================================
     HEADER UI
  ========================================== */

  return (
    <header className="za-header">

      {/* MOBILE NAVIGATION */}

      <button
        type="button"
        className="za-icon-button"
        aria-label="Open navigation"
        onClick={onMenu}
      >
        <Menu size={24} />
      </button>

      {/* SEARCH BAR */}

      <label className="za-search">

        <Search size={20} />

        <input
          aria-label="Search dashboard"
          placeholder={
            page === 'dashboard'
              ? 'Search products, offers, or bookings...'
              : 'Search this section...'
          }
          value={query}
          onChange={event =>
            onQuery(event.target.value)
          }
        />

      </label>

      {/* HEADER RIGHT */}

      <div className="za-header-right">

        {/* NOTIFICATION DROPDOWN */}

        <div
          className="za-header-dropdown-wrap"
          ref={notificationRef}
        >

          <button
            type="button"
            className="za-notification za-notification-button"
            aria-label="Open notifications"
            aria-expanded={
              notificationsOpen
            }
            aria-haspopup="true"
            onClick={() => {
              setNotificationsOpen(
                previous => !previous
              )

              setProfileOpen(false)
            }}
          >
            <Bell size={23} />

            {pendingBookings > 0 && (
              <span className="za-notification-badge">
                {pendingBookings > 9
                  ? '9+'
                  : pendingBookings}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="za-header-dropdown za-notification-dropdown">

              {/* NOTIFICATION HEADER */}

              <div className="za-dropdown-heading">

                <div>
                  <strong>
                    Notifications
                  </strong>

                  <small>
                    Zen Café Admin
                  </small>
                </div>

                <button
                  type="button"
                  className="za-dropdown-close"
                  aria-label="Close notifications"
                  onClick={() =>
                    setNotificationsOpen(false)
                  }
                >
                  <X size={17} />
                </button>

              </div>

              {/* NOTIFICATION CONTENT */}

              <div className="za-notification-content">

                <div className="za-notification-item">

                  <span className="za-notification-item-icon">
                    <CalendarDays size={20} />
                  </span>

                  <div>

                    <strong>
                      {pendingBookings > 0
                        ? `${pendingBookings} Pending Booking${
                            pendingBookings === 1
                              ? ''
                              : 's'
                          }`
                        : 'No Pending Bookings'}
                    </strong>

                    <p>
                      {pendingBookings > 0
                        ? 'You have room reservations waiting for confirmation.'
                        : 'Your room bookings are up to date.'}
                    </p>

                  </div>

                </div>

              </div>

              {/* NOTIFICATION FOOTER */}

              <button
                type="button"
                className="za-dropdown-footer-button"
                onClick={() =>
                  navigateTo('bookings')
                }
              >
                View Room Bookings
              </button>

            </div>
          )}

        </div>

        {/* ADMIN PROFILE DROPDOWN */}

        <div
          className="za-header-dropdown-wrap"
          ref={profileRef}
        >

          <button
            type="button"
            className="za-profile-trigger"
            aria-label="Open admin profile menu"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => {
              setProfileOpen(
                previous => !previous
              )

              setNotificationsOpen(false)
            }}
          >

            {/* PROFILE AVATAR */}

            <span className="za-avatar">

              {adminAvatar ? (
                <img
                  src={adminAvatar}
                  alt={adminName}
                />
              ) : (
                initials || 'A'
              )}

            </span>

            {/* PROFILE DETAILS */}

            <span className="za-user">

              <strong>
                {adminName}
              </strong>

              <small>
                {adminEmail}
              </small>

            </span>

            <ChevronDown
              size={17}
              className={`za-user-chevron ${
                profileOpen
                  ? 'is-open'
                  : ''
              }`}
            />

          </button>

          {/* PROFILE DROPDOWN */}

          {profileOpen && (
            <div
              className="za-header-dropdown za-profile-dropdown"
              role="menu"
              aria-label="Administrator options"
            >

              {/* PROFILE SUMMARY */}

              <div className="za-profile-dropdown-top">

                <div className="za-profile-dropdown-avatar">

                  {adminAvatar ? (
                    <img
                      src={adminAvatar}
                      alt={adminName}
                    />
                  ) : (
                    initials || 'A'
                  )}

                </div>

                <div>

                  <strong>
                    {adminName}
                  </strong>

                  <small>
                    {adminEmail}
                  </small>

                  <span>
                    Administrator
                  </span>

                </div>

              </div>

              {/* PROFILE ACTIONS */}

              <div className="za-profile-dropdown-links">

                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    openSettingsTab('profile')
                  }
                >
                  <UserRound size={18} />
                  My Profile
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    openSettingsTab('security')
                  }
                >
                  <Settings size={18} />
                  Account Settings
                </button>

              </div>

              {/* LOGOUT */}

              <div className="za-profile-dropdown-bottom">

                <button
                  type="button"
                  role="menuitem"
                  className="za-profile-logout"
                  disabled={loggingOut}
                  onClick={() => {
                    void handleLogout()
                  }}
                >
                  <LogOut size={18} />

                  {loggingOut
                    ? 'Logging out...'
                    : 'Logout'}
                </button>

              </div>

            </div>
          )}

        </div>

      </div>

    </header>
  )
}
