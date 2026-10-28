// server/api/bookings.mjs
// Zen Café — Phase 3: Room Bookings & Availability Management API

import { getDbPool, mapRowToBooking, mapRowToBookingBlock, formatDateYMD } from '../db.mjs'
import { verifyAdminRequest } from '../auth.mjs'

const DEFAULT_ROOM_NAME = 'Private Dining Room'
const DEFAULT_OPENING_TIME = '09:00'
const DEFAULT_CLOSING_TIME = '22:00'
const DEFAULT_DURATION_HOURS = 2

function jsonResponse(res, data, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(data))
}

function jsonError(res, message, statusCode = 400, details = null) {
  jsonResponse(
    res,
    {
      success: false,
      error: message,
      ...(details ? { details } : {}),
    },
    statusCode
  )
}

export function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 1024 * 512) {
        reject(new Error('Request payload too large'))
      }
    })
    req.on('end', () => {
      if (!body.trim()) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(new Error('Invalid JSON format'))
      }
    })
    req.on('error', reject)
  })
}

// Get current date string in Asia/Colombo (YYYY-MM-DD)
export function getColomboToday() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date())
}

// Convert "HH:MM" to minutes from midnight
export function timeToMinutes(timeStr) {
  if (!timeStr) return 0
  const parts = String(timeStr).split(':')
  const h = Number(parts[0]) || 0
  const m = Number(parts[1]) || 0
  return h * 60 + m
}

// Convert minutes from midnight to "HH:MM"
export function minutesToTime(mins) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, mins))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Check if two time intervals [s1, e1) and [s2, e2) overlap
export function intervalsOverlap(s1, e1, s2, e2) {
  const start1 = timeToMinutes(s1)
  const end1 = timeToMinutes(e1)
  const start2 = timeToMinutes(s2)
  const end2 = timeToMinutes(e2)
  return start1 < end2 && end1 > start2
}

/**
 * Check overlapping reservations inside an active database client/transaction.
 * If advisoryLock is true, acquires a PostgreSQL transaction-level advisory lock on (bookingDate + ':' + roomName).
 */
export async function checkSlotAvailability(client, {
  date,
  roomName = DEFAULT_ROOM_NAME,
  startTime,
  endTime,
  excludeBookingId = null,
  acquireLock = false,
}) {
  const normalizedDate = formatDateYMD(date)
  if (acquireLock) {
    const lockKey = `${normalizedDate}:${roomName}`
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey])
  }

  // 1. Check confirmed bookings
  const bookingOverlapQuery = `
    SELECT id, customer_name, start_time, end_time, room_name
    FROM public.bookings
    WHERE booking_date = $1
      AND room_name = $2
      AND status = 'confirmed'
      AND ($3::bigint IS NULL OR id != $3)
      AND (start_time < $5::time AND end_time > $4::time)
  `
  const bookingOverlap = await client.query(bookingOverlapQuery, [
    normalizedDate,
    roomName,
    excludeBookingId ? Number(excludeBookingId) : null,
    startTime,
    endTime,
  ])

  if (bookingOverlap.rows.length > 0) {
    const conflict = bookingOverlap.rows[0]
    return {
      available: false,
      conflictType: 'booking',
      conflictId: String(conflict.id),
      conflictStart: String(conflict.start_time).slice(0, 5),
      conflictEnd: String(conflict.end_time).slice(0, 5),
      message: `Conflict: Booking ID ${conflict.id} already reserves ${String(conflict.start_time).slice(0, 5)} - ${String(conflict.end_time).slice(0, 5)} for ${roomName}.`,
    }
  }

  // 2. Check manual blocks
  const blockOverlapQuery = `
    SELECT id, start_time, end_time, reason, room_name
    FROM public.booking_blocks
    WHERE block_date = $1
      AND room_name = $2
      AND (start_time < $4::time AND end_time > $3::time)
  `
  const blockOverlap = await client.query(blockOverlapQuery, [
    normalizedDate,
    roomName,
    startTime,
    endTime,
  ])

  if (blockOverlap.rows.length > 0) {
    const block = blockOverlap.rows[0]
    return {
      available: false,
      conflictType: 'block',
      conflictId: String(block.id),
      conflictStart: String(block.start_time).slice(0, 5),
      conflictEnd: String(block.end_time).slice(0, 5),
      reason: block.reason || 'Admin block',
      message: `Slot is unavailable: ${roomName} is blocked from ${String(block.start_time).slice(0, 5)} to ${String(block.end_time).slice(0, 5)}${block.reason ? ` (${block.reason})` : ''}.`,
    }
  }

  return { available: true }
}

