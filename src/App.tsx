import { useEffect, useState } from 'react'
import { ClipboardCheck, Clock3, Images, Users, UtensilsCrossed } from 'lucide-react'
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

type OverviewCard = {
  title:string
  meta:string
  icon:LucideIcon
}

const overviewCards:OverviewCard[] = [
  {title:'Signature menu',meta:'Browse favourites',icon:UtensilsCrossed},
  {title:'Private room',meta:'10–15 guests · max 3h',icon:Users},
  {title:'Quick booking',meta:'One simple request',icon:ClipboardCheck},
  {title:'Guest gallery',meta:'Upload · browse',icon:Images},
]

export default function App(){
 const [toast,setToast]=useState('')
 const toastNow=(msg:string)=>{setToast(msg);window.setTimeout(()=>setToast(''),2500)}

 useEffect(()=>{
   if('scrollRestoration' in history) history.scrollRestoration='manual'
   const top=()=>window.scrollTo({top:0,left:0,behavior:'auto'})
   const navEntry=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
   const isReload=navEntry?.type==='reload'
   const requestedHash=window.location.hash

   let raf=0
   let timer=0
   if(isReload || !requestedHash){
     top()
     raf=requestAnimationFrame(top)
     timer=window.setTimeout(top,80)
   }else{
     timer=window.setTimeout(()=>{
       document.querySelector(requestedHash)?.scrollIntoView({behavior:'auto',block:'start'})
     },100)
   }

   const onPageShow=(event:PageTransitionEvent)=>{
     if(event.persisted && !window.location.hash) top()
   }
   const onBeforeUnload=()=>{ if(!window.location.hash || isReload) top() }
   window.addEventListener('pageshow',onPageShow)
   window.addEventListener('beforeunload',onBeforeUnload)
   return()=>{
     if(raf) cancelAnimationFrame(raf)
     clearTimeout(timer)
     window.removeEventListener('pageshow',onPageShow)
     window.removeEventListener('beforeunload',onBeforeUnload)
   }
 },[])

 return <div className="zen-dark-scope zen-app-shell min-h-screen bg-[#f8f0e8] text-[#201713]">
  <MagneticButtons/>
  <GlobalPetals/>
  <PageReveal/>
  <ScrollToTop/>
  <FloatingSocialRail/>
  <Header/>
  <RopePanda/>
  <main>
   <HeroSection/>
   <HomeOffersSlider/>
   <section data-zen-reveal className="zen-overview-band zen-reveal relative z-10 -mt-[1px] overflow-hidden border-y border-[#5b3c2c]/10 bg-[#efe2d4]">
    <div className="zen-overview-inner mx-auto max-w-[1500px] px-5 sm:px-10 lg:px-12">
      <div className="zen-overview-head">
        <div className="zen-overview-heading-copy">
          <p className="kicker">Zen essentials</p>
          <h2 className="section-title">Everything you need.<br/><span>Nothing extra.</span></h2>
        </div>
        <p className="section-copy">Menu, room, booking and gallery — at a glance.</p>
      </div>

      <div className="zen-overview-grid">
        {overviewCards.map((item)=>{
          const Icon = item.icon
          return(
            <article key={item.title} className="zen-overview-card">
              <span className="zen-overview-icon"><Icon size={18}/></span>
              <div className="zen-overview-card-copy">
                <h3>{item.title}</h3>
                <span className="zen-overview-meta">{item.meta}</span>
              </div>
            </article>
          )
        })}
      </div>
    </div>
   </section>
   <MenuCarousel/>
   <section id="room-booking" data-zen-reveal className="zen-room-section section-shell zen-reveal relative overflow-hidden bg-[#eee1d4]"><div className="room-section-inner mx-auto max-w-[1500px] px-5 py-24 sm:px-10 lg:px-12">
        <div className="room-section-head room-section-head-v121">
          <div><h2 className="section-title room-booking-title">Party room booking.<br/><span>Fill once. Submit clearly.</span></h2></div>
          <p className="section-copy">Choose your details below.</p>
        </div>

        <div className="room-essentials-v121" aria-label="Private room essentials">
          <div className="room-essential-v121"><Users size={19}/><span><small>Room limit</small><b>10–15 guests</b></span></div>
          <div className="room-essential-v121"><Clock3 size={19}/><span><small>Maximum stay</small><b>3 hours</b></span></div>
          <div className="room-essential-v121"><ClipboardCheck size={19}/><span><small>Confirmation</small><b>Email</b></span></div>
        </div>

        <RoomBooking toast={toastNow}/>
      </div><div className="room-to-gallery-fade" aria-hidden="true"/></section>
   <CommunityGallery toast={toastNow}/>
  </main>
  <PremiumFooter/>
  <div className={`fixed bottom-5 left-1/2 z-[200] -translate-x-1/2 rounded-full bg-[#24140e]/94 px-5 py-3 text-[11px] font-semibold text-white shadow-2xl transition-all ${toast?'translate-y-0 opacity-100':'pointer-events-none translate-y-4 opacity-0'}`}>{toast}</div>
 </div>
}
