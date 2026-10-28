// server/api/games.mjs
// Zen Café — Phase 6: Games & Rewards Database Integration API

import { getDbPool } from '../db.mjs'
import { verifyAdminRequest } from '../auth.mjs'

export const DEFAULT_CARDS = [
  {
    cardId: 1,
    prize: {
      productId: 'demo-iced-coffee',
      title: 'Iced Coffee',
      detail: 'A cool Zen Café treat.',
      emoji: '🧋',
    },
  },
  {
    cardId: 2,
    prize: null,
  },
  {
    cardId: 3,
    prize: null,
  },
  {
    cardId: 4,
    prize: {
      productId: 'demo-burger',
      title: 'Zen Burger',
      detail: 'A delicious little surprise.',
      emoji: '🍔',
    },
  },
  {
    cardId: 5,
    prize: null,
  },
]

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token',
  })
  res.end(JSON.stringify(data))
}

function jsonError(res, message, status = 400) {
  jsonResponse(res, { success: false, error: message, message }, status)
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload Too Large'))
      }
    })
    req.on('end', () => {
      if (!body) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(new Error('Invalid JSON payload: ' + err.message))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Validate game configuration server-side
 */
export function validateGameConfigServer(config) {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'Game configuration must be an object.' }
  }

  if (typeof config.enabled !== 'boolean') {
    return { valid: false, error: 'The "enabled" property must be a boolean.' }
  }

  if (!Array.isArray(config.cards) || config.cards.length !== 5) {
    return { valid: false, error: 'The game requires exactly 5 cards.' }
  }

  const seenIds = new Set()
  let winnerCount = 0

  for (const card of config.cards) {
    if (!card || typeof card !== 'object') {
      return { valid: false, error: 'Each card configuration must be an object.' }
    }

    const cardId = Number(card.cardId)
    if (!Number.isInteger(cardId) || cardId < 1 || cardId > 5 || seenIds.has(cardId)) {
      return { valid: false, error: 'Cards must have unique cardId values from 1 to 5.' }
    }
    seenIds.add(cardId)

    if (card.prize !== null && card.prize !== undefined) {
      winnerCount++
      const p = card.prize
      if (
        typeof p !== 'object' ||
        typeof p.productId !== 'string' || !p.productId.trim() ||
        typeof p.title !== 'string' || !p.title.trim() ||
        typeof p.detail !== 'string' ||
        typeof p.emoji !== 'string'
      ) {
        return {
          valid: false,
          error: `Card ${cardId} prize must contain valid productId, title, detail, and emoji.`,
        }
      }
    }
  }

  if (winnerCount !== 2) {
    return {
      valid: false,
      error: `Exactly two of the five cards must have valid winning prizes (current: ${winnerCount}).`,
    }
  }

  return { valid: true }
}

/**
 * Main Games Route Handler
 */
export async function handleGamesRoute(req, res, parsedUrl) {
  const pool = await getDbPool()
  const pathname = parsedUrl.pathname
  const method = req.method

  // 1. GET /api/games/settings (Public: read game configuration)
  if (pathname === '/api/games/settings' && method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT game_key, settings, is_enabled, updated_at
         FROM public.game_settings
         WHERE game_key = 'scratch'`
      )

      if (result.rows.length === 0) {
        // Return defaults
        return jsonResponse(res, {
          success: true,
          gameKey: 'scratch',
          enabled: true,
          cards: DEFAULT_CARDS,
          source: 'default',
        })
      }

      const row = result.rows[0]
      const settingsData = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings
      const cards = Array.isArray(settingsData?.cards) ? settingsData.cards : DEFAULT_CARDS

      return jsonResponse(res, {
        success: true,
        gameKey: row.game_key,
        enabled: Boolean(row.is_enabled),
        cards,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        source: 'database',
      })
    } catch (err) {
      console.error('Error fetching game settings:', err)
      return jsonError(res, 'Failed to fetch game configuration.', 500)
    }
  }

  // 2. PUT or POST /api/games/settings (Admin: update game configuration)
  if (pathname === '/api/games/settings' && (method === 'PUT' || method === 'POST')) {
    if (!(await verifyAdminRequest(req))) {
      return jsonError(res, 'Unauthorized: Admin authentication required to update game settings.', 401)
    }

    try {
      const body = await parseJsonBody(req)
      const validation = validateGameConfigServer(body)
      if (!validation.valid) {
        return jsonError(res, validation.error, 400)
      }

      const cards = body.cards.map(c => ({
        cardId: Number(c.cardId),
        prize: c.prize
          ? {
              productId: String(c.prize.productId).trim(),
              title: String(c.prize.title).trim(),
              detail: String(c.prize.detail || '').trim(),
              emoji: String(c.prize.emoji || '🎁').trim(),
            }
          : null,
      }))

      const settingsPayload = JSON.stringify({ cards })
      const isEnabled = Boolean(body.enabled)

      const result = await pool.query(
        `INSERT INTO public.game_settings (game_key, settings, is_enabled, updated_at)
         VALUES ('scratch', $1::jsonb, $2, NOW())
         ON CONFLICT (game_key) DO UPDATE
         SET settings = $1::jsonb, is_enabled = $2, updated_at = NOW()
         RETURNING game_key, settings, is_enabled, updated_at`,
        [settingsPayload, isEnabled]
      )

      const row = result.rows[0]
      const savedSettings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings

      return jsonResponse(res, {
        success: true,
        message: 'Game settings updated successfully.',
        gameKey: row.game_key,
        config: {
          enabled: Boolean(row.is_enabled),
          cards: savedSettings.cards || cards,
        },
        updatedAt: new Date(row.updated_at).toISOString(),
      })
    } catch (err) {
      console.error('Error updating game settings:', err)
      return jsonError(res, err.message || 'Failed to update game settings.', 500)
    }
  }

  return false
}
