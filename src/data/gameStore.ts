
import { getAdminAuthHeaders } from '../admin-auth'

/* ==========================================
   ZEN CAFÉ — SCRATCH GAME STORE
========================================== */

/* ==========================================
   TYPES
========================================== */

export type GamePrize = {
  productId: string
  title: string
  detail: string
  emoji: string
}

export type GameCardConfig = {
  cardId: number
  prize: GamePrize | null
}

export type GameConfig = {
  enabled: boolean
  scratchCount: number
  cards: GameCardConfig[]
}

/* ==========================================
   CONSTANTS
========================================== */

export const GAME_CONFIG_KEY =
  'zen-cafe-scratch-game-v1'

export const GAME_CONFIG_EVENT =
  'zen-cafe-scratch-game-change'

export const DEFAULT_SCRATCH_COUNT = 25

export const MIN_SCRATCH_COUNT = 5

export const MAX_SCRATCH_COUNT = 100

export const TOTAL_GAME_CARDS = 5

export const REQUIRED_WINNING_CARDS = 2

const GAME_SETTINGS_ENDPOINT =
  '/api/games/settings'

/* ==========================================
   DEFAULT CONFIGURATION
========================================== */

export const DEFAULT_GAME_CONFIG: GameConfig = {
  enabled: true,

  scratchCount: DEFAULT_SCRATCH_COUNT,

  cards: [
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
  ],
}

/* ==========================================
   INTERNAL TYPES
========================================== */

type UnknownRecord = Record<string, unknown>

type GameSettingsResponse = {
  config?: unknown
  enabled?: unknown
  scratchCount?: unknown
  cards?: unknown
  error?: unknown
  message?: unknown
}

/* ==========================================
   HELPERS
========================================== */

function isRecord(
  value: unknown
): value is UnknownRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function isValidScratchCount(
  value: unknown
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_SCRATCH_COUNT &&
    value <= MAX_SCRATCH_COUNT
  )
}

export function normalizeScratchCount(
  value: unknown
): number {
  return isValidScratchCount(value)
    ? value
    : DEFAULT_SCRATCH_COUNT
}

/* ==========================================
   VALIDATE GAME CONFIGURATION
========================================== */

export function isValidGameConfig(
  value: unknown
): value is GameConfig {
  if (!isRecord(value)) {
    return false
  }

  if (
    typeof value.enabled !== 'boolean' ||
    !isValidScratchCount(value.scratchCount) ||
    !Array.isArray(value.cards) ||
    value.cards.length !== TOTAL_GAME_CARDS
  ) {
    return false
  }

  const cardIds = new Set<number>()

  let winningCards = 0

  for (const item of value.cards) {
    if (!isRecord(item)) {
      return false
    }

    const cardId = item.cardId

    if (
      typeof cardId !== 'number' ||
      !Number.isInteger(cardId) ||
      cardId < 1 ||
      cardId > TOTAL_GAME_CARDS ||
      cardIds.has(cardId)
    ) {
      return false
    }

    cardIds.add(cardId)

    const prize = item.prize

    if (prize === null) {
      continue
    }

    winningCards += 1

    if (!isRecord(prize)) {
      return false
    }

    if (
      typeof prize.productId !== 'string' ||
      !prize.productId.trim() ||
      typeof prize.title !== 'string' ||
      !prize.title.trim() ||
      typeof prize.detail !== 'string' ||
      typeof prize.emoji !== 'string'
    ) {
      return false
    }
  }

  return (
    cardIds.size === TOTAL_GAME_CARDS &&
    winningCards === REQUIRED_WINNING_CARDS
  )
}

/* ==========================================
   NORMALIZE LEGACY CONFIGURATION

   Older saved configurations may not
   contain scratchCount.

   Those configurations automatically
   receive the default value of 25.

   Invalid explicit scratch counts are
   rejected instead of silently replaced.
========================================== */

export function normalizeGameConfig(
  value: unknown
): GameConfig | null {
  if (!isRecord(value)) {
    return null
  }

  const scratchCount =
    value.scratchCount === undefined
      ? DEFAULT_SCRATCH_COUNT
      : value.scratchCount

  const normalized: unknown = {
    ...value,
    scratchCount,
  }

  if (!isValidGameConfig(normalized)) {
    return null
  }

  return normalized
}

/* ==========================================
   STORAGE HELPERS
========================================== */

function notifyGameConfigChange(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new Event(GAME_CONFIG_EVENT)
  )
}

function persistGameConfig(
  config: GameConfig
): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      GAME_CONFIG_KEY,
      JSON.stringify(config)
    )
  } catch (error) {
    console.warn(
      'Unable to cache game configuration:',
      error
    )
  }

  notifyGameConfigChange()
}

/* ==========================================
   READ GAME CONFIGURATION
========================================== */

export function readGameConfig(): GameConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_GAME_CONFIG
  }

  try {
    const stored = window.localStorage.getItem(
      GAME_CONFIG_KEY
    )

    if (stored) {
      const parsed: unknown = JSON.parse(stored)

      const normalized =
        normalizeGameConfig(parsed)

      if (normalized) {
        return normalized
      }
    }
  } catch (error) {
    console.warn(
      'Unable to read game configuration:',
      error
    )
  }

  return DEFAULT_GAME_CONFIG
}

