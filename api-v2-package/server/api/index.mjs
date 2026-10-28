
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
import { handleAdminNotificationsRoute } from './notifications.mjs'

/* =========================================================
   ZEN CAFÉ API ROUTER

   Community Gallery:
   - Customer registers once
   - Customer verifies email once
   - Returning customers check registered email
   - No gallery login or magic-link routes
   - No customer session required for photo upload
   - Upload eligibility enforced by gallery.mjs
========================================================= */

const MAX_JSON_BYTES = 1024 * 1024

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false

    const declaredSize = Number(
      req.headers['content-length'] || 0
    )

    if (declaredSize > MAX_JSON_BYTES) {
      reject(new Error('Payload Too Large'))
      req.resume()
      return
    }

    req.on('data', chunk => {
      if (settled) return

      size += chunk.length

      if (size > MAX_JSON_BYTES) {
        settled = true
        reject(new Error('Payload Too Large'))
        req.resume()
        return
      }

      chunks.push(chunk)
    })

    req.on('end', () => {
      if (settled) return
      settled = true

      const body = Buffer.concat(chunks).toString('utf8')

      if (!body.trim()) {
        resolve({})
        return
      }

      try {
        const parsed = JSON.parse(body)

        if (
          parsed === null ||
          typeof parsed !== 'object' ||
          Array.isArray(parsed)
        ) {
          reject(new Error('JSON body must be an object.'))
          return
        }

        resolve(parsed)
      } catch (error) {
        reject(
          new Error(
            error instanceof SyntaxError
              ? 'Invalid JSON body.'
              : error.message
          )
        )
      }
    })

    req.on('error', error => {
      if (settled) return
      settled = true
      reject(error)
    })

    req.on('aborted', () => {
      if (settled) return
      settled = true
      reject(new Error('Request interrupted.'))
    })
  })
}

function sendJson(res, status, data) {
  if (res.headersSent || res.writableEnded) return

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods':
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-admin-token, x-customer-token',
    'X-Content-Type-Options': 'nosniff',
  })

  res.end(JSON.stringify(data))
}

function sendMethodNotAllowed(res) {
  sendJson(res, 405, {
    success: false,
    error: 'Method Not Allowed',
  })

  return true
}

function sendBodyError(res, error) {
  const isTooLarge =
    error?.message === 'Payload Too Large'

  sendJson(res, isTooLarge ? 413 : 400, {
    success: false,
    error: isTooLarge
      ? 'Request body is too large.'
      : error?.message || 'Invalid request body.',
  })

  return true
}

async function handleJsonEndpoint(
  req,
  res,
  handler
) {
  try {
    const body = await parseJsonBody(req)
    const result = await handler(body)

    sendJson(res, result.status, result.body)
  } catch (error) {
    return sendBodyError(res, error)
  }

  return true
}

