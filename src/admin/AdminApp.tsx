
import { useCallback, useState } from 'react'

import AdminLayout from './components/AdminLayout'

import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import AddProduct from './pages/AddProduct'
import Offers from './pages/Offers'
import Games from './pages/Games'
import Bookings from './pages/RoomBookings'
import Settings from './pages/Settings'

import type { SettingsTab } from './pages/Settings'

import AdminAlert from './utils/sweetAlert'

import './admin.css'

/* ==========================================
   ZEN CAFÉ — ADMIN PAGE TYPES
========================================== */

export type AdminPage =
  | 'dashboard'
  | 'products'
  | 'add-product'
  | 'offers'
  | 'games'
  | 'bookings'
  | 'settings'

/* ==========================================
   ZEN CAFÉ — ADMIN APPLICATION
========================================== */

export default function AdminApp() {
  /* ==========================================
     STATE
  ========================================== */

  const [page, setPage] = useState<AdminPage>(
    'dashboard'
  )

  const [query, setQuery] = useState<string>('')

  const [settingsTab, setSettingsTab] =
    useState<SettingsTab>('general')

  /* ==========================================
     SCROLL HELPER
  ========================================== */

  const scrollToTop = useCallback((): void => {
    window.scrollTo({
      top: 0,
      behavior: 'instant',
    })
  }, [])

  /* ==========================================
     PAGE NAVIGATION
  ========================================== */

  const navigate = useCallback(
    (nextPage: AdminPage): void => {
      setPage(nextPage)

      // Clear the previous section's search.
      setQuery('')

      // Normal Settings navigation opens
      // Café Information by default.
      if (nextPage === 'settings') {
        setSettingsTab('general')
      }

      scrollToTop()
    },
    [scrollToTop]
  )

  /* ==========================================
     OPEN SETTINGS FROM PROFILE MENU
  ========================================== */

  const openSettings = useCallback(
    (tab: 'profile' | 'security'): void => {
      // Preserve the requested Settings tab.
      setSettingsTab(tab)

      setPage('settings')
      setQuery('')

      scrollToTop()
    },
    [scrollToTop]
  )

  /* ==========================================
     SWEETALERT LOGOUT CONFIRMATION
  ========================================== */

  const confirmLogout = useCallback(
    async (
      performLogout: () => void | Promise<void>
    ): Promise<void> => {
      const confirmed = await AdminAlert.confirm(
        'Logout Confirmation',
        'Are you sure you want to log out of Zen Café Admin?',
        'Yes, Logout'
      )

      if (!confirmed) {
        return
      }

      try {
        await performLogout()
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
    },
    []
  )

  /* ==========================================
     PAGE RENDERING
  ========================================== */

  const renderPage = () => {
    switch (page) {
      /* --------------------------------------
         DASHBOARD
      -------------------------------------- */

      case 'dashboard':
        return (
          <Dashboard
            onNavigate={navigate}
            query={query}
          />
        )

      /* --------------------------------------
         MENU / PRODUCTS
      -------------------------------------- */

      case 'products':
        return (
          <Products
            onNavigate={navigate}
            query={query}
          />
        )

      /* --------------------------------------
         ADD PRODUCT
      -------------------------------------- */

      case 'add-product':
        return (
          <AddProduct
            onNavigate={navigate}
          />
        )

      /* --------------------------------------
         OFFERS & PROMOTIONS
      -------------------------------------- */

      case 'offers':
        return (
          <Offers
            onNavigate={navigate}
            query={query}
          />
        )

      /* --------------------------------------
         GAMES & REWARDS
      -------------------------------------- */

      case 'games':
        return (
          <Games
            query={query}
          />
        )

      /* --------------------------------------
         ROOM BOOKINGS
      -------------------------------------- */

      case 'bookings':
        return (
          <Bookings
            onNavigate={navigate}
            query={query}
          />
        )

      /* --------------------------------------
         SETTINGS
      -------------------------------------- */

      case 'settings':
        return (
          <Settings
            onNavigate={navigate}
            query={query}
            initialTab={settingsTab}
          />
        )

      /* --------------------------------------
         FALLBACK
      -------------------------------------- */

      default:
        return (
          <Dashboard
            onNavigate={navigate}
            query={query}
          />
        )
    }
  }

  /* ==========================================
     MAIN ADMIN LAYOUT
  ========================================== */

  return (
    <AdminLayout
      page={page}
      onNavigate={navigate}
      query={query}
      onQuery={setQuery}
      onOpenSettings={openSettings}
      onConfirmLogout={confirmLogout}
    >
      {renderPage()}
    </AdminLayout>
  )
}
