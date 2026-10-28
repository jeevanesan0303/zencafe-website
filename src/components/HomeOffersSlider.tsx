import { ArrowUpRight, BadgePercent, Clock3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { activeOffers, loadOffers, subscribeOffers, type ZenOffer } from '../data/offerStore'
import OfferArtwork from './OfferArtwork'
import OfferComicBadge from './OfferComicBadge'

const SLIDE_MS = 5200

function formatOfferTime(dateLike:string){
  const date=new Date(dateLike)
  if(Number.isNaN(date.getTime()))return 'Live now'
  const now=new Date()
  const diff=Math.max(0,now.getTime()-date.getTime())
  const mins=Math.floor(diff/60000)
  if(mins<1)return 'Just added'
  if(mins<60)return `${mins} min ago`
  const hours=Math.floor(mins/60)
  if(hours<24)return `${hours} hr${hours>1?'s':''} ago`
  return `Added ${date.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`
}

export default function HomeOffersSlider(){
  const [offers,setOffers]=useState<ZenOffer[]>(()=>activeOffers())
  const [index,setIndex]=useState(0)

  useEffect(()=>{
    loadOffers().then(items=>{
      setOffers(items.filter(o=>o.active))
      setIndex(0)
    }).catch(()=>{})

    return subscribeOffers(()=>{
      setOffers(activeOffers())
      setIndex(0)
    })
  },[])

  useEffect(()=>{
    if(offers.length<2)return
    const timer=window.setInterval(()=>{
      setIndex(current=>(current+1)%offers.length)
    },SLIDE_MS)
    return()=>window.clearInterval(timer)
  },[offers.length])

  useEffect(()=>{
    if(index>=offers.length)setIndex(0)
  },[index,offers.length])

  if(!offers.length)return null

  return <section className="zen-home-offers-band" aria-label="Live Zen Café offers">
    <div className="zen-home-offers-shell">
      <div className="zen-home-offers-topline">
        <div className="zen-home-offers-live"><span/><BadgePercent size={14}/><b>Live offer{offers.length===1?'':'s'}</b></div>
        {offers.length>1 && <span className="zen-home-offers-count">{index+1} / {offers.length}</span>}
      </div>

      <div className="zen-home-offers-viewport">
        <div className="zen-home-offers-track" style={{transform:`translate3d(-${index*100}%,0,0)`}}>
          {offers.map(offer=><HomeOfferCard key={offer.id} offer={offer}/>)}
        </div>
      </div>

      {offers.length>1 && <div className="zen-home-offers-dots" aria-label="Choose offer">
        {offers.map((offer,i)=><button
          key={offer.id}
          type="button"
          aria-label={`Show offer ${i+1}: ${offer.title}`}
          aria-current={i===index?'true':undefined}
          className={i===index?'is-active':''}
          onClick={()=>setIndex(i)}
        />)}
      </div>}
    </div>
  </section>
}

function HomeOfferCard({offer}:{offer:ZenOffer}){
  return <article className="zen-home-offer-slide">
    <div className="zen-home-offer-card">
      <div className="zen-home-offer-art-panel">
        <div className="zen-home-offer-media">
          <OfferArtwork src={offer.image||'/assets/menu-panda-main.png'} alt="" ariaHidden/>
        </div>
        <OfferComicBadge compact text={offer.badge||'SPECIAL OFFER'} className="zen-home-offer-comic-stamp"/>
      </div>

      <div className="zen-home-offer-copy">
        <p>{offer.subtitle||'Zen Café special'}</p>
        <h2>{offer.title}</h2>
        <span>{offer.description}</span>
        <div className="zen-home-offer-meta"><Clock3 size={12}/><span>{formatOfferTime(offer.createdAt)}</span></div>
      </div>

      <a className="zen-home-offer-link" href="/offers.html" aria-label={`View ${offer.title}`}>
        <span>View offer</span><ArrowUpRight size={17}/>
      </a>
    </div>
  </article>
}
