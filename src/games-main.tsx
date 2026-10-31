
import * as React from 'react'
import { createRoot } from 'react-dom/client'

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import {
  ChefHat,
  DoorOpen,
  Gamepad2,
  Gift,
  Home,
  Images,
  MapPin,
  Menu as MenuIcon,
  Sparkles,
  UserPlus,
  UtensilsCrossed,
  X,
} from 'lucide-react'

import ThemeToggle from './components/ThemeToggle'
import { useSiteTheme } from './theme'

import {
  readGameConfig,
  fetchGameConfig,
  subscribeGameConfig,
  DEFAULT_SCRATCH_COUNT,
  MIN_SCRATCH_COUNT,
  MAX_SCRATCH_COUNT,
  type GameConfig,
  type GamePrize,
} from './data/gameStore'

import './games.css'

/* ==========================================
   ZEN CAFÉ — SCRATCH & WIN
========================================== */

const SCRATCH_WIDTH = 480
const SCRATCH_HEIGHT = 280
const BRUSH_SIZE = 46

// Minimum travel distance for a valid swipe.
// A simple tap does not count as a scratch.
const MIN_GESTURE_DISTANCE = 18

const cards = [
  {
    image: '/assets/Game/Card/game-1.png.png',
    position: '50% 35%',
    color: '#f45bdd',
    rgb: '244 91 221',
  },
  {
    image: '/assets/Game/Card/game-2.png.png',
    position: '50% 35%',
    color: '#40c9ff',
    rgb: '64 201 255',
  },
  {
    image: '/assets/Game/Card/game-3.png.png',
    position: '72% 42%',
    color: '#f6b64f',
    rgb: '246 182 79',
  },
  {
    image: '/assets/Game/Card/game-4.png.png',
    position: '50% 38%',
    color: '#ff627c',
    rgb: '255 98 124',
  },
  {
    image: '/assets/Game/Card/game-5.png.png',
    position: '50% 38%',
    color: '#80b9ff',
    rgb: '128 185 255',
  },
]

const navLinks = [
  {
    label: 'Home',
    href: '/#home',
    icon: Home,
  },
  {
    label: 'Our Menu',
    href: '/#menu',
    icon: UtensilsCrossed,
  },
  {
    label: 'Private Room',
    href: '/#room-booking',
    icon: DoorOpen,
  },
  {
    label: 'Gallery',
    href: '/gallery.html',
    icon: Images,
  },
  {
    label: 'Contact',
    href: '/#contact',
    icon: MapPin,
  },
] as const

const extraLinks = [
  {
    label: 'Offers',
    href: '/offers.html',
    icon: Gift,
  },
  {
    label: 'Register',
    href: '/register.html',
    icon: UserPlus,
  },
  {
    label: 'Zen Kitchen',
    href: '/zen-kitchen.html',
    icon: ChefHat,
  },
] as const

const floatingItems = [
  { emoji: '🎲', x: 12, y: 17, size: 30, delay: -2 },
  { emoji: '🎮', x: 91, y: 37, size: 34, delay: -6 },
  { emoji: '✨', x: 6, y: 61, size: 23, delay: -3 },
  { emoji: '🎲', x: 87, y: 67, size: 32, delay: -8 },
  { emoji: '🕹️', x: 8, y: 87, size: 26, delay: -5 },
  { emoji: '👾', x: 92, y: 91, size: 25, delay: -10 },
]

const confettiColors = [
  '#d88aff',
  '#6cdbff',
  '#ffd279',
  '#ff79bd',
  '#a794ff',
  '#ffffff',
]

/* ==========================================
   TYPES
========================================== */

type Point = {
  x: number
  y: number
}

type GameResult =
  | {
      kind: 'win'
      offer: GamePrize
    }
  | {
      kind: 'lose'
    }

type GamePhase =
  | 'intro'
  | 'spread'
  | 'choose'
  | 'centering'
  | 'flipping'
  | 'scratch'
  | 'revealed'

type ScratchCardProps = {
  result: GameResult
  enabled: boolean
  revealed: boolean
  requiredScratches: number
  onReveal: () => void
}

/* ==========================================
   GAME CONFIGURATION HELPERS
========================================== */

function getRequiredScratches(
  config: GameConfig
): number {
  const count = config.scratchCount

  if (
    !Number.isInteger(count) ||
    count < MIN_SCRATCH_COUNT ||
    count > MAX_SCRATCH_COUNT
  ) {
    return DEFAULT_SCRATCH_COUNT
  }

  return count
}

