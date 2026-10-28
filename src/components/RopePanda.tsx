import { useEffect, useRef, useState } from 'react'

const INITIAL_APPEAR_DELAY_MS = 1000
const IDLE_REPLAY_DELAY_MS = 5000
const SCROLL_REPLAY_DELAY_MS = 5000
const SCROLL_SETTLE_DELAY_MS = 140
const START_TIME_SECONDS = 0.72
const PLAYBACK_RATE = 2.05

export default function RopePanda(){
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [active,setActive] = useState(false)

  useEffect(()=>{
    const video = videoRef.current
    if(!video) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if(reduced) return

    let initialTimer = 0
    let replayTimer = 0
    let scrollSettleTimer = 0
    let destroyed = false
    let isScrolling = false

    const clearTimers = () => {
      window.clearTimeout(initialTimer)
      window.clearTimeout(replayTimer)
      window.clearTimeout(scrollSettleTimer)
    }

    const stopSequence = () => {
      try{
        video.pause()
        video.currentTime = START_TIME_SECONDS
      }catch{}
      setActive(false)
    }

    const playSequence = () => {
      if(destroyed || isScrolling || document.visibilityState !== 'visible') return

      try{
        video.pause()
        video.currentTime = START_TIME_SECONDS
        video.playbackRate = PLAYBACK_RATE
        video.muted = true
        setActive(true)
        const promise = video.play()
        promise?.catch(()=>setActive(false))
      }catch{
        setActive(false)
      }
    }

    const queueReplay = (delay:number) => {
      window.clearTimeout(replayTimer)
      if(destroyed || isScrolling || document.visibilityState !== 'visible') return
      replayTimer = window.setTimeout(playSequence, delay)
    }

    const onEnded = () => {
      setActive(false)
      try{ video.currentTime = START_TIME_SECONDS }catch{}
      queueReplay(IDLE_REPLAY_DELAY_MS)
    }

    const onScrollActivity = () => {
      isScrolling = true
      window.clearTimeout(replayTimer)
      window.clearTimeout(scrollSettleTimer)
      stopSequence()

      scrollSettleTimer = window.setTimeout(()=>{
        isScrolling = false
        queueReplay(SCROLL_REPLAY_DELAY_MS)
      }, SCROLL_SETTLE_DELAY_MS)
    }

    const onVisibility = () => {
      if(document.visibilityState !== 'visible'){
        window.clearTimeout(replayTimer)
        stopSequence()
        return
      }

      if(!isScrolling) queueReplay(IDLE_REPLAY_DELAY_MS)
    }

    video.addEventListener('ended',onEnded)
    document.addEventListener('visibilitychange',onVisibility)
    window.addEventListener('scroll',onScrollActivity,{ passive:true })
    window.addEventListener('wheel',onScrollActivity,{ passive:true })
    window.addEventListener('touchmove',onScrollActivity,{ passive:true })

    initialTimer = window.setTimeout(playSequence, INITIAL_APPEAR_DELAY_MS)

    return()=>{
      destroyed = true
      clearTimers()
      video.removeEventListener('ended',onEnded)
      document.removeEventListener('visibilitychange',onVisibility)
      window.removeEventListener('scroll',onScrollActivity)
      window.removeEventListener('wheel',onScrollActivity)
      window.removeEventListener('touchmove',onScrollActivity)
      stopSequence()
    }
  },[])

  return(
    <div className={`rope-panda-anchor ${active?'is-active':''}`} aria-hidden="true">
      <video
        ref={videoRef}
        className="rope-panda-video"
        preload="auto"
        muted
        playsInline
        disablePictureInPicture
        controls={false}
        tabIndex={-1}
      >
        <source src="/assets/Rope_Panda_Transparent.webm" type="video/webm" />
      </video>
    </div>
  )
}
