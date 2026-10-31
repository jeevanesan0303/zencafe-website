
// server/api/games.mjs
// Zen Café — Games & Rewards Database Integration API
// Supports admin-controlled scratch count and PostgreSQL persistence.

import { getDbPool } from '../db.mjs'
import { verifyAdminRequest } from '../auth.mjs'

/* ==========================================
   GAME CONSTANTS
========================================== */

export const GAME_KEY = 'scratch'

export const TOTAL_GAME_CARDS = 5
export const REQUIRED_WINNING_CARDS = 2

export const DEFAULT_SCRATCH_COUNT = 25
export const MIN_SCRATCH_COUNT = 5
export const MAX_SCRATCH_COUNT = 100

const MAX_BODY_BYTES = 1024 * 1024

/* ==========================================
   DEFAULT GAME CARDS
========================================== */

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

/* ==========================================
   RESPONSE HELPERS
========================================== */

function jsonResponse(res, data, status = 200) {
  if (res.headersSent || res.writableEnded) {
    return
  }

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods':
      'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-admin-token',
  })

  res.end(JSON.stringify(data))
}

function jsonError(res, message, status = 400) {
  return jsonResponse(
    res,
    {
      success: false,
      error: message,
      message,
    },
    status
  )
}

/* ==========================================
   GENERAL HELPERS
========================================== */

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function normalizeScratchCount(value) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_SCRATCH_COUNT ||
    value > MAX_SCRATCH_COUNT
  ) {
    return DEFAULT_SCRATCH_COUNT
  }

  return value
}

function parseStoredSettings(value) {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value)

    if (!isPlainObject(parsed)) {
      throw new Error(
        'Stored game settings must be an object.'
      )
    }

    return parsed
  }

  if (isPlainObject(value)) {
    return value
  }

  return {}
}

function formatUpdatedAt(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString()
}

/* ==========================================
   REQUEST BODY PARSER
========================================== */

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let totalBytes = 0
    let settled = false

    const finishError = error => {
      if (settled) return
      settled = true
      reject(error)
    }

    req.on('data', chunk => {
      if (settled) return

      totalBytes += chunk.length

      if (totalBytes > MAX_BODY_BYTES) {
        finishError(
          Object.assign(
            new Error('Payload Too Large'),
            { statusCode: 413 }
          )
        )

        // Stop collecting and processing request data.
        req.pause()
        return
      }

      chunks.push(chunk)
    })

    req.on('end', () => {
      if (settled) return

      settled = true

      const body = Buffer.concat(chunks)
        .toString('utf8')
        .trim()

      if (!body) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(body))
      } catch {
        reject(
          Object.assign(
            new Error('Invalid JSON payload.'),
            { statusCode: 400 }
          )
        )
      }
    })

    req.on('error', finishError)
    req.on('aborted', () => {
      finishError(
        Object.assign(
          new Error('Request aborted.'),
          { statusCode: 400 }
        )
      )
    })
  })
}

/* ==========================================
   VALIDATE GAME CONFIGURATION
========================================== */