/* ==========================================
   CARD RESULT

   Preserves existing admin-defined
   winning card positions.
========================================== */

function createResult(
  cardIndex: number,
  config: GameConfig
): GameResult {
  const cardId = cardIndex + 1

  const selectedCard = config.cards.find(
    card => card.cardId === cardId
  )

  if (
    !config.enabled ||
    !selectedCard?.prize
  ) {
    return { kind: 'lose' }
  }

  return {
    kind: 'win',
    offer: { ...selectedCard.prize },
  }
}

/* ==========================================
   GAMING BACKGROUND
========================================== */

function GamingBackground() {
  return (
    <div
      className="zg-background"
      aria-hidden="true"
    >
      <div className="zg-grid" />
      <div className="zg-orb zg-orb-purple" />
      <div className="zg-orb zg-orb-blue" />
      <div className="zg-orb zg-orb-pink" />

      <div className="zg-scene">
        <div className="zg-scene-wall" />

        <div className="zg-scene-posters">
          {cards.slice(0, 3).map((card, index) => (
            <div
              className="zg-scene-poster"
              key={index}
            >
              <img
                src={card.image}
                alt=""
                draggable={false}
              />
            </div>
          ))}
        </div>

        <div className="zg-scene-monitor">
          <div className="zg-monitor-screen">
            <img
              src={cards[4]!.image}
              alt=""
              draggable={false}
            />
          </div>
          <span className="zg-monitor-neck" />
          <span className="zg-monitor-base" />
        </div>

        <div className="zg-scene-warrior">
          <img
            src={cards[1]!.image}
            alt=""
            draggable={false}
          />
        </div>

        <div className="zg-scene-sign">
          <strong>ZEN</strong>
          <span>PLAY LOUNGE</span>
          <small>JAFFNA</small>
        </div>

        <div className="zg-scene-floor" />
        <div className="zg-scene-fade" />
      </div>

      <div className="zg-neon-trails">
        {Array.from(
          { length: 6 },
          (_, index) => (
            <span
              key={index}
              className={
                `zg-neon-trail trail-${index % 3}`
              }
              style={{
                top: `${17 + index * 15}%`,
                animationDelay:
                  `${-index * 3.1}s`,
                animationDuration:
                  `${15 + index * 1.4}s`,
                animationDirection:
                  index % 2
                    ? 'reverse'
                    : 'normal',
              }}
            />
          )
        )}
      </div>

      <div className="zg-floating-items">
        {floatingItems.map((item, index) => (
          <span
            key={index}
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              fontSize: `${item.size}px`,
              animationDelay:
                `${item.delay}s`,
              animationDuration:
                `${11 + index}s`,
            }}
          >
            {item.emoji}
          </span>
        ))}
      </div>

      <div className="zg-sparks">
        {Array.from(
          { length: 16 },
          (_, index) => (
            <i
              key={index}
              style={{
                left:
                  `${(index * 31 + 7) % 100}%`,
                top:
                  `${(index * 23 + 9) % 100}%`,
                animationDelay:
                  `${-(index % 7)}s`,
                animationDuration:
                  `${4 + (index % 4)}s`,
              }}
            />
          )
        )}
      </div>
    </div>
  )
}

/* ==========================================
   WIN CELEBRATION
========================================== */

function WinCelebration() {
  return (
    <div
      className="zg-celebration"
      aria-hidden="true"
    >
      <div className="zg-celebration-glow" />

      {Array.from(
        { length: 64 },
        (_, index) => {
          const style = {
            left:
              `${(index * 37 + 11) % 100}%`,
            width:
              `${6 + (index % 5)}px`,
            height:
              `${9 + (index % 7)}px`,
            backgroundColor:
              confettiColors[
                index % confettiColors.length
              ],
            borderRadius:
              index % 3 === 0
                ? '50%'
                : '2px',
            animationDelay:
              `${(index % 12) * 0.055}s`,
            animationDuration:
              `${2.6 + (index % 6) * 0.22}s`,
            '--drift':
              `${((index * 29) % 220) - 110}px`,
            '--spin':
              `${
                index % 2 === 0
                  ? 720
                  : -720
              }deg`,
          } as CSSProperties

          return (
            <span
              key={index}
              className="zg-confetti"
              style={style}
            />
          )
        }
      )}
    </div>
  )
}

/* ==========================================
   SCRATCH CARD

   Counts completed scratch gestures.
   Does not require 100% pixel clearance.
========================================== */

