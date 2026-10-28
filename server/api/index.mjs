import {
  handleGetProducts,
  handleGetProductById,
  handleCreateProduct,
  handleUpdateProduct,
  handleDeleteProduct,
} from './products.mjs'

import {
  handleGetOffers,
  handleGetOfferById,
  handleCreateOffer,
  handleUpdateOffer,
  handleDeleteOffer,
} from './offers.mjs'

import { handleBookingsRoute } from './bookings.mjs'
import { handleGalleryRoute } from './gallery.mjs'
import { handleGamesRoute } from './games.mjs'
import { handleSettingsRoute } from './settings.mjs'

import {
  handleAdminLogin,
  handleAdminLogout,
  handleAdminCheck,
} from '../auth.mjs'

import {
  handleCustomerRegister,
  handleCustomerVerify,
  handleResendVerification,
  handleCustomerMe,
  handleCustomerLogout,
  handleGalleryCheckEmail,
} from './auth.mjs'

import { isDbInMemory, getDbPool } from '../db.mjs'

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 10 * 1024 * 1024) {
        // 10MB limit
        reject(new Error('Payload Too Large'))
      }
    })

    req.on('end', () => {
      if (!body) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(new Error('Invalid JSON: ' + err.message))
      }
    })

    req.on('error', reject)
  })
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token',
  })
  res.end(JSON.stringify(data))
}

