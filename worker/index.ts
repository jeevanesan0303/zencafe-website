
import type { R2Bucket } from '@cloudflare/workers-types'

/* ==========================================
   ZEN CAFÉ — CLOUDFLARE WORKER

   - Clean URLs
   - API Proxy
   - Static Assets
   - Authenticated Product Image Upload
   - Cloudflare R2 Product Images
========================================== */

/* ==========================================
   ENVIRONMENT
========================================== */

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }

  API_V2_URL: string

  PRODUCTS_BUCKET: R2Bucket
  GALLERY_BUCKET: R2Bucket

  PUBLIC_BASE_URL?: string
  RESEND_FROM_EMAIL?: string
}

/* ==========================================
   CONSTANTS
========================================== */

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_MULTIPART_SIZE = MAX_IMAGE_SIZE + 64 * 1024
const IMAGE_CACHE_SECONDS = 3600

const ALLOWED_IMAGE_TYPES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

/*
  Confirmed in server/auth.mjs:

  GET /api/admin/check

  The backend validates:
  - Administrator session token
  - PostgreSQL session record
  - Session expiration
  - Session revocation
  - Active administrator account
  - Administrator role
*/

const ADMIN_AUTH_CHECK_PATH = '/api/admin/check'

/* ==========================================
   WEBSITE ROUTES
========================================== */

const pageRoutes: Record<string, string> = {
  '/': '/index.html',

  '/admin': '/admin.html',
  '/admin/login': '/admin-login.html',
  '/admin-bookings': '/admin-bookings.html',

  '/zen-kitchen': '/zen-kitchen.html',
  '/offers': '/offers.html',
  '/register': '/register.html',
  '/games': '/games.html',
}

const legacyRoutes: Record<string, string> = {
  '/index.html': '/',

  '/admin.html': '/admin',
  '/admin-login.html': '/admin/login',
  '/admin-bookings.html': '/admin-bookings',

  '/zen-kitchen.html': '/zen-kitchen',
  '/offers.html': '/offers',
  '/register.html': '/register',
  '/games.html': '/games',
}

/* ==========================================
   RESPONSE HELPERS
========================================== */

function jsonResponse(
  data: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function isApiPath(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/')
  )
}

/* ==========================================
   BACKEND URL BUILDER
========================================== */

function buildBackendUrl(
  request: Request,
  env: Env,
  overridePath?: string,
): URL {
  if (!env.API_V2_URL) {
    throw new Error(
      'Zen Café API URL is not configured.',
    )
  }

  const incomingUrl = new URL(request.url)
  const backendUrl = new URL(env.API_V2_URL)

  const basePath =
    backendUrl.pathname.replace(/\/+$/, '')

  backendUrl.pathname =
    basePath +
    (overridePath ?? incomingUrl.pathname)

  backendUrl.search = overridePath
    ? ''
    : incomingUrl.search

  return backendUrl
}

/* ==========================================
   API PROXY
========================================== */

async function proxyApi(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.API_V2_URL) {
    return jsonResponse(
      {
        success: false,
        error:
          'Zen Café API URL is not configured.',
      },
      503,
    )
  }

  try {
    const incomingUrl = new URL(request.url)

    const backendUrl = buildBackendUrl(
      request,
      env,
    )

    const headers = new Headers(request.headers)

    headers.delete('host')

    const hasBody =
      request.method !== 'GET' &&
      request.method !== 'HEAD'

    const upstreamRequest = new Request(
      backendUrl.toString(),
      {
        method: request.method,
        headers,
        body: hasBody
          ? request.body
          : undefined,
        redirect: 'manual',
      },
    )

    const response = await fetch(upstreamRequest)

    if (
      !response.ok &&
      response.status >= 500
    ) {
      console.error(
        '[Zen Café API] Upstream error:',
        request.method,
        incomingUrl.pathname,
        response.status,
      )
    }

    return response
  } catch (error) {
    console.error(
      '[Zen Café API] Proxy failure:',
      error,
    )

    return jsonResponse(
      {
        success: false,
        error:
          'The Zen Café API is temporarily unavailable.',
      },
      502,
    )
  }
}

