import * as React from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DoorOpen, Gift, Instagram } from 'lucide-react'

import WhatsAppIcon from './WhatsAppIcon'
import {
  activeOffers,
  subscribeOffers,
} from '../data/offerStore'

import './FloatingSocialRail.css'

const INSTAGRAM_URL =
  'https://www.instagram.com/_zen___cafe?igsi=MXhrZmJjeWtkc2VpMQ=='

const WHATSAPP_URL = 'https://wa.me/94705175174'

// Replace these with your café's actual ordering links.
const PICKME_URL = 'YOUR_PICKME_URL'
const UBER_URL = 'YOUR_UBER_URL'

export default function FloatingSocialRail() {
  const [offerCount, setOfferCount] = useState(
    () => activeOffers().length,
  )

  const [showDoorIntro, setShowDoorIntro] = useState(true)

  useEffect(() => {
    return subscribeOffers(() => {
      setOfferCount(activeOffers().length)
    })
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowDoorIntro(false)
    }, 4200)

    return () => window.clearTimeout(timer)
  }, [])

  const showDoor = () => {
    setShowDoorIntro(false)

    const home = document.getElementById('home')

    if (!home) {
      window.location.assign('/#home')
      return
    }

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches

    home.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  const hasOffers = offerCount > 0

  const rail = (
    <aside
      className="zen-quiet-dock"
      aria-label="Zen Café quick links"
    >
      <button
        type="button"
        className="zen-quiet-dock__button zen-quiet-dock__door"
        onClick={showDoor}
        aria-label="Knock the door — go to the café entrance"
        title="Knock the door"
      >
        {showDoorIntro && (
          <span
            className="zen-quiet-dock__intro"
            aria-hidden="true"
          >
            <span>Knock the door</span>
          </span>
        )}

        <span
          className="zen-quiet-dock__door-icon"
          aria-hidden="true"
        >
          <DoorOpen size={21} strokeWidth={1.8} />
        </span>
      </button>

      <a
        className="zen-quiet-dock__button zen-quiet-dock__instagram"
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Visit Zen Café on Instagram"
        title="Instagram"
      >
        <Instagram size={20} aria-hidden="true" />
      </a>

      <a
        className="zen-quiet-dock__button zen-quiet-dock__whatsapp"
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with Zen Café on WhatsApp"
        title="WhatsApp"
      >
        <span
          className="zen-quiet-dock__whatsapp-logo"
          aria-hidden="true"
        >
          <WhatsAppIcon size={24} />
        </span>
      </a>

      <a
        className="zen-quiet-dock__button zen-quiet-dock__offers"
        href="/offers.html"
        aria-label={
          hasOffers
            ? `${offerCount} live Zen Café offer${
                offerCount === 1 ? '' : 's'
              }`
            : 'View Zen Café offers'
        }
        title={
          hasOffers
            ? `Offers · ${offerCount}`
            : 'No live offers'
        }
      >
        <Gift
          size={22}
          strokeWidth={1.8}
          aria-hidden="true"
        />

        {hasOffers && (
          <span
            className="zen-quiet-dock__badge"
            aria-hidden="true"
          >
            {offerCount > 99 ? '99+' : offerCount}
          </span>
        )}
      </a>

      <a
        className="zen-quiet-dock__button zen-quiet-dock__pickme"
        href={PICKME_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Order from Zen Café on PickMe"
        title="Order on PickMe"
      >
        <img
          src="/assets/PickMe.jpeg"
          alt=""
          width={32}
          height={32}
          draggable={false}
        />
      </a>

      <a
        className="zen-quiet-dock__button zen-quiet-dock__uber"
        href={UBER_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Order from Zen Café on Uber Eats"
        title="Order on Uber Eats"
      >
        <img
          src="/assets/Uber.png"
          alt=""
          width={32}
          height={32}
          draggable={false}
        />
      </a>
    </aside>
  )

  if (typeof document === 'undefined') {
    return null
  }

  // Keeps the dock attached to the viewport, even when
  // a page section has a transform or animation.
  return createPortal(rail, document.body)
}