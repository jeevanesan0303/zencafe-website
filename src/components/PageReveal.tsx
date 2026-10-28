import { useEffect } from 'react'

export default function PageReveal(){
  useEffect(()=>{
    const targets=Array.from(document.querySelectorAll<HTMLElement>('[data-zen-reveal]'))
    if(!('IntersectionObserver' in window)){
      targets.forEach(el=>el.classList.add('zen-reveal-visible'))
      return
    }
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          ;(entry.target as HTMLElement).classList.add('zen-reveal-visible')
          observer.unobserve(entry.target)
        }
      })
    },{threshold:.08,rootMargin:'0px 0px -7% 0px'})
    targets.forEach(el=>observer.observe(el))
    return()=>observer.disconnect()
  },[])
  return null
}
