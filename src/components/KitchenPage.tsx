import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ChefHat, Utensils } from 'lucide-react'
import PremiumFooter from './PremiumFooter'
import MagneticButtons from './MagneticButtons'
import ScrollToTop from './ScrollToTop'
import PageReveal from './PageReveal'
import ThemeToggle from './ThemeToggle'
import GlobalPetals from './GlobalPetals'
import FloatingSocialRail from './FloatingSocialRail'
import type { MenuItem } from '../data/menu'
import { getVisibleMenu, loadMenuCatalog, subscribeMenuCatalog } from '../data/menuStore'
import FoodVisual from './FoodVisual'

const kitchenStyles = `
  .zen-kitchen-aligned {
    width: 100%;
    min-width: 0;
  }

  /* Compact navbar */

  .zen-kitchen-navbar {
    position: fixed;
    inset: 0 0 auto;
    z-index: 80;
    box-sizing: border-box;
    width: 100%;
    padding: 12px clamp(12px, 3vw, 48px);
    padding-top: max(12px, env(safe-area-inset-top));
  }

  .zen-kitchen-navbar .zen-kitchen-navbar-inner {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 16px;

    box-sizing: border-box;
    width: 100%;
    max-width: 1500px;
    min-height: 76px;
    margin: 0 auto;
    padding: 12px 20px;

    border: 1px solid rgb(255 255 255 / 85%);
    border-radius: 22px;
    background: rgb(255 250 245 / 94%);
    box-shadow:
      0 8px 28px rgb(74 43 29 / 8%),
      inset 0 1px 0 rgb(255 255 255 / 85%);

    -webkit-backdrop-filter: blur(18px);
    backdrop-filter: blur(18px);
  }

  .zen-kitchen-navbar .zen-kitchen-navbar-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    justify-self: start;
    gap: 8px;

    box-sizing: border-box;
    min-width: 44px;
    min-height: 44px;
    padding: 0 15px;

    border: 1px solid rgb(100 66 47 / 12%);
    border-radius: 14px;
    background: rgb(255 255 255 / 78%);
    color: #604538;
    text-decoration: none;
    white-space: nowrap;

    transition:
      background 180ms ease,
      box-shadow 180ms ease;
  }

  .zen-kitchen-navbar-back svg {
    flex-shrink: 0;
  }

  .zen-kitchen-navbar-back span {
    font-size: 12px;
    font-weight: 600;
  }

  .zen-kitchen-navbar .zen-kitchen-navbar-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    color: #603b2d;
    text-align: center;
    text-decoration: none;
  }

  .zen-kitchen-navbar-brand > b {
    margin: 0;
    white-space: nowrap;
  }

  .zen-kitchen-navbar .zen-kitchen-navbar-theme {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    justify-self: end;
    min-width: 44px;
  }

  .zen-kitchen-navbar .zen-kitchen-navbar-toggle {
    position: static !important;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    box-sizing: border-box;
    min-width: 44px;
    min-height: 44px;
    margin: 0 !important;
    flex-shrink: 0;
  }

  .zen-kitchen-navbar a:focus-visible,
  .zen-kitchen-navbar button:focus-visible {
    outline: 2px solid #a13c31;
    outline-offset: 4px;
  }

  @media (hover: hover) {
    .zen-kitchen-navbar-back:hover {
      background: #fff;
      box-shadow: 0 4px 12px rgb(74 43 29 / 9%);
    }
  }

  html[data-theme="dark"] .zen-kitchen-navbar-inner {
    border-color: rgb(231 202 174 / 14%);
    background: rgb(35 27 23 / 95%);
    box-shadow: 0 8px 28px rgb(0 0 0 / 22%);
  }

  html[data-theme="dark"] .zen-kitchen-navbar-brand {
    color: #f1dfca;
  }

  html[data-theme="dark"] .zen-kitchen-navbar-back {
    border-color: rgb(231 202 174 / 16%);
    background: rgb(255 255 255 / 5%);
    color: #f1dfca;
  }

  /* Page alignment: existing typography is preserved. */

  .zen-kitchen-aligned .zen-kitchen-aligned-main {
    min-width: 0;
  }

  .zen-kitchen-aligned .kitchen-hero-v62 {
    box-sizing: border-box;
    height: auto !important;
    min-height: 0 !important;
    padding: 32px clamp(16px, 3vw, 48px) 48px !important;
  }

  .zen-kitchen-aligned .kitchen-hero-v62-inner {
    box-sizing: border-box;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr);
    align-items: center !important;
    gap: 28px !important;

    width: 100% !important;
    max-width: 1500px !important;
    min-width: 0;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 auto !important;
    padding: 0 !important;
  }

  .zen-kitchen-aligned .kitchen-hero-v62-copy {
    box-sizing: border-box;
    position: relative !important;
    inset: auto !important;

    width: 100% !important;
    max-width: none !important;
    min-width: 0;
    margin: 0 !important;
    padding: 12px 0 !important;

    text-align: center;
  }

  .zen-kitchen-aligned .kitchen-hero-v62-copy h1,
  .zen-kitchen-aligned .kitchen-hero-v62-copy p {
    max-width: 100%;
    overflow-wrap: break-word;
  }

  .zen-kitchen-aligned .kitchen-hero-v62-badge {
    width: fit-content;
    margin-right: auto;
    margin-left: auto;
  }

  .zen-kitchen-aligned .kitchen-hero-v62-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .zen-kitchen-aligned .kitchen-hero-v63-visual {
    box-sizing: border-box;
    position: relative !important;

    width: 100% !important;
    max-width: 100% !important;
    min-width: 0;
    height: clamp(360px, 65vw, 540px) !important;
    min-height: 0 !important;
    margin: 0 !important;

    overflow: hidden;
    touch-action: pan-y;
  }

  .zen-kitchen-aligned .kitchen-hero-v63-info {
    box-sizing: border-box;
    display: flex !important;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    position: absolute !important;
    top: auto !important;
    right: 12px !important;
    bottom: 16px !important;
    left: 12px !important;

    width: auto !important;
    max-width: none !important;
    margin: 0 !important;
    transform: none !important;
  }

  .zen-kitchen-aligned .kitchen-hero-v63-info > .min-w-0 {
    flex: 1 1 140px;
    min-width: 0;
  }

  .zen-kitchen-aligned .kitchen-hero-v63-info b {
    display: block;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .zen-kitchen-aligned .kitchen-hero-v63-controls {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    gap: 10px;
    max-width: 100%;
  }

  .zen-kitchen-aligned .kitchen-hero-v63-controls > button {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
  }

  .zen-kitchen-aligned .kitchen-hero-v63-dots {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
  }

  .zen-kitchen-aligned .kitchen-menu-head-v128 {
    display: flex !important;
    flex-direction: column;
    align-items: flex-start !important;
    justify-content: space-between;
    gap: 20px;
  }

  .zen-kitchen-aligned .kitchen-menu-head-v128 > * {
    min-width: 0;
    max-width: 100%;
  }

  .zen-kitchen-aligned .kitchen-category-grid {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    align-items: stretch;
    gap: 20px !important;
  }

  .zen-kitchen-aligned .kitchen-menu-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    width: 100%;
    height: 100%;
  }

  .zen-kitchen-aligned .kitchen-menu-media {
    flex-shrink: 0;
    width: 100%;
    height: clamp(240px, 65vw, 330px) !important;
  }

  .zen-kitchen-aligned .kitchen-menu-content {
    flex: 1;
    min-width: 0;
  }

  .zen-kitchen-aligned .kitchen-menu-title,
  .zen-kitchen-aligned .kitchen-menu-description,
  .zen-kitchen-aligned .kitchen-menu-ingredients-text,
  .zen-kitchen-aligned .kitchen-category-block h3 {
    overflow-wrap: anywhere;
  }

  @media (max-width: 639px) {
    .zen-kitchen-navbar {
      padding: 8px 10px;
      padding-top: max(8px, env(safe-area-inset-top));
    }

    .zen-kitchen-navbar .zen-kitchen-navbar-inner {
      grid-template-columns: 44px minmax(0, 1fr) 44px;
      gap: 8px;
      min-height: 64px;
      padding: 9px 10px;
      border-radius: 18px;
    }

    .zen-kitchen-navbar .zen-kitchen-navbar-back {
      width: 44px;
      height: 44px;
      padding: 0;
      border-radius: 13px;
    }

    .zen-kitchen-navbar-back span {
      display: none;
    }

    .zen-kitchen-navbar .zen-kitchen-navbar-toggle {
      width: 44px !important;
      height: 44px !important;
      padding: 0 !important;
    }
  }

  @media (min-width: 640px) {
    .zen-kitchen-aligned .kitchen-category-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    .zen-kitchen-aligned .kitchen-menu-media {
      height: 330px !important;
    }
  }

  @media (min-width: 1024px) {
    .zen-kitchen-aligned .kitchen-hero-v62 {
      padding-top: 40px !important;
      padding-bottom: 64px !important;
    }

    .zen-kitchen-aligned .kitchen-hero-v62-inner {
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      gap: clamp(28px, 4vw, 64px) !important;
    }

    .zen-kitchen-aligned .kitchen-hero-v62-copy {
      text-align: left;
    }

    .zen-kitchen-aligned .kitchen-hero-v62-badge {
      margin-left: 0;
    }

    .zen-kitchen-aligned .kitchen-hero-v62-actions {
      justify-content: flex-start;
    }

    .zen-kitchen-aligned .kitchen-hero-v63-visual {
      height: clamp(460px, 42vw, 640px) !important;
    }

    .zen-kitchen-aligned .kitchen-menu-head-v128 {
      flex-direction: row;
      align-items: flex-end !important;
    }
  }

  @media (min-width: 1280px) {
    .zen-kitchen-aligned .kitchen-category-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 380px) {
    .zen-kitchen-aligned .kitchen-hero-v63-controls {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .zen-kitchen-navbar-back {
      transition: none;
    }
  }
`

