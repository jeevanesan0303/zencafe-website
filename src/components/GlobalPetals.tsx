import { CSSProperties, useEffect, useMemo, useState } from 'react'

/**
 * V44: Hero-only rose atmosphere.
 * - Desktop: 120 petals at full peak opacity.
 * - Tablet/mobile: fewer rendered petals for smooth performance.
 * - Petals are clipped to the hero and softly fade out at its bottom.
 */
export default function GlobalPetals(){
  const [tier,setTier]=useState<'mobile'|'tablet'|'desktop'>(()=>
    typeof window==='undefined'?'desktop':window.innerWidth<=640?'mobile':window.innerWidth<=1024?'tablet':'desktop'
  )
  const [heroHeight,setHeroHeight]=useState(()=>typeof window==='undefined'?900:Math.max(window.innerHeight,720))

  useEffect(()=>{
    const syncTier=()=>setTier(window.innerWidth<=640?'mobile':window.innerWidth<=1024?'tablet':'desktop')
    const syncHero=()=>{
      const hero=document.querySelector<HTMLElement>('#home, .kitchen-hero')
      if(!hero) return setHeroHeight(Math.max(window.innerHeight,720))
      const rect=hero.getBoundingClientRect()
      const top=rect.top+window.scrollY
      setHeroHeight(Math.max(1,Math.ceil(top+rect.height)))
    }
    syncTier();syncHero()
    window.addEventListener('resize',syncTier,{passive:true})
    window.addEventListener('resize',syncHero,{passive:true})
    const hero=document.querySelector<HTMLElement>('#home, .kitchen-hero')
    const observer=hero && 'ResizeObserver' in window ? new ResizeObserver(syncHero) : null
    if(hero&&observer) observer.observe(hero)
    const timer=window.setTimeout(syncHero,180)
    return()=>{
      window.removeEventListener('resize',syncTier)
      window.removeEventListener('resize',syncHero)
      observer?.disconnect()
      window.clearTimeout(timer)
    }
  },[])

  const count=tier==='desktop'?120:tier==='tablet'?76:42
  const petals=useMemo(()=>Array.from({length:count}),[count])
  const baseScale=tier==='mobile'?.46:tier==='tablet'?.55:.62
  const scaleStep=tier==='mobile'?.052:.065
  const durationBase=tier==='mobile'?13.5:tier==='tablet'?12.4:10.8

  return <div
    className={`global-petals fixed-rose-petals hero-only-petals hero-only-petals-${tier}`}
    aria-hidden="true"
    style={{
      height:`${heroHeight}px`,
      '--hero-petal-height':`${heroHeight}px`,
    } as CSSProperties}
  >
    {petals.map((_,index)=><span
      key={`${tier}-${index}`}
      className={`global-petal fixed-rose-petal global-petal-${(index%4)+1}`}
      style={{
        left:`${0.6+((index*37)%98.8)}%`,
        animationDelay:`-${((index*.47)%20).toFixed(2)}s`,
        animationDuration:`${durationBase+(index%11)*.74}s`,
        '--petal-drift':`${-90+((index*31)%180)}px`,
        '--petal-scale':`${baseScale+(index%7)*scaleStep}`,
        '--petal-opacity':'1',
      } as CSSProperties}
    />)}
  </div>
}