export async function handleApiRequest(req, res) {
  const url = new URL(
    req.url,
    `http://${req.headers.host || 'localhost'}`
  )

  const pathname =
    url.pathname.replace(/\/+$/, '') || '/'

  /* =======================================================
     CORS PREFLIGHT
  ======================================================= */

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods':
        'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, x-admin-token, x-customer-token',
      'Access-Control-Max-Age': '86400',
    })

    res.end()
    return true
  }

  /* =======================================================
     HEALTH
  ======================================================= */

  if (pathname === '/api/health') {
    if (req.method !== 'GET') {
      return sendMethodNotAllowed(res)
    }

    let dbStatus = 'disconnected'

    try {
      const pool = await getDbPool()
      await pool.query('SELECT 1')

      dbStatus = isDbInMemory()
        ? 'in-memory-postgres'
        : 'connected-postgres'
    } catch (error) {
      dbStatus =
        'disconnected: ' +
        (error.code || error.message)
    }

    sendJson(res, 200, {
      ok:
        dbStatus.startsWith('connected') ||
        dbStatus.startsWith('in-memory'),
      service: 'zen-cafe-api',
      database: dbStatus,
      timestamp: new Date().toISOString(),
    })

    return true
  }

  /* =======================================================
     ADMIN AUTHENTICATION
  ======================================================= */

  if (pathname === '/api/admin/login') {
    if (req.method !== 'POST') {
      return sendMethodNotAllowed(res)
    }

    return handleJsonEndpoint(
      req,
      res,
      body => handleAdminLogin(body, req)
    )
  }

  if (pathname === '/api/admin/logout') {
    const result = await handleAdminLogout(req)

    sendJson(res, result.status, result.body)
    return true
  }

  if (pathname === '/api/admin/check') {
    const result = await handleAdminCheck(req)

    sendJson(res, result.status, result.body)
    return true
  }

  /* =======================================================
     CUSTOMER REGISTRATION

     POST /api/auth/register
  ======================================================= */

  if (pathname === '/api/auth/register') {
    if (req.method !== 'POST') {
      return sendMethodNotAllowed(res)
    }

    return handleJsonEndpoint(
      req,
      res,
      body => handleCustomerRegister(req, res, body)
    )
  }

  /* =======================================================
     CUSTOMER EMAIL VERIFICATION

     GET /api/auth/verify?token=...
     POST /api/auth/verify
  ======================================================= */

  if (pathname === '/api/auth/verify') {
    if (req.method === 'GET') {
      const token = url.searchParams.get('token')

      const result = await handleCustomerVerify(
        req,
        res,
        token
      )

      sendJson(res, result.status, result.body)
      return true
    }

    if (req.method === 'POST') {
      return handleJsonEndpoint(
        req,
        res,
        async body => {
          const token =
            body.token ||
            url.searchParams.get('token')

          return handleCustomerVerify(
            req,
            res,
            token
          )
        }
      )
    }

    return sendMethodNotAllowed(res)
  }

  /* =======================================================
     RESEND CUSTOMER VERIFICATION EMAIL

     POST /api/auth/resend-verification
  ======================================================= */

  if (
    pathname === '/api/auth/resend-verification'
  ) {
    if (req.method !== 'POST') {
      return sendMethodNotAllowed(res)
    }

    return handleJsonEndpoint(
      req,
      res,
      body => handleResendVerification(req, res, body)
    )
  }

  /* =======================================================
     EXISTING CUSTOMER SESSION ROUTES

     Retained for compatibility with the existing
     registration and customer account functionality.

     These routes are NOT required for gallery uploads.
  ======================================================= */

  if (pathname === '/api/auth/me') {
    if (req.method !== 'GET') {
      return sendMethodNotAllowed(res)
    }

    const result = await handleCustomerMe(req, res)

    sendJson(res, result.status, result.body)
    return true
  }

  if (pathname === '/api/auth/logout') {
    if (req.method !== 'POST') {
      return sendMethodNotAllowed(res)
    }

    const result = await handleCustomerLogout(req, res)

    sendJson(res, result.status, result.body)
    return true
  }

  /* =======================================================
     DISABLE OLD GALLERY LOGIN ROUTES

     No Returning Customer login.
     No magic-link sign-in.
  ======================================================= */

  if (
    pathname === '/api/auth/gallery-login/request' ||
    pathname === '/api/auth/gallery-login/verify'
  ) {
    sendJson(res, 410, {
      success: false,
      error:
        'Gallery sign-in has been discontinued. Please use the Community Gallery email check.',
    })

    return true
  }

  /* =======================================================
     COMMUNITY GALLERY EMAIL CHECK

     POST /api/gallery/check-email

     Checks:
     - Registered customer
     - Verified email
     - Active customer
     - Upload cooldown

     No customer session required.

     This is handled here ONLY.
  ======================================================= */

  if (pathname === '/api/gallery/check-email') {
    if (req.method !== 'POST') {
      return sendMethodNotAllowed(res)
    }

    return handleJsonEndpoint(
      req,
      res,
      body => handleGalleryCheckEmail(req, res, body)
    )
  }

  /* =======================================================
     PRODUCTS
  ======================================================= */

  if (pathname === '/api/products') {
    try {
      if (req.method === 'GET') {
        const result = await handleGetProducts(
          url,
          req
        )

        sendJson(res, result.status, result.body)
        return true
      }

      if (req.method === 'POST') {
        return handleJsonEndpoint(
          req,
          res,
          body => handleCreateProduct(body, req)
        )
      }

      return sendMethodNotAllowed(res)
    } catch (error) {
      console.error(
        'API Error in /api/products:',
        error
      )

      sendJson(res, 500, {
        success: false,
        error:
          error.message || 'Internal Server Error',
      })

      return true
    }
  }

  const productMatch = pathname.match(
    /^\/api\/products\/([^/]+)$/
  )

  if (productMatch) {
    const id = decodeURIComponent(
      productMatch[1]
    )

    try {
      if (req.method === 'GET') {
        const result = await handleGetProductById(id)

        sendJson(res, result.status, result.body)
        return true
      }

      if (
        req.method === 'PUT' ||
        req.method === 'PATCH'
      ) {
        return handleJsonEndpoint(
          req,
          res,
          body => handleUpdateProduct(id, body, req)
        )
      }

      if (req.method === 'DELETE') {
        const result = await handleDeleteProduct(
          id,
          req
        )

        sendJson(res, result.status, result.body)
        return true
      }

      return sendMethodNotAllowed(res)
    } catch (error) {
      console.error(
        `API Error in /api/products/${id}:`,
        error
      )

      sendJson(res, 500, {
        success: false,
        error:
          error.message || 'Internal Server Error',
      })

      return true
    }
  }

  /* =======================================================
     OFFERS
  ======================================================= */

  if (pathname === '/api/offers') {
    try {
      if (req.method === 'GET') {
        const result = await handleGetOffers(
          url,
          req
        )

        sendJson(res, result.status, result.body)
        return true
      }

      if (req.method === 'POST') {
        return handleJsonEndpoint(
          req,
          res,
          body => handleCreateOffer(body, req)
        )
      }

      return sendMethodNotAllowed(res)
    } catch (error) {
      console.error(
        'API Error in /api/offers:',
        error
      )

      sendJson(res, 500, {
        success: false,
        error:
          error.message || 'Internal Server Error',
      })

      return true
    }
  }

  const offerMatch = pathname.match(
    /^\/api\/offers\/([^/]+)$/
  )

  if (offerMatch) {
    const id = decodeURIComponent(
      offerMatch[1]
    )

    try {
      if (req.method === 'GET') {
        const result = await handleGetOfferById(id)

        sendJson(res, result.status, result.body)
        return true
      }

      if (
        req.method === 'PUT' ||
        req.method === 'PATCH'
      ) {
        return handleJsonEndpoint(
          req,
          res,
          body => handleUpdateOffer(id, body, req)
        )
      }

      if (req.method === 'DELETE') {
        const result = await handleDeleteOffer(
          id,
          req
        )

        sendJson(res, result.status, result.body)
        return true
      }

      return sendMethodNotAllowed(res)
    } catch (error) {
      console.error(
        `API Error in /api/offers/${id}:`,
        error
      )

      sendJson(res, 500, {
        success: false,
        error:
          error.message || 'Internal Server Error',
      })

      return true
    }
  }

  /* =======================================================
     BOOKINGS
  ======================================================= */

  if (pathname.startsWith('/api/bookings')) {
    await handleBookingsRoute(req, res, url)
    return true
  }

  /* =======================================================
     COMMUNITY GALLERY

     Includes:
     GET  /api/gallery/public
     POST /api/gallery/upload
     Admin gallery routes
     Gallery image delivery

     Upload authorization is implemented in gallery.mjs,
     not through customer session middleware here.
  ======================================================= */

  if (pathname.startsWith('/api/gallery')) {
    const handled = await handleGalleryRoute(
      req,
      res,
      url
    )

    if (handled) return true
  }

  /* =======================================================
     GAMES
  ======================================================= */

  if (pathname.startsWith('/api/games')) {
    const handled = await handleGamesRoute(
      req,
      res,
      url
    )

    if (handled) return true
  }

  /* =======================================================
     SETTINGS AND ADMIN PASSWORD CHANGE
  ======================================================= */

  if (
    pathname.startsWith('/api/settings') ||
    pathname === '/api/admin/change-password'
  ) {
    const handled = await handleSettingsRoute(
      req,
      res,
      url
    )

    if (handled) return true
  }

  /* =======================================================
     ADMIN NOTIFICATIONS
  ======================================================= */

  if (
    pathname.startsWith('/api/admin/notifications')
  ) {
    const handled =
      await handleAdminNotificationsRoute(
        req,
        res,
        url
      )

    if (handled) return true
  }

  /* =======================================================
     UNHANDLED API ROUTES
  ======================================================= */

  if (pathname.startsWith('/api')) {
    return false
  }

  return false
}
