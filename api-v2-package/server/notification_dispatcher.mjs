// server/notification_dispatcher.mjs
// Zen Café — Phase 3: Outbox Notification Dispatcher Architecture
// Handles delivery to Resend (Email) and Meta Cloud API (WhatsApp) with retries, error handling, and duplicate-send prevention.

import dotenv from 'dotenv'
dotenv.config()

const MAX_ATTEMPTS = 5
const RESEND_API_URL = 'https://api.resend.com/emails'
const WHATSAPP_API_BASE = 'https://graph.facebook.com/v20.0'

/**
 * Audit delivery credentials
 */
export function checkNotificationCredentials() {
  const resendKey = process.env.RESEND_API_KEY || ''
  const resendFrom = process.env.RESEND_FROM_EMAIL || 'Zen Café <bookings@zencafe.lk>'
  const whatsappToken = process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_TOKEN || ''
  const whatsappPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || ''

  return {
    email: {
      provider: 'Resend',
      configured: Boolean(resendKey && resendKey.startsWith('re_')),
      hasKey: Boolean(resendKey),
      from: resendFrom,
      blocker: !resendKey ? 'Missing RESEND_API_KEY in environment' : null,
    },
    whatsapp: {
      provider: 'WhatsApp Cloud API',
      configured: Boolean(whatsappToken && whatsappPhoneId),
      hasToken: Boolean(whatsappToken),
      hasPhoneId: Boolean(whatsappPhoneId),
      blocker: !whatsappToken
        ? 'Missing WHATSAPP_API_TOKEN in environment'
        : !whatsappPhoneId
        ? 'Missing WHATSAPP_PHONE_NUMBER_ID in environment'
        : null,
    },
  }
}

/**
 * Format email HTML based on template_key and payload
 */
function buildEmailContent(templateKey, payload) {
  const { customerName, date, time, reason, roomName = 'Private Dining Room' } = payload || {}

  switch (templateKey) {
    case 'booking_confirmed':
      return {
        subject: `Your Booking at Zen Café is Confirmed! (Date: ${date})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0e6dc; border-radius: 12px; background: #fffcf8;">
            <h2 style="color: #a32722; margin-top: 0;">Reservation Confirmed</h2>
            <p>Dear <strong>${customerName || 'Valued Guest'}</strong>,</p>
            <p>We are delighted to confirm your room reservation at <strong>Zen Café</strong>!</p>
            <div style="background: #fdf5ec; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 6px 0;"><strong>Room:</strong> ${roomName}</p>
              <p style="margin: 6px 0;"><strong>Date:</strong> ${date}</p>
              <p style="margin: 6px 0;"><strong>Start Time:</strong> ${time}</p>
            </div>
            <p>If you need to make any changes, please reply to this email or reach us on WhatsApp at +94 70 517 5174.</p>
            <p style="color: #7d6b63; font-size: 13px; margin-top: 30px;">Warm regards,<br/>The Zen Café Team</p>
          </div>
        `,
      }

    case 'booking_rejected':
      return {
        subject: `Update regarding your Zen Café booking request (${date})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0e6dc; border-radius: 12px; background: #fffcf8;">
            <h2 style="color: #695950; margin-top: 0;">Booking Update</h2>
            <p>Dear <strong>${customerName || 'Valued Guest'}</strong>,</p>
            <p>Thank you for choosing Zen Café. Unfortunately, we are unable to accept your reservation request for <strong>${date} at ${time}</strong>.</p>
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
            <p>We would love to host you at another time. Please feel free to check alternative availability or call us directly.</p>
            <p style="color: #7d6b63; font-size: 13px; margin-top: 30px;">Warm regards,<br/>The Zen Café Team</p>
          </div>
        `,
      }

    case 'booking_modification_proposed':
      return {
        subject: `Alternative time proposed for your Zen Café booking (${payload?.proposedDate || date})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0e6dc; border-radius: 12px; background: #fffcf8;">
            <h2 style="color: #b3531b; margin-top: 0;">Alternative Time Proposed</h2>
            <p>Dear <strong>${customerName || 'Valued Guest'}</strong>,</p>
            <p>Thank you for your reservation request. We have an alternative time slot suggestion for you:</p>
            <div style="background: #fff8f0; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #b3531b;">
              <p style="margin: 6px 0;"><strong>Proposed Date:</strong> ${payload?.proposedDate || date}</p>
              <p style="margin: 6px 0;"><strong>Proposed Time:</strong> ${payload?.proposedStartTime || time}</p>
              ${reason ? `<p style="margin: 6px 0;"><strong>Note:</strong> ${reason}</p>` : ''}
            </div>
            <p>Please contact us at +94 70 517 5174 or reply to confirm if this proposed time works for you.</p>
            <p style="color: #7d6b63; font-size: 13px; margin-top: 30px;">Warm regards,<br/>The Zen Café Team</p>
          </div>
        `,
      }

    default:
      return {
        subject: `Notification from Zen Café`,
        html: `<p>Dear ${customerName || 'Guest'}, you have an update regarding your booking.</p>`,
      }
  }
}

/**
 * Dispatch a single outbox record
 */
