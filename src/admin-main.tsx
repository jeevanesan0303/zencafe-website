
import React from 'react'
import ReactDOM from 'react-dom/client'

// Global styles
import './index.css'
import './admin/admin.css'

// Admin application
import AdminApp from './admin/AdminApp'

// Authentication
import { isAdminLoggedIn } from './admin-auth'

// Check admin authentication
const isAuthenticated = isAdminLoggedIn()

if (!isAuthenticated) {
  // Redirect unauthenticated users to admin login
  window.location.replace('/admin/login')
} else {
  // Find the root element
  const rootElement = document.getElementById('root')

  if (!rootElement) {
    throw new Error(
      'Root element not found. Check that admin.html contains <div id="root"></div>.'
    )
  }

  // Render the admin dashboard
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AdminApp />
    </React.StrictMode>
  )
}
