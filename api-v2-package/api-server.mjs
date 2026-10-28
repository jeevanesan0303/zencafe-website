
import http from 'node:http'
import dotenv from 'dotenv'
import { handleApiRequest } from './server/api/index.mjs'

dotenv.config()

const port = Number(process.env.PORT || 5001)
const host = '127.0.0.1'

const server = http.createServer(async (req, res) => {
  try {
    const handled = await handleApiRequest(req, res)

    if (!handled && !res.headersSent) {
      res.writeHead(404, {
        'Content-Type': 'application/json; charset=utf-8',
      })

      res.end(
        JSON.stringify({
          success: false,
          error: 'API endpoint not found',
        })
      )
    }
  } catch (error) {
    console.error('[Zen Cafe API]', error)

    if (!res.headersSent) {
      res.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
      })

      res.end(
        JSON.stringify({
          success: false,
          error: 'Internal server error',
        })
      )
    } else if (!res.writableEnded) {
      res.end()
    }
  }
})

server.listen(port, host, () => {
  console.log('================================')
  console.log('ZEN CAFE API V2')
  console.log('================================')
  console.log(`Listening: http://${host}:${port}`)
  console.log('Database: PostgreSQL')
  console.log('Storage: Cloudflare R2')
  console.log('================================')
})
