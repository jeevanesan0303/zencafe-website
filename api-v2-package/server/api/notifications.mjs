
import { getDbPool } from '../db.mjs'
import { verifyAdminRequest } from '../auth.mjs'

export async function handleAdminNotificationsRoute(req, res, url) {
  const pathname = url.pathname.replace(/\/+$/, '') || '/'

  const isListRoute = pathname === '/api/admin/notifications'
  const readMatch = pathname.match(
    /^\/api\/admin\/notifications\/([^/]+)\/read$/
  )

  if (!isListRoute && !readMatch) return false

  function send(status, body) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }

  if (
    (isListRoute && req.method !== 'GET') ||
    (readMatch && req.method !== 'POST')
  ) {
    send(405, { success: false, error: 'Method Not Allowed' })
    return true
  }

  try {
    const authenticated = await verifyAdminRequest(req)

    if (!authenticated) {
      send(401, {
        success: false,
        error: 'Unauthorized: Admin authentication required.',
      })
      return true
    }

    const pool = await getDbPool()

    if (isListRoute) {
      const result = await pool.query(
        `SELECT id, type, title, message, booking_id, is_read, created_at
         FROM public.admin_notifications
         ORDER BY created_at DESC
         LIMIT 50`
      )

      send(200, {
        success: true,
        count: result.rows.length,
        notifications: result.rows.map(row => ({
          id: String(row.id),
          type: row.type,
          title: row.title,
          message: row.message,
          bookingId: row.booking_id
            ? String(row.booking_id)
            : null,
          isRead: Boolean(row.is_read),
          createdAt: row.created_at
            ? new Date(row.created_at).toISOString()
            : new Date().toISOString(),
        })),
      })

      return true
    }

    const id = decodeURIComponent(readMatch[1])

    if (!/^\d+$/.test(id)) {
      send(400, {
        success: false,
        error: 'Invalid notification ID.',
      })
      return true
    }

    await pool.query(
      `UPDATE public.admin_notifications
       SET is_read = true
       WHERE id = $1`,
      [id]
    )

    send(200, {
      success: true,
      message: 'Notification marked as read.',
    })

    return true
  } catch (error) {
    console.error('Admin notifications API error:', error)

    send(500, {
      success: false,
      error: 'Failed to process admin notifications.',
    })

    return true
  }
}