/* ==========================================
   ADMIN AUTHENTICATION

   Validates the administrator using
   the existing backend endpoint:

   GET /api/admin/check
========================================== */

async function verifyAdmin(
  request: Request,
  env: Env,
): Promise<boolean> {
  if (!env.API_V2_URL) {
    return false
  }

  /*
    Support both authentication headers
    used by src/admin-auth.ts.
  */

  const authorization =
    request.headers.get('Authorization')

  const adminToken =
    request.headers.get('x-admin-token')

  if (!authorization && !adminToken) {
    return false
  }

  try {
    const authUrl = buildBackendUrl(
      request,
      env,
      ADMIN_AUTH_CHECK_PATH,
    )

    const headers = new Headers()

    const forwardedHeaders = [
      'Authorization',
      'x-admin-token',
      'x-csrf-token',
      'csrf-token',
      'Cookie',
    ]

    for (const name of forwardedHeaders) {
      const value = request.headers.get(name)

      if (value) {
        headers.set(name, value)
      }
    }

    headers.set(
      'Accept',
      'application/json',
    )

    const response = await fetch(
      authUrl.toString(),
      {
        method: 'GET',
        headers,
        redirect: 'manual',
        cache: 'no-store',
      },
    )

    /*
      Only HTTP 200 is accepted.

      The backend performs authoritative
      PostgreSQL admin-session validation.
    */

    return response.status === 200
  } catch (error) {
    console.error(
      '[Zen Café] Admin verification failed:',
      error,
    )

    return false
  }
}

/* ==========================================
   PRODUCT IMAGE ROUTES
========================================== */

function getProductUploadId(
  pathname: string,
): string | null {
  const match = pathname.match(
    /^\/api\/products\/([^/]+)\/image$/,
  )

  if (!match) {
    return null
  }

  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function getProductImageKey(
  pathname: string,
): string | null {
  const prefix = '/api/product-images/'

  if (!pathname.startsWith(prefix)) {
    return null
  }

  const encodedKey =
    pathname.slice(prefix.length)

  if (!encodedKey) {
    return null
  }

  try {
    const key = decodeURIComponent(encodedKey)

    if (
      !key ||
      key.includes('..') ||
      key.includes('\\') ||
      key.startsWith('/') ||
      key.includes('\0')
    ) {
      return null
    }

    return key
  } catch {
    return null
  }
}

/* ==========================================
   IMAGE SIGNATURE VALIDATION
========================================== */

function hasValidImageSignature(
  bytes: Uint8Array,
  mimeType: string,
): boolean {
  if (mimeType === 'image/jpeg') {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    )
  }

  if (mimeType === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    )
  }

  if (mimeType === 'image/webp') {
    if (bytes.length < 12) {
      return false
    }

    const riff = String.fromCharCode(
      ...bytes.slice(0, 4),
    )

    const webp = String.fromCharCode(
      ...bytes.slice(8, 12),
    )

    return (
      riff === 'RIFF' &&
      webp === 'WEBP'
    )
  }

  return false
}

/* ==========================================
   PRODUCT IMAGE UPLOAD

   POST /api/products/:id/image

   FormData field:
   image
========================================== */

