// server/api/settings.mjs
// Zen Café — Phase 6: Website Settings & Admin Profile Integration API

import { getDbPool } from '../db.mjs'
import {
  verifyAdminRequest,
  verifyPassword,
  updateAdminPassword,
} from '../auth.mjs'

export const DEFAULT_SETTINGS = {
  cafeName: 'Zen Café',
  tagline: 'Good Food Brings People Together',
  email: 'admin@zencafe.com',
  phone: '011 234 5678',
  address: 'No. 42, Lotus Grove Avenue, Colombo 07, Sri Lanka',
  openingTime: '09:00',
  closingTime: '22:00',
  currency: 'LKR',

  bookingsEnabled: true,
  autoConfirmBookings: false,
  maxGuests: 20,
  defaultBookingDuration: 2,

  emailNotifications: true,
  bookingNotifications: true,
  promotionNotifications: false,

  adminName: 'Admin',
  adminEmail: 'admin@zencafe.com',
  adminAvatar: '',
}

const PUBLIC_KEYS = new Set([
  'cafeName',
  'tagline',
  'email',
  'phone',
  'address',
  'openingTime',
  'closingTime',
  'currency',
  'bookingsEnabled',
  'autoConfirmBookings',
  'maxGuests',
  'defaultBookingDuration',
])

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token',
  })
  res.end(JSON.stringify(data))
}

function jsonError(res, message, status = 400) {
  jsonResponse(res, { success: false, error: message, message }, status)
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload Too Large'))
      }
    })
    req.on('end', () => {
      if (!body) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(new Error('Invalid JSON payload: ' + err.message))
      }
    })
    req.on('error', reject)
  })
}

function filterPublicSettings(settings) {
  const safe = {}
  for (const key of PUBLIC_KEYS) {
    if (key in settings) {
      safe[key] = settings[key]
    }
  }
  return safe
}

/**
 * Main Settings Route Handler
 */
