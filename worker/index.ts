
/* ==========================================
   ZEN CAFÉ — CLOUDFLARE WORKER
   Clean URLs + API Proxy + Static Assets
========================================== */

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }

  API_V2_URL: string
}

/* ==========================================
   WEBSITE PAGE ROUTES
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

/* ==========================================
   LEGACY HTML REDIRECTS
========================================== */

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
   API PATH DETECTION
========================================== */

function isApiPath(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/')
  )
}

/* ==========================================
   API PROXY
========================================== */

async function proxyApi(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.API_V2_URL) {
    return Response.json(
      {
        success: false,
        error: 'Zen Café API URL is not configured.',
      },
      {
        status: 503,
      },
    )
  }

  try {
    const incomingUrl = new URL(request.url)
    const backendUrl = new URL(env.API_V2_URL)

    // Preserve the complete API path.
    backendUrl.pathname =
      backendUrl.pathname.replace(/\/+$/, '') +
      incomingUrl.pathname

    // Preserve API query parameters.
    backendUrl.search = incomingUrl.search

    const headers = new Headers(request.headers)

    // Let Cloudflare set the upstream Host header.
    headers.delete('host')

    const hasBody =
      request.method !== 'GET' &&
      request.method !== 'HEAD'

    const upstreamRequest = new Request(
      backendUrl.toString(),
      {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: 'manual',
      },
    )

    const response = await fetch(upstreamRequest)

    if (!response.ok && response.status >= 500) {
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

    return Response.json(
      {
        success: false,
        error:
          'The Zen Café API is temporarily unavailable.',
      },
      {
        status: 502,
      },
    )
  }
}

/* ==========================================
   REDIRECT HELPER
========================================== */

function redirectToCleanUrl(
  request: Request,
  cleanPath: string,
): Response {
  const url = new URL(request.url)

  url.pathname = cleanPath

  // Preserve query parameters.
  // Example:
  // /register.html?ref=home
  // becomes:
  // /register?ref=home

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
  const assetUrl = new URL(request.url)

  assetUrl.pathname = htmlPath

  // Serve the HTML file internally without
  // changing the browser's clean URL.
  return env.ASSETS.fetch(
    new Request(assetUrl.toString(), request),
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
       1. API REQUESTS
    -------------------------------------- */

    // API requests always go to the
    // configured Zen Café API backend.
    if (isApiPath(pathname)) {
      return proxyApi(request, env)
    }

    /* --------------------------------------
       2. CHECK STATIC ASSET BINDING
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
       3. REDIRECT LEGACY HTML URLS
    -------------------------------------- */

    // Redirect only browser navigation requests.
    // Preserve normal asset handling for
    // non-navigation requests.

    if (
      request.method === 'GET' ||
      request.method === 'HEAD'
    ) {
      const cleanPath = legacyRoutes[pathname]

      if (cleanPath) {
        return redirectToCleanUrl(
          request,
          cleanPath,
        )
      }
    }

    /* --------------------------------------
       4. SERVE CLEAN PAGE ROUTES
    -------------------------------------- */

    const normalizedPath =
      pathname.length > 1
        ? pathname.replace(/\/+$/, '')
        : pathname

    const htmlPage = pageRoutes[normalizedPath]

    if (htmlPage) {
      return servePage(
        request,
        env,
        htmlPage,
      )
    }

    /* --------------------------------------
       5. STATIC ASSETS
    -------------------------------------- */

    // All remaining requests:
    // CSS, JavaScript, images, fonts,
    // favicons, and other static files.

    return env.ASSETS.fetch(request)
  },
}
