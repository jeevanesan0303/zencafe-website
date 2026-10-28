import { BadgePercent, Sparkles, Zap } from 'lucide-react'

type Props={
  text?:string
  className?:string
  compact?:boolean
}

function splitOfferText(text:string){
  const cleaned=(text||'SPECIAL OFFER').trim().replace(/\s+/g,' ').toUpperCase()
  if(!cleaned)return{top:'SPECIAL',bottom:'OFFER'}
  const words=cleaned.split(' ')
  if(words.length===1)return{top:'SPECIAL',bottom:words[0]}
  if(words.length===2)return{top:words[0],bottom:words[1]}
  const mid=Math.ceil(words.length/2)
  return{
    top:words.slice(0,mid).join(' '),
    bottom:words.slice(mid).join(' '),
  }
}

export default function OfferComicBadge({text='SPECIAL OFFER',className='',compact=false}:Props){
  const lines=splitOfferText(text)

  return <div className={`zen-offer-comic-badge ${compact?'is-compact':''} ${className}`.trim()}>
    <span className="zen-offer-comic-glow" aria-hidden="true"/>
    <span className="zen-offer-comic-shadow" aria-hidden="true"/>
    <span className="zen-offer-comic-spark spark-a" aria-hidden="true"><Sparkles size={compact?11:14}/></span>
    <span className="zen-offer-comic-spark spark-b" aria-hidden="true"><Zap size={compact?10:13}/></span>
    <span className="zen-offer-comic-icon" aria-hidden="true"><BadgePercent size={compact?15:18}/></span>

    <span className="zen-offer-comic-body">
      <small>Zen Café</small>
      <b>{lines.top}</b>
      <strong>{lines.bottom}</strong>
    </span>
  </div>
}
