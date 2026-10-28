import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Coffee, RefreshCw } from 'lucide-react'
import { MenuItem } from '../data/menu'
import { getVisibleMenu, isStoredMenuImageRef, loadMenuCatalog, subscribeMenuCatalog } from '../data/menuStore'
import FoodVisual from './FoodVisual'
import { useThemeMode } from './ThemeToggle'

type Role='center'|'left'|'right'|'farLeft'|'farRight'

const transition='transform 760ms cubic-bezier(.22,1,.36,1),filter 760ms cubic-bezier(.22,1,.36,1),opacity 760ms cubic-bezier(.22,1,.36,1),left 760ms cubic-bezier(.22,1,.36,1),width 760ms cubic-bezier(.22,1,.36,1),height 760ms cubic-bezier(.22,1,.36,1),top 760ms cubic-bezier(.22,1,.36,1)'

const signatureDrinkImage=(item:MenuItem)=>item.image


const toRgb=(hex:string)=>{
  const clean=(hex||'#a32722').replace('#','')
  const value=parseInt(clean.length===3?clean.split('').map(x=>x+x).join(''):clean,16)
  return {r:(value>>16)&255,g:(value>>8)&255,b:value&255}
}
const mix=(hex:string,target:{r:number;g:number;b:number},amount:number)=>{
  const c=toRgb(hex)
  const r=Math.round(c.r+(target.r-c.r)*amount)
  const g=Math.round(c.g+(target.g-c.g)*amount)
  const b=Math.round(c.b+(target.b-c.b)*amount)
  return `rgb(${r} ${g} ${b})`
}
const alpha=(hex:string,a:number)=>{const c=toRgb(hex);return `rgba(${c.r},${c.g},${c.b},${a})`}

