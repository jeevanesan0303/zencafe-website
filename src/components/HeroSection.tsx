import { ArrowRight, ChefHat, DoorOpen } from 'lucide-react'
import {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

const MOBILE_DOUBLE_TAP_MS = 430
export default function HeroSection(){
  const mediaRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastTouchTapRef = useRef(0)
  const playingRef = useRef(false)
  const startLockRef = useRef(false)
  const resetTimerRef = useRef<number|null>(null)

  const [playing,setPlaying] = useState(false)
  const [posterVisible,setPosterVisible] = useState(true)

  const setPlayingSafe=(value:boolean)=>{
    playingRef.current=value
    setPlaying(value)
  }

  const resetVideo=useCallback(()=>{
    const video=videoRef.current
    if(!video)return
    try{video.pause()}catch{}
    try{video.currentTime=0}catch{}
    setPlayingSafe(false)
    startLockRef.current=false
    lastTouchTapRef.current=0
    setPosterVisible(true)
  },[])

  useEffect(()=>{
    const video=videoRef.current
    if(!video)return

    // Treat the MP4 only as a hidden cinematic hero layer.
    // No media controls, labels, playback status or sound UI are exposed.
    video.defaultMuted=true
    video.muted=true
    video.playsInline=true
    video.preload='auto'
    video.controls=false
    video.disablePictureInPicture=true

    const playingNow=()=>{
      setPosterVisible(false)
      setPlayingSafe(true)
      startLockRef.current=false
    }

    const ended=()=>{
      setPlayingSafe(false)
      startLockRef.current=true
      // Cross-fade back to the exact closed-door still so the sequence
      // feels like a living background, not a media player finishing.
      setPosterVisible(true)
      if(resetTimerRef.current)window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current=window.setTimeout(()=>{
        try{video.pause()}catch{}
        try{video.currentTime=0}catch{}
        startLockRef.current=false
        lastTouchTapRef.current=0
      },220)
    }

    const failed=()=>resetVideo()

    video.addEventListener('playing',playingNow)
    video.addEventListener('ended',ended)
    video.addEventListener('error',failed)

    // Preload immediately; poster remains visually on top until playback begins.
    try{video.load()}catch{}

    return()=>{
      video.removeEventListener('playing',playingNow)
      video.removeEventListener('ended',ended)
      video.removeEventListener('error',failed)
      if(resetTimerRef.current)window.clearTimeout(resetTimerRef.current)
    }
  },[resetVideo])

  const go=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})

  const startVideo=useCallback(async()=>{
    const video=videoRef.current
    if(!video || playingRef.current || startLockRef.current)return

    // Lock BEFORE video.play(). This prevents the browser's native dblclick event
    // and a second React event from starting the same sequence twice.
    startLockRef.current=true
    lastTouchTapRef.current=0

    try{
      if(resetTimerRef.current)window.clearTimeout(resetTimerRef.current)
      video.controls=false
      video.muted=true
      video.playsInline=true
      try{video.pause()}catch{}
      try{video.currentTime=0}catch{}
      const promise=video.play()
      if(promise)await promise
      // `playing` event will swap poster → moving background.
    }catch(error){
      console.error('Zen hero interaction playback failed:',error)
      startLockRef.current=false
      resetVideo()
    }
  },[resetVideo])

  const insideDoor=(clientX:number,clientY:number)=>{
    const media=mediaRef.current
    if(!media)return false
    const rect=media.getBoundingClientRect()
    if(rect.width<=0||rect.height<=0)return false
    const x=(clientX-rect.left)/rect.width
    const y=(clientY-rect.top)/rect.height

    // Invisible interaction region around the round wooden door.
    // Kept generous enough for desktop + phone crops without exposing UI.
    return x>=.58 && x<=.985 && y>=.075 && y<=.985
  }

  // Desktop: ONLY the browser's true dblclick event starts playback.
  // This means exactly two mouse clicks — no duplicate pointer-up counting.
  const handleDoubleClickCapture=(event:ReactMouseEvent<HTMLElement>)=>{
    if(playingRef.current || startLockRef.current)return
    if(!insideDoor(event.clientX,event.clientY))return
    event.preventDefault()
    event.stopPropagation()
    void startVideo()
  }

  // Touch screens do not reliably emit dblclick. Count only touch/pen taps here;
  // mouse events are deliberately ignored so desktop never becomes “4 clicks”.
  const handlePointerUpCapture=(event:ReactPointerEvent<HTMLElement>)=>{
    if(event.pointerType==='mouse' || !event.isPrimary || playingRef.current || startLockRef.current)return
    if(!insideDoor(event.clientX,event.clientY)){
      lastTouchTapRef.current=0
      return
    }

    const now=performance.now()
    const previous=lastTouchTapRef.current

    if(previous>0 && now-previous<=MOBILE_DOUBLE_TAP_MS){
      lastTouchTapRef.current=0
      event.preventDefault()
      void startVideo()
      return
    }

    lastTouchTapRef.current=now
    window.setTimeout(()=>{
      if(lastTouchTapRef.current===now)lastTouchTapRef.current=0
    },MOBILE_DOUBLE_TAP_MS+40)
  }

  const blockMediaMenu=(event:ReactMouseEvent<HTMLElement>)=>event.preventDefault()

  return <section
    id="home"
    className={`video-hero v52-video-hero v53-stealth-video-hero v54-true-double-hero v55-smooth-hero v61-responsive-hero ${playing?'video-hero-is-playing':''}`}
    onDoubleClickCapture={handleDoubleClickCapture}
    onPointerUpCapture={handlePointerUpCapture}
    onContextMenu={blockMediaMenu}
  >
    <div ref={mediaRef} className="video-hero-media" aria-hidden="true">
      <video
        ref={videoRef}
        className="video-hero-video"
        poster="/assets/zen-door-panda-poster.jpg"
        preload="auto"
        playsInline
        muted
        controls={false}
        controlsList="nodownload noplaybackrate nofullscreen"
        disablePictureInPicture
        aria-hidden="true"
        tabIndex={-1}
      >
        <source src="/assets/zen-door-panda-hero.mp4" type="video/mp4"/>
      </video>

      <img
        src="/assets/zen-door-panda-poster.jpg"
        alt=""
        aria-hidden="true"
        className={`video-hero-poster ${posterVisible?'is-visible':''}`}
        draggable={false}
      />

      <div className="video-hero-soft-wash" aria-hidden="true"/>
      <div className="video-hero-playback-shade" aria-hidden="true"/>
    // HeroSection.tsx — replace the existing zen-door-knock-hint block.
      
    </div>

    {/* Hero copy intentionally never changes when the hidden panda sequence plays. */}
    <div className="video-hero-content">
      <div className="video-hero-copy-block">
        <div className="video-hero-brand"><img src="/assets/zen-logo.png" alt="Zen Café logo"/><div><b>ZEN CAFÉ · JAFFNA</b><span>Café · private room</span></div></div>
        <p className="video-hero-kicker">A quiet surprise.</p>
        <div className="hero-meet-video-shell" role="img" aria-label="Meet Zen tiger pull introduction">
          <video
            className="hero-meet-video hero-meet-video--tiger"
            poster="/assets/hero-meet-zen-tiger-pull-poster.png"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            controls={false}
            disablePictureInPicture
            aria-hidden="true"
            tabIndex={-1}
          >
            <source src="/assets/hero-meet-zen-tiger-pull.webm" type="video/webm" />
            <source src="/assets/hero-meet-zen-tiger-pull.mp4" type="video/mp4" />
          </video>
        </div>
        <p className="video-hero-description">Calm food, cozy space, premium Zen moments.</p>
      </div>
      <div className="video-hero-actions">
        <button onClick={()=>go('room-booking')} className="hero-primary-btn"><DoorOpen size={16}/> Book private room</button>
        <button onClick={()=>go('menu')} className="hero-secondary-btn">Explore menu <ArrowRight size={17}/></button>
        <a href="/zen-kitchen.html" className="hero-kitchen-btn"><ChefHat size={16}/> Zen Kitchen <ArrowRight size={16}/></a>
      </div>
    </div>

    <div className="hero-bottom-fade" aria-hidden="true"/>
  </section>
}