/**
 * Main Bookings API Handler
 */
export async function handleBookingsRoute(req, res, parsedUrl) {
  const pool = await getDbPool()
  const pathname = parsedUrl.pathname
  const method = req.method

  // ========================================================
  // 1. GET /api/bookings/availability (Public)
  // ========================================================
  if (pathname === '/api/bookings/availability' && method === 'GET') {
    try {
      const today = getColomboToday()
      const date = parsedUrl.searchParams.get('date') || today
      const roomName = parsedUrl.searchParams.get('room') || DEFAULT_ROOM_NAME

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return jsonError(res, 'Invalid date format. Expected YYYY-MM-DD.', 400)
      }

      // Query confirmed bookings
      const bookingsRes = await pool.query(
        `SELECT id, start_time, end_time, room_name 
         FROM public.bookings 
         WHERE booking_date = $1 AND room_name = $2 AND status = 'confirmed'
         ORDER BY start_time ASC`,
        [date, roomName]
      )

      // Query manual blocks
      const blocksRes = await pool.query(
        `SELECT id, start_time, end_time, reason, room_name 
         FROM public.booking_blocks 
         WHERE block_date = $1 AND room_name = $2
         ORDER BY start_time ASC`,
        [date, roomName]
      )

      const reservedIntervals = [
        ...bookingsRes.rows.map(r => ({
          type: 'booking',
          id: String(r.id),
          startTime: String(r.start_time).slice(0, 5),
          endTime: String(r.end_time).slice(0, 5),
        })),
        ...blocksRes.rows.map(r => ({
          type: 'block',
          id: String(r.id),
          startTime: String(r.start_time).slice(0, 5),
          endTime: String(r.end_time).slice(0, 5),
          reason: r.reason || '',
        })),
      ]

      // Fetch dynamic café settings for hours and duration if configured
      let openingTime = DEFAULT_OPENING_TIME
      let closingTime = DEFAULT_CLOSING_TIME
      let defaultDurationHours = DEFAULT_DURATION_HOURS

      try {
        const settingsRes = await pool.query(
          "SELECT value FROM public.website_settings WHERE key = 'cafe_info'"
        )
        if (settingsRes.rows.length > 0) {
          const val = typeof settingsRes.rows[0].value === 'string'
            ? JSON.parse(settingsRes.rows[0].value)
            : settingsRes.rows[0].value
          if (val?.openingTime) openingTime = String(val.openingTime)
          if (val?.closingTime) closingTime = String(val.closingTime)
          if (val?.defaultBookingDuration && Number(val.defaultBookingDuration) > 0) {
            defaultDurationHours = Number(val.defaultBookingDuration)
          }
        }
      } catch {
        // Fall back to defaults safely
      }

      // Generate standard slots (every 30 mins from opening to closing minus duration)
      const openMins = timeToMinutes(openingTime)
      const closeMins = timeToMinutes(closingTime)
      const durationMins = Math.round(defaultDurationHours * 60)

      const availableSlots = []
      for (let m = openMins; m + durationMins <= closeMins; m += 30) {
        const slotStart = minutesToTime(m)
        const slotEnd = minutesToTime(m + durationMins)
        const isBlocked = reservedIntervals.some(r =>
          intervalsOverlap(slotStart, slotEnd, r.startTime, r.endTime)
        )
        if (!isBlocked) {
          availableSlots.push(slotStart)
        }
      }

      return jsonResponse(res, {
        success: true,
        date,
        roomName,
        openingTime,
        closingTime,
        defaultDuration: defaultDurationHours,
        reservedIntervals,
        availableSlots,
      })
    } catch (err) {
      console.error('Error fetching availability:', err)
      return jsonError(res, 'Failed to fetch room availability.', 500)
    }
  }

  // ========================================================
  // 2. GET /api/bookings/blocks (Admin only)
  // ========================================================
  if (pathname === '/api/bookings/blocks' && method === 'GET') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }
    try {
      const room = parsedUrl.searchParams.get('room')
      const date = parsedUrl.searchParams.get('date')

      let query = 'SELECT * FROM public.booking_blocks'
      const params = []
      const conditions = []

      if (room) {
        params.push(room)
        conditions.push(`room_name = $${params.length}`)
      }
      if (date) {
        params.push(date)
        conditions.push(`block_date = $${params.length}`)
      }
      if (conditions.length) {
        query += ' WHERE ' + conditions.join(' AND ')
      }
      query += ' ORDER BY block_date DESC, start_time ASC'

      const result = await pool.query(query, params)
      return jsonResponse(res, {
        success: true,
        count: result.rows.length,
        data: result.rows.map(mapRowToBookingBlock),
      })
    } catch (err) {
      console.error('Error fetching booking blocks:', err)
      return jsonError(res, 'Failed to fetch booking blocks.', 500)
    }
  }

  // ========================================================
  // 3. POST /api/bookings/blocks (Admin only)
  // ========================================================
  if (pathname === '/api/bookings/blocks' && method === 'POST') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }

    let client
    try {
      const body = await parseJsonBody(req)
      const roomName = (body.roomName || DEFAULT_ROOM_NAME).trim()
      const blockDate = (body.blockDate || body.date || '').trim()
      const startTime = (body.startTime || body.time || '').trim()
      const endTime = (body.endTime || '').trim()
      const reason = (body.reason || '').trim()

      if (!blockDate || !/^\d{4}-\d{2}-\d{2}$/.test(blockDate)) {
        return jsonError(res, 'Valid blockDate required (YYYY-MM-DD).', 400)
      }
      if (!startTime || !/^\d{2}:\d{2}/.test(startTime)) {
        return jsonError(res, 'Valid startTime required (HH:MM).', 400)
      }
      if (!endTime || !/^\d{2}:\d{2}/.test(endTime)) {
        return jsonError(res, 'Valid endTime required (HH:MM).', 400)
      }
      if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        return jsonError(res, 'endTime must be strictly after startTime.', 400)
      }

      client = await pool.connect()
      await client.query('BEGIN')

      // Check slot availability with advisory lock
      const availability = await checkSlotAvailability(client, {
        date: blockDate,
        roomName,
        startTime,
        endTime,
        acquireLock: true,
      })

      if (!availability.available) {
        await client.query('ROLLBACK')
        return jsonError(
          res,
          `Cannot create block: ${availability.message}`,
          409,
          availability
        )
      }

      const insertRes = await client.query(
        `INSERT INTO public.booking_blocks (
           room_name, block_date, start_time, end_time, reason, created_at
         ) VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [roomName, blockDate, startTime, endTime, reason || null]
      )

      await client.query('COMMIT')
      return jsonResponse(
        res,
        {
          success: true,
          message: 'Room interval blocked successfully.',
          data: mapRowToBookingBlock(insertRes.rows[0]),
        },
        201
      )
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      console.error('Error creating booking block:', err)
      return jsonError(res, err.message || 'Failed to create block.', 500)
    } finally {
      if (client) client.release()
    }
  }

  // ========================================================
  // 4. DELETE /api/bookings/blocks/:id (Admin only)
  // ========================================================
  const blockMatch = pathname.match(/^\/api\/bookings\/blocks\/(\d+)$/)
  if (blockMatch && method === 'DELETE') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }
    const blockId = Number(blockMatch[1])
    try {
      const del = await pool.query(
        'DELETE FROM public.booking_blocks WHERE id = $1 RETURNING *',
        [blockId]
      )
      if (del.rows.length === 0) {
        return jsonError(res, 'Block not found.', 404)
      }
      return jsonResponse(res, {
        success: true,
        message: 'Manual block removed successfully.',
      })
    } catch (err) {
      console.error('Error deleting block:', err)
      return jsonError(res, 'Failed to remove block.', 500)
    }
  }

  // ========================================================
  // 5. POST /api/bookings (Public: Customer Room Booking Request)
  // ========================================================
  if (pathname === '/api/bookings' && method === 'POST') {
    let client
    try {
      const body = await parseJsonBody(req)
      const customerName = (body.customerName || body.name || '').trim()
      const phone = (body.phone || body.customerPhone || '').trim()
      const email = (body.email || body.customerEmail || '').trim()
      const date = (body.bookingDate || body.date || '').trim()
      const time = (body.bookingTime || body.startTime || body.time || '').trim()
      const roomName = (body.roomName || DEFAULT_ROOM_NAME).trim()
      const guests = Number(body.guests || body.guestCount) || 10
      const duration = Number(body.duration) || DEFAULT_DURATION_HOURS
      const occasion = (body.occasion || '').trim()
      const notes = (body.notes || body.note || '').trim()

      // Validation
      if (!customerName) {
        return jsonError(res, 'Customer name is required.', 400)
      }
      const digits = phone.replace(/\D/g, '')
      if (digits.length < 9) {
        return jsonError(res, 'A valid phone number (at least 9 digits) is required.', 400)
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonError(res, 'Invalid email address format.', 400)
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return jsonError(res, 'Valid booking date required (YYYY-MM-DD).', 400)
      }

      const today = getColomboToday()
      if (date < today) {
        return jsonError(res, 'Booking date cannot be in the past.', 400)
      }

      if (!/^\d{2}:\d{2}/.test(time)) {
        return jsonError(res, 'Valid booking time required (HH:MM).', 400)
      }

      // Fetch dynamic café settings for hours if configured
      let openingTime = DEFAULT_OPENING_TIME
      let closingTime = DEFAULT_CLOSING_TIME
      try {
        const settingsRes = await pool.query(
          "SELECT value FROM public.website_settings WHERE key = 'cafe_info'"
        )
        if (settingsRes.rows.length > 0) {
          const val = typeof settingsRes.rows[0].value === 'string'
            ? JSON.parse(settingsRes.rows[0].value)
            : settingsRes.rows[0].value
          if (val?.openingTime) openingTime = String(val.openingTime)
          if (val?.closingTime) closingTime = String(val.closingTime)
        }
      } catch {
        // Fall back to defaults safely
      }

      const startMins = timeToMinutes(time)
      const openMins = timeToMinutes(openingTime)
      const closeMins = timeToMinutes(closingTime)

      if (startMins < openMins || startMins >= closeMins) {
        return jsonError(
          res,
          `Booking time must be between opening (${openingTime}) and closing (${closingTime}).`,
          400
        )
      }

      if (duration < 0.5 || duration > 4) {
        return jsonError(res, 'Duration must be between 0.5 and 4 hours.', 400)
      }

      const endMins = startMins + Math.round(duration * 60)
      if (endMins > closeMins) {
        return jsonError(
          res,
          `Booking duration extends past café closing time (${closingTime}).`,
          400
        )
      }

      const formattedStartTime = minutesToTime(startMins)
      const formattedEndTime = minutesToTime(endMins)

      client = await pool.connect()
      await client.query('BEGIN')

      // Check slot availability (does it conflict with an existing confirmed booking or block?)
      const availability = await checkSlotAvailability(client, {
        date,
        roomName,
        startTime: formattedStartTime,
        endTime: formattedEndTime,
        acquireLock: true,
      })

      if (!availability.available) {
        await client.query('ROLLBACK')
        return jsonError(
          res,
          'The requested time slot is unavailable. Please choose another date or time.',
          409,
          availability
        )
      }

      // Combine occasion and notes cleanly
      const fullNotes = [
        occasion ? `Occasion: ${occasion}` : '',
        notes ? `Notes: ${notes}` : '',
      ]
        .filter(Boolean)
        .join(' | ')

      const insertRes = await client.query(
        `INSERT INTO public.bookings (
           customer_name, customer_phone, customer_email,
           booking_date, start_time, end_time, guest_count,
           room_name, status, notes, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, NOW(), NOW())
         RETURNING *`,
        [
          customerName,
          phone,
          email || null,
          date,
          formattedStartTime,
          formattedEndTime,
          guests,
          roomName,
          fullNotes || null,
        ]
      )

      const newBooking = insertRes.rows[0]

      // Queue admin dashboard notification
      await client.query(
        `INSERT INTO public.admin_notifications (
           type, title, message, booking_id, is_read, created_at
         ) VALUES ($1, $2, $3, $4, FALSE, NOW())`,
        [
          'booking_request',
          'New Room Booking Request',
          `New booking request from ${customerName} for ${roomName} on ${date} at ${formattedStartTime} (${guests} guests).`,
          newBooking.id,
        ]
      )

      await client.query('COMMIT')

      return jsonResponse(
        res,
        {
          success: true,
          message: 'Your room booking request has been submitted. Our team will review and confirm availability.',
          data: mapRowToBooking(newBooking),
        },
        201
      )
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      console.error('Error submitting room booking:', err)
      return jsonError(res, err.message || 'Failed to submit room booking.', 500)
    } finally {
      if (client) client.release()
    }
  }

  // ========================================================
  // 6. GET /api/bookings (Admin: List Bookings)
  // ========================================================
  if (pathname === '/api/bookings' && method === 'GET') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }
    try {
      const status = parsedUrl.searchParams.get('status')
      const date = parsedUrl.searchParams.get('date')
      const search = (parsedUrl.searchParams.get('search') || '').trim().toLowerCase()

      let query = 'SELECT * FROM public.bookings'
      const params = []
      const conditions = []

      if (status && status !== 'all') {
        params.push(status)
        conditions.push(`status = $${params.length}`)
      }
      if (date) {
        params.push(date)
        conditions.push(`booking_date = $${params.length}`)
      }
      if (search) {
        params.push(`%${search}%`)
        conditions.push(
          `(LOWER(customer_name) LIKE $${params.length} OR LOWER(COALESCE(customer_phone, '')) LIKE $${params.length} OR LOWER(COALESCE(customer_email, '')) LIKE $${params.length} OR LOWER(room_name) LIKE $${params.length})`
        )
      }

      if (conditions.length) {
        query += ' WHERE ' + conditions.join(' AND ')
      }
      query += ' ORDER BY booking_date DESC, start_time DESC'

      const result = await pool.query(query, params)
      return jsonResponse(res, {
        success: true,
        count: result.rows.length,
        data: result.rows.map(mapRowToBooking),
      })
    } catch (err) {
      console.error('Error fetching bookings:', err)
      return jsonError(res, 'Failed to fetch bookings.', 500)
    }
  }

  // ========================================================
  // 7. POST /api/bookings/:id/accept (Admin: Accept Booking)
  // ========================================================
  const acceptMatch = pathname.match(/^\/api\/bookings\/(\d+)\/accept$/)
  if (acceptMatch && method === 'POST') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }

    const bookingId = Number(acceptMatch[1])
    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')

      // Select booking for update
      const bRes = await client.query(
        'SELECT * FROM public.bookings WHERE id = $1 FOR UPDATE',
        [bookingId]
      )
      if (bRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return jsonError(res, 'Booking not found.', 404)
      }

      const booking = bRes.rows[0]
      const bookingDate = formatDateYMD(booking.booking_date)
      const roomName = booking.room_name || DEFAULT_ROOM_NAME
      const startTime = String(booking.start_time).slice(0, 5)
      const endTime = booking.end_time
        ? String(booking.end_time).slice(0, 5)
        : minutesToTime(timeToMinutes(startTime) + DEFAULT_DURATION_HOURS * 60)

      // Recheck availability with transaction advisory lock to guarantee mutual exclusion
      const availability = await checkSlotAvailability(client, {
        date: bookingDate,
        roomName,
        startTime,
        endTime,
        excludeBookingId: bookingId,
        acquireLock: true,
      })

      if (!availability.available) {
        await client.query('ROLLBACK')
        return jsonError(
          res,
          `Cannot accept booking: ${availability.message}`,
          409,
          availability
        )
      }

      // Update booking to confirmed
      const updRes = await client.query(
        `UPDATE public.bookings
         SET status = 'confirmed',
             end_time = $1,
             reviewed_at = NOW(),
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [endTime, bookingId]
      )

      // Queue customer confirmation notification in notification_outbox
      if (booking.customer_email) {
        await client.query(
          `INSERT INTO public.notification_outbox (
             booking_id, channel, recipient, template_key, payload, status, created_at
           ) VALUES ($1, 'email', $2, 'booking_confirmed', $3, 'pending', NOW())`,
          [
            bookingId,
            booking.customer_email,
            JSON.stringify({
              customerName: booking.customer_name,
              roomName,
              date: bookingDate,
              time: startTime,
              endTime,
            }),
          ]
        )
      }

      if (booking.customer_phone) {
        await client.query(
          `INSERT INTO public.notification_outbox (
             booking_id, channel, recipient, template_key, payload, status, created_at
           ) VALUES ($1, 'whatsapp', $2, 'booking_confirmed', $3, 'pending', NOW())`,
          [
            bookingId,
            booking.customer_phone,
            JSON.stringify({
              customerName: booking.customer_name,
              roomName,
              date: bookingDate,
              time: startTime,
              endTime,
            }),
          ]
        )
      }

      await client.query('COMMIT')
      return jsonResponse(res, {
        success: true,
        message: 'Booking accepted and room reserved successfully.',
        data: mapRowToBooking(updRes.rows[0]),
      })
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      console.error('Error accepting booking:', err)
      return jsonError(res, err.message || 'Failed to accept booking.', 500)
    } finally {
      if (client) client.release()
    }
  }

  // ========================================================
  // 8. POST /api/bookings/:id/reject (Admin: Reject Booking)
  // ========================================================
  const rejectMatch = pathname.match(/^\/api\/bookings\/(\d+)\/reject$/)
  if (rejectMatch && method === 'POST') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }

    const bookingId = Number(rejectMatch[1])
    let client
    try {
      const body = await parseJsonBody(req)
      const reason = (body.reason || body.adminReason || '').trim()

      if (!reason) {
        return jsonError(res, 'A rejection reason is required.', 400)
      }

      client = await pool.connect()
      await client.query('BEGIN')

      const bRes = await client.query(
        'SELECT * FROM public.bookings WHERE id = $1 FOR UPDATE',
        [bookingId]
      )
      if (bRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return jsonError(res, 'Booking not found.', 404)
      }

      const booking = bRes.rows[0]

      const updRes = await client.query(
        `UPDATE public.bookings
         SET status = 'rejected',
             admin_reason = $1,
             reviewed_at = NOW(),
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [reason, bookingId]
      )

      // Queue rejection notification
      if (booking.customer_email) {
        await client.query(
          `INSERT INTO public.notification_outbox (
             booking_id, channel, recipient, template_key, payload, status, created_at
           ) VALUES ($1, 'email', $2, 'booking_rejected', $3, 'pending', NOW())`,
          [
            bookingId,
            booking.customer_email,
            JSON.stringify({
              customerName: booking.customer_name,
              reason,
              date: booking.booking_date,
              time: booking.start_time,
            }),
          ]
        )
      }

      if (booking.customer_phone) {
        await client.query(
          `INSERT INTO public.notification_outbox (
             booking_id, channel, recipient, template_key, payload, status, created_at
           ) VALUES ($1, 'whatsapp', $2, 'booking_rejected', $3, 'pending', NOW())`,
          [
            bookingId,
            booking.customer_phone,
            JSON.stringify({
              customerName: booking.customer_name,
              reason,
              date: booking.booking_date,
              time: booking.start_time,
            }),
          ]
        )
      }

      await client.query('COMMIT')
      return jsonResponse(res, {
        success: true,
        message: 'Booking rejected and rejection notice queued.',
        data: mapRowToBooking(updRes.rows[0]),
      })
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      console.error('Error rejecting booking:', err)
      return jsonError(res, err.message || 'Failed to reject booking.', 500)
    } finally {
      if (client) client.release()
    }
  }

  // ========================================================
  // 9. POST /api/bookings/:id/modify (Admin: Propose Modification)
  // ========================================================
  const modifyMatch = pathname.match(/^\/api\/bookings\/(\d+)\/modify$/)
  if (modifyMatch && method === 'POST') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }

    const bookingId = Number(modifyMatch[1])
    let client
    try {
      const body = await parseJsonBody(req)
      const proposedDate = (body.proposedDate || body.date || '').trim()
      const proposedStartTime = (body.proposedStartTime || body.startTime || body.time || '').trim()
      const duration = Number(body.duration) || DEFAULT_DURATION_HOURS
      const reason = (body.reason || body.adminReason || '').trim()

      if (!reason) {
        return jsonError(res, 'A reason for the modification proposal is required.', 400)
      }
      if (!proposedDate || !/^\d{4}-\d{2}-\d{2}$/.test(proposedDate)) {
        return jsonError(res, 'Valid proposed date required (YYYY-MM-DD).', 400)
      }
      if (!proposedStartTime || !/^\d{2}:\d{2}/.test(proposedStartTime)) {
        return jsonError(res, 'Valid proposed start time required (HH:MM).', 400)
      }

      const pStartMins = timeToMinutes(proposedStartTime)
      const pEndMins = pStartMins + Math.round(duration * 60)
      const proposedEndTime = minutesToTime(pEndMins)

      const openMins = timeToMinutes(DEFAULT_OPENING_TIME)
      const closeMins = timeToMinutes(DEFAULT_CLOSING_TIME)

      if (pStartMins < openMins || pStartMins >= closeMins) {
        return jsonError(
          res,
          `Proposed start time must be between opening (${DEFAULT_OPENING_TIME}) and closing (${DEFAULT_CLOSING_TIME}).`,
          400
        )
      }

      if (pEndMins > closeMins) {
        return jsonError(
          res,
          `Proposed time extends past café closing time (${DEFAULT_CLOSING_TIME}).`,
          400
        )
      }

      client = await pool.connect()
      await client.query('BEGIN')

      const bRes = await client.query(
        'SELECT * FROM public.bookings WHERE id = $1 FOR UPDATE',
        [bookingId]
      )
      if (bRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return jsonError(res, 'Booking not found.', 404)
      }

      const booking = bRes.rows[0]
      const roomName = booking.room_name || DEFAULT_ROOM_NAME

      // Check slot availability for the proposed time (informational / pre-flight)
      const availability = await checkSlotAvailability(client, {
        date: proposedDate,
        roomName,
        startTime: proposedStartTime,
        endTime: proposedEndTime,
        excludeBookingId: bookingId,
        acquireLock: true,
      })

      if (!availability.available) {
        await client.query('ROLLBACK')
        return jsonError(
          res,
          `Cannot propose modification: proposed slot conflicts with ${availability.message}`,
          409,
          availability
        )
      }

      const updRes = await client.query(
        `UPDATE public.bookings
         SET status = 'modification_proposed',
             proposed_date = $1,
             proposed_start_time = $2,
             proposed_end_time = $3,
             admin_reason = $4,
             reviewed_at = NOW(),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [proposedDate, proposedStartTime, proposedEndTime, reason, bookingId]
      )

      // Queue modification notification
      if (booking.customer_email) {
        await client.query(
          `INSERT INTO public.notification_outbox (
             booking_id, channel, recipient, template_key, payload, status, created_at
           ) VALUES ($1, 'email', $2, 'booking_modification_proposed', $3, 'pending', NOW())`,
          [
            bookingId,
            booking.customer_email,
            JSON.stringify({
              customerName: booking.customer_name,
              reason,
              originalDate: booking.booking_date,
              originalTime: booking.start_time,
              proposedDate,
              proposedTime: proposedStartTime,
            }),
          ]
        )
      }

      if (booking.customer_phone) {
        await client.query(
          `INSERT INTO public.notification_outbox (
             booking_id, channel, recipient, template_key, payload, status, created_at
           ) VALUES ($1, 'whatsapp', $2, 'booking_modification_proposed', $3, 'pending', NOW())`,
          [
            bookingId,
            booking.customer_phone,
            JSON.stringify({
              customerName: booking.customer_name,
              reason,
              proposedDate,
              proposedTime: proposedStartTime,
            }),
          ]
        )
      }

      await client.query('COMMIT')
      return jsonResponse(res, {
        success: true,
        message: 'Modification proposal saved and customer notification queued.',
        data: mapRowToBooking(updRes.rows[0]),
      })
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      console.error('Error proposing modification:', err)
      return jsonError(res, err.message || 'Failed to modify booking.', 500)
    } finally {
      if (client) client.release()
    }
  }

  // ========================================================
  // 10. GET /api/bookings/:id (Admin only)
  // ========================================================
  const memberMatch = pathname.match(/^\/api\/bookings\/(\d+)$/)
  if (memberMatch && method === 'GET') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }
    const bookingId = Number(memberMatch[1])
    try {
      const result = await pool.query('SELECT * FROM public.bookings WHERE id = $1', [bookingId])
      if (result.rows.length === 0) {
        return jsonError(res, 'Booking not found.', 404)
      }
      return jsonResponse(res, {
        success: true,
        data: mapRowToBooking(result.rows[0]),
      })
    } catch (err) {
      console.error('Error fetching booking:', err)
      return jsonError(res, 'Failed to fetch booking.', 500)
    }
  }

  // ========================================================
  // 11. DELETE /api/bookings/:id (Admin only)
  // ========================================================
  if (memberMatch && method === 'DELETE') {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required.', 401)
    }
    const bookingId = Number(memberMatch[1])
    try {
      const del = await pool.query(
        'DELETE FROM public.bookings WHERE id = $1 RETURNING *',
        [bookingId]
      )
      if (del.rows.length === 0) {
        return jsonError(res, 'Booking not found.', 404)
      }
      return jsonResponse(res, {
        success: true,
        message: 'Booking deleted successfully.',
      })
    } catch (err) {
      console.error('Error deleting booking:', err)
      return jsonError(res, 'Failed to delete booking.', 500)
    }
  }

  return jsonError(res, 'Endpoint not found', 404)
}
