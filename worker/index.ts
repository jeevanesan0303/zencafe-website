
interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
  API_V2_URL: string
}

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

function isApiPath(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/')
  )
}

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
      { status: 503 },
    )
  }

  try {
    const incomingUrl = new URL(request.url)
    const backendUrl = new URL(env.API_V2_URL)

    // Preserve the complete API path and query parameters.
    backendUrl.pathname =
      backendUrl.pathname.replace(/\/+$/, '') +
      incomingUrl.pathname

    backendUrl.search = incomingUrl.search

    const headers = new Headers(request.headers)

    // Allow Cloudflare to set the correct upstream Host.
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
      { status: 502 },
    )
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(request.url)

    // API requests always go to the VPS backend.
    if (isApiPath(url.pathname)) {
      return proxyApi(request, env)
    }

    if (!env.ASSETS) {
      return new Response(
        'Website assets are not configured.',
        { status: 503 },
      )
    }

    // Serve the correct HTML entry for each route.
    const page = pageRoutes[url.pathname]

    if (page) {
      const assetUrl = new URL(request.url)
      assetUrl.pathname = page

      return env.ASSETS.fetch(
        new Request(assetUrl, request),
      )
    }

    // Serve CSS, JS, images and other static assets.
    return env.ASSETS.fetch(request)
  },
}