async function uploadProductImage(
  request: Request,
  env: Env,
  productId: string,
): Promise<Response> {
  if (!env.PRODUCTS_BUCKET) {
    return jsonResponse(
      {
        success: false,
        error:
          'Zen Café product image storage is not configured.',
      },
      503,
    )
  }

  /*
    Validate administrator credentials
    before processing the uploaded file.
  */

  const authorized = await verifyAdmin(
    request,
    env,
  )

  if (!authorized) {
    return jsonResponse(
      {
        success: false,
        error:
          'Administrator authentication failed or the session has expired.',
      },
      401,
    )
  }

  if (
    !productId ||
    productId.length > 128 ||
    !/^[a-zA-Z0-9_-]+$/.test(productId)
  ) {
    return jsonResponse(
      {
        success: false,
        error: 'Invalid product ID.',
      },
      400,
    )
  }

  const contentType =
    request.headers.get('Content-Type') || ''

  if (
    !contentType
      .toLowerCase()
      .startsWith('multipart/form-data')
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          'Expected multipart/form-data.',
      },
      415,
    )
  }

  const contentLengthHeader =
    request.headers.get('Content-Length')

  if (contentLengthHeader) {
    const contentLength = Number(
      contentLengthHeader,
    )

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_MULTIPART_SIZE
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            'Image upload exceeds the 5 MB limit.',
        },
        413,
      )
    }
  }

  try {
    const rawBody =
      await request.arrayBuffer()

    if (
      rawBody.byteLength >
      MAX_MULTIPART_SIZE
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            'Image upload exceeds the 5 MB limit.',
        },
        413,
      )
    }

    const formRequest = new Request(
      request.url,
      {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
        },
        body: rawBody,
      },
    )

    const formData =
      await formRequest.formData()

    const image =
      formData.get('image')

    if (!(image instanceof File)) {
      return jsonResponse(
        {
          success: false,
          error:
            'Please select a product image.',
        },
        400,
      )
    }

    const extension =
      ALLOWED_IMAGE_TYPES.get(image.type)

    if (!extension) {
      return jsonResponse(
        {
          success: false,
          error:
            'Only JPG, PNG and WebP images are allowed.',
        },
        415,
      )
    }

    if (
      image.size === 0 ||
      image.size > MAX_IMAGE_SIZE
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            'Image must be between 1 byte and 5 MB.',
        },
        413,
      )
    }

    const bytes = new Uint8Array(
      await image.arrayBuffer(),
    )

    if (
      !hasValidImageSignature(
        bytes,
        image.type,
      )
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            'The selected file is not a valid image.',
        },
        415,
      )
    }

    /*
      Generate a unique image key so
      replacing an image does not reuse
      an old cached URL.
    */

    const key =
      `products/${productId}/` +
      `${crypto.randomUUID()}.${extension}`

    await env.PRODUCTS_BUCKET.put(
      key,
      bytes,
      {
        httpMetadata: {
          contentType: image.type,
          cacheControl:
            `public, max-age=${IMAGE_CACHE_SECONDS}`,
        },
        customMetadata: {
          productId,
          uploadedAt:
            new Date().toISOString(),
        },
      },
    )

    const origin =
      new URL(request.url).origin

    const imageUrl =
      `${origin}/api/product-images/` +
      key
        .split('/')
        .map(encodeURIComponent)
        .join('/')

    return jsonResponse(
      {
        success: true,
        image: imageUrl,
        url: imageUrl,
        key,
        data: {
          image: imageUrl,
          url: imageUrl,
          key,
        },
      },
      201,
    )
  } catch (error) {
    console.error(
      '[Zen Café] Product image upload failed:',
      error,
    )

    return jsonResponse(
      {
        success: false,
        error:
          'Unable to upload product image.',
      },
      500,
    )
  }
}

/* ==========================================
   PUBLIC PRODUCT IMAGE DELIVERY

   GET /api/product-images/:key
   HEAD /api/product-images/:key
========================================== */

