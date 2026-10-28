import { useEffect, useState } from 'react'
import { MenuItem } from '../data/menu'
import { isStoredMenuImageRef, resolveStoredMenuImage } from '../data/menuStore'

type Props = {
  item: MenuItem
  className?: string
  imageClassName?: string
  compact?: boolean
}

export default function FoodVisual({ item, className = '', imageClassName = '' }: Props) {
  const [source,setSource]=useState(()=>isStoredMenuImageRef(item.image)?'':item.image)

  useEffect(()=>{
    let active=true
    let objectUrl=''
    if(!isStoredMenuImageRef(item.image)){
      setSource(item.image)
      return()=>{}
    }
    setSource('')
    resolveStoredMenuImage(item.image).then(url=>{
      objectUrl=url.startsWith('blob:')?url:''
      if(active)setSource(url)
      else if(objectUrl)URL.revokeObjectURL(objectUrl)
    }).catch(()=>{if(active)setSource('/assets/menu-panda-main.png')})
    return()=>{
      active=false
      if(objectUrl)URL.revokeObjectURL(objectUrl)
    }
  },[item.image])

  return (
    <div className={`zen-simple-food-visual ${className}`.trim()}>
      {source ? <img
        src={source}
        alt={item.name}
        className={imageClassName || 'h-full w-full object-contain'}
        loading="lazy"
        draggable={false}
      /> : <span className="zen-menu-image-loading" aria-label="Loading product image"/>}
    </div>
  )
}
