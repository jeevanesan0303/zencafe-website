import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createServer as createViteServer,
  loadEnv,
} from 'vite'
import { handleApiRequest } from './server/api/index.mjs'

const __filename = fileURLToPath(import.meta.url)
const root = path.dirname(__filename)

const mode = process.env.NODE_ENV || 'development'

const env = {
  ...loadEnv(mode, root, ''),
  ...process.env,
}

const port = Number(env.PORT || 3000)

// SSH tunnel endpoint on your Windows laptop
const apiTarget = env.API_PROXY_TARGET || 'http://127.0.0.1:5500'

const routes = {
  '/admin': '/admin.html',
  '/admin/login': '/admin-login.html',
  '/zen-kitchen': '/zen-kitchen.html',
  '/offers': '/offers.html',
  '/register': '/register.html',
  '/games': '/games.html',
  '/admin-bookings': '/admin-bookings.html',
}

const vite = await createViteServer({
  root,
  server: {
    middlewareMode: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: true,
      },
    },
  },
  appType: 'mpa',
})

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url || '/',
    'http://localhost'
  )

  const pathname = url.pathname

  // Dispatch API requests
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    try {
      const handled = await handleApiRequest(req, res)
      if (handled) return
    } catch (err) {
      console.error('Unhandled API error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: err.message }))
      }
      return
    }
  }

  // Redirect old HTML URLs to clean URLs
  const oldRoute = Object.entries(routes).find(
    ([, htmlPath]) => htmlPath === pathname
  )

  if (oldRoute) {
    res.writeHead(308, {
      Location: oldRoute[0] + url.search,
    })

    res.end()
    return
  }

  // Remove trailing slash
  const cleanPath =
    pathname.length > 1
      ? pathname.replace(/\/+$/, '')
      : pathname

  // Rewrite clean URLs internally
  if (routes[cleanPath]) {
    req.url = routes[cleanPath] + url.search
  }

  // Handle requests through Vite
  vite.middlewares(req, res, () => {
    res.statusCode = 404
    res.end('Not found')
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log('\n================================')
  console.log('       ZEN CAFÉ SERVER')
  console.log('================================')
  console.log(`Website:       http://localhost:${port}/`)
  console.log(`Admin Login:   http://localhost:${port}/admin/login`)
  console.log(`Admin:         http://localhost:${port}/admin`)
  console.log(`Zen Kitchen:   http://localhost:${port}/zen-kitchen`)
  console.log(`Offers:        http://localhost:${port}/offers`)
  console.log(`Register:      http://localhost:${port}/register`)
  console.log(`Games:         http://localhost:${port}/games`)
  console.log(`Products API:  http://localhost:${port}/api/products`)
  console.log(`API Proxy:     /api -> ${apiTarget}`)
  console.log('================================\n')
})