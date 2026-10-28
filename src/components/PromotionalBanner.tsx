import { useEffect, useState } from 'react'
import { ArrowRight, Sparkles, Tag } from 'lucide-react'
import { activeOffers, loadOffers, subscribeOffers, type ZenOffer } from '../data/offerStore'

export default function PromotionalBanner() {
  const [offers, setOffers] = useState<ZenOffer[]>(() => activeOffers())

  useEffect(() => {
    loadOffers()
      .then(items => setOffers(items.filter(o => o.active)))
      .catch(() => {})

    return subscribeOffers(() => {
      setOffers(activeOffers())
    })
  }, [])

  // Hide the banner when no active offers exist
  if (!offers.length) {
    return null
  }

  // Duplicate items for continuous seamless loop without jumps
  const loopItems = [...offers, ...offers]

  return (
    <aside
      className="zen-promo-banner-wrapper pointer-events-auto mx-auto mt-2 max-w-[1480px] overflow-hidden"
      aria-label="Live promotions and special offers"
    >
      <div className="zen-promo-banner-glass group relative flex items-center rounded-full border border-white/60 bg-[#fffaf5]/85 py-1.5 pl-3 pr-4 shadow-[0_8px_24px_rgba(72,34,22,0.08)] backdrop-blur-xl transition-all duration-300 hover:border-[#a32722]/30 dark:border-white/10 dark:bg-[#1a1412]/85">
        {/* Left static badge */}
        <a
          href="/offers.html"
          className="zen-promo-tag-badge relative z-10 mr-3 flex flex-shrink-0 items-center gap-1.5 rounded-full bg-[#a32722] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white shadow-[0_2px_8px_rgba(163,39,34,0.35)] transition-transform hover:scale-105"
          aria-label="Explore all Zen Café specials"
        >
          <Sparkles size={11} className="text-[#fddcb4]" />
          <span>Special Offers</span>
        </a>

        {/* Horizontally scrolling marquee track */}
        <div className="zen-promo-marquee flex-1 overflow-hidden" tabIndex={0} role="region" aria-label="Offers ticker">
          <div className="zen-promo-track flex items-center">
            {loopItems.map((offer, idx) => (
              <a
                key={`${offer.id}-${idx}`}
                href="/offers.html"
                className="zen-promo-item group/item inline-flex flex-shrink-0 items-center gap-2.5 px-4 text-[12px] font-medium text-[#463229] transition-colors hover:text-[#a32722] dark:text-[#eedfd6] dark:hover:text-[#f3b2a9]"
              >
                {offer.badge && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#a32722]/20 bg-[#a32722]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#a32722] dark:border-[#f3b2a9]/30 dark:bg-[#f3b2a9]/15 dark:text-[#f3b2a9]">
                    <Tag size={9} />
                    {offer.badge}
                  </span>
                )}
                <span className="font-semibold text-[#251915] dark:text-[#fff6ef]">
                  {offer.title}
                </span>
                {offer.description && (
                  <span className="hidden text-[11px] text-[#78665d] sm:inline dark:text-[#ad9e96]">
                    — {offer.description.slice(0, 60)}{offer.description.length > 60 ? '...' : ''}
                  </span>
                )}
                {offer.code && (
                  <span className="rounded bg-[#553628]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#553628] dark:bg-white/10 dark:text-[#edd6c8]">
                    Code: {offer.code}
                  </span>
                )}
                <span className="text-[#c2aba0] dark:text-[#5e4e46]" aria-hidden="true">
                  ·
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* Right CTA link */}
        <a
          href="/offers.html"
          className="zen-promo-view-all relative z-10 ml-2 hidden flex-shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold tracking-wider text-[#a32722] hover:underline sm:inline-flex dark:text-[#f3b2a9]"
          aria-label="View all active offers"
        >
          <span>View All</span>
          <ArrowRight size={13} />
        </a>
      </div>
    </aside>
  )
}
