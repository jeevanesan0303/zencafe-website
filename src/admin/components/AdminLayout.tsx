
import {
  useState,
  type ReactNode,
} from 'react'

import type { AdminPage } from '../AdminApp'

import Header from './Header'
import Sidebar from './Sidebar'

import AdminAlert from '../utils/sweetAlert'

/* ==========================================
   TYPES
========================================== */

type Props = {
  children: ReactNode

  page: AdminPage

  onNavigate: (
    page: AdminPage
  ) => void

  query: string

  onQuery: (
    query: string
  ) => void

  onOpenSettings?: (
    tab: 'profile' | 'security'
  ) => void

  // Existing authentication logout function
  onLogout?: () => void | Promise<void>

  // SweetAlert confirmation from AdminApp
  onConfirmLogout?: (
    performLogout: () => void | Promise<void>
  ) => Promise<void>
}

/* ==========================================
   ADMIN LAYOUT
========================================== */

export default function AdminLayout({
  children,
  page,
  onNavigate,
  query,
  onQuery,
  onOpenSettings,
  onLogout,
  onConfirmLogout,
}: Props) {
  /* ==========================================
     MOBILE SIDEBAR STATE
  ========================================== */

  const [open, setOpen] =
    useState(false)

  /* ==========================================
     PAGE NAVIGATION
  ========================================== */

  const handleNavigate = (
    nextPage: AdminPage
  ) => {
    onNavigate(nextPage)
    setOpen(false)
  }

  /* ==========================================
     OPEN PROFILE / SECURITY SETTINGS
  ========================================== */

  const handleOpenSettings = (
    tab: 'profile' | 'security'
  ) => {
    onOpenSettings?.(tab)
    setOpen(false)
  }

  /* ==========================================
     LOGOUT WITH SWEETALERT2
  ========================================== */

  const handleLogout = async () => {
    setOpen(false)

    // Prevent misleading logout confirmation
    // if no authentication logout function exists.
    if (!onLogout) {
      await AdminAlert.warning(
        'Logout Not Connected',
        'The admin authentication logout function has not been connected yet.'
      )

      return
    }

    // Use the centralized confirmation
    // supplied by AdminApp.
    if (onConfirmLogout) {
      await onConfirmLogout(onLogout)
      return
    }

    // Fallback confirmation using SweetAlert2
    const confirmed =
      await AdminAlert.confirm(
        'Logout Confirmation',
        'Are you sure you want to log out of Zen Café Admin?',
        'Yes, Logout'
      )

    if (!confirmed) return

    try {
      await onLogout()
    } catch (error) {
      console.error(
        'Admin logout failed:',
        error
      )

      await AdminAlert.error(
        'Logout Failed',
        'Unable to log out. Please try again.'
      )
    }
  }

  /* ==========================================
     LAYOUT
  ========================================== */

  return (
    <div className="za-shell">

      {/* SIDEBAR */}

      <Sidebar
        page={page}
        onNavigate={handleNavigate}
        open={open}
        onClose={() =>
          setOpen(false)
        }
      />

      {/* MAIN CONTENT */}

      <div className="za-main">

        {/* HEADER */}

        <Header
          page={page}
          query={query}
          onQuery={onQuery}
          onMenu={() =>
            setOpen(true)
          }
          onNavigate={handleNavigate}
          onOpenSettings={
            handleOpenSettings
          }
          onLogout={() => {
            void handleLogout()
          }}
        />

        {/* PAGE CONTENT */}

        <main className="za-content">
          {children}
        </main>

      </div>

    </div>
  )
}