export function validateGameConfigServer(config) {
  if (!isPlainObject(config)) {
    return {
      valid: false,
      error: 'Game configuration must be an object.',
    }
  }

  if (typeof config.enabled !== 'boolean') {
    return {
      valid: false,
      error:
        'The "enabled" property must be a boolean.',
    }
  }

  if (
    typeof config.scratchCount !== 'number' ||
    !Number.isInteger(config.scratchCount) ||
    config.scratchCount < MIN_SCRATCH_COUNT ||
    config.scratchCount > MAX_SCRATCH_COUNT
  ) {
    return {
      valid: false,
      error:
        `Scratch count must be a whole number between ${MIN_SCRATCH_COUNT} and ${MAX_SCRATCH_COUNT}.`,
    }
  }

  if (
    !Array.isArray(config.cards) ||
    config.cards.length !== TOTAL_GAME_CARDS
  ) {
    return {
      valid: false,
      error:
        `The game requires exactly ${TOTAL_GAME_CARDS} cards.`,
    }
  }

  const seenIds = new Set()
  let winnerCount = 0

  for (const card of config.cards) {
    if (!isPlainObject(card)) {
      return {
        valid: false,
        error:
          'Each card configuration must be an object.',
      }
    }

    const cardId = card.cardId

    if (
      typeof cardId !== 'number' ||
      !Number.isInteger(cardId) ||
      cardId < 1 ||
      cardId > TOTAL_GAME_CARDS ||
      seenIds.has(cardId)
    ) {
      return {
        valid: false,
        error:
          'Cards must have unique cardId values from 1 to 5.',
      }
    }

    seenIds.add(cardId)

    if (card.prize === null) {
      continue
    }

    if (!isPlainObject(card.prize)) {
      return {
        valid: false,
        error:
          `Card ${cardId} must have a valid prize or null.`,
      }
    }

    const prize = card.prize

    if (
      typeof prize.productId !== 'string' ||
      !prize.productId.trim() ||
      typeof prize.title !== 'string' ||
      !prize.title.trim() ||
      typeof prize.detail !== 'string' ||
      typeof prize.emoji !== 'string'
    ) {
      return {
        valid: false,
        error:
          `Card ${cardId} prize must contain valid productId, title, detail, and emoji.`,
      }
    }

    winnerCount += 1
  }

  if (winnerCount !== REQUIRED_WINNING_CARDS) {
    return {
      valid: false,
      error:
        `Exactly ${REQUIRED_WINNING_CARDS} of the five cards must have valid winning prizes (current: ${winnerCount}).`,
    }
  }

  return { valid: true }
}

/* ==========================================
   NORMALIZE VALID CARD DATA
========================================== */

function normalizeCards(cards) {
  return cards
    .map(card => ({
      cardId: card.cardId,
      prize: card.prize
        ? {
            productId:
              card.prize.productId.trim(),
            title:
              card.prize.title.trim(),
            detail:
              card.prize.detail.trim(),
            emoji:
              card.prize.emoji.trim(),
          }
        : null,
    }))
    .sort((a, b) => a.cardId - b.cardId)
}

/* ==========================================
   FORMAT DATABASE GAME CONFIG
========================================== */

function formatGameConfig(row) {
  const settings = parseStoredSettings(
    row.settings
  )

  const scratchCount = normalizeScratchCount(
    settings.scratchCount
  )

  const candidateConfig = {
    enabled: Boolean(row.is_enabled),
    scratchCount,
    cards: settings.cards,
  }

  const validation =
    validateGameConfigServer(candidateConfig)

  if (!validation.valid) {
    throw new Error(
      `Invalid stored game configuration: ${validation.error}`
    )
  }

  return {
    enabled: candidateConfig.enabled,
    scratchCount,
    cards: normalizeCards(
      candidateConfig.cards
    ),
  }
}

/* ==========================================
   MAIN GAMES ROUTE HANDLER
========================================== */

