// 1. Add Gamepad2 to your existing lucide-react imports.
import {
  DoorOpen,
  Gamepad2,
  Home,
  Images,
  MapPin,
  Menu,
  Sparkles,
  UserPlus,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import ThemeToggle from './ThemeToggle'
import PromotionalBanner from './PromotionalBanner'

const links = [
  ['Home', 'home'],
  ['Our Menu', 'menu'],
  ['Private Room', 'room-booking'],
  ['Gallery', 'gallery'],
  ['Contact', 'contact'],
] as const

// 2. Add Games after Contact in mobileLinks.
// Change /games.html if your Games page uses a different URL.
const mobileLinks = [
  { label: 'Home', id: 'home', icon: Home },
  { label: 'Our Menu', id: 'menu', icon: UtensilsCrossed },
  { label: 'Private Room', id: 'room-booking', icon: DoorOpen },
  { label: 'Gallery', id: 'gallery', icon: Images },
  { label: 'Contact', id: 'contact', icon: MapPin },
  { label: 'Games', href: '/games.html', icon: Gamepad2 },
  { label: 'Customer Register', href: '/register.html', icon: UserPlus },
] as const

export default function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState('home')

  const activeLabel = useMemo(() => {
    return mobileLinks.find(item => 'id' in item && item.id === active)?.label || 'Home'
  }, [active])

  useEffect(() => {
    const onScroll = () => setScrolled(Math.max(0, window.scrollY) > 22)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive:true })

    const observer = new IntersectionObserver((entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0]
      if (visibleEntry?.target.id) setActive(visibleEntry.target.id)
    }, { rootMargin:'-28% 0px -58% 0px', threshold:[0,.2,.5] })

    links.forEach(([,id]) => {
      const el=document.getElementById(id)
      if(el) observer.observe(el)
    })

    return () => {
      window.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if(!open) return
    const onKey = (event:KeyboardEvent) => {
      if(event.key === 'Escape') setOpen(false)
    }
    const onResize = () => {
      if(window.innerWidth >= 1024) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const go = (id:string) => {
    setActive(id)
    setOpen(false)
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})
    })
  }

  return (
    <header className={`zen-header-fixed fixed inset-x-0 top-0 z-[90] px-4 sm:px-7 lg:px-12 ${scrolled?'is-scrolled pt-2.5':'pt-4'}`}>
      <div className="zen-header-glass zen-header-clean zen-header-always zen-mobile-header-bar relative z-[3] mx-auto flex max-w-[1500px] items-center justify-between rounded-full border px-3 py-2">
        <button type="button" data-no-magnet onClick={()=>go('home')} className="zen-mobile-brand-button flex items-center gap-3 rounded-full pr-3 text-left">
          <img src="/assets/zen-logo.png" alt="Zen Café" className="h-12 w-12 rounded-full object-contain sm:h-14 sm:w-14"/>
          <span className="leading-none">
            <b className="zen-navbar-brand-japan block text-[21px] sm:text-[24px]">ZEN CAFE</b>
            <small className="mt-1 hidden text-[7px] font-semibold uppercase tracking-[.16em] text-[#76665c] sm:block">Jaffna · Café · Private Room</small>
          </span>
        </button>

<nav className="zen-nav-glass hidden items-center gap-1 rounded-full p-1 lg:flex">
  {links.map(([label, id]) => (
    <button
      type="button"
      key={id}
      onClick={() => go(id)}
      className={`zen-nav-pill rounded-full px-4 py-3 text-[9px] font-semibold uppercase tracking-[.1em] ${
        active === id ? 'is-active text-white' : 'text-[#56473f]'
      }`}
      aria-current={active === id ? 'page' : undefined}
    >
      {label}
    </button>
  ))}

  <a
    href="/games.html"
    className="zen-nav-pill inline-flex items-center gap-2 rounded-full px-4 py-3 text-[9px] font-semibold uppercase tracking-[.1em] text-[#56473f]"
  >
    <Gamepad2 size={15} aria-hidden="true" />
    <span>Games</span>
  </a>
</nav>

        <div className="zen-header-actions flex items-center gap-2">
          <div className="zen-mobile-current-chip lg:hidden" aria-live="polite">
            <span className="zen-mobile-current-dot"/>
            <span>{activeLabel}</span>
          </div>
          <ThemeToggle/>
          <a href="/register.html" className="zen-register-nav-link zen-customer-register-btn hidden lg:inline-flex" aria-label="Customer registration">
            <UserPlus size={15}/><span>Register</span>
          </a>
          <a href="/zen-kitchen.html" className="zen-glass-light zen-kitchen-nav-btn hidden h-11 items-center gap-2 rounded-full px-3 pr-4 text-[9px] font-semibold uppercase tracking-[.1em] text-[#5d4c43] md:inline-flex">
            <img src="/assets/zen-kitchen-nav-panda.png" alt="Zen Kitchen panda" className="zen-kitchen-nav-panda"/>
            <span>Zen Kitchen</span>
          </a>
          <button type="button" onClick={()=>go('room-booking')} className="zen-glass-red hidden items-center gap-2 rounded-full px-5 py-3 text-[9px] font-semibold uppercase tracking-[.1em] text-white sm:inline-flex">
            <DoorOpen size={15}/> Book Room
          </button>
          <button
            type="button"
            data-no-magnet
            onClick={()=>setOpen(v=>!v)}
            className={`zen-glass-icon zen-mobile-menu-trigger grid h-11 w-11 place-items-center rounded-full lg:hidden ${open?'is-open':''}`}
            aria-label={open?'Close navigation':'Open navigation'}
            aria-expanded={open}
            aria-controls="zen-mobile-navigation"
          >
            {open?<X size={20}/>:<Menu size={20}/>} 
          </button>
        </div>
      </div>

      <PromotionalBanner />

      {open && <button
        type="button"
        data-no-magnet
        className="zen-mobile-nav-backdrop lg:hidden"
        aria-label="Close navigation"
        onClick={()=>setOpen(false)}
      />}

      {open&&
        <div id="zen-mobile-navigation" className="zen-mobile-nav-sheet zen-mobile-glass zen-mobile-glass-fixed lg:hidden" aria-label="Zen Café navigation">
          <div className="zen-mobile-nav-compact-head">
            <span><Sparkles size={12}/> Menu</span>
            <b>{activeLabel}</b>
          </div>

          <nav className="zen-mobile-nav-list zen-mobile-nav-list-compact" aria-label="Mobile navigation">
            {mobileLinks.map((item) => {
              const Icon = item.icon
              const isSection = 'id' in item
              const isActive = isSection && active === item.id
              const content = <>
                <span className="zen-mobile-nav-icon"><Icon size={17}/></span>
                <span className="zen-mobile-nav-label">{item.label}</span>
                {isActive && <span className="zen-mobile-nav-active-dot" aria-hidden="true"/>}
              </>

              if(isSection){
                return <button
                  type="button"
                  data-no-magnet
                  key={item.label}
                  onClick={()=>go(item.id)}
                  className={`zen-mobile-link zen-mobile-nav-item zen-mobile-nav-item-compact ${isActive?'is-active':''}`}
                  aria-current={isActive?'page':undefined}
                >{content}</button>
              }
              return <a
                key={item.label}
                data-no-magnet
                href={item.href}
                className="zen-mobile-link zen-mobile-nav-item zen-mobile-nav-item-compact"
              >{content}</a>
            })}
          </nav>

          <div className="zen-mobile-nav-quick-actions">
            <a href="/zen-kitchen.html" data-no-magnet className="zen-mobile-quick-action zen-mobile-quick-kitchen">
              <img src="/assets/zen-kitchen-nav-panda.png" alt="" aria-hidden="true"/>
              <span>Zen Kitchen</span>
            </a>
            <button type="button" data-no-magnet onClick={()=>go('room-booking')} className="zen-mobile-quick-action zen-mobile-quick-book">
              <DoorOpen size={16}/><span>Book Room</span>
            </button>
          </div>
        </div>
      }
    </header>
  )
}