export async function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname.replace(/\/+$/, '') || '/'

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, x-admin-token',
      'Access-Control-Max-Age': '86400',
    })
    res.end()
    return true
  }

  // Health endpoint
  if (pathname === '/api/health') {
    let dbStatus = 'disconnected'
    try {
      const pool = await getDbPool()
      await pool.query('SELECT 1')
      dbStatus = isDbInMemory() ? 'in-memory-postgres' : 'connected-postgres'
    } catch (err) {
      dbStatus = 'disconnected: ' + (err.code || err.message)
    }

    sendJson(res, 200, {
      ok: dbStatus.startsWith('connected') || dbStatus.startsWith('in-memory'),
      service: 'zen-cafe-api',
      database: dbStatus,
      timestamp: new Date().toISOString(),
    })
    return true
  }

  // Admin login endpoint
  if (pathname === '/api/admin/login') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' })
      return true
    }
    const body = await parseJsonBody(req)
    const result = await handleAdminLogin(body, req)
    sendJson(res, result.status, result.body)
    return true
  }

  // Admin logout endpoint
  if (pathname === '/api/admin/logout') {
    const result = await handleAdminLogout(req)
    sendJson(res, result.status, result.body)
    return true
  }

  // Admin auth check endpoint
  if (pathname === '/api/admin/check') {
    const result = await handleAdminCheck(req)
    sendJson(res, result.status, result.body)
    return true
  }

  // ==========================================
  // Customer Auth Endpoints (Phase 4)
  // ==========================================

  // POST /api/auth/register
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req)
      const result = await handleCustomerRegister(req, res, body)
      sendJson(res, result.status, result.body)
      return true
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message })
      return true
    }
  }

  // GET /api/auth/verify or POST /api/auth/verify
  if (pathname === '/api/auth/verify') {
    if (req.method === 'GET') {
      const rawToken = url.searchParams.get('token')
      const result = await handleCustomerVerify(req, res, rawToken)
      sendJson(res, result.status, result.body)
      return true
    }
    if (req.method === 'POST') {
      const body = await parseJsonBody(req)
      const rawToken = body.token || url.searchParams.get('token')
      const result = await handleCustomerVerify(req, res, rawToken)
      sendJson(res, result.status, result.body)
      return true
    }
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return true
  }

  // POST /api/auth/resend-verification
  if (pathname === '/api/auth/resend-verification' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req)
      const result = await handleResendVerification(req, res, body)
      sendJson(res, result.status, result.body)
      return true
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message })
      return true
    }
  }

  // GET /api/auth/me
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const result = await handleCustomerMe(req, res)
    sendJson(res, result.status, result.body)
    return true
  }

  // POST /api/auth/logout
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const result = await handleCustomerLogout(req, res)
    sendJson(res, result.status, result.body)
    return true
  }

  // POST /api/gallery/check-email (Gallery readiness)
  if (pathname === '/api/gallery/check-email' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req)
      const result = await handleGalleryCheckEmail(req, res, body)
      sendJson(res, result.status, result.body)
      return true
    } catch (err) {
      sendJson(res, 400, { success: false, message: err.message })
      return true
    }
  }

  // ==========================================
  // /api/products endpoints
  // ==========================================
  if (pathname === '/api/products') {
    try {
      if (req.method === 'GET') {
        const result = await handleGetProducts(url, req)
        sendJson(res, result.status, result.body)
        return true
      }

      if (req.method === 'POST') {
        const body = await parseJsonBody(req)
        const result = await handleCreateProduct(body, req)
        sendJson(res, result.status, result.body)
        return true
      }

      sendJson(res, 405, { error: 'Method Not Allowed' })
      return true
    } catch (err) {
      console.error('API Error in /api/products:', err)
      sendJson(res, 500, {
        success: false,
        error: err.message || 'Internal Server Error',
      })
      return true
    }
  }

  // /api/products/:id
  const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/)
  if (productMatch) {
    const id = decodeURIComponent(productMatch[1])
    try {
      if (req.method === 'GET') {
        const result = await handleGetProductById(id)
        sendJson(res, result.status, result.body)
        return true
      }

      if (req.method === 'PUT' || req.method === 'PATCH') {
        const body = await parseJsonBody(req)
        const result = await handleUpdateProduct(id, body, req)
        sendJson(res, result.status, result.body)
        return true
      }

      if (req.method === 'DELETE') {
        const result = await handleDeleteProduct(id, req)
        sendJson(res, result.status, result.body)
        return true
      }

      sendJson(res, 405, { error: 'Method Not Allowed' })
      return true
    } catch (err) {
      console.error(`API Error in /api/products/${id}:`, err)
      sendJson(res, 500, {
        success: false,
        error: err.message || 'Internal Server Error',
      })
      return true
    }
  }

  // ==========================================
  // /api/offers endpoints
  // ==========================================
  if (pathname === '/api/offers') {
    try {
      if (req.method === 'GET') {
        const result = await handleGetOffers(url, req)
        sendJson(res, result.status, result.body)
        return true
      }

      if (req.method === 'POST') {
        const body = await parseJsonBody(req)
        const result = await handleCreateOffer(body, req)
        sendJson(res, result.status, result.body)
        return true
      }

      sendJson(res, 405, { error: 'Method Not Allowed' })
      return true
    } catch (err) {
      console.error('API Error in /api/offers:', err)
      sendJson(res, 500, {
        success: false,
        error: err.message || 'Internal Server Error',
      })
      return true
    }
  }

  // /api/offers/:id
  const offerMatch = pathname.match(/^\/api\/offers\/([^/]+)$/)
  if (offerMatch) {
    const id = decodeURIComponent(offerMatch[1])
    try {
      if (req.method === 'GET') {
        const result = await handleGetOfferById(id)
        sendJson(res, result.status, result.body)
        return true
      }

      if (req.method === 'PUT' || req.method === 'PATCH') {
        const body = await parseJsonBody(req)
        const result = await handleUpdateOffer(id, body, req)
        sendJson(res, result.status, result.body)
        return true
      }

      if (req.method === 'DELETE') {
        const result = await handleDeleteOffer(id, req)
        sendJson(res, result.status, result.body)
        return true
      }

      sendJson(res, 405, { error: 'Method Not Allowed' })
      return true
    } catch (err) {
      console.error(`API Error in /api/offers/${id}:`, err)
      sendJson(res, 500, {
        success: false,
        error: err.message || 'Internal Server Error',
      })
      return true
    }
  }

  // ==========================================
  // /api/bookings endpoints
  // ==========================================
  if (pathname.startsWith('/api/bookings')) {
    await handleBookingsRoute(req, res, url)
    return true
  }

  // ==========================================
  // /api/gallery endpoints
  // ==========================================
  if (pathname.startsWith('/api/gallery')) {
    const handled = await handleGalleryRoute(req, res, url)
    if (handled) return true
  }

  // ==========================================
  // /api/games endpoints (Phase 6)
  // ==========================================
  if (pathname.startsWith('/api/games')) {
    const handled = await handleGamesRoute(req, res, url)
    if (handled) return true
  }

  // ==========================================
  // /api/settings endpoints & admin password change (Phase 6)
  // ==========================================
  if (pathname.startsWith('/api/settings') || pathname === '/api/admin/change-password') {
    const handled = await handleSettingsRoute(req, res, url)
    if (handled) return true
  }

  // Unhandled /api route
  if (pathname.startsWith('/api')) {
    // If an external proxy target is specified and running, let caller handle or return 404
    return false
  }

  return false
}
