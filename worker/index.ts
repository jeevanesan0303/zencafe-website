
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
  return pathname === '/api' || pathname.startsWith('/api/')
}

async function proxyApi(request: Request, env: Env): Promise<Response> {
  if (!env.API_V2_URL) {
    return Response.json(
      { success: false, error: 'API V2 URL is not configured' },
      { status: 503 },
    )
  }

  try {
    const incomingUrl = new URL(request.url)
    const backendUrl = new URL(env.API_V2_URL)

    backendUrl.pathname =
      backendUrl.pathname.replace(/\/$/, '') + incomingUrl.pathname
    backendUrl.search = incomingUrl.search

    const headers = new Headers(request.headers)
    headers.delete('host')

    const upstreamRequest = new Request(backendUrl.toString(), {
      method: request.method,
      headers,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : request.body,
      redirect: 'manual',
    })

    return await fetch(upstreamRequest)
  } catch (error) {
    console.error('Zen Café API proxy error:', error)

    return Response.json(
      {
        success: false,
        error: 'The Zen Café API is temporarily unavailable.',
      },
      { status: 502 },
    )
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (isApiPath(url.pathname)) {
      return proxyApi(request, env)
    }

    if (!env.ASSETS) {
      return new Response('Website assets are not configured', {
        status: 503,
      })
    }

    const page = pageRoutes[url.pathname]

    if (page) {
      const assetUrl = new URL(request.url)
      assetUrl.pathname = page

      return env.ASSETS.fetch(new Request(assetUrl, request))
    }

    return env.ASSETS.fetch(request)
  },
}
