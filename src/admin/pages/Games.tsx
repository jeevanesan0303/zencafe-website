
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

import {
  Check,
  CircleHelp,
  Gamepad2,
  Gift,
  Hand,
  Minus,
  Plus,
  Power,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trophy,
  UtensilsCrossed,
} from 'lucide-react'

import {
  getScratchRewardProducts,
  subscribeMenuCatalog,
  type ScratchRewardProduct,
} from '../../data/menuStore'

import {
  readGameConfig,
  fetchGameConfig,
  saveGameConfig,
  subscribeGameConfig,
  type GameConfig,
  type GamePrize,
} from '../../data/gameStore'

import AdminAlert from '../utils/sweetAlert'

/* ==========================================
   ZEN CAFÉ — GAMES & REWARDS
========================================== */

type Props = {
  query?: string
}

type CardDraft = {
  cardId: number
  winning: boolean
  productId: string
}

type ScratchGameConfig = GameConfig & {
  scratchCount: number
}

const TOTAL_CARDS = 5
const REQUIRED_WINNERS = 2

const DEFAULT_SCRATCH_COUNT = 25
const MIN_SCRATCH_COUNT = 5
const MAX_SCRATCH_COUNT = 100

const CARD_IMAGES = [
  '/assets/Game/Card/game-1.png.png',
  '/assets/Game/Card/game-2.png.png',
  '/assets/Game/Card/game-3.png.png',
  '/assets/Game/Card/game-4.png.png',
  '/assets/Game/Card/game-5.png.png',
]

const COLORS = {
  primary: '#852B3A',
  primaryDark: '#6B2030',
  heading: '#48282E',
  text: '#88777A',
  border: '#EFE5E2',
  green: '#278157',
  background: '#FFFFFF',
}

const sectionStyle: CSSProperties = {
  background: COLORS.background,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 18,
  padding: 22,
  boxShadow: '0 5px 20px rgba(65,32,35,0.035)',
}

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 19,
  fontWeight: 750,
  color: COLORS.heading,
}

const descriptionStyle: CSSProperties = {
  margin: '7px 0 0',
  fontSize: 13,
  lineHeight: 1.7,
  color: COLORS.text,
}