async function serveProductImage(
  request: Request,
  env: Env,
  key: string,
): Promise<Response> {
  if (!env.PRODUCTS_BUCKET) {
    return new Response(
      'Product image storage unavailable.',
      {
        status: 503,
      },
    )
  }

  try {
    if (!key.startsWith('products/')) {
      return new Response(
        'Invalid image key.',
        {
          status: 400,
        },
      )
    }

    /*
      HEAD:
      Read metadata only.

      GET:
      Read image content.
    */

    const object =
      request.method === 'HEAD'
        ? await env.PRODUCTS_BUCKET.head(key)
        : await env.PRODUCTS_BUCKET.get(key)

    if (!object) {
      return new Response(
        'Product image not found.',
        {
          status: 404,
        },
      )
    }

    const headers = new Headers()
    const metadata = object.httpMetadata

    /*
      Assign metadata manually to avoid
      conflicting DOM and Cloudflare
      Headers types.
    */

    if (metadata?.contentType) {
      headers.set(
        'Content-Type',
        metadata.contentType,
      )
    } else {
      headers.set(
        'Content-Type',
        'application/octet-stream',
      )
    }

    if (metadata?.contentLanguage) {
      headers.set(
        'Content-Language',
        metadata.contentLanguage,
      )
    }

    if (metadata?.contentEncoding) {
      headers.set(
        'Content-Encoding',
        metadata.contentEncoding,
      )
    }

    headers.set(
      'Cache-Control',
      `public, max-age=${IMAGE_CACHE_SECONDS}`,
    )

    headers.set(
      'X-Content-Type-Options',
      'nosniff',
    )

    headers.set(
      'Content-Disposition',
      'inline',
    )

    headers.set(
      'ETag',
      object.httpEtag,
    )

    headers.set(
      'Content-Length',
      String(object.size),
    )

    if (request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers,
      })
    }

    /*
      GET requires R2ObjectBody.

      A separate typed GET branch avoids
      the R2Object / R2ObjectBody union
      TypeScript error.
    */

    const imageObject =
      await env.PRODUCTS_BUCKET.get(key)

    if (!imageObject) {
      return new Response(
        'Product image not found.',
        {
          status: 404,
        },
      )
    }

    const imageBytes =
      await imageObject.arrayBuffer()

    return new Response(
      imageBytes,
      {
        status: 200,
        headers,
      },
    )
  } catch (error) {
    console.error(
      '[Zen Café] Product image delivery failed:',
      error,
    )

    return new Response(
      'Unable to load product image.',
      {
        status: 500,
      },
    )
  }
}

/* ==========================================
   CLEAN URL REDIRECT
========================================== */

function redirectToCleanUrl(
  request: Request,
  cleanPath: string,
): Response {
  const url = new URL(request.url)

  url.pathname = cleanPath

  return Response.redirect(
    url.toString(),
    308,
  )
}

/* ==========================================
   STATIC PAGE HANDLER
========================================== */

async function servePage(
  request: Request,
  env: Env,
  htmlPath: string,
): Promise<Response> {
  const assetUrl =
    new URL(request.url)

  assetUrl.pathname = htmlPath

  return env.ASSETS.fetch(
    new Request(
      assetUrl.toString(),
      request,
    ),
  )
}

/* ==========================================
   CLOUDFLARE WORKER ENTRY
========================================== */

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(request.url)
    const pathname = url.pathname

    /* --------------------------------------
       1. PRODUCT IMAGE UPLOAD
    -------------------------------------- */

    const productId =
      getProductUploadId(pathname)

    if (
      productId !== null &&
      request.method === 'POST'
    ) {
      return uploadProductImage(
        request,
        env,
        productId,
      )
    }

    /* --------------------------------------
       2. PUBLIC PRODUCT IMAGE DELIVERY
    -------------------------------------- */

    const imageKey =
      getProductImageKey(pathname)

    if (
      imageKey !== null &&
      (
        request.method === 'GET' ||
        request.method === 'HEAD'
      )
    ) {
      return serveProductImage(
        request,
        env,
        imageKey,
      )
    }

    /* --------------------------------------
       3. ALL OTHER API REQUESTS
    -------------------------------------- */

    if (isApiPath(pathname)) {
      return proxyApi(request, env)
    }

    /* --------------------------------------
       4. STATIC ASSET BINDING
    -------------------------------------- */

    if (!env.ASSETS) {
      return new Response(
        'Website assets are not configured.',
        {
          status: 503,
        },
      )
    }

    /* --------------------------------------
       5. LEGACY HTML REDIRECTS
    -------------------------------------- */

    if (
      request.method === 'GET' ||
      request.method === 'HEAD'
    ) {
      const cleanPath =
        legacyRoutes[pathname]

      if (cleanPath) {
        return redirectToCleanUrl(
          request,
          cleanPath,
        )
      }
    }

    /* --------------------------------------
       6. CLEAN PAGE ROUTES
    -------------------------------------- */

    const normalizedPath =
      pathname.length > 1
        ? pathname.replace(/\/+$/, '')
        : pathname

    const htmlPage =
      pageRoutes[normalizedPath]

    if (htmlPage) {
      return servePage(
        request,
        env,
        htmlPage,
      )
    }

    /* --------------------------------------
       7. STATIC ASSETS
    -------------------------------------- */

    return env.ASSETS.fetch(request)
  },
}
