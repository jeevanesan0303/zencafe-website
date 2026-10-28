import { useEffect, useRef, useState } from 'react'

type Stage='idle'|'opening'|'peek'|'wave'|'return'|'closing'

export default function HeroDoorExperience(){
  const [stage,setStage]=useState<Stage>('idle')
  const [hint,setHint]=useState(true)
  const timers=useRef<number[]>([])
  const lastTap=useRef(0)

  useEffect(()=>{
    const t=window.setTimeout(()=>setHint(false),4200)
    return()=>{window.clearTimeout(t);timers.current.forEach(window.clearTimeout)}
  },[])

  const later=(fn:()=>void,ms:number)=>{const id=window.setTimeout(fn,ms);timers.current.push(id)}
  const start=()=>{
    if(stage!=='idle') return
    setHint(false); setStage('opening')
    later(()=>setStage('peek'),760)
    later(()=>setStage('wave'),1450)
    later(()=>setStage('return'),2750)
    later(()=>setStage('closing'),3450)
    later(()=>setStage('idle'),4300)
  }

  const pointerUp=(e:React.PointerEvent<HTMLButtonElement>)=>{
    if(e.pointerType==='touch'){
      const now=Date.now()
      if(now-lastTap.current<360) start()
      else setHint(true)
      lastTap.current=now
    }
  }

  return <div className={`zen-door-experience zen-door-${stage}`}>
    <div className="zen-door-stucco" aria-hidden="true"><i className="zen-door-lantern"/><span className="zen-door-plaque"><img src="/assets/zen-logo.png" alt=""/></span></div>
    <button type="button" className="zen-door-widget" onDoubleClick={start} onPointerUp={pointerUp} aria-label="Open the Zen Café door">
      <span className="zen-door-interior" aria-hidden="true"><i className="zen-door-glow"/></span>
      <span className="zen-door-panda-wrap" aria-hidden="true"><img src="/assets/panda-warrior-empty-tray.png" alt="" className="zen-door-panda"/></span>
      <span className="zen-door-frame" aria-hidden="true"/>
      <span className="zen-door-leaf zen-door-leaf-left" aria-hidden="true"><img src="/assets/hero-door-left.png" alt=""/></span>
      <span className="zen-door-leaf zen-door-leaf-right" aria-hidden="true"><img src="/assets/hero-door-right.png" alt=""/></span>
      <span className="zen-door-floor-shadow" aria-hidden="true"/>
    </button>
    <div className={`zen-door-bubble ${stage==='wave'?'is-visible':''}`}>Welcome 👋</div>
    <div className={`zen-door-hint ${hint&&stage==='idle'?'is-visible':''}`}><span className="desktop-hint">Double click</span><span className="mobile-hint">Double tap</span> the door</div>
  </div>
}
