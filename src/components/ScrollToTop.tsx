import { ArrowUp } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function ScrollToTop(){
  const [visible,setVisible]=useState(false)

  useEffect(()=>{
    const update=()=>setVisible(window.scrollY>620)
    update()
    window.addEventListener('scroll',update,{passive:true})
    return()=>window.removeEventListener('scroll',update)
  },[])

  return (
    <button
      type="button"
      aria-label="Back to top"
      title="Back to top"
      onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}
      className={`zen-scroll-top ${visible?'zen-scroll-top-visible':''}`}
    >
      <ArrowUp size={17}/>
    </button>
  )
}