function normalizeScratchCount(value: unknown): number {
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

function getScratchCount(config: GameConfig): number {
  return normalizeScratchCount(
    (config as GameConfig & {
      scratchCount?: unknown
    }).scratchCount
  )
}

function configToDraft(
  config: GameConfig,
  products: ScratchRewardProduct[]
): CardDraft[] {
  return Array.from(
    { length: TOTAL_CARDS },
    (_, index) => {
      const cardId = index + 1

      const savedCard = config.cards.find(
        card => card.cardId === cardId
      )

      const winning = savedCard?.prize != null

      const savedProductId =
        savedCard?.prize?.productId || ''

      const validProduct = products.some(
        product => product.id === savedProductId
      )

      return {
        cardId,
        winning,
        productId: validProduct
          ? savedProductId
          : '',
      }
    }
  )
}

function productToPrize(
  product: ScratchRewardProduct
): GamePrize {
  return {
    productId: product.id,
    title: product.name,
    detail:
      product.description ||
      `You've won ${product.name} from Zen Café!`,
    emoji:
      product.kind === 'drink'
        ? '🥤'
        : '🍽️',
  }
}

/* ==========================================
   ADMIN GAMES COMPONENT
========================================== */

export default function Games({
  query: _query = '',
}: Props) {
  const initialConfig = readGameConfig()

  const [savedConfig, setSavedConfig] =
    useState<GameConfig>(() => readGameConfig())

  const [products, setProducts] =
    useState<ScratchRewardProduct[]>(
      () => getScratchRewardProducts()
    )

  const [cards, setCards] =
    useState<CardDraft[]>(() =>
      configToDraft(
        readGameConfig(),
        getScratchRewardProducts()
      )
    )

  const [enabled, setEnabled] = useState(
    initialConfig.enabled
  )

  const [scratchCount, setScratchCount] =
    useState<number>(
      () => getScratchCount(readGameConfig())
    )

  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  /* ==========================================
     LOAD CONFIGURATION
  ========================================== */

  useEffect(() => {
    let mounted = true

    fetchGameConfig()
      .then(config => {
        if (!mounted) return

        const latestProducts =
          getScratchRewardProducts()

        setProducts(latestProducts)
        setSavedConfig(config)

        setCards(
          configToDraft(config, latestProducts)
        )

        setEnabled(config.enabled)
        setScratchCount(getScratchCount(config))
      })
      .catch(error => {
        console.warn(
          'Unable to load game configuration:',
          error
        )
      })

    const unsubscribe = subscribeGameConfig(() => {
      if (!mounted || savingRef.current) return

      setSavedConfig(readGameConfig())
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  /* ==========================================
     MENU PRODUCTS SUBSCRIPTION
  ========================================== */

  useEffect(() => {
    const refreshProducts = () => {
      setProducts(getScratchRewardProducts())
    }

    return subscribeMenuCatalog(
      refreshProducts
    )
  }, [])

  /* ==========================================
     DERIVED VALUES
  ========================================== */

  const winningCards = useMemo(
    () => cards.filter(card => card.winning),
    [cards]
  )

  const winningCount = winningCards.length
  const losingCount = TOTAL_CARDS - winningCount

  const missingPrizeCards = useMemo(
    () =>
      winningCards.filter(
        card =>
          !products.some(
            product =>
              product.id === card.productId
          )
      ),
    [winningCards, products]
  )

  const savedScratchCount =
    getScratchCount(savedConfig)

  const hasChanges = useMemo(() => {
    if (enabled !== savedConfig.enabled) {
      return true
    }

    if (
      scratchCount !==
      getScratchCount(savedConfig)
    ) {
      return true
    }

    return cards.some(card => {
      const saved = savedConfig.cards.find(
        item => item.cardId === card.cardId
      )

      const savedWinning =
        saved?.prize != null

      const savedProductId =
        saved?.prize?.productId || ''

      return (
        card.winning !== savedWinning ||
        (
          card.winning &&
          card.productId !== savedProductId
        )
      )
    })
  }, [
    cards,
    enabled,
    scratchCount,
    savedConfig,
  ])

  /* ==========================================
     SCRATCH COUNT CONTROL
  ========================================== */

  function updateScratchCount(value: number) {
    if (savingRef.current) return

    if (!Number.isFinite(value)) return

    const next = Math.max(
      MIN_SCRATCH_COUNT,
      Math.min(
        MAX_SCRATCH_COUNT,
        Math.round(value)
      )
    )

    setScratchCount(next)
  }

  /* ==========================================
     WINNING CARD SELECTION
  ========================================== */

  function toggleWinner(cardId: number) {
    if (savingRef.current) return

    const selected = cards.find(
      card => card.cardId === cardId
    )

    if (!selected) return

    if (
      !selected.winning &&
      winningCount >= REQUIRED_WINNERS
    ) {
      void AdminAlert.warning(
        'Only Two Winning Cards',
        'You can select only two winning cards. Deselect another winning card first.'
      )
      return
    }

    setCards(previous =>
      previous.map(card =>
        card.cardId === cardId
          ? {
              ...card,
              winning: !card.winning,
              productId: card.winning
                ? ''
                : card.productId,
            }
          : card
      )
    )
  }

  function updatePrize(
    cardId: number,
    productId: string
  ) {
    if (savingRef.current) return

    setCards(previous =>
      previous.map(card =>
        card.cardId === cardId
          ? {
              ...card,
              productId,
            }
          : card
      )
    )
  }

  /* ==========================================
     RESET UNSAVED CHANGES
  ========================================== */

  function resetChanges() {
    if (savingRef.current) return

    const config = savedConfig
    const latestProducts =
      getScratchRewardProducts()

    setProducts(latestProducts)

    setCards(
      configToDraft(config, latestProducts)
    )

    setEnabled(config.enabled)

    setScratchCount(
      getScratchCount(config)
    )
  }

  /* ==========================================
     SAVE GAME SETTINGS
  ========================================== */

  async function handleSave() {
    if (savingRef.current) return

    if (winningCount !== REQUIRED_WINNERS) {
      await AdminAlert.warning(
        'Invalid Winning Cards',
        'Please select exactly two winning cards out of five before saving.'
      )
      return
    }

    if (missingPrizeCards.length > 0) {
      const cardNames = missingPrizeCards
        .map(card => `Card ${card.cardId}`)
        .join(', ')

      await AdminAlert.warning(
        'Reward Selection Required',
        `Please select an available food or drink product for ${cardNames} before saving.`
      )
      return
    }

    if (
      !Number.isInteger(scratchCount) ||
      scratchCount < MIN_SCRATCH_COUNT ||
      scratchCount > MAX_SCRATCH_COUNT
    ) {
      await AdminAlert.warning(
        'Invalid Scratch Count',
        `Enter a number between ${MIN_SCRATCH_COUNT} and ${MAX_SCRATCH_COUNT}.`
      )
      return
    }

    savingRef.current = true
    setSaving(true)

    try {
      const confirmed = await AdminAlert.confirm(
        'Save Games & Rewards?',
        `Save the five scratch cards, selected rewards, and ${scratchCount} required scratches?`,
        'Yes, Save Changes'
      )

      if (!confirmed) return

      const latestProducts =
        getScratchRewardProducts()

      const nextCards = cards.map(card => {
        if (!card.winning) {
          return {
            cardId: card.cardId,
            prize: null,
          }
        }

        const product = latestProducts.find(
          item => item.id === card.productId
        )

        if (!product) {
          throw new Error(
            `Card ${card.cardId} has an unavailable reward. Please select another menu product.`
          )
        }

        return {
          cardId: card.cardId,
          prize: productToPrize(product),
        }
      })

      const nextConfig: ScratchGameConfig = {
        enabled,
        scratchCount,
        cards: nextCards,
      }

      await saveGameConfig(nextConfig)

      /*
       * The gameStore and backend must also
       * preserve scratchCount.
       *
       * Do not report a successful persistent
       * save unless the API supports this field.
       */

      const verifyResponse = await fetch(
        '/api/games/settings',
        {
          headers: {
            Accept: 'application/json',
          },
          cache: 'no-store',
        }
      )

      if (!verifyResponse.ok) {
        throw new Error(
          'Unable to verify saved game settings.'
        )
      }

      const verifyData = await verifyResponse.json()

      const verifiedConfig =
        verifyData.config ??
        verifyData

      if (
        verifiedConfig.scratchCount !==
        scratchCount
      ) {
        throw new Error(
          'The game API has not saved the scratch count. Update the backend /api/games/settings endpoint to support scratchCount before using this setting.'
        )
      }

      setSavedConfig(nextConfig)
      setProducts(latestProducts)

      await AdminAlert.success(
        'Game Settings Saved',
        `Your game settings have been saved. Customers must complete ${scratchCount} scratches to reveal their result.`
      )
    } catch (error) {
      console.error(
        'Game settings save failed:',
        error
      )

      await AdminAlert.error(
        'Save Failed',
        error instanceof Error
          ? error.message
          : 'Unable to save the game settings.'
      )
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  /* ==========================================
     SHARED BUTTON STYLE
  ========================================== */

  const saveButtonStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    padding: '13px 20px',
    border: 0,
    borderRadius: 12,
    background: saving
      ? '#C7B9B9'
      : COLORS.primary,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 700,
    cursor: saving
      ? 'not-allowed'
      : 'pointer',
    opacity: saving ? 0.7 : 1,
  }

  /* ==========================================
     RENDER
  ========================================== */

  return (
    <div
      style={{
        display: 'grid',
        gap: 24,
        paddingBottom: 36,
      }}
    >
      {/* PAGE HEADER */}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 8,
            }}
          >
            <Gamepad2
              size={27}
              color={COLORS.primary}
            />

            <h1
              style={{
                margin: 0,
                fontSize:
                  'clamp(24px, 3vw, 32px)',
                color: COLORS.heading,
              }}
            >
              Games & Rewards
            </h1>
          </div>

          <p style={descriptionStyle}>
            Manage scratch cards, winning
            positions, customer rewards,
            and scratch requirements.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          style={saveButtonStyle}
        >
          <Save size={18} />
          {saving
            ? 'Saving...'
            : 'Save Changes'}
        </button>
      </div>

      {/* SUMMARY CARDS */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(155px, 1fr))',
          gap: 14,
        }}
      >
        {[
          {
            label: 'Total Cards',
            value: TOTAL_CARDS,
            icon: Gamepad2,
          },
          {
            label: 'Winning Cards',
            value: winningCount,
            icon: Trophy,
          },
          {
            label: 'Losing Cards',
            value: losingCount,
            icon: CircleHelp,
          },
          {
            label: 'Available Rewards',
            value: products.length,
            icon: Gift,
          },
          {
            label: 'Required Scratches',
            value: scratchCount,
            icon: Hand,
          },
        ].map(stat => {
          const Icon = stat.icon

          return (
            <div
              key={stat.label}
              style={{
                ...sectionStyle,
                padding: 20,
              }}
            >
              <Icon
                size={22}
                color="#9B4853"
              />

              <div
                style={{
                  fontSize: 29,
                  fontWeight: 800,
                  color: COLORS.heading,
                  marginTop: 10,
                }}
              >
                {stat.value}
              </div>

              <div
                style={{
                  fontSize: 13,
                  color: COLORS.text,
                  marginTop: 3,
                }}
              >
                {stat.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* GAME STATUS */}

      <section style={sectionStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: '#F9ECEE',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Power
                size={21}
                color={COLORS.primary}
              />
            </div>

            <div>
              <h2 style={headingStyle}>
                Scratch Game Status
              </h2>

              <p style={descriptionStyle}>
                Enable or disable customer
                scratch-card selection.
              </p>
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              fontWeight: 700,
              color: enabled
                ? '#24734D'
                : '#A15B5B',
            }}
          >
            <input
              type="checkbox"
              checked={enabled}
              disabled={saving}
              onChange={event =>
                setEnabled(
                  event.target.checked
                )
              }
              style={{
                width: 19,
                height: 19,
                accentColor: COLORS.primary,
              }}
            />

            {enabled
              ? 'Game Enabled'
              : 'Game Disabled'}
          </label>
        </div>
      </section>

      {/* SCRATCH COUNT CONFIGURATION */}

      <section style={sectionStyle}>
        <div
          style={{
            display: 'flex',
            gap: 13,
            alignItems: 'flex-start',
            marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              background: '#F6EAF8',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Hand
              size={23}
              color="#8743A5"
            />
          </div>

          <div>
            <h2 style={headingStyle}>
              Scratch Count Settings
            </h2>

            <p style={descriptionStyle}>
              Choose how many complete scratch
              gestures a customer must perform
              before the prize is revealed.
            </p>
          </div>
        </div>

        <div
          style={{
            background: '#FCF8FD',
            border: '1px solid #EADCEF',
            borderRadius: 16,
            padding: 20,
            display: 'grid',
            gap: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.heading,
                }}
              >
                Required Scratches
              </div>

              <p style={descriptionStyle}>
                Default: 25 scratches
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <button
                type="button"
                disabled={
                  saving ||
                  scratchCount <= MIN_SCRATCH_COUNT
                }
                onClick={() =>
                  updateScratchCount(
                    scratchCount - 1
                  )
                }
                aria-label="Decrease scratch count"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: '1px solid #DDC9E3',
                  background: '#FFFFFF',
                  color: COLORS.heading,
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Minus size={18} />
              </button>

              <input
                type="number"
                min={MIN_SCRATCH_COUNT}
                max={MAX_SCRATCH_COUNT}
                step={1}
                value={scratchCount}
                disabled={saving}
                onChange={event => {
                  const value =
                    event.target.valueAsNumber

                  if (!Number.isNaN(value)) {
                    updateScratchCount(value)
                  }
                }}
                aria-label="Required scratch count"
                style={{
                  width: 82,
                  height: 44,
                  textAlign: 'center',
                  borderRadius: 10,
                  border: '1px solid #DDC9E3',
                  background: '#FFFFFF',
                  fontSize: 23,
                  fontWeight: 800,
                  color: COLORS.primary,
                }}
              />

              <button
                type="button"
                disabled={
                  saving ||
                  scratchCount >= MAX_SCRATCH_COUNT
                }
                onClick={() =>
                  updateScratchCount(
                    scratchCount + 1
                  )
                }
                aria-label="Increase scratch count"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: '1px solid #DDC9E3',
                  background: '#FFFFFF',
                  color: COLORS.heading,
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          <input
            type="range"
            min={MIN_SCRATCH_COUNT}
            max={MAX_SCRATCH_COUNT}
            step={1}
            value={scratchCount}
            disabled={saving}
            onChange={event =>
              updateScratchCount(
                Number(event.target.value)
              )
            }
            aria-label="Adjust required scratches"
            style={{
              width: '100%',
              accentColor: COLORS.primary,
              cursor: 'pointer',
            }}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: COLORS.text,
            }}
          >
            <span>{MIN_SCRATCH_COUNT} scratches</span>
            <span>{MAX_SCRATCH_COUNT} scratches</span>
          </div>

          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #EADCEF',
              borderRadius: 12,
              padding: 15,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <strong
                style={{
                  fontSize: 13,
                  color: COLORS.heading,
                }}
              >
                Customer Scratch Counter
              </strong>

              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: COLORS.primary,
                }}
              >
                0 / {scratchCount}
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: 9,
                background: '#EFE4F1',
                borderRadius: 20,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '0%',
                  height: '100%',
                  background: COLORS.primary,
                }}
              />
            </div>

            <p
              style={{
                ...descriptionStyle,
                marginTop: 11,
              }}
            >
              The customer will see their reward
              after completing {scratchCount} valid
              scratch gestures.
            </p>
          </div>

          {scratchCount !== savedScratchCount && (
            <div
              style={{
                background: '#FFF3E5',
                color: '#936026',
                borderRadius: 10,
                padding: '10px 13px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Scratch count changed from{' '}
              {savedScratchCount} to {scratchCount}.
              Save your changes to apply it.
            </div>
          )}
        </div>
      </section>

      {/* SELECT WINNING CARDS */}

      <section style={sectionStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div>
            <h2 style={headingStyle}>
              Select Winning Cards
            </h2>

            <p style={descriptionStyle}>
              Choose exactly two winning
              positions from the five cards.
            </p>
          </div>

          <span
            style={{
              background:
                winningCount === REQUIRED_WINNERS
                  ? '#E8F6EE'
                  : '#FFF1E3',
              color:
                winningCount === REQUIRED_WINNERS
                  ? '#24734D'
                  : '#A66B28',
              padding: '9px 13px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {winningCount} / {REQUIRED_WINNERS} Selected
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(145px, 1fr))',
            gap: 14,
          }}
        >
          {cards.map(card => (
            <button
              key={card.cardId}
              type="button"
              disabled={saving}
              onClick={() =>
                toggleWinner(card.cardId)
              }
              aria-pressed={card.winning}
              style={{
                padding: 12,
                borderRadius: 15,
                border: card.winning
                  ? '2px solid #2B9867'
                  : '2px solid #E9E0DD',
                background: card.winning
                  ? '#F0FAF4'
                  : '#FFFCFB',
                cursor: saving
                  ? 'not-allowed'
                  : 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  position: 'relative',
                }}
              >
                <img
                  src={
                    CARD_IMAGES[
                      card.cardId - 1
                    ]
                  }
                  alt={`Scratch card ${card.cardId}`}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: 175,
                    objectFit: 'contain',
                  }}
                />

                {card.winning && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 5,
                      right: 5,
                      width: 27,
                      height: 27,
                      borderRadius: '50%',
                      background: '#2B9867',
                      color: '#FFFFFF',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Check size={17} />
                  </span>
                )}
              </div>

              <div
                style={{
                  marginTop: 10,
                  fontWeight: 800,
                  color: COLORS.heading,
                }}
              >
                Card {card.cardId}
              </div>

              <div
                style={{
                  marginTop: 5,
                  fontSize: 12,
                  fontWeight: 700,
                  color: card.winning
                    ? COLORS.green
                    : '#9A888A',
                }}
              >
                {card.winning
                  ? 'Winning Card'
                  : 'Good Luck Next Time!'}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ASSIGN REWARD PRODUCTS */}

      <section style={sectionStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 8,
          }}
        >
          <Gift
            size={23}
            color={COLORS.primary}
          />

          <h2 style={headingStyle}>
            Assign Reward Products
          </h2>
        </div>

        <p
          style={{
            ...descriptionStyle,
            marginBottom: 20,
          }}
        >
          Select an available menu product
          for each winning card.
        </p>

        {winningCards.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 35,
              borderRadius: 12,
              background: '#FAF6F5',
              color: COLORS.text,
            }}
          >
            <Gift size={30} />

            <p>
              Select your winning cards
              to assign rewards.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: 15,
            }}
          >
            {winningCards.map(card => {
              const selectedProduct =
                products.find(
                  product =>
                    product.id === card.productId
                )

              return (
                <div
                  key={card.cardId}
                  style={{
                    display: 'grid',
                    gap: 13,
                    padding: 18,
                    borderRadius: 13,
                    background: '#FCF8F7',
                    border: '1px solid #F0E4E1',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <Trophy
                      size={20}
                      color="#A36B2F"
                    />

                    <strong
                      style={{
                        color: COLORS.heading,
                      }}
                    >
                      Card {card.cardId}
                      {' — '}Winning Reward
                    </strong>
                  </div>

                  <select
                    value={card.productId}
                    disabled={saving}
                    onChange={event =>
                      updatePrize(
                        card.cardId,
                        event.target.value
                      )
                    }
                    style={{
                      width: '100%',
                      padding: '13px 14px',
                      borderRadius: 10,
                      border: '1px solid #DCCBC8',
                      background: '#FFFFFF',
                      color: COLORS.heading,
                      fontSize: 14,
                    }}
                  >
                    <option value="">
                      Select a food or drink
                    </option>

                    {products.map(product => (
                      <option
                        key={product.id}
                        value={product.id}
                      >
                        {product.name}
                        {' — '}
                        {product.kind === 'food'
                          ? 'Food'
                          : 'Drink'}
                      </option>
                    ))}
                  </select>

                  {selectedProduct ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 13,
                        color: '#32724D',
                      }}
                    >
                      <ShieldCheck size={18} />

                      Selected:{' '}
                      <strong>
                        {selectedProduct.name}
                      </strong>
                    </div>
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: '#B36B33',
                      }}
                    >
                      Please choose an available
                      menu product for this card.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {products.length === 0 && (
          <p
            style={{
              marginTop: 15,
              padding: 14,
              borderRadius: 10,
              background: '#FFF2E5',
              color: '#9D6030',
              fontSize: 13,
            }}
          >
            No available menu products were
            found. Add or enable products in
            Menu / Products first.
          </p>
        )}
      </section>

      {/* GAME RULES */}

      <section
        style={{
          ...sectionStyle,
          background: '#FFF8ED',
          border: '1px solid #F2E2C7',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <Sparkles
            size={21}
            color="#A87530"
          />

          <h2
            style={{
              ...headingStyle,
              fontSize: 17,
              color: '#74502D',
            }}
          >
            Scratch Game Rules
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 13,
            color: '#806D58',
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <div>
            <UtensilsCrossed
              size={15}
              style={{
                display: 'inline',
                verticalAlign: 'middle',
                marginRight: 7,
              }}
            />
            Only available food and drink
            products can be assigned.
          </div>

          <div>
            <Trophy
              size={15}
              style={{
                display: 'inline',
                verticalAlign: 'middle',
                marginRight: 7,
              }}
            />
            Exactly two cards must contain
            winning rewards.
          </div>

          <div>
            <CircleHelp
              size={15}
              style={{
                display: 'inline',
                verticalAlign: 'middle',
                marginRight: 7,
              }}
            />
            The other three cards display
            "Good Luck Next Time!"
          </div>

          <div>
            <Hand
              size={15}
              style={{
                display: 'inline',
                verticalAlign: 'middle',
                marginRight: 7,
              }}
            />
            Customers must complete the
            configured number of scratch
            gestures before revealing the result.
          </div>

          <div>
            <ShieldCheck
              size={15}
              style={{
                display: 'inline',
                verticalAlign: 'middle',
                marginRight: 7,
              }}
            />
            Settings are sent to the Games API.
            Real reward redemption requires
            server-side verification.
          </div>
        </div>
      </section>

      {/* BOTTOM ACTIONS */}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={resetChanges}
          disabled={saving || !hasChanges}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 18px',
            borderRadius: 11,
            border: '1px solid #DAC9C6',
            background: '#FFFFFF',
            color: '#704B50',
            cursor:
              saving || !hasChanges
                ? 'not-allowed'
                : 'pointer',
            opacity:
              saving || !hasChanges
                ? 0.55
                : 1,
          }}
        >
          <RefreshCw size={17} />
          Reset Changes
        </button>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          style={saveButtonStyle}
        >
          <Save size={17} />

          {saving
            ? 'Saving...'
            : 'Save Game Settings'}
        </button>
      </div>
    </div>
  )
}
