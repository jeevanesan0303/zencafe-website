
import { getAdminAuthHeaders } from '../admin-auth'

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
  cards: GameCardConfig[]
}

export const GAME_CONFIG_KEY = 'zen-cafe-scratch-game-v1'
export const GAME_CONFIG_EVENT = 'zen-cafe-scratch-game-change'

export const DEFAULT_GAME_CONFIG: GameConfig = {
  enabled: true,
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

export function isValidGameConfig(
  value: unknown
): value is GameConfig {
  if (!value || typeof value !== 'object') {
    return false
  }

  const config = value as Partial<GameConfig>

  if (
    typeof config.enabled !== 'boolean' ||
    !Array.isArray(config.cards) ||
    config.cards.length !== 5
  ) {
    return false
  }

  const cardIds = new Set<number>()
  let winningCards = 0

  for (const card of config.cards) {
    if (
      !card ||
      !Number.isInteger(card.cardId) ||
      card.cardId < 1 ||
      card.cardId > 5 ||
      cardIds.has(card.cardId)
    ) {
      return false
    }

    cardIds.add(card.cardId)

    if (card.prize !== null) {
      winningCards++

      if (
        !card.prize ||
        typeof card.prize.productId !== 'string' ||
        !card.prize.productId.trim() ||
        typeof card.prize.title !== 'string' ||
        !card.prize.title.trim() ||
        typeof card.prize.detail !== 'string' ||
        typeof card.prize.emoji !== 'string'
      ) {
        return false
      }
    }
  }

  return winningCards === 2
}

export function readGameConfig(): GameConfig {
  try {
    const stored = localStorage.getItem(GAME_CONFIG_KEY)

    if (stored) {
      const parsed: unknown = JSON.parse(stored)

      if (isValidGameConfig(parsed)) {
        return parsed
      }
    }
  } catch (error) {
    console.warn('Unable to read game configuration:', error)
  }

  return DEFAULT_GAME_CONFIG
}

export async function fetchGameConfig(): Promise<GameConfig> {
  try {
    const res = await fetch('/api/games/settings', {
      headers: {
        Accept: 'application/json',
      },
    })
    if (res.ok) {
      const data = await res.json()
      const rawConfig = data.config || {
        enabled: data.enabled ?? true,
        cards: data.cards || [],
      }
      if (isValidGameConfig(rawConfig)) {
        localStorage.setItem(GAME_CONFIG_KEY, JSON.stringify(rawConfig))
        window.dispatchEvent(new Event(GAME_CONFIG_EVENT))
        return rawConfig
      }
    }
  } catch (err) {
    console.warn('Failed to fetch game configuration from API:', err)
  }
  return readGameConfig()
}

export async function saveGameConfig(config: GameConfig): Promise<void> {
  if (!isValidGameConfig(config)) {
    throw new Error(
      'Exactly two of the five cards must have valid prizes.'
    )
  }

  localStorage.setItem(
    GAME_CONFIG_KEY,
    JSON.stringify(config)
  )

  window.dispatchEvent(new Event(GAME_CONFIG_EVENT))

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...getAdminAuthHeaders(),
  }

  const res = await fetch('/api/games/settings', {
    method: 'PUT',
    headers,
    body: JSON.stringify(config),
  })

  if (!res.ok) {
    let errMsg = 'Failed to persist game settings.'
    try {
      const errData = await res.json()
      if (errData.error || errData.message) {
        errMsg = errData.error || errData.message
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errMsg)
  }

  try {
    const result = await res.json()
    if (result.config && isValidGameConfig(result.config)) {
      localStorage.setItem(GAME_CONFIG_KEY, JSON.stringify(result.config))
    }
  } catch {
    // ignore
  }
}

export function subscribeGameConfig(
  callback: () => void
): () => void {
  window.addEventListener('storage', callback)
  window.addEventListener(GAME_CONFIG_EVENT, callback)

  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(GAME_CONFIG_EVENT, callback)
  }
}
