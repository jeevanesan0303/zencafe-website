
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  Check,
  CircleHelp,
  Gamepad2,
  Gift,
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

const TOTAL_CARDS = 5
const REQUIRED_WINNERS = 2

const CARD_IMAGES = [
  '/assets/Game/Card/game-1.png.png',
  '/assets/Game/Card/game-2.png.png',
  '/assets/Game/Card/game-3.png.png',
  '/assets/Game/Card/game-4.png.png',
  '/assets/Game/Card/game-5.png.png',
]

/* ==========================================
   SAVED CONFIG TO EDITABLE CARDS
========================================== */

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

      const winning =
        savedCard?.prize != null

      const savedProductId =
        savedCard?.prize?.productId || ''

      const validProduct = products.some(
        product =>
          product.id === savedProductId
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

/* ==========================================
   MENU PRODUCT TO GAME PRIZE
========================================== */

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
   PAGE COMPONENT
========================================== */

export default function Games({
  query: _query = '',
}: Props) {
  /* ==========================================
     INITIAL DATA
  ========================================== */

  const [savedConfig, setSavedConfig] =
    useState<GameConfig>(
      () => readGameConfig()
    )

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

  const [enabled, setEnabled] =
    useState<boolean>(
      () => readGameConfig().enabled
    )

  const [saving, setSaving] =
    useState(false)

  const savingRef = useRef(false)

  /* ==========================================
     MENU SUBSCRIPTION
  ========================================== */

  useEffect(() => {
    const refreshProducts = () => {
      setProducts(
        getScratchRewardProducts()
      )
    }

    return subscribeMenuCatalog(
      refreshProducts
    )
  }, [])

  /* ==========================================
     GAME CONFIG SUBSCRIPTION & FETCH
  ========================================== */

  useEffect(() => {
    fetchGameConfig().then(cfg => {
      setSavedConfig(cfg)
      setCards(configToDraft(cfg, products))
      setEnabled(cfg.enabled)
    }).catch(err => {
      console.warn('Unable to load game config from API:', err)
    })

    return subscribeGameConfig(() => {
      const latest = readGameConfig()

      setSavedConfig(latest)
    })
  }, [])

  /* ==========================================
     DERIVED VALUES
  ========================================== */

  const winningCards = useMemo(
    () =>
      cards.filter(
        card => card.winning
      ),
    [cards]
  )

  const winningCount =
    winningCards.length

  const losingCount =
    TOTAL_CARDS - winningCount

  // The reward dropdown must always contain
  // all available products, regardless of
  // the global admin header search.
  const rewardProducts = products

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

  const hasChanges = useMemo(() => {
    if (
      enabled !== savedConfig.enabled
    ) {
      return true
    }

    return cards.some(card => {
      const saved =
        savedConfig.cards.find(
          item =>
            item.cardId === card.cardId
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
    savedConfig,
  ])

  /* ==========================================
     TOGGLE WINNING CARD
  ========================================== */

  function toggleWinner(
    cardId: number
  ) {
    if (savingRef.current) {
      return
    }

    const selected = cards.find(
      card =>
        card.cardId === cardId
    )

    if (!selected) {
      return
    }

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
      previous.map(card => {
        if (
          card.cardId !== cardId
        ) {
          return card
        }

        return {
          ...card,
          winning: !card.winning,
          productId: card.winning
            ? ''
            : card.productId,
        }
      })
    )
  }

  /* ==========================================
     UPDATE REWARD PRODUCT
  ========================================== */

  function updatePrize(
    cardId: number,
    productId: string
  ) {
    if (savingRef.current) {
      return
    }

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
    if (savingRef.current) {
      return
    }

    const latest =
      readGameConfig()

    const latestProducts =
      getScratchRewardProducts()

    setSavedConfig(latest)

    setProducts(
      latestProducts
    )

    setCards(
      configToDraft(
        latest,
        latestProducts
      )
    )

    setEnabled(
      latest.enabled
    )
  }

  /* ==========================================
     SAVE GAME SETTINGS
  ========================================== */

  async function handleSave() {
    if (savingRef.current) {
      return
    }

    /* --------------------------------------
       VALIDATE WINNING CARD COUNT
    -------------------------------------- */

    if (
      winningCount !== REQUIRED_WINNERS
    ) {
      await AdminAlert.warning(
        'Invalid Winning Cards',
        'Please select exactly two winning cards out of five before saving.'
      )

      return
    }

    /* --------------------------------------
       VALIDATE AVAILABLE PRODUCTS
    -------------------------------------- */

    if (
      missingPrizeCards.length > 0
    ) {
      const cardNames =
        missingPrizeCards
          .map(
            card =>
              `Card ${card.cardId}`
          )
          .join(', ')

      await AdminAlert.warning(
        'Reward Selection Required',
        `Please select an available food or drink product for ${cardNames} before saving.`
      )

      return
    }

    /* --------------------------------------
       CONFIRM BEFORE SAVING
    -------------------------------------- */

    savingRef.current = true
    setSaving(true)

    try {
      const confirmed =
        await AdminAlert.confirm(
          'Save Games & Rewards?',
          'This will update the five scratch cards and their selected prizes.',
          'Yes, Save Changes'
        )

      if (!confirmed) {
        return
      }

      /* ------------------------------------
         REFRESH AVAILABLE PRODUCTS
      ------------------------------------ */

      const latestProducts =
        getScratchRewardProducts()

      const latestProductIds =
        new Set(
          latestProducts.map(
            product => product.id
          )
        )

      for (
        const card of winningCards
      ) {
        if (
          !latestProductIds.has(
            card.productId
          )
        ) {
          throw new Error(
            `Card ${card.cardId} has an unavailable reward. Please select another menu product.`
          )
        }
      }

      /* ------------------------------------
         CREATE CONFIGURATION
      ------------------------------------ */

      const nextConfig: GameConfig = {
        enabled,

        cards: cards.map(card => {
          if (!card.winning) {
            return {
              cardId: card.cardId,
              prize: null,
            }
          }

          const product =
            latestProducts.find(
              item =>
                item.id ===
                card.productId
            )

          if (!product) {
            throw new Error(
              `Card ${card.cardId} has no valid reward product.`
            )
          }

          return {
            cardId: card.cardId,
            prize: productToPrize(
              product
            ),
          }
        }),
      }

      /* ------------------------------------
         SAVE CONFIGURATION
      ------------------------------------ */

      await saveGameConfig(
        nextConfig
      )

      setSavedConfig(
        nextConfig
      )

      setProducts(
        latestProducts
      )

      /* ------------------------------------
         SUCCESS ALERT
      ------------------------------------ */

      await AdminAlert.success(
        'Game Settings Saved',
        'Your scratch-card configuration has been saved successfully.'
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
     SHARED BUTTON STYLES
  ========================================== */

  const saveButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    padding: '13px 20px',
    border: 0,
    borderRadius: 12,
    background: saving
      ? '#C7B9B9'
      : '#852B3A',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 700,
    cursor: saving
      ? 'not-allowed'
      : 'pointer',
    opacity: saving ? 0.7 : 1,
  } as const

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
      {/* ======================================
          PAGE HEADER
      ====================================== */}

      <div
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems:
            'flex-start',
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
              color="#8B2738"
            />

            <h1
              style={{
                margin: 0,
                fontSize:
                  'clamp(24px, 3vw, 32px)',
                color: '#44252A',
              }}
            >
              Games & Rewards
            </h1>
          </div>

          <p
            style={{
              margin: 0,
              color: '#89777A',
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            Manage Zen Café scratch cards,
            winning positions, and
            customer rewards.
          </p>
        </div>

        {/* TOP SAVE BUTTON */}

        <button
          type="button"
          onClick={() => {
            void handleSave()
          }}
          disabled={saving}
          style={saveButtonStyle}
        >
          <Save size={18} />

          {saving
            ? 'Saving...'
            : 'Save Changes'}
        </button>
      </div>

      {/* ======================================
          SUMMARY CARDS
      ====================================== */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(160px, 1fr))',
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
        ].map(stat => {
          const Icon = stat.icon

          return (
            <div
              key={stat.label}
              style={{
                background: '#FFFFFF',
                border:
                  '1px solid #EFE5E2',
                borderRadius: 16,
                padding: 20,
                boxShadow:
                  '0 5px 20px rgba(65, 32, 35, 0.04)',
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
                  color: '#48282E',
                  marginTop: 10,
                }}
              >
                {stat.value}
              </div>

              <div
                style={{
                  fontSize: 13,
                  color: '#88777A',
                  marginTop: 3,
                }}
              >
                {stat.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* ======================================
          GAME ENABLE / DISABLE
      ====================================== */}

      <section
        style={{
          background: '#FFFFFF',
          border:
            '1px solid #EFE5E2',
          borderRadius: 18,
          padding: 22,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 13,
              alignItems: 'center',
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
                color="#8B2738"
              />
            </div>

            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
                  color: '#48282E',
                }}
              >
                Scratch Game Status
              </h2>

              <p
                style={{
                  margin: '5px 0 0',
                  fontSize: 13,
                  color: '#8C7B7D',
                }}
              >
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
                accentColor: '#852B3A',
                cursor: 'pointer',
              }}
            />

            {enabled
              ? 'Game Enabled'
              : 'Game Disabled'}
          </label>
        </div>
      </section>

      {/* ======================================
          SELECT WINNING CARDS
      ====================================== */}

      <section
        style={{
          background: '#FFFFFF',
          border:
            '1px solid #EFE5E2',
          borderRadius: 18,
          padding: '24px 20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                color: '#48282E',
              }}
            >
              Select Winning Cards
            </h2>

            <p
              style={{
                color: '#88777A',
                fontSize: 13,
                margin: '7px 0 0',
              }}
            >
              Choose exactly two winning
              positions from the five cards.
            </p>
          </div>

          <span
            style={{
              background:
                winningCount ===
                REQUIRED_WINNERS
                  ? '#E8F6EE'
                  : '#FFF1E3',
              color:
                winningCount ===
                REQUIRED_WINNERS
                  ? '#24734D'
                  : '#A66B28',
              padding: '9px 13px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {winningCount} / {REQUIRED_WINNERS}
            {' '}Selected
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
                toggleWinner(
                  card.cardId
                )
              }
              aria-pressed={
                card.winning
              }
              style={{
                padding: 12,
                borderRadius: 15,
                border: card.winning
                  ? '2px solid #2B9867'
                  : '2px solid #E9E0DD',
                background:
                  card.winning
                    ? '#F0FAF4'
                    : '#FFFCFB',
                cursor: saving
                  ? 'not-allowed'
                  : 'pointer',
                textAlign: 'center',
                transition:
                  'all 0.2s ease',
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
                  color: '#48282E',
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
                    ? '#278157'
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

      {/* ======================================
          ASSIGN REWARD PRODUCTS
      ====================================== */}

      <section
        style={{
          background: '#FFFFFF',
          border:
            '1px solid #EFE5E2',
          borderRadius: 18,
          padding: 22,
        }}
      >
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
            color="#8B2738"
          />

          <h2
            style={{
              margin: 0,
              fontSize: 20,
              color: '#48282E',
            }}
          >
            Assign Reward Products
          </h2>
        </div>

        <p
          style={{
            color: '#88777A',
            fontSize: 13,
            margin: '0 0 20px',
            lineHeight: 1.7,
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
              color: '#89777A',
            }}
          >
            <Gift
              size={30}
              style={{
                marginBottom: 10,
              }}
            />

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
                    product.id ===
                    card.productId
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
                    border:
                      '1px solid #F0E4E1',
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
                        color: '#48282E',
                      }}
                    >
                      Card {card.cardId}
                      {' '}— Winning Reward
                    </strong>
                  </div>

                  <select
                    value={
                      card.productId
                    }
                    disabled={saving}
                    onChange={event =>
                      updatePrize(
                        card.cardId,
                        event.target.value
                      )
                    }
                    style={{
                      width: '100%',
                      padding:
                        '13px 14px',
                      borderRadius: 10,
                      border:
                        '1px solid #DCCBC8',
                      background:
                        '#FFFFFF',
                      color: '#48282E',
                      fontSize: 14,
                    }}
                  >
                    <option value="">
                      Select a food or drink
                    </option>

                    {rewardProducts.map(
                      product => (
                        <option
                          key={
                            product.id
                          }
                          value={
                            product.id
                          }
                        >
                          {product.name}
                          {' — '}
                          {product.kind ===
                          'food'
                            ? 'Food'
                            : 'Drink'}
                        </option>
                      )
                    )}
                  </select>

                  {selectedProduct && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 13,
                        color: '#32724D',
                      }}
                    >
                      <ShieldCheck
                        size={18}
                      />

                      Selected:
                      {' '}
                      <strong>
                        {
                          selectedProduct.name
                        }
                      </strong>
                    </div>
                  )}

                  {!selectedProduct && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: '#B36B33',
                      }}
                    >
                      Please choose an
                      available menu product
                      for this winning card.
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

      {/* ======================================
          GAME RULES
      ====================================== */}

      <section
        style={{
          padding: 22,
          borderRadius: 18,
          background: '#FFF8ED',
          border:
            '1px solid #F2E2C7',
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
              margin: 0,
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
            gap: 10,
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
            <ShieldCheck
              size={15}
              style={{
                display: 'inline',
                verticalAlign: 'middle',
                marginRight: 7,
              }}
            />

            Changes are saved to the
            current browser's local storage.
            Production redemption requires
            server-side verification.
          </div>
        </div>
      </section>

      {/* ======================================
          BOTTOM ACTION BUTTONS
      ====================================== */}

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
          disabled={
            saving ||
            !hasChanges
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding:
              '12px 18px',
            borderRadius: 11,
            border:
              '1px solid #DAC9C6',
            background: '#FFFFFF',
            color: '#704B50',
            cursor:
              saving ||
              !hasChanges
                ? 'not-allowed'
                : 'pointer',
          }}
        >
          <RefreshCw
            size={17}
          />

          Reset Changes
        </button>

        <button
          type="button"
          onClick={() => {
            void handleSave()
          }}
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