export async function handleGamesRoute(
  req,
  res,
  parsedUrl
) {
  const pathname = parsedUrl.pathname
  const method = req.method

  const isSettingsRoute =
    pathname === '/api/games/settings'

  if (!isSettingsRoute) {
    return false
  }

  /* ========================================
     OPTIONS
  ======================================== */

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods':
        'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, x-admin-token',
    })

    res.end()
    return true
  }

  /* ========================================
     GET /api/games/settings

     Public endpoint
  ======================================== */

  if (method === 'GET') {
    try {
      const pool = await getDbPool()

      const result = await pool.query(
        `
          SELECT
            game_key,
            settings,
            is_enabled,
            updated_at
          FROM public.game_settings
          WHERE game_key = $1
          LIMIT 1
        `,
        [GAME_KEY]
      )

      if (result.rows.length === 0) {
        const defaultConfig = {
          enabled: true,
          scratchCount:
            DEFAULT_SCRATCH_COUNT,
          cards: DEFAULT_CARDS,
        }

        return jsonResponse(res, {
          success: true,
          gameKey: GAME_KEY,

          // Nested format
          config: defaultConfig,

          // Backward-compatible top-level format
          enabled: defaultConfig.enabled,
          scratchCount:
            defaultConfig.scratchCount,
          cards: defaultConfig.cards,

          updatedAt: null,
          source: 'default',
        })
      }

      const row = result.rows[0]

      const config = formatGameConfig(row)

      return jsonResponse(res, {
        success: true,
        gameKey: row.game_key,

        // Shared frontend configuration
        config,

        // Backward-compatible fields
        enabled: config.enabled,
        scratchCount: config.scratchCount,
        cards: config.cards,

        updatedAt:
          formatUpdatedAt(row.updated_at),

        source: 'database',
      })
    } catch (error) {
      console.error(
        'Error fetching game settings:',
        error
      )

      return jsonError(
        res,
        'Failed to fetch game configuration.',
        500
      )
    }
  }

  /* ========================================
     PUT /api/games/settings
     POST /api/games/settings

     Admin only
  ======================================== */

  if (
    method === 'PUT' ||
    method === 'POST'
  ) {
    let authorized = false

    try {
      authorized =
        await verifyAdminRequest(req)
    } catch (error) {
      console.error(
        'Admin authentication error:',
        error
      )

      return jsonError(
        res,
        'Unable to verify admin authentication.',
        500
      )
    }

    if (!authorized) {
      return jsonError(
        res,
        'Unauthorized: Admin authentication required to update game settings.',
        401
      )
    }

    let body

    try {
      body = await parseJsonBody(req)
    } catch (error) {
      return jsonError(
        res,
        error.message ||
          'Invalid request payload.',
        error.statusCode === 413
          ? 413
          : 400
      )
    }

    const validation =
      validateGameConfigServer(body)

    if (!validation.valid) {
      return jsonError(
        res,
        validation.error,
        400
      )
    }

    try {
      const pool = await getDbPool()

      const cards = normalizeCards(
        body.cards
      )

      const scratchCount =
        body.scratchCount

      const isEnabled = body.enabled

      /*
       * Store scratchCount in the existing
       * JSONB settings column.
       *
       * No additional PostgreSQL column
       * is required.
       */

      const settingsPayload = JSON.stringify({
        cards,
        scratchCount,
      })

      const result = await pool.query(
        `
          INSERT INTO public.game_settings (
            game_key,
            settings,
            is_enabled,
            updated_at
          )
          VALUES (
            $1,
            $2::jsonb,
            $3,
            NOW()
          )
          ON CONFLICT (game_key)
          DO UPDATE SET
            settings = EXCLUDED.settings,
            is_enabled = EXCLUDED.is_enabled,
            updated_at = NOW()
          RETURNING
            game_key,
            settings,
            is_enabled,
            updated_at
        `,
        [
          GAME_KEY,
          settingsPayload,
          isEnabled,
        ]
      )

      const row = result.rows[0]

      if (!row) {
        throw new Error(
          'Database did not return the saved game settings.'
        )
      }

      const savedConfig =
        formatGameConfig(row)

      return jsonResponse(res, {
        success: true,

        message:
          'Game settings updated successfully.',

        gameKey: row.game_key,

        config: savedConfig,

        enabled: savedConfig.enabled,
        scratchCount:
          savedConfig.scratchCount,
        cards: savedConfig.cards,

        updatedAt:
          formatUpdatedAt(row.updated_at),

        source: 'database',
      })
    } catch (error) {
      console.error(
        'Error updating game settings:',
        error
      )

      return jsonError(
        res,
        'Failed to update game settings.',
        500
      )
    }
  }

  return jsonError(
    res,
    'Method not allowed.',
    405
  )
}