export async function sendOutboxItem(client, item, creds) {
  const { id, channel, recipient, template_key, payload, attempts } = item
  const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload || {}

  // 1. Channel: EMAIL (via Resend)
  if (channel === 'email') {
    if (!creds.email.configured) {
      throw new Error(`[EMAIL_BLOCKED] ${creds.email.blocker}`)
    }

    const { subject, html } = buildEmailContent(template_key, parsedPayload)
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: creds.email.from,
        to: [recipient],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Resend API HTTP ${res.status}: ${errText}`)
    }

    return await res.json()
  }

  // 2. Channel: WHATSAPP (via WhatsApp Cloud API)
  if (channel === 'whatsapp') {
    if (!creds.whatsapp.configured) {
      throw new Error(`[WHATSAPP_BLOCKED] ${creds.whatsapp.blocker}`)
    }

    const cleanPhone = recipient.replace(/\D/g, '')
    const url = `${WHATSAPP_API_BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`
    const messageText = `*Zen Café Update*\nDear ${parsedPayload.customerName || 'Guest'},\n${
      template_key === 'booking_confirmed'
        ? `Your reservation for ${parsedPayload.date} at ${parsedPayload.time} is CONFIRMED!`
        : template_key === 'booking_rejected'
        ? `Your reservation request for ${parsedPayload.date} at ${parsedPayload.time} could not be accepted. Note: ${parsedPayload.reason || 'Slot unavailable'}`
        : `An alternative time was proposed: ${parsedPayload.proposedDate} at ${parsedPayload.proposedStartTime}. Note: ${parsedPayload.reason || ''}`
    }\nFor assistance, call +94 70 517 5174.`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: messageText },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`WhatsApp API HTTP ${res.status}: ${errText}`)
    }

    return await res.json()
  }

  throw new Error(`Unsupported channel: ${channel}`)
}

/**
 * Run one dispatch cycle across pending outbox records
 * Concurrency-safe: Locks rows using FOR UPDATE SKIP LOCKED
 */
export async function processOutboxQueue(pool, { batchSize = 10, dryRun = false } = {}) {
  const creds = checkNotificationCredentials()
  const stats = {
    totalChecked: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    blocked: 0,
    errors: [],
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Find pending notifications with attempts under maximum
    // Using FOR UPDATE SKIP LOCKED to prevent multiple workers from double-sending
    const res = await client.query(
      `SELECT * FROM public.notification_outbox
       WHERE status = 'pending' AND attempts < $1
       ORDER BY created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [MAX_ATTEMPTS, batchSize]
    )

    stats.totalChecked = res.rows.length

    for (const item of res.rows) {
      const newAttempts = Number(item.attempts || 0) + 1

      if (dryRun) {
        stats.blocked++
        stats.errors.push(`[Dry Run] Skipped item #${item.id} (${item.channel})`)
        continue
      }

      // Check whether this channel has credentials
      const channelBlocked =
        (item.channel === 'email' && !creds.email.configured) ||
        (item.channel === 'whatsapp' && !creds.whatsapp.configured)

      if (channelBlocked) {
        const reason =
          item.channel === 'email' ? creds.email.blocker : creds.whatsapp.blocker
        stats.blocked++
        stats.errors.push(`Item #${item.id} (${item.channel}): ${reason}`)
        // Record attempt and reason without marking permanently failed if credentials may be added later
        await client.query(
          `UPDATE public.notification_outbox 
           SET attempts = $1, last_error = $2 
           WHERE id = $3`,
          [newAttempts, reason, item.id]
        )
        continue
      }

      try {
        // Transition to 'processing' before external API call
        await client.query(
          `UPDATE public.notification_outbox SET status = 'processing', attempts = $1 WHERE id = $2`,
          [newAttempts, item.id]
        )

        // Dispatch to provider
        await sendOutboxItem(client, item, creds)

        // Mark as sent
        await client.query(
          `UPDATE public.notification_outbox 
           SET status = 'sent', sent_at = NOW(), last_error = NULL 
           WHERE id = $1`,
          [item.id]
        )
        stats.sent++
      } catch (err) {
        const isExhausted = newAttempts >= MAX_ATTEMPTS
        const newStatus = isExhausted ? 'failed' : 'pending'

        await client.query(
          `UPDATE public.notification_outbox 
           SET status = $1, last_error = $2 
           WHERE id = $3`,
          [newStatus, err.message, item.id]
        )

        if (isExhausted) {
          stats.failed++
        } else {
          stats.retried++
        }
        stats.errors.push(`Item #${item.id} error: ${err.message}`)
      }
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  return { creds, stats }
}

// Standalone execution for auditing / verification
if (process.argv[1] && process.argv[1].endsWith('notification_dispatcher.mjs')) {
  import('./db.mjs').then(async ({ getDbPool }) => {
    console.log('\n=== NOTIFICATION DISPATCHER AUDIT ===\n')
    const creds = checkNotificationCredentials()
    console.log('Provider Credentials Status:')
    console.log(' - Resend (Email):', creds.email.configured ? '✅ Configured' : `❌ ${creds.email.blocker}`)
    console.log(' - WhatsApp Cloud:', creds.whatsapp.configured ? '✅ Configured' : `❌ ${creds.whatsapp.blocker}`)

    try {
      const pool = await getDbPool()
      const result = await processOutboxQueue(pool, { dryRun: true })
      console.log('\nOutbox Queue Status:', result.stats)
      process.exit(0)
    } catch (err) {
      console.error('Queue inspection error:', err.message)
      process.exit(1)
    }
  })
}
