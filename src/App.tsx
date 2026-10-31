
import { useEffect, useRef, useState } from 'react'
import {
  ClipboardCheck,
  Clock3,
  Images,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import Header from './components/Header'
import HeroSection from './components/HeroSection'
import HomeOffersSlider from './components/HomeOffersSlider'
import MenuCarousel from './components/MenuCarousel'
import { RoomBooking } from './components/BookingForms'
import PremiumFooter from './components/PremiumFooter'
import GlobalPetals from './components/GlobalPetals'
import MagneticButtons from './components/MagneticButtons'
import ScrollToTop from './components/ScrollToTop'
import FloatingSocialRail from './components/FloatingSocialRail'
import PageReveal from './components/PageReveal'
import RopePanda from './components/RopePanda'
import CommunityGallery from './components/CommunityGallery'

/* ==========================================
   TYPES
========================================== */

type OverviewCard = {
  title: string
  meta: string
  icon: LucideIcon
}

/* ==========================================
   OVERVIEW CARDS
========================================== */

const overviewCards: OverviewCard[] = [
  {
    title: 'Signature menu',
    meta: 'Browse favourites',
    icon: UtensilsCrossed,
  },
  {
    title: 'Private room',
    meta: '10–15 guests · max 3h',
    icon: Users,
  },
  {
    title: 'Quick booking',
    meta: 'One simple request',
    icon: ClipboardCheck,
  },
  {
    title: 'Guest gallery',
    meta: 'Upload · browse',
    icon: Images,
  },
]

/* ==========================================
   APP
========================================== */

export default function App() {
  const [toast, setToast] = useState('')

  const toastTimerRef = useRef<number | null>(null)

  /* ==========================================
     TOAST NOTIFICATION
  ========================================== */

  const toastNow = (message: string) => {
    setToast(message)

    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast('')
      toastTimerRef.current = null
    }, 2500)
  }

  /* ==========================================
     SCROLL RESTORATION
  ========================================== */

  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }

    const scrollTop = () => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'auto',
      })
    }

    const navEntry = performance.getEntriesByType(
      'navigation'
    )[0] as PerformanceNavigationTiming | undefined

    const isReload = navEntry?.type === 'reload'
    const requestedHash = window.location.hash

    let raf = 0
    let timer = 0

    if (isReload || !requestedHash) {
      scrollTop()

      raf = window.requestAnimationFrame(scrollTop)

      timer = window.setTimeout(scrollTop, 80)
    } else {
      timer = window.setTimeout(() => {
        const targetId = decodeURIComponent(
          requestedHash.slice(1)
        )

        const target = document.getElementById(targetId)

        target?.scrollIntoView({
          behavior: 'auto',
          block: 'start',
        })
      }, 100)
    }

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && !window.location.hash) {
        scrollTop()
      }
    }

    const onBeforeUnload = () => {
      if (!window.location.hash || isReload) {
        scrollTop()
      }
    }

    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      if (raf) {
        window.cancelAnimationFrame(raf)
      }

      window.clearTimeout(timer)

      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener(
        'beforeunload',
        onBeforeUnload
      )
    }
  }, [])

  /* ==========================================
     TOAST CLEANUP
  ========================================== */

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  /* ==========================================
     RENDER
  ========================================== */

  return (
    <div className="zen-dark-scope zen-app-shell min-h-screen bg-[#f8f0e8] text-[#201713]">

      {/* GLOBAL WEBSITE COMPONENTS */}

      <MagneticButtons />
      <GlobalPetals />
      <PageReveal />
      <ScrollToTop />
      <FloatingSocialRail />

      {/* EXISTING HEADER - UNCHANGED */}

      <Header />

      <RopePanda />

      <main>

        {/* ======================================
            HERO SECTION
        ====================================== */}

        <HeroSection />

        {/* ======================================
            HOME OFFERS
        ====================================== */}

        <HomeOffersSlider />

        {/* ======================================
            ZEN ESSENTIALS
        ====================================== */}

        <section
          data-zen-reveal
          className="zen-overview-band zen-reveal relative z-10 -mt-[1px] overflow-hidden border-y border-[#5b3c2c]/10 bg-[#efe2d4]"
        >
          <div className="zen-overview-inner mx-auto max-w-[1500px] px-5 sm:px-10 lg:px-12">

            <div className="zen-overview-head">
              <div className="zen-overview-heading-copy">
                <p className="kicker">
                  Zen essentials
                </p>

                <h2 className="section-title">
                  Everything you need.
                  <br />
                  <span>Nothing extra.</span>
                </h2>
              </div>

              <p className="section-copy">
                Menu, room, booking and gallery — at a glance.
              </p>
            </div>

            <div className="zen-overview-grid">
              {overviewCards.map(item => {
                const Icon = item.icon

                return (
                  <article
                    key={item.title}
                    className="zen-overview-card"
                  >
                    <span className="zen-overview-icon">
                      <Icon size={18} />
                    </span>

                    <div className="zen-overview-card-copy">
                      <h3>{item.title}</h3>

                      <span className="zen-overview-meta">
                        {item.meta}
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        {/* ======================================
            MENU SECTION - UNCHANGED
        ====================================== */}

        <MenuCarousel />

        {/* ======================================
            PARTY ROOM BOOKING
            FRONTEND REDESIGN ONLY
        ====================================== */}

        <section
          id="room-booking"
          data-zen-reveal
          aria-labelledby="zen-party-room-heading"
          className="zen-room-section section-shell zen-reveal relative overflow-hidden bg-[#eee1d4]"
        >
          <div className="room-section-inner mx-auto max-w-[1500px] px-5 py-20 sm:px-10 sm:py-24 lg:px-12 lg:py-28">

            {/* SECTION INTRO */}

            <div className="room-section-head room-section-head-v121 mb-10 lg:mb-14">
              <div>
                <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.3em] text-[#a83d2b]">
                  Zen Café · Private Celebrations
                </p>

                <h2
                  id="zen-party-room-heading"
                  className="section-title room-booking-title"
                >
                  A space for
                  <br />
                  <span>beautiful moments.</span>
                </h2>

                <div className="mt-5 h-[2px] w-16 bg-[#a83d2b]" />
              </div>

              <p className="section-copy max-w-[420px]">
                
              </p>
            </div>

            {/* ROOM INFORMATION STRIP */}

            <div
              className="room-essentials-v121 mb-8 overflow-hidden rounded-2xl border border-[#e3c6b2] bg-[#f7e4d5] shadow-[0_12px_35px_rgba(73,39,25,0.05)]"
              aria-label="Private room essentials"
            >
              <div className="room-essential-v121">
                <Users size={21} strokeWidth={1.6} />

                <span>
                  <small>Room capacity</small>
                  <b>10–15 guests</b>
                </span>
              </div>

              <div className="room-essential-v121">
                <Clock3 size={21} strokeWidth={1.6} />

                <span>
                  <small>Maximum duration</small>
                  <b>Up to 3 hours</b>
                </span>
              </div>

              <div className="room-essential-v121">
                <ClipboardCheck
                  size={21}
                  strokeWidth={1.6}
                />

                <span>
                  <small>Booking confirmation</small>
                  <b>Via email</b>
                </span>
              </div>
            </div>

            {/* EXISTING BOOKING COMPONENT */}

            <RoomBooking toast={toastNow} />

          </div>

          {/* TRANSITION INTO GALLERY */}

          <div
            className="room-to-gallery-fade"
            aria-hidden="true"
          />
        </section>

        {/* ======================================
            COMMUNITY GALLERY - UNCHANGED
        ====================================== */}

        <CommunityGallery toast={toastNow} />

      </main>

      {/* ======================================
          FOOTER - UNCHANGED
      ====================================== */}

      <PremiumFooter />

      {/* ======================================
          GLOBAL TOAST
      ====================================== */}

      <div
        role="status"
        aria-live="polite"
        className={
          'fixed bottom-5 left-1/2 z-[200] ' +
          'max-w-[calc(100vw-32px)] -translate-x-1/2 ' +
          'rounded-full bg-[#24140e]/94 px-5 py-3 ' +
          'text-center text-[11px] font-semibold text-white ' +
          'shadow-2xl transition-all duration-300 ' +
          (toast
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-4 opacity-0')
        }
      >
        {toast}
      </div>
    </div>
  )
}