export default function MenuCarousel(){
  const sectionRef=useRef<HTMLElement>(null)
  const touch=useRef<number|null>(null)
  const manualUntil=useRef(0)
  const [active,setActive]=useState(0)
  const [mobile,setMobile]=useState(()=>window.innerWidth<640)
  const [items,setItems]=useState<MenuItem[]>(()=>getVisibleMenu('drink'))
  const mode=useThemeMode()
  const count=items.length

  useEffect(()=>{
    loadMenuCatalog().then(()=>setItems(getVisibleMenu('drink'))).catch(()=>{})
    return subscribeMenuCatalog(()=>setItems(getVisibleMenu('drink')))
  },[])

  useEffect(()=>{
    if(active>=count) setActive(Math.max(0,count-1))
  },[active,count])

  useEffect(()=>{
    const resize=()=>setMobile(window.innerWidth<640)
    const updateFromScroll=()=>{
      if(Date.now()<manualUntil.current || count<2) return
      const section=sectionRef.current
      if(!section) return
      const viewport=window.innerHeight
      const start=section.offsetTop-viewport*.42
      const end=section.offsetTop+section.offsetHeight-viewport*.58
      if(window.scrollY<start || window.scrollY>end) return
      const progress=Math.min(1,Math.max(0,(window.scrollY-start)/Math.max(1,end-start)))
      const next=Math.min(count-1,Math.max(0,Math.round(progress*(count-1))))
      setActive(prev=>prev===next?prev:next)
    }
    items.forEach(item=>{const source=signatureDrinkImage(item);if(!isStoredMenuImageRef(source)){const image=new Image();image.src=source}})
    resize();updateFromScroll()
    window.addEventListener('resize',resize)
    window.addEventListener('scroll',updateFromScroll,{passive:true})
    return ()=>{window.removeEventListener('resize',resize);window.removeEventListener('scroll',updateFromScroll)}
  },[count,items])

  const role=(i:number):Role=>{
    if(count<=1) return 'center'
    const diff=(i-active+count)%count
    if(diff===0) return 'center'
    if(diff===1) return 'right'
    if(diff===count-1) return 'left'
    if(diff===2) return 'farRight'
    return 'farLeft'
  }

  const select=(index:number)=>{
    if(!count)return
    manualUntil.current=Date.now()+1100
    setActive((index+count)%count)
  }
  const nav=(dir:1|-1)=>{if(count>1)select(active+dir)}

  const style=(r:Role):CSSProperties=>{
    const c:CSSProperties={position:'absolute',transition,willChange:'transform,filter,opacity,left,top,width,height',transformOrigin:'center center'}
    if(r==='center') return {...c,left:'50%',top:mobile?'8%':'8%',width:mobile?'54%':'28%',height:mobile?'42%':'58%',transform:'translateX(-50%) perspective(1200px) scale(1)',filter:'blur(0) saturate(1)',opacity:1,zIndex:20}
    if(r==='left') return {...c,left:mobile?'14%':'26%',top:mobile?'22%':'21%',width:mobile?'17%':'15%',height:mobile?'23%':'35%',transform:'translateX(-50%) perspective(950px) rotateY(10deg) scale(.96)',filter:'blur(.7px) saturate(.92)',opacity:.72,zIndex:11}
    if(r==='right') return {...c,left:mobile?'86%':'74%',top:mobile?'22%':'21%',width:mobile?'17%':'15%',height:mobile?'23%':'35%',transform:'translateX(-50%) perspective(950px) rotateY(-10deg) scale(.96)',filter:'blur(.7px) saturate(.92)',opacity:.72,zIndex:11}
    if(r==='farLeft') return {...c,left:mobile?'2%':'11%',top:mobile?'29%':'29%',width:mobile?'9%':'9%',height:mobile?'15%':'23%',transform:'translateX(-50%) scale(.84)',filter:'blur(2.2px) saturate(.78)',opacity:.24,zIndex:5}
    return {...c,left:mobile?'98%':'89%',top:mobile?'29%':'29%',width:mobile?'9%':'9%',height:mobile?'15%':'23%',transform:'translateX(-50%) scale(.84)',filter:'blur(2.2px) saturate(.78)',opacity:.24,zIndex:5}
  }

  const current=items[active]
  const theme=useMemo(()=>{
    const accent=current?.accent||'#a32722'
    return mode==='dark'
      ? {base:mix(accent,{r:5,g:7,b:9},.88),soft:mix(accent,{r:13,g:14,b:17},.78),glow:accent,ring:mix(accent,{r:246,g:226,b:187},.35)}
      : {base:mix(accent,{r:248,g:239,b:229},.78),soft:mix(accent,{r:255,g:250,b:245},.88),glow:accent,ring:mix(accent,{r:82,g:25,b:22},.18)}
  },[current,mode])

  return <section ref={sectionRef} id="menu" data-zen-reveal className="zen-menu-section zen-reveal relative overflow-hidden" style={{backgroundColor:theme.base,transition:'background-color 1050ms cubic-bezier(.22,1,.36,1)'}}>
    <div className="paper-noise absolute inset-0 opacity-25"/>
    <div className="pointer-events-none absolute inset-0 transition-opacity duration-700" style={{background:`radial-gradient(circle at 50% 38%, ${theme.soft} 0%, transparent 37%), radial-gradient(circle at 7% 17%, ${alpha(theme.glow,.28)} 0%, transparent 27%), radial-gradient(circle at 92% 85%, ${alpha(theme.glow,.34)} 0%, transparent 30%)`}}/>
    <div className="pointer-events-none absolute left-1/2 top-[44%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border transition-all duration-700 sm:h-[680px] sm:w-[680px]" style={{borderColor:alpha(theme.ring,.16),boxShadow:`0 0 0 42px ${alpha(theme.ring,.07)},0 0 0 92px ${alpha(theme.ring,.04)}`}}/>

    <div className="zen-menu-inner relative z-10 mx-auto max-w-[1500px] px-5 py-20 sm:px-10 lg:px-12 lg:py-24">
      <div className="mb-7 grid gap-5 lg:grid-cols-[1fr_.72fr] lg:items-end">
        <div><p className="kicker">Cool Drinks</p><h2 className="section-title !text-[clamp(36px,4vw,62px)]">Zen signature drinks.<br/><span>Updated from the admin dashboard.</span></h2></div>
        <div className="lg:justify-self-end"><p className="section-copy">Every available cool drink added by the admin appears here automatically. Scroll, swipe or use the arrows to explore the live drinks collection.</p><div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/60 px-4 py-2 text-[9px] font-bold uppercase tracking-[.12em] text-[#5d4940] backdrop-blur"><RefreshCw size={13}/> Live menu · Scroll · Swipe</div></div>
      </div>

      {!count ? <div className="grid min-h-[520px] place-items-center rounded-[42px] border border-white/35 bg-white/20 text-center shadow-zen backdrop-blur-sm"><div className="max-w-[420px] px-6"><Coffee className="mx-auto text-[#a32722]" size={34}/><h3 className="mt-4 font-serif text-[34px]">No drinks available yet.</h3><p className="mt-3 text-[12px] leading-6 text-[#6b5b53]">Add a Cool Drink from the admin dashboard and mark it available. It will appear here automatically.</p></div></div> : <div onTouchStart={e=>touch.current=e.changedTouches[0].clientX} onTouchEnd={e=>{if(touch.current===null)return;const dx=e.changedTouches[0].clientX-touch.current;touch.current=null;if(Math.abs(dx)>45)nav(dx<0?1:-1)}} className="zen-menu-stage relative min-h-[720px] overflow-hidden rounded-[42px] border border-white/35 bg-white/10 shadow-[0_30px_90px_rgba(62,34,23,.12)] backdrop-blur-[1px] sm:min-h-[800px]">
        <div className="zen-menu-ghost pointer-events-none absolute inset-x-0 top-[2%] z-[1] flex justify-center"><div className="font-display text-[clamp(70px,15vw,230px)] uppercase leading-none tracking-[-.03em] text-white/20">ZEN DRINKS</div></div>
        <div className="zen-menu-hint absolute left-5 top-5 z-30 rounded-full border border-white/50 bg-white/65 px-4 py-2 text-[9px] font-bold uppercase tracking-[.14em] text-[#6f241f] backdrop-blur-xl sm:left-8 sm:top-8">Scroll · Swipe · Buttons</div>
        <div className="absolute right-5 top-5 z-30 hidden items-center gap-2 rounded-full border border-white/40 bg-white/45 px-4 py-2 text-[8px] font-extrabold uppercase tracking-[.14em] text-[#4e392f] backdrop-blur sm:flex"><span className="h-2.5 w-2.5 rounded-full" style={{background:theme.glow}}/> {current.category}</div>

        <div className="absolute inset-0 z-[3]">{items.map((item,i)=>{const visualItem={...item,image:signatureDrinkImage(item)};return <button key={item.id} type="button" onClick={()=>select(i)} style={style(role(i))} className="border-0 bg-transparent p-0" aria-label={`Select ${item.name}`}><FoodVisual item={visualItem} className="h-full w-full" imageClassName="h-full w-full object-contain object-center drop-shadow-[0_24px_25px_rgba(47,22,14,.22)]"/></button>})}</div>

        <div className="zen-menu-info absolute bottom-20 left-1/2 z-30 w-[calc(100%-34px)] max-w-[760px] -translate-x-1/2 rounded-[30px] border border-white/55 bg-[#fffaf5]/90 p-5 shadow-[0_22px_65px_rgba(64,31,20,.14)] backdrop-blur-xl sm:bottom-8 sm:p-6">
          <div className="max-w-[650px]"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[.14em] text-white" style={{background:theme.ring}}>{current.category}</span><span className="zen-menu-badge zen-menu-badge-milk">{current.dairyType==='milk-powder'?'Milk Powder':current.dairyType==='milk'?'Fresh Milk':'No Milk'}</span>{current.serving&&<span className="text-[9px] font-bold uppercase tracking-[.13em] text-[#8b7469]">{current.serving}</span>}</div><h3 className="mt-3 font-serif text-[28px] leading-none sm:text-[38px]">{current.name}</h3><p className="mt-3 text-[11px] leading-6 text-[#695a52] sm:text-[12px]">{current.description}</p>{current.ingredients&&<p className="mt-2 text-[10px] leading-5 text-[#8a786e]"><b>Ingredients:</b> {current.ingredients}</p>}</div>
        </div>

        <div className="zen-menu-controls absolute bottom-5 left-5 z-40 flex items-center gap-3 sm:left-8"><button onClick={()=>nav(-1)} className="round-control" disabled={count<2}><ArrowLeft size={21}/></button><button onClick={()=>nav(1)} className="round-control" disabled={count<2}><ArrowRight size={21}/></button><span className="ml-1 text-[10px] font-bold tracking-[.18em] text-[#5b4941]">{String(active+1).padStart(2,'0')} / {String(count).padStart(2,'0')}</span></div>
        <div className="absolute bottom-6 right-6 z-40 hidden max-w-[48%] flex-wrap justify-end gap-2 sm:flex">{items.map((item,index)=><button key={item.id} onClick={()=>select(index)} className={`h-2.5 rounded-full transition-all ${index===active?'w-8':'w-2.5'}`} style={{background:index===active?theme.ring:'rgba(255,255,255,.72)'}} aria-label={`Go to ${item.name}`}/>)}</div>
      </div>}
    </div>
    <div className="menu-to-room-fade" aria-hidden="true"/>
  </section>
}