function ScratchCard({
  result,
  enabled,
  revealed,
  requiredScratches,
  onReveal,
}: ScratchCardProps) {
  const canvasRef =
    useRef<HTMLCanvasElement>(null)

  const activePointerRef =
    useRef<number | null>(null)

  const previousPointRef =
    useRef<Point | null>(null)

  const gestureDistanceRef = useRef(0)

  const scratchCountRef = useRef(0)
  const completedRef = useRef(false)

  const [scratchCount, setScratchCount] =
    useState(0)

  const [
    canvasUnavailable,
    setCanvasUnavailable,
  ] = useState(false)

  const target = Math.max(
    MIN_SCRATCH_COUNT,
    Math.min(
      MAX_SCRATCH_COUNT,
      Math.round(requiredScratches)
    )
  )

  const progress = Math.min(
    100,
    (scratchCount / target) * 100
  )

  const remaining = Math.max(
    0,
    target - scratchCount
  )

  /* ========================================
     DRAW ORIGINAL SCRATCH COATING
  ======================================== */

  useEffect(() => {
    const canvas = canvasRef.current

    const context = canvas?.getContext('2d')

    if (!canvas || !context) {
      setCanvasUnavailable(true)
      return
    }

    setCanvasUnavailable(false)
    setScratchCount(0)

    scratchCountRef.current = 0
    completedRef.current = false
    activePointerRef.current = null
    previousPointRef.current = null
    gestureDistanceRef.current = 0

    context.globalCompositeOperation =
      'source-over'

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    )

    const gradient =
      context.createLinearGradient(
        0,
        0,
        canvas.width,
        canvas.height
      )

    gradient.addColorStop(0, '#7745bd')
    gradient.addColorStop(0.3, '#b985f0')
    gradient.addColorStop(0.55, '#e2c9ff')
    gradient.addColorStop(1, '#8b4bc6')

    context.fillStyle = gradient

    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    )

    for (
      let y = 12;
      y < canvas.height;
      y += 22
    ) {
      for (
        let x = 12;
        x < canvas.width;
        x += 22
      ) {
        context.beginPath()
        context.arc(
          x,
          y,
          1.2,
          0,
          Math.PI * 2
        )

        context.fillStyle =
          'rgba(50, 20, 90, 0.14)'

        context.fill()
      }
    }

    context.strokeStyle =
      'rgba(255, 255, 255, 0.5)'

    context.lineWidth = 1

    context.strokeRect(
      18,
      18,
      canvas.width - 36,
      canvas.height - 36
    )

    context.textAlign = 'center'
    context.fillStyle = '#35204f'

    context.font = '600 14px system-ui'

    context.fillText(
      'ZEN LUCKY TABLE',
      canvas.width / 2,
      63
    )

    context.font = '34px Georgia'

    context.fillText(
      'Unlock your luck',
      canvas.width / 2,
      124
    )

    context.font = '16px system-ui'

    context.fillText(
      `Complete ${target} scratches`,
      canvas.width / 2,
      168
    )

    context.font = '14px system-ui'

    context.fillText(
      'Your surprise stays hidden until the end',
      canvas.width / 2,
      196
    )

    context.font = '22px Georgia'

    context.fillText(
      '✦',
      canvas.width / 2,
      237
    )
  }, [target])

  /* ========================================
     REVEAL AFTER REQUIRED SCRATCHES
  ======================================== */

  const completeScratchGame = () => {
    if (
      completedRef.current ||
      !enabled ||
      revealed
    ) {
      return
    }

    completedRef.current = true

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')

    if (canvas && context) {
      context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      )
    }

    scratchCountRef.current = target
    setScratchCount(target)

    activePointerRef.current = null
    previousPointRef.current = null
    gestureDistanceRef.current = 0

    onReveal()
  }

  /* ========================================
     REGISTER ONE VALID SCRATCH

     A completed drag counts once.
  ======================================== */

  const registerScratch = () => {
    if (
      !enabled ||
      revealed ||
      completedRef.current
    ) {
      return
    }

    const next = Math.min(
      target,
      scratchCountRef.current + 1
    )

    scratchCountRef.current = next
    setScratchCount(next)

    if (next >= target) {
      completeScratchGame()
    }
  }

  /* ========================================
     CANVAS POINTER COORDINATES
  ======================================== */

  const getPointerPoint = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ): Point | null => {
    const canvas = canvasRef.current

    if (!canvas) return null

    const rect =
      canvas.getBoundingClientRect()

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return null
    }

    return {
      x: Math.max(
        0,
        Math.min(
          canvas.width,
          (
            (event.clientX - rect.left) /
            rect.width
          ) * canvas.width
        )
      ),
      y: Math.max(
        0,
        Math.min(
          canvas.height,
          (
            (event.clientY - rect.top) /
            rect.height
          ) * canvas.height
        )
      ),
    }
  }

  /* ========================================
     SCRATCH SURFACE

     The coating is decorative.
     The reveal condition is scratch count.
  ======================================== */

  const scratch = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ) => {
    if (
      !enabled ||
      revealed ||
      completedRef.current
    ) {
      return
    }

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const point = getPointerPoint(event)

    if (!canvas || !context || !point) {
      return
    }

    const previous =
      previousPointRef.current ?? point

    const distance = Math.hypot(
      point.x - previous.x,
      point.y - previous.y
    )

    gestureDistanceRef.current += distance

    const steps = Math.max(
      1,
      Math.ceil(distance / 5)
    )

    for (
      let step = 0;
      step <= steps;
      step += 1
    ) {
      const amount = step / steps

      const x =
        previous.x +
        (point.x - previous.x) * amount

      const y =
        previous.y +
        (point.y - previous.y) * amount

      context.clearRect(
        Math.floor(x - BRUSH_SIZE / 2),
        Math.floor(y - BRUSH_SIZE / 2),
        BRUSH_SIZE,
        BRUSH_SIZE
      )
    }

    previousPointRef.current = point
  }

  /* ========================================
     POINTER START
  ======================================== */

  const startScratching = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ) => {
    if (
      !enabled ||
      revealed ||
      completedRef.current ||
      canvasUnavailable ||
      !event.isPrimary ||
      event.button !== 0 ||
      activePointerRef.current !== null
    ) {
      return
    }

    event.preventDefault()

    const point = getPointerPoint(event)

    if (!point) return

    activePointerRef.current =
      event.pointerId

    previousPointRef.current = point
    gestureDistanceRef.current = 0

    try {
      event.currentTarget.setPointerCapture(
        event.pointerId
      )
    } catch {
      activePointerRef.current = null
      previousPointRef.current = null
      return
    }

    scratch(event)
  }

  /* ========================================
     POINTER END

     Count only a completed, meaningful
     scratch gesture.
  ======================================== */

  const stopScratching = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ) => {
    if (
      activePointerRef.current !==
      event.pointerId
    ) {
      return
    }

    if (event.type === 'pointerup') {
      scratch(event)
    }

    const validGesture =
      event.type === 'pointerup' &&
      gestureDistanceRef.current >=
        MIN_GESTURE_DISTANCE

    activePointerRef.current = null
    previousPointRef.current = null
    gestureDistanceRef.current = 0

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      )
    }

    if (validGesture) {
      registerScratch()
    }
  }

  /* ========================================
     KEYBOARD ACCESSIBLE SCRATCH

     One button press = one scratch.
  ======================================== */

  const scratchNextStrip = () => {
    if (
      !enabled ||
      revealed ||
      completedRef.current ||
      canvasUnavailable ||
      activePointerRef.current !== null
    ) {
      return
    }

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')

    if (!canvas || !context) return

    const index = scratchCountRef.current

    const y =
      (index * 23) % canvas.height

    context.clearRect(
      0,
      y,
      canvas.width,
      20
    )

    registerScratch()
  }

  const won = result.kind === 'win'

  /* ========================================
     SCRATCH CARD UI
  ======================================== */

  return (
    <div className="zg-scratch-area">
      <div
        className={[
          'zg-ticket',
          revealed ? 'is-revealed' : '',
          revealed
            ? won
              ? 'is-win'
              : 'is-lose'
            : '',
        ].join(' ')}
      >
        {revealed ? (
          <div className="zg-prize">
            <span
              className="zg-prize-emoji"
              aria-hidden="true"
            >
              {result.kind === 'win'
                ? result.offer.emoji
                : '🥺'}
            </span>

            <span className="zg-eyebrow">
              {won
                ? 'YOU WON!'
                : 'NOT THIS TIME'}
            </span>

            <h3>
              {result.kind === 'win'
                ? result.offer.title
                : 'Good Luck Next Time!'}
            </h3>

            <p>
              {result.kind === 'win'
                ? result.offer.detail
                : 'Your next little surprise is waiting.'}
            </p>

            <span className="zg-demo-badge">
              {won
                ? 'Demo reward'
                : 'Another chance awaits'}
            </span>
          </div>
        ) : (
          <div
            className="zg-mystery"
            aria-hidden="true"
          >
            <Sparkles size={28} />

            <strong>Keep scratching</strong>

            <span>
              Complete {target} scratches to
              unlock your result
            </span>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={SCRATCH_WIDTH}
          height={SCRATCH_HEIGHT}
          className="zg-scratch-canvas"
          aria-hidden="true"
          style={{
            touchAction: 'none',
            pointerEvents:
              enabled && !revealed
                ? 'auto'
                : 'none',
          }}
          onPointerDown={startScratching}
          onPointerMove={event => {
            if (
              activePointerRef.current ===
              event.pointerId
            ) {
              event.preventDefault()
              scratch(event)
            }
          }}
          onPointerUp={stopScratching}
          onPointerCancel={stopScratching}
          onLostPointerCapture={stopScratching}
          onContextMenu={event =>
            event.preventDefault()
          }
        />
      </div>

      {/* SCRATCH COUNTER */}

      <div className="zg-scratch-progress">
        <div className="zg-progress-label">
          <span>
            {revealed
              ? 'Reward unlocked'
              : 'Scratch progress'}
          </span>

          <strong>
            {scratchCount} / {target}
          </strong>
        </div>

        <div
          className="zg-progress-track"
          role="progressbar"
          aria-label="Scratch completion"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={scratchCount}
        >
          <span
            style={{
              width: `${progress}%`,
              transition: 'width 0.25s ease',
            }}
          />
        </div>
      </div>

      {!revealed && (
        <div className="zg-scratch-help">
          <p aria-live="polite">
            {canvasUnavailable
              ? 'The scratch surface is unavailable. Please reload.'
              : remaining === 1
                ? 'Just one more scratch to reveal your surprise!'
                : `${remaining} more scratches to reveal your surprise!`}
          </p>

          <button
            type="button"
            disabled={
              !enabled ||
              canvasUnavailable
            }
            tabIndex={enabled ? 0 : -1}
            onClick={scratchNextStrip}
            title="Use this button to complete one scratch"
          >
            Scratch next strip
          </button>
        </div>
      )}
    </div>
  )
}

/* ==========================================
   MAIN GAMES PAGE
========================================== */

function GamesExperience() {
  const theme = useSiteTheme()

  /* ========================================
     GAME CONFIGURATION
  ======================================== */

  const [gameConfig, setGameConfig] =
    useState<GameConfig>(
      () => readGameConfig()
    )

  const [roundScratchCount, setRoundScratchCount] =
    useState<number>(
      () => getRequiredScratches(
        readGameConfig()
      )
    )

  useEffect(() => {
    let mounted = true

    fetchGameConfig()
      .then(config => {
        if (mounted) {
          setGameConfig(config)
        }
      })
      .catch(error => {
        console.warn(
          'Unable to load live game configuration:',
          error
        )
      })

    const unsubscribe =
      subscribeGameConfig(() => {
        if (!mounted) return

        setGameConfig(readGameConfig())
      })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  /* ========================================
     GAME STATE
  ======================================== */

  const [navOpen, setNavOpen] =
    useState(false)

  const [phase, setPhase] =
    useState<GamePhase>('intro')

  const [selected, setSelected] =
    useState<number | null>(null)

  const [result, setResult] =
    useState<GameResult | null>(null)

  const [round, setRound] =
    useState(0)

  const selectionLock = useRef(false)

  const scratchBackRef =
    useRef<HTMLDivElement>(null)

  const replayRef =
    useRef<HTMLButtonElement>(null)

  const revealed = phase === 'revealed'
  const scratchEnabled = phase === 'scratch'

  const flipped =
    phase === 'flipping' ||
    phase === 'scratch' ||
    revealed

  const won =
    revealed &&
    result?.kind === 'win'

  const lost =
    revealed &&
    result?.kind === 'lose'

  /* ========================================
     ANIMATION TIMING
  ======================================== */

  useEffect(() => {
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches

    const transitions: Partial<
      Record<
        GamePhase,
        {
          next: GamePhase
          delay: number
        }
      >
    > = {
      intro: {
        next: 'spread',
        delay: 900,
      },
      spread: {
        next: 'choose',
        delay: 1100,
      },
      centering: {
        next: 'flipping',
        delay: 950,
      },
      flipping: {
        next: 'scratch',
        delay: 1050,
      },
    }

    const transition = transitions[phase]

    if (!transition) return

    const timer = window.setTimeout(
      () => setPhase(transition.next),
      reducedMotion
        ? 40
        : transition.delay
    )

    return () => {
      window.clearTimeout(timer)
    }
  }, [phase])

  /* ========================================
     ACCESSIBILITY FOCUS
  ======================================== */

  useEffect(() => {
    if (phase === 'scratch') {
      scratchBackRef.current
        ?.querySelector<HTMLButtonElement>(
          'button'
        )
        ?.focus({
          preventScroll: true,
        })
    }

    if (phase === 'revealed') {
      replayRef.current?.focus({
        preventScroll: true,
      })
    }
  }, [phase])

  /* ========================================
     MOBILE NAVIGATION
  ======================================== */

  useEffect(() => {
    if (!navOpen) return

    const onKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === 'Escape') {
        setNavOpen(false)
      }
    }

    const onResize = () => {
      if (window.innerWidth > 960) {
        setNavOpen(false)
      }
    }

    window.addEventListener(
      'keydown',
      onKeyDown
    )

    window.addEventListener(
      'resize',
      onResize
    )

    return () => {
      window.removeEventListener(
        'keydown',
        onKeyDown
      )

      window.removeEventListener(
        'resize',
        onResize
      )
    }
  }, [navOpen])

  /* ========================================
     CHOOSE CARD

     Snapshot the scratch requirement at
     the start of each game round.
  ======================================== */

  const chooseCard = (index: number) => {
    if (
      phase !== 'choose' ||
      selectionLock.current ||
      !gameConfig.enabled
    ) {
      return
    }

    selectionLock.current = true

    const selectedResult = createResult(
      index,
      gameConfig
    )

    setRoundScratchCount(
      getRequiredScratches(gameConfig)
    )

    setResult(selectedResult)
    setSelected(index)
    setPhase('centering')
  }

  /* ========================================
     RESET GAME
  ======================================== */

  const resetGame = () => {
    selectionLock.current = false

    setSelected(null)
    setResult(null)

    setRound(current => current + 1)
    setPhase('intro')
  }

  /* ========================================
     REVEAL RESULT
  ======================================== */

  const revealResult = () => {
    setPhase(current =>
      current === 'scratch'
        ? 'revealed'
        : current
    )
  }

  const choosing =
    phase === 'spread' ||
    phase === 'choose'

  /* ========================================
     HEADING MESSAGE
  ======================================== */

  const message =
    !gameConfig.enabled &&
    phase === 'choose'
      ? 'The game is temporarily unavailable.'
      : phase === 'intro'
        ? 'Your little adventure begins…'
        : choosing
          ? 'Choose your winning card'
          : phase === 'centering'
            ? 'Your choice. Your moment.'
            : phase === 'flipping'
              ? 'Something is waiting for you.'
              : phase === 'scratch'
                ? `Complete ${roundScratchCount} scratches. Unlock your luck.`
                : won
                  ? 'A little win. A big celebration.'
                  : 'Your next lucky moment awaits.'

  /* ========================================
     PAGE RENDER
  ======================================== */

  return (
    <main
      className="zg-page"
      data-theme={theme}
    >
      <GamingBackground />

      {/* HEADER */}

      <header className="zg-site-header">
        <nav
          className="zg-topbar"
          aria-label="Zen Café navigation"
        >
          <a
            href="/#home"
            className="zg-brand"
          >
            <img
              src="/assets/zen-logo.png"
              alt=""
              className="zg-brand-logo"
            />

            <span>
              <strong>ZEN CAFE</strong>
              <small>JAFFNA</small>
            </span>
          </a>

          <div className="zg-desktop-nav">
            {navLinks.map(
              ({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  className="zg-nav-link"
                >
                  {label}
                </a>
              )
            )}

            <a
              href="#game"
              className="zg-nav-link is-active"
              aria-current="page"
            >
              Games
            </a>
          </div>

          <div className="zg-nav-actions">
            <ThemeToggle
              className="zg-theme-toggle"
            />

            <a
              href="/offers.html"
              className="zg-offers-button"
            >
              <Gift size={16} />
              <span>Offers</span>
            </a>

            <button
              type="button"
              className="zg-mobile-toggle"
              onClick={() =>
                setNavOpen(current => !current)
              }
              aria-expanded={navOpen}
              aria-controls="zg-mobile-navigation"
              aria-label={
                navOpen
                  ? 'Close menu'
                  : 'Open menu'
              }
            >
              {navOpen ? (
                <X size={21} />
              ) : (
                <MenuIcon size={21} />
              )}
            </button>
          </div>
        </nav>

        {/* MOBILE NAVIGATION */}

        {navOpen && (
          <>
            <button
              type="button"
              className="zg-nav-backdrop"
              aria-label="Close navigation"
              onClick={() =>
                setNavOpen(false)
              }
            />

            <div
              id="zg-mobile-navigation"
              className="zg-mobile-menu"
            >
              <div className="zg-mobile-menu-head">
                <span>
                  <Gamepad2 size={17} />
                  ZEN PLAY
                </span>

                <Sparkles size={18} />
              </div>

              <div className="zg-mobile-menu-grid">
                {navLinks.map(
                  ({
                    label,
                    href,
                    icon: Icon,
                  }) => (
                    <a
                      key={label}
                      href={href}
                      onClick={() =>
                        setNavOpen(false)
                      }
                    >
                      <Icon size={17} />
                      <span>{label}</span>
                    </a>
                  )
                )}

                <a
                  href="#game"
                  className="is-current"
                  aria-current="page"
                  onClick={() =>
                    setNavOpen(false)
                  }
                >
                  <Gamepad2 size={17} />
                  <span>Games</span>
                </a>
              </div>

              <div className="zg-mobile-extra">
                {extraLinks.map(
                  ({
                    label,
                    href,
                    icon: Icon,
                  }) => (
                    <a
                      key={label}
                      href={href}
                      onClick={() =>
                        setNavOpen(false)
                      }
                    >
                      <Icon size={15} />
                      {label}
                    </a>
                  )
                )}
              </div>
            </div>
          </>
        )}
      </header>

      {/* PAGE CONTENT */}

      <div className="zg-container">
        {/* HERO */}

        <section className="zg-hero">
          <div className="zg-hero-badge">
            <Gamepad2 size={15} />
            <span>ZEN LUCKY TABLE</span>
            <i aria-hidden="true" />
          </div>

          <h1>
            A little play.
            <br />
            <em>A little possibility.</em>
          </h1>

          <p>
            Follow your feeling. Pick a card.
            Let your little surprise unfold.
          </p>

          <div className="zg-how-it-works">
            <span>Choose a card</span>
            <i aria-hidden="true" />
            <span>
              Scratch{' '}
              {getRequiredScratches(gameConfig)} times
            </span>
            <i aria-hidden="true" />
            <span>Discover</span>
          </div>

          {!gameConfig.enabled && (
            <p
              role="status"
              style={{
                marginTop: 20,
                textAlign: 'center',
                color: '#e2c9ff',
                fontWeight: 600,
              }}
            >
              The scratch card game is temporarily
              unavailable. Please check back later.
            </p>
          )}
        </section>

        {/* GAME SHELL */}

        <section
          id="game"
          className={[
            'zg-game-shell',
            `phase-${phase}`,
            won ? 'result-win' : '',
            lost ? 'result-lose' : '',
          ].join(' ')}
        >
          <div
            className="zg-table-neon"
            aria-hidden="true"
          >
            <span />
            <span />
          </div>

          {won && (
            <WinCelebration
              key={`celebration-${round}`}
            />
          )}

          {/* GAME HEADING */}

          <div className="zg-game-heading">
            <span className="zg-eyebrow">
              A MOMENT OF LUCK
            </span>

            <h2
              role="status"
              aria-live="polite"
            >
              {choosing &&
              gameConfig.enabled ? (
                <>
                  Choose your{' '}
                  <em>winning card</em>
                </>
              ) : (
                message
              )}
            </h2>

            <div
              className="zg-heading-line"
              aria-hidden="true"
            >
              <span />
              <b>✦</b>
              <span />
            </div>
          </div>

          {/* FIVE CARDS */}

          <div className="zg-deal-stage">
            <div
              className="zg-table-glow"
              aria-hidden="true"
            />

            <div
              className="zg-table-floor"
              aria-hidden="true"
            />

            {cards.map((card, index) => {
              const isSelected =
                selected === index

              if (
                selected !== null &&
                !isSelected &&
                phase !== 'centering'
              ) {
                return null
              }

              const showBack =
                isSelected && flipped

              const canChoose =
                phase === 'choose' &&
                gameConfig.enabled

              const cardStyle = {
                '--card-color': card.color,
                '--card-rgb': card.rgb,
              } as CSSProperties

              return (
                <article
                  key={`${round}-${index}`}
                  style={cardStyle}
                  className={[
                    'zg-deal-card',
                    `zg-position-${index}`,
                    index === 2
                      ? 'is-intro-card'
                      : '',
                    isSelected
                      ? 'is-chosen'
                      : '',
                    selected !== null &&
                    !isSelected
                      ? 'is-leaving'
                      : '',
                  ].join(' ')}
                  aria-hidden={
                    phase === 'intro'
                      ? index !== 2
                      : selected !== null &&
                        !isSelected
                  }
                >
                  <div
                    className="zg-card-ground-glow"
                    aria-hidden="true"
                  />

                  <div
                    className={[
                      'zg-deal-flipper',
                      showBack
                        ? 'is-turned'
                        : '',
                    ].join(' ')}
                  >
                    {/* CARD FRONT */}

                    <button
                      type="button"
                      className="zg-deal-front"
                      disabled={!canChoose}
                      tabIndex={
                        canChoose ? 0 : -1
                      }
                      onClick={() =>
                        chooseCard(index)
                      }
                      aria-hidden={showBack}
                      aria-label={
                        `Choose mystery card ${index + 1}`
                      }
                    >
                      <span className="zg-photo">
                        <span
                          className="zg-photo-fallback"
                          aria-hidden="true"
                        >
                          ✦
                        </span>

                        <img
                          src={card.image}
                          alt=""
                          draggable={false}
                          style={{
                            objectPosition:
                              card.position,
                          }}
                          onError={event => {
                            event.currentTarget.style.display =
                              'none'
                          }}
                        />
                      </span>
                    </button>

                    {/* CARD BACK */}

                    <div
                      ref={
                        isSelected
                          ? scratchBackRef
                          : undefined
                      }
                      className="zg-deal-back"
                      aria-hidden={
                        !scratchEnabled &&
                        !revealed
                      }
                    >
                      {isSelected &&
                        result && (
                          <>
                            <span
                              className="zg-back-emblem"
                              aria-hidden="true"
                            >
                              {revealed && !won
                                ? '♡'
                                : '✦'}
                            </span>

                            <span className="zg-eyebrow">
                              {revealed
                                ? won
                                  ? 'LUCK LOOKS GOOD ON YOU'
                                  : 'ANOTHER CHANCE AWAITS'
                                : 'YOUR LITTLE ZEN SURPRISE'}
                            </span>

                            <h3>
                              {revealed
                                ? won
                                  ? 'Lucky you!'
                                  : 'Good Luck Next Time!'
                                : 'Scratch & discover.'}
                            </h3>

                            <ScratchCard
                              key={`scratch-${round}`}
                              result={result}
                              enabled={scratchEnabled}
                              revealed={revealed}
                              requiredScratches={
                                roundScratchCount
                              }
                              onReveal={
                                revealResult
                              }
                            />

                            <span className="zg-back-signature">
                              with love,
                              Zen Café
                            </span>
                          </>
                        )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          {/* RESULT CAPTION */}

          <div className="zg-stage-caption">
            {scratchEnabled && (
              <p>
                Complete {roundScratchCount}{' '}
                scratches to unlock your result.
              </p>
            )}

            {revealed && result && (
              <div
                className={[
                  'zg-result-message',
                  result.kind === 'win'
                    ? 'is-win'
                    : 'is-lose',
                ].join(' ')}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <span
                  className="zg-result-reaction"
                  aria-hidden="true"
                >
                  {result.kind === 'win'
                    ? '🥳'
                    : '🥺'}
                </span>

                <strong>
                  {result.kind === 'win'
                    ? `Hooray! You won ${result.offer.title.toLowerCase()}!`
                    : 'Good Luck Next Time!'}
                </strong>

                <p>
                  {result.kind === 'win'
                    ? 'A little luck. A lovely reason to smile.'
                    : 'Your next lucky moment could be one card away.'}
                </p>

                <span className="zg-result-note">
                  {result.kind === 'win'
                    ? 'Demo reward — not a redeemable voucher.'
                    : 'Demo game — a fresh chance awaits each round.'}
                </span>

                <button
                  ref={replayRef}
                  type="button"
                  className="zg-reset"
                  onClick={resetGame}
                >
                  {result.kind === 'win'
                    ? 'Play again ↻'
                    : 'Try my luck again ↻'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* FOOTER */}

        <footer className="zg-footer">
          <div className="zg-footer-brand">
            <Sparkles size={20} />

            <span>
              <strong>ZEN CAFE</strong>
              <small>JAFFNA</small>
            </span>
          </div>

          <p>
            A little play. A little luck.
            A little Zen.
          </p>

          <a href="/#home">
            Back to café →
          </a>
        </footer>
      </div>
    </main>
  )
}

/* ==========================================
   MOUNT REACT APPLICATION
========================================== */

const rootElement =
  document.getElementById('root')

if (!rootElement) {
  throw new Error(
    'games.html must contain <div id="root"></div>'
  )
}

createRoot(rootElement).render(
  React.createElement(GamesExperience)
)