export async function handleSettingsRoute(req, res, parsedUrl) {
  const pool = await getDbPool()
  const pathname = parsedUrl.pathname
  const method = req.method

  // 1. GET /api/settings (Public: read safe café settings)
  if (pathname === '/api/settings' && method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT key, value, updated_at
         FROM public.website_settings
         WHERE key = 'cafe_info'`
      )

      let settings = { ...DEFAULT_SETTINGS }
      if (result.rows.length > 0) {
        const rowVal = typeof result.rows[0].value === 'string'
          ? JSON.parse(result.rows[0].value)
          : result.rows[0].value
        settings = { ...settings, ...rowVal }
      }

      return jsonResponse(res, {
        success: true,
        settings: filterPublicSettings(settings),
        updatedAt: result.rows[0]?.updated_at
          ? new Date(result.rows[0].updated_at).toISOString()
          : new Date().toISOString(),
      })
    } catch (err) {
      console.error('Error fetching public website settings:', err)
      return jsonError(res, 'Failed to fetch website settings.', 500)
    }
  }

  // 2. GET /api/settings/admin (Admin: read complete settings)
  if (pathname === '/api/settings/admin' && method === 'GET') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }

    try {
      const result = await pool.query(
        `SELECT key, value, updated_at
         FROM public.website_settings
         WHERE key = 'cafe_info'`
      )

      let settings = { ...DEFAULT_SETTINGS }
      if (result.rows.length > 0) {
        const rowVal = typeof result.rows[0].value === 'string'
          ? JSON.parse(result.rows[0].value)
          : result.rows[0].value
        settings = { ...settings, ...rowVal }
      }

      return jsonResponse(res, {
        success: true,
        settings,
        updatedAt: result.rows[0]?.updated_at
          ? new Date(result.rows[0].updated_at).toISOString()
          : new Date().toISOString(),
      })
    } catch (err) {
      console.error('Error fetching admin website settings:', err)
      return jsonError(res, 'Failed to fetch admin website settings.', 500)
    }
  }

  // 3. PUT or POST /api/settings (Admin: update website settings)
  if (pathname === '/api/settings' && (method === 'PUT' || method === 'POST')) {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }

    try {
      const body = await parseJsonBody(req)

      // Validate inputs if provided
      if ('email' in body && body.email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim())) {
          return jsonError(res, 'Please provide a valid café email address.', 400)
        }
      }

      if ('adminEmail' in body && body.adminEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.adminEmail).trim())) {
          return jsonError(res, 'Please provide a valid administrator email address.', 400)
        }
      }

      if ('maxGuests' in body && body.maxGuests !== undefined) {
        const maxGuests = Number(body.maxGuests)
        if (!Number.isInteger(maxGuests) || maxGuests < 1) {
          return jsonError(res, 'Maximum guests per booking must be at least 1.', 400)
        }
      }

      if ('defaultBookingDuration' in body && body.defaultBookingDuration !== undefined) {
        const duration = Number(body.defaultBookingDuration)
        if (!Number.isFinite(duration) || duration <= 0) {
          return jsonError(res, 'Default booking duration must be greater than zero.', 400)
        }
      }

      // Fetch existing stored settings for non-destructive partial updates
      const existingRes = await pool.query(
        `SELECT key, value FROM public.website_settings WHERE key = 'cafe_info'`
      )

      let currentSettings = { ...DEFAULT_SETTINGS }
      if (existingRes.rows.length > 0) {
        const parsedExisting = typeof existingRes.rows[0].value === 'string'
          ? JSON.parse(existingRes.rows[0].value)
          : existingRes.rows[0].value
        currentSettings = { ...currentSettings, ...parsedExisting }
      }

      // Merge changes
      const mergedSettings = {
        ...currentSettings,
        ...body,
      }

      // Ensure types are normalized
      if (mergedSettings.maxGuests) mergedSettings.maxGuests = Number(mergedSettings.maxGuests)
      if (mergedSettings.defaultBookingDuration) mergedSettings.defaultBookingDuration = Number(mergedSettings.defaultBookingDuration)
      if (typeof mergedSettings.bookingsEnabled === 'string') mergedSettings.bookingsEnabled = mergedSettings.bookingsEnabled === 'true'
      if (typeof mergedSettings.autoConfirmBookings === 'string') mergedSettings.autoConfirmBookings = mergedSettings.autoConfirmBookings === 'true'

      const valueJson = JSON.stringify(mergedSettings)

      const updateRes = await pool.query(
        `INSERT INTO public.website_settings (key, value, updated_at)
         VALUES ('cafe_info', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE
         SET value = $1::jsonb, updated_at = NOW()
         RETURNING key, value, updated_at`,
        [valueJson]
      )

      const savedRow = updateRes.rows[0]
      const savedSettings = typeof savedRow.value === 'string'
        ? JSON.parse(savedRow.value)
        : savedRow.value

      return jsonResponse(res, {
        success: true,
        message: 'Settings saved successfully.',
        settings: savedSettings,
        updatedAt: new Date(savedRow.updated_at).toISOString(),
      })
    } catch (err) {
      console.error('Error updating website settings:', err)
      return jsonError(res, err.message || 'Failed to update website settings.', 500)
    }
  }

  // 4. POST /api/admin/change-password (Admin security: change administrator password)
  if (pathname === '/api/admin/change-password' && method === 'POST') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }

    try {
      const body = await parseJsonBody(req)
      const currentPassword = String(body.currentPassword || '')
      const newPassword = String(body.newPassword || '')
      const confirmPassword = String(body.confirmPassword || '')

      if (!currentPassword) {
        return jsonError(res, 'Current password is required.', 400)
      }

      if (!verifyPassword(currentPassword)) {
        return jsonError(res, 'Current password is incorrect.', 400)
      }

      if (!newPassword || newPassword.length < 8) {
        return jsonError(res, 'New password must be at least 8 characters long.', 400)
      }

      if (confirmPassword && newPassword !== confirmPassword) {
        return jsonError(res, 'New password and confirmation do not match.', 400)
      }

      updateAdminPassword(newPassword, pool)

      return jsonResponse(res, {
        success: true,
        message: 'Administrator password updated successfully.',
      })
    } catch (err) {
      console.error('Error changing admin password:', err)
      return jsonError(res, err.message || 'Failed to update password.', 500)
    }
  }

  return false
}
