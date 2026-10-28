import { useEffect } from 'react'

const MAGNET_SELECTOR = 'button, a.hero-primary-btn, a.hero-secondary-btn, a.primary-pill, a.secondary-pill'
const MAGNET_EXCLUDE = '.kitchen-food-card, [data-no-magnet], input, textarea, select'

export default function MagneticButtons(){
  useEffect(()=>{
    const finePointer = window.matchMedia('(pointer: fine)')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if(!finePointer.matches || reducedMotion.matches) return

    let active: HTMLElement | null = null

    const reset = (el: HTMLElement | null) => {
      if(!el) return
      el.style.setProperty('--zen-mag-x','0px')
      el.style.setProperty('--zen-mag-y','0px')
      el.classList.remove('zen-magnetic-active','zen-magnetic-pressed')
    }

    const eligible = (target: HTMLElement | null) => {
      const el = target?.closest(MAGNET_SELECTOR) as HTMLElement | null
      if(!el || el.matches(MAGNET_EXCLUDE) || el.closest(MAGNET_EXCLUDE)) return null
      const rect = el.getBoundingClientRect()
      if(rect.width > 430 || rect.height > 130 || rect.width < 24 || rect.height < 24) return null
      return el
    }

    const onMove = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      const magnet = eligible(target)
      if(active && active !== magnet) reset(active)
      active = magnet
      if(!magnet) return

      const rect = magnet.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const relX = event.clientX - cx
      const relY = event.clientY - cy
      const pullX = Math.max(-8, Math.min(8, relX * .10))
      const pullY = Math.max(-6, Math.min(6, relY * .12))

      magnet.style.setProperty('--zen-mag-x',`${pullX.toFixed(2)}px`)
      magnet.style.setProperty('--zen-mag-y',`${pullY.toFixed(2)}px`)
      magnet.classList.add('zen-magnetic-button','zen-magnetic-active')
    }

    const onDown = () => active?.classList.add('zen-magnetic-pressed')
    const onUp = () => active?.classList.remove('zen-magnetic-pressed')
    const onLeave = () => { reset(active); active = null }

    window.addEventListener('pointermove',onMove,{passive:true})
    window.addEventListener('pointerdown',onDown,{passive:true})
    window.addEventListener('pointerup',onUp,{passive:true})
    document.addEventListener('mouseleave',onLeave)

    return()=>{
      reset(active)
      window.removeEventListener('pointermove',onMove)
      window.removeEventListener('pointerdown',onDown)
      window.removeEventListener('pointerup',onUp)
      document.removeEventListener('mouseleave',onLeave)
    }
  },[])

  return null
}
