import { ArrowDown, ArrowLeft, BadgePercent, Clock3, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import ThemeToggle from './ThemeToggle'
import { activeOffers, loadOffers, subscribeOffers, ZenOffer } from '../data/offerStore'
import OfferArtwork from './OfferArtwork'
import OfferComicBadge from './OfferComicBadge'

function formatOfferTime(dateLike:string){
  const date=new Date(dateLike)
  if(Number.isNaN(date.getTime()))return 'Limited-time availability'
  return `Live since ${date.toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ${date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}`
}

export default function OffersPage(){
  const [offers,setOffers]=useState<ZenOffer[]>(()=>activeOffers())
  useEffect(()=>{
    loadOffers().then(items=>setOffers(items.filter(o=>o.active))).catch(()=>{})
    return subscribeOffers(()=>setOffers(activeOffers()))
  },[])

  const hasOffers=offers.length>0
  const goToOffers=()=>document.getElementById('live-offers')?.scrollIntoView({behavior:'smooth',block:'start'})

  return <main className="zen-offers-page zen-offers-v139 min-h-screen bg-[#f8f0e8] text-[#241713]">
    <div className="zen-offers-v139-bg" aria-hidden="true">
      <span className="zen-offers-v139-sun"/>
      <span className="zen-offers-v139-wave wave-a"/>
      <span className="zen-offers-v139-wave wave-b"/>
    </div>

    <header className="zen-offers-header zen-offers-v139-header zen-offers-v140-header">
      <a href="/" className="zen-offers-brand zen-offers-v139-brand zen-offers-v140-brand" aria-label="Zen Café home">
        <img src="/assets/zen-logo.png" alt="Zen Café"/>
        <div><b>ZEN CAFE</b><span>Live offers</span></div>
      </a>

      <div className="zen-offers-v139-nav-actions zen-offers-v140-nav-actions">
        <a href="/" className="zen-offers-back zen-offers-v139-back zen-offers-v140-back" aria-label="Back to Zen Café">
          <ArrowLeft size={17}/><span>Back</span>
        </a>
        <div className={`zen-offers-v139-live-pill zen-offers-v140-live-pill ${hasOffers?'is-live':'is-resting'}`} aria-live="polite">
          <i aria-hidden="true"/>
          <span>{hasOffers?`${offers.length} live`:'No live offer'}</span>
        </div>
        <ThemeToggle/>
      </div>
    </header>

    <section className="zen-offers-hero zen-offers-v139-hero">
      <div className="zen-offers-copy zen-offers-v139-copy">
        <div className="zen-offers-v139-kicker"><Sparkles size={15}/><span>Zen specials</span></div>
        <h1>Today's<br/><span>specials.</span></h1>
        <p>Fresh café offers, updated live. No clutter — only the specials available right now.</p>
        {hasOffers&&<button type="button" className="zen-offers-v139-view" onClick={goToOffers}>View offers <ArrowDown size={16}/></button>}
      </div>

      <div className={`zen-offers-v139-hero-card zen-offers-v141-hero-card ${hasOffers?'is-live':'is-resting'}`} aria-label={hasOffers?`${offers.length} live offers`:'No live offers'}>
        <div className="zen-offers-v141-status-row" aria-hidden="true">
          <i className="zen-offers-v141-status-dot"/>
          <span>{hasOffers?'Live offers':'Offers board'}</span>
        </div>
        <div className="zen-offers-v141-hero-card-copy">
          <small>{hasOffers?'Updated automatically':'Waiting for the next special'}</small>
          <div className="zen-offers-v141-hero-stat">
            <strong>{offers.length.toString().padStart(2,'0')}</strong>
            <span>{offers.length===1?'offer available right now':'offers available right now'}</span>
          </div>
          <p>{hasOffers?'Fresh Zen Café specials, shown cleanly without clutter.':'When the next Zen Café special goes live, it will appear here automatically.'}</p>
        </div>
      </div>
    </section>

    <section id="live-offers" className="zen-offers-grid-wrap zen-offers-v139-grid-wrap" aria-label="Live Zen Café offers">
      <div className="zen-offers-v139-section-head">
        <div><span>Live board</span><h2>{hasOffers?'Available now':'Next special'}</h2></div>
        {hasOffers&&<p>{offers.length} active {offers.length===1?'offer':'offers'} · updates automatically</p>}
      </div>

      {hasOffers?
        <div className={`zen-offers-grid zen-offers-v139-grid ${offers.length===1?'is-single':''}`}>
          {offers.map((offer,index)=><OfferCard key={offer.id} offer={offer} index={index}/>) }
        </div>:
        <div className="zen-offers-empty zen-offers-v139-empty">
          <div className="zen-offers-v139-empty-icon"><Sparkles size={30}/><span>Z</span><span>Z</span></div>
          <p className="zen-offers-v139-empty-kicker">Offers board is resting</p>
          <h2>No live offers right now.</h2>
          <p>When the next Zen Café special goes live, it will appear here automatically.</p>
          <a href="/"><ArrowLeft size={15}/> Return to Zen Café</a>
        </div>}
    </section>
  </main>
}

function OfferCard({offer,index}:{offer:ZenOffer,index:number}){
  return <article className="zen-offer-card zen-offer-card--comic zen-offer-card-v139 zen-offer-card-v141" style={{animationDelay:`${Math.min(index,7)*80}ms`}}>
    <div className="zen-offer-card-media zen-offer-card-v139-media">
      <div className="zen-offer-card-v139-live"><i/> Live</div>
      <div className="zen-offer-card-v139-index">{String(index+1).padStart(2,'0')}</div>
      <OfferArtwork src={offer.image||'/assets/menu-panda-main.png'} alt={offer.title}/>
      <OfferComicBadge text={offer.badge||'SPECIAL OFFER'} className="zen-offer-card-comic-badge"/>
      <span className="zen-offer-card-v139-shine" aria-hidden="true"/>
    </div>
    <div className="zen-offer-card-copy zen-offer-card-v139-copy">
      <p className="zen-offer-subtitle">{offer.subtitle||'Zen Café special'}</p>
      <h2>{offer.title}</h2>
      <p>{offer.description}</p>
      <div className="zen-offer-card-meta zen-offer-card-v139-meta"><Clock3 size={14}/><span>{formatOfferTime(offer.createdAt)}</span></div>
      <div className="zen-offer-card-v139-foot"><BadgePercent size={15}/><span>Limited-time Zen special</span></div>
    </div>
  </article>
}