/* ==========================================
   PARSE API RESPONSE
========================================== */

function extractGameConfig(
  response: unknown
): GameConfig | null {
  if (!isRecord(response)) {
    return null
  }

  const data =
    response as GameSettingsResponse

  /*
   * Supports:
   *
   * { config: { enabled, scratchCount, cards } }
   *
   * and:
   *
   * { enabled, scratchCount, cards }
   */

  const rawConfig =
    data.config !== undefined
      ? data.config
      : {
          enabled: data.enabled,
          scratchCount: data.scratchCount,
          cards: data.cards,
        }

  return normalizeGameConfig(rawConfig)
}

/* ==========================================
   FETCH LIVE GAME CONFIGURATION
========================================== */

export async function fetchGameConfig():
  Promise<GameConfig> {
  try {
    const response = await fetch(
      GAME_SETTINGS_ENDPOINT,
      {
        method: 'GET',

        headers: {
          Accept: 'application/json',
        },

        cache: 'no-store',
      }
    )

    if (!response.ok) {
      throw new Error(
        `Unable to fetch game settings (${response.status}).`
      )
    }

    const data: unknown =
      await response.json()

    const config =
      extractGameConfig(data)

    if (!config) {
      throw new Error(
        'The game API returned an invalid configuration.'
      )
    }

    persistGameConfig(config)

    return config
  } catch (error) {
    console.warn(
      'Failed to fetch live game configuration:',
      error
    )

    return readGameConfig()
  }
}

/* ==========================================
   SAVE GAME CONFIGURATION

   Important:
   - Validate first.
   - Send to API.
   - Check the API response.
   - Cache only after successful save.
========================================== */

export async function saveGameConfig(
  config: GameConfig
): Promise<void> {
  if (!isValidGameConfig(config)) {
    throw new Error(
      'Invalid game settings. Exactly two of the five cards must have valid prizes, and the scratch count must be between 5 and 100.'
    )
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...getAdminAuthHeaders(),
  }

  let response: Response

  try {
    response = await fetch(
      GAME_SETTINGS_ENDPOINT,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(config),
      }
    )
  } catch {
    throw new Error(
      'Unable to connect to the game settings API. Please check your connection and try again.'
    )
  }

  if (!response.ok) {
    let errorMessage =
      'Failed to save game settings.'

    try {
      const errorData: unknown =
        await response.json()

      if (isRecord(errorData)) {
        if (
          typeof errorData.error === 'string'
        ) {
          errorMessage = errorData.error
        } else if (
          typeof errorData.message === 'string'
        ) {
          errorMessage = errorData.message
        }
      }
    } catch {
      // Keep the default error message.
    }

    throw new Error(errorMessage)
  }

  /*
   * Some APIs return a saved configuration,
   * while others return only a success message.
   *
   * We check the returned configuration when
   * one is provided.
   */

  let savedConfig: GameConfig = config

  const responseText =
    await response.text()

  if (responseText.trim()) {
    let responseData: unknown

    try {
      responseData = JSON.parse(
        responseText
      )
    } catch {
      throw new Error(
        'The game API returned an invalid JSON response.'
      )
    }

    if (isRecord(responseData)) {
      const hasReturnedConfig =
        responseData.config !== undefined ||
        (
          responseData.enabled !== undefined &&
          responseData.cards !== undefined
        )

      if (hasReturnedConfig) {
        const returnedConfig =
          extractGameConfig(responseData)

        if (!returnedConfig) {
          throw new Error(
            'The game API returned invalid saved settings.'
          )
        }

        /*
         * An older backend may silently discard
         * scratchCount. Reject that response.
         */

        if (
          returnedConfig.scratchCount !==
          config.scratchCount
        ) {
          throw new Error(
            'The game API did not preserve the required scratch count. Please update the backend game settings endpoint.'
          )
        }

        savedConfig = returnedConfig
      }
    }
  }

  /*
   * Cache the accepted configuration.
   *
   * Note: If the backend returns only a success
   * message, this does not prove that it stored
   * scratchCount. The admin page performs a
   * separate GET verification.
   */

  persistGameConfig(savedConfig)
}

/* ==========================================
   SUBSCRIBE TO GAME CONFIGURATION CHANGES
========================================== */

export function subscribeGameConfig(
  callback: () => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const onStorageChange = (
    event: StorageEvent
  ) => {
    if (
      event.key === GAME_CONFIG_KEY ||
      event.key === null
    ) {
      callback()
    }
  }

  window.addEventListener(
    'storage',
    onStorageChange
  )

  window.addEventListener(
    GAME_CONFIG_EVENT,
    callback
  )

  return () => {
    window.removeEventListener(
      'storage',
      onStorageChange
    )

    window.removeEventListener(
      GAME_CONFIG_EVENT,
      callback
    )
  }
}