export default function KitchenPage() {
  const [items, setItems] = useState<MenuItem[]>(() =>
    getVisibleMenu('food'),
  )
  const [activeHero, setActiveHero] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(0)

  const swipeStartX = useRef<number | null>(null)
  const headerRef = useRef<HTMLElement>(null)
  const heroResumeTimer = useRef<number | null>(null)

  // Keep page content below the actual navbar height.
  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const updateHeaderHeight = () => {
      const height = Math.ceil(header.getBoundingClientRect().height)

      setHeaderHeight((previous) =>
        previous === height ? previous : height,
      )
    }

    updateHeaderHeight()

    const observer = new ResizeObserver(updateHeaderHeight)
    observer.observe(header)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    loadMenuCatalog().then(() => {
      setItems(getVisibleMenu('food'))
    }).catch(() => {})

    return subscribeMenuCatalog(() => {
      setItems(getVisibleMenu('food'))
    })
  }, [])

  useEffect(() => {
    const previousRestoration = history.scrollRestoration

    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }

    const top = () =>
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'auto',
      })

    const navEntry = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming | undefined

    const isReload = navEntry?.type === 'reload'
    const hash = window.location.hash

    let timer = 0

    if (isReload || !hash) {
      top()
      timer = window.setTimeout(top, 70)
    } else {
      timer = window.setTimeout(() => {
        let targetId = hash.slice(1)

        try {
          targetId = decodeURIComponent(targetId)
        } catch {
          // Keep the original fragment if it cannot be decoded.
        }

        document.getElementById(targetId)?.scrollIntoView({
          behavior: 'auto',
          block: 'start',
        })
      }, 90)
    }

    return () => {
      window.clearTimeout(timer)

      if ('scrollRestoration' in history) {
        history.scrollRestoration = previousRestoration
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (heroResumeTimer.current !== null) {
        window.clearTimeout(heroResumeTimer.current)
      }
    }
  }, [])

  const heroItems = useMemo(() => {
    const featured = items.filter((item) => item.featured)

    return (featured.length ? featured : items).slice(0, 7)
  }, [items])

  useEffect(() => {
    if (activeHero >= heroItems.length) {
      setActiveHero(Math.max(0, heroItems.length - 1))
    }
  }, [activeHero, heroItems.length])

  useEffect(() => {
    if (heroItems.length < 2 || heroPaused) return

    const timer = window.setInterval(() => {
      setActiveHero((value) => (value + 1) % heroItems.length)
    }, 5200)

    return () => window.clearInterval(timer)
  }, [heroItems.length, heroPaused])

  const heroNav = (dir: 1 | -1) => {
    if (heroItems.length < 2) return

    setHeroPaused(true)

    setActiveHero(
      (value) => (value + dir + heroItems.length) % heroItems.length,
    )

    if (heroResumeTimer.current !== null) {
      window.clearTimeout(heroResumeTimer.current)
    }

    heroResumeTimer.current = window.setTimeout(() => {
      setHeroPaused(false)
      heroResumeTimer.current = null
    }, 7000)
  }

  const heroRole = (index: number) => {
    const len = heroItems.length

    if (!len) return 'hidden'

    const diff = (index - activeHero + len) % len

    if (diff === 0) return 'active'
    if (diff === 1) return 'next'
    if (diff === len - 1) return 'prev'

    return 'hidden'
  }

  const currentHero = heroItems[activeHero]

  const categories = useMemo(() => {
    const map = new Map<string, MenuItem[]>()

    items.forEach((item) => {
      const category = item.category.trim() || 'Other Food'

      if (!map.has(category)) {
        map.set(category, [])
      }

      map.get(category)!.push(item)
    })

    return Array.from(map.entries())
  }, [items])

  return (
    <div className="zen-dark-scope zen-kitchen-shell zen-kitchen-aligned min-h-screen bg-[#f7eee5] text-[#211712]">
      <style>{kitchenStyles}</style>

      <MagneticButtons />
      <GlobalPetals />
      <PageReveal />
      <ScrollToTop />
      <FloatingSocialRail />

      <header ref={headerRef} className="zen-kitchen-navbar">
        <nav
          className="zen-kitchen-navbar-inner"
          aria-label="Zen Kitchen navigation"
        >
          <a
            href="/"
            className="zen-kitchen-navbar-back"
            data-no-magnet
            aria-label="Back to Zen Café"
          >
            <ArrowLeft size={19} aria-hidden="true" />
            <span>Back</span>
          </a>

          <a
            href="/zen-kitchen.html"
            className="zen-kitchen-navbar-brand"
            data-no-magnet
            aria-label="Zen Kitchen home"
          >
            <b className="zen-navbar-brand-japan block text-[21px] sm:text-[24px]">
              Zen Kitchen
            </b>
          </a>

          <div className="zen-kitchen-navbar-theme">
            <ThemeToggle className="zen-kitchen-navbar-toggle" />
          </div>
        </nav>
      </header>

      <main
        className="zen-kitchen-aligned-main"
        style={{ paddingTop: headerHeight }}
      >
        <section className="kitchen-hero zen-kitchen-hero kitchen-hero-v62">
          <div className="kitchen-grid-bg" />
          <div className="kitchen-glow kitchen-glow-one" />
          <div className="kitchen-glow kitchen-glow-two" />

          <div className="kitchen-hero-v62-inner relative z-10 mx-auto max-w-[1500px]">
            <div className="kitchen-hero-v62-copy">
              <div className="kitchen-hero-v62-badge">
                <ChefHat size={16} />
                <span>Zen Kitchen</span>
              </div>

              <h1>
                Fresh from
                <br />
                the <span>Kitchen.</span>
              </h1>

              <p>Fresh dishes. Calm flavours.</p>

              <div className="kitchen-hero-v62-actions">
                <a href="#kitchen-menu" className="primary-pill">
                  <Utensils size={14} />
                  Explore dishes
                </a>
              </div>
            </div>

            <div
              className="kitchen-hero-v62-visual kitchen-hero-v63-visual"
              aria-label="Swipe through Zen Kitchen Panda dishes"
              onMouseEnter={() => setHeroPaused(true)}
              onMouseLeave={() => setHeroPaused(false)}
              onPointerDown={(event) => {
                if (
                  event.pointerType === 'mouse' &&
                  event.button !== 0
                ) {
                  return
                }

                swipeStartX.current = event.clientX
              }}
              onPointerUp={(event) => {
                if (swipeStartX.current === null) return

                const delta = event.clientX - swipeStartX.current
                swipeStartX.current = null

                if (Math.abs(delta) < 38) return

                heroNav(delta < 0 ? 1 : -1)
              }}
              onPointerCancel={() => {
                swipeStartX.current = null
              }}
            >
              <div
                className="kitchen-hero-v62-word"
                aria-hidden="true"
              >
                ZEN
              </div>

              <div
                className="kitchen-hero-v62-halo"
                aria-hidden="true"
              />

              <div className="kitchen-hero-v63-track">
                {heroItems.map((item, index) => {
                  const role = heroRole(index)

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`kitchen-hero-v63-slide kitchen-hero-v63-${role}`}
                      onClick={() => {
                        if (role !== 'active') {
                          setHeroPaused(true)
                          setActiveHero(index)
                        }
                      }}
                      aria-label={`Show ${item.name}`}
                      aria-hidden={role === 'hidden'}
                      tabIndex={role === 'hidden' ? -1 : 0}
                    >
                      <FoodVisual
                        item={item}
                        className="h-full w-full"
                        imageClassName="kitchen-hero-v63-panda h-full w-full object-contain object-bottom"
                      />
                    </button>
                  )
                })}
              </div>

              <div
                className="kitchen-hero-v62-floor"
                aria-hidden="true"
              />

              {currentHero && (
                <div className="kitchen-hero-v63-info">
                  <div className="min-w-0">
                    <span>{currentHero.category}</span>
                    <b>{currentHero.name}</b>
                  </div>

                  <div className="kitchen-hero-v63-controls">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        heroNav(-1)
                      }}
                      aria-label="Previous Panda"
                    >
                      <ArrowLeft size={17} />
                    </button>

                    <div
                      className="kitchen-hero-v63-dots"
                      aria-label="Panda slides"
                    >
                      {heroItems.map((item, index) => (
                        <button
                          key={item.id}
                          type="button"
                          className={
                            index === activeHero ? 'is-active' : ''
                          }
                          onClick={(event) => {
                            event.stopPropagation()
                            setHeroPaused(true)
                            setActiveHero(index)
                          }}
                          aria-label={`Go to ${item.name}`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        heroNav(1)
                      }}
                      aria-label="Next Panda"
                    >
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div
            className="kitchen-hero-v62-fade"
            aria-hidden="true"
          />
        </section>

        <section
          id="kitchen-menu"
          data-zen-reveal
          className="zen-kitchen-menu-section zen-reveal bg-[#efe1d4] px-5 py-20 sm:px-10 lg:px-12"
          style={{ scrollMarginTop: headerHeight + 16 }}
        >
          <div className="mx-auto max-w-[1500px]">
            <div className="kitchen-menu-head-v128 mb-10">
              <div>
                <p className="kicker">Restaurant Menu</p>

                <h2 className="section-title">
                  Pick your
                  <br />
                  <span>favourite.</span>
                </h2>
              </div>

              <p className="section-copy">
                Fresh dishes, grouped simply.
              </p>
            </div>

            {!categories.length ? (
              <div className="panel grid min-h-[300px] place-items-center p-8 text-center">
                <div>
                  <ChefHat
                    className="mx-auto text-[#a32722]"
                    size={34}
                  />

                  <h3 className="mt-4 font-serif text-[32px]">
                    Kitchen menu is waiting.
                  </h3>

                  <p className="mt-2 text-[12px] text-[#74645b]">
                    Add an available Food item in the admin dashboard.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-14">
                {categories.map(
                  ([category, categoryItems], groupIndex) => (
                    <section
                      key={category}
                      data-zen-reveal
                      className="zen-reveal kitchen-category-block"
                    >
                      <div className="mb-6 flex flex-col gap-3 border-b border-[#60392b]/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[9px] font-extrabold uppercase tracking-[.18em] text-[#a32722]">
                            Category{' '}
                            {String(groupIndex + 1).padStart(2, '0')}
                          </p>

                          <h3 className="mt-1 font-serif text-[38px] leading-none sm:text-[46px]">
                            {category}
                          </h3>
                        </div>

                        <span className="w-fit shrink-0 rounded-full border border-[#5a3528]/10 bg-white/55 px-4 py-2 text-[9px] font-bold uppercase tracking-[.12em] text-[#6b5a51]">
                          {categoryItems.length} item
                          {categoryItems.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="kitchen-category-grid grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {categoryItems.map((item) => (
                          <article
                            key={item.id}
                            className="kitchen-menu-card kitchen-menu-card-compact group"
                          >
                            <div className="kitchen-menu-media zen-transparent-menu-media relative h-[330px] overflow-hidden rounded-[28px]">
                              <FoodVisual
                                item={item}
                                className="relative z-10 h-full w-full"
                                imageClassName="kitchen-menu-image relative z-10 h-full w-full object-contain object-bottom transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.035]"
                              />
                            </div>

                            <div className="kitchen-menu-content p-5">
                              <div className="kitchen-menu-tags flex flex-wrap items-center gap-2">
                                <p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#a32722]">
                                  {item.category}
                                </p>

                                <span
                                  className={`zen-menu-badge ${
                                    item.dietaryType === 'non-veg'
                                      ? 'zen-menu-badge-nonveg'
                                      : 'zen-menu-badge-veg'
                                  }`}
                                >
                                  {item.dietaryType === 'non-veg'
                                    ? 'Non Veg'
                                    : 'Veg'}
                                </span>

                                {item.featured && (
                                  <span className="kitchen-featured-badge rounded-full bg-[#a32722]/8 px-2 py-1 text-[8px] font-bold uppercase tracking-[.1em] text-[#a32722]">
                                    Featured
                                  </span>
                                )}
                              </div>

                              <h4 className="kitchen-menu-title mt-2 font-serif text-[28px] leading-none">
                                {item.name}
                              </h4>

                              <p className="kitchen-menu-description mt-3 text-[11px] leading-5 text-[#6b5b53]">
                                {item.description}
                              </p>

                              {item.ingredients && (
                                <div className="kitchen-menu-ingredients mt-4 rounded-[18px] border border-[#5a3528]/8 bg-[#fffaf5]/70 p-3">
                                  <p className="text-[8px] font-extrabold uppercase tracking-[.13em] text-[#8f211e]">
                                    Ingredients
                                  </p>

                                  <p className="kitchen-menu-ingredients-text mt-1 text-[10px] leading-5 text-[#6b5b53]">
                                    {item.ingredients}
                                  </p>
                                </div>
                              )}

                              {item.serving && (
                                <p className="kitchen-menu-serving mt-3 text-[9px] font-semibold uppercase tracking-[.1em] text-[#8a786e]">
                                  {item.serving}
                                </p>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ),
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      <PremiumFooter kitchen />
    </div>
  )
}