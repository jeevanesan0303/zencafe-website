import { useEffect, useState } from 'react'
import { isStoredMenuImageRef, resolveStoredMenuImage } from '../data/menuStore'

type Props={
  src:string
  alt:string
  className?:string
  ariaHidden?:boolean
}

const isLegacyJpegData=(src:string)=>/^data:image\/jpe?g[;,]/i.test(src)

const loadImage=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
  const image=new Image()
  image.onload=()=>resolve(image)
  image.onerror=()=>reject(new Error('Offer image could not be loaded.'))
  image.src=src
})

async function repairLegacyBlackBackground(src:string):Promise<string>{
  if(!isLegacyJpegData(src))return src

  try{
    const image=await loadImage(src)
    const width=image.naturalWidth||image.width
    const height=image.naturalHeight||image.height
    if(!width||!height)return src

    const canvas=document.createElement('canvas')
    canvas.width=width
    canvas.height=height
    const ctx=canvas.getContext('2d',{willReadFrequently:true})
    if(!ctx)return src
    ctx.drawImage(image,0,0,width,height)

    const frame=ctx.getImageData(0,0,width,height)
    const px=frame.data
    const sample=Math.max(2,Math.min(10,Math.floor(Math.min(width,height)*.025)))
    let sr=0,sg=0,sb=0,count=0
    const sampleCorner=(x0:number,y0:number)=>{
      for(let y=y0;y<y0+sample;y++)for(let x=x0;x<x0+sample;x++){
        const i=(y*width+x)*4
        sr+=px[i];sg+=px[i+1];sb+=px[i+2];count++
      }
    }
    sampleCorner(0,0)
    sampleCorner(width-sample,0)
    sampleCorner(0,height-sample)
    sampleCorner(width-sample,height-sample)
    if(!count)return src

    const bg=[sr/count,sg/count,sb/count]
    const bgLum=(bg[0]+bg[1]+bg[2])/3
    const bgSpread=Math.max(...bg)-Math.min(...bg)
    // V109 transparent PNGs were converted to JPEG on a black canvas.
    // Only repair that very specific legacy signature; real photographic
    // images with non-black corners are left completely untouched.
    if(bgLum>46||bgSpread>24)return src

    const total=width*height
    const visited=new Uint8Array(total)
    const queue=new Int32Array(total)
    let head=0,tail=0,removed=0
    const tolerance=38
    const maxLum=Math.max(62,bgLum+52)

    const canRemove=(index:number)=>{
      if(visited[index])return false
      const i=index*4
      if(px[i+3]===0)return true
      const d=Math.max(
        Math.abs(px[i]-bg[0]),
        Math.abs(px[i+1]-bg[1]),
        Math.abs(px[i+2]-bg[2]),
      )
      const lum=(px[i]+px[i+1]+px[i+2])/3
      return d<=tolerance&&lum<=maxLum
    }
    const enqueue=(index:number)=>{
      if(index<0||index>=total||visited[index]||!canRemove(index))return
      visited[index]=1
      queue[tail++]=index
    }

    for(let x=0;x<width;x++){enqueue(x);enqueue((height-1)*width+x)}
    for(let y=1;y<height-1;y++){enqueue(y*width);enqueue(y*width+width-1)}

    while(head<tail){
      const index=queue[head++]
      removed++
      const x=index%width
      if(x>0)enqueue(index-1)
      if(x<width-1)enqueue(index+1)
      if(index>=width)enqueue(index-width)
      if(index<total-width)enqueue(index+width)
    }

    if(removed<Math.max(24,total*.008))return src

    for(let index=0;index<total;index++){
      if(visited[index])px[index*4+3]=0
    }

    // Soften only the immediate JPEG halo next to the removed background.
    const softLimit=72
    for(let index=0;index<total;index++){
      if(visited[index])continue
      const x=index%width
      const touchesBg=(x>0&&visited[index-1])||(x<width-1&&visited[index+1])||
        (index>=width&&visited[index-width])||(index<total-width&&visited[index+width])
      if(!touchesBg)continue
      const i=index*4
      const d=Math.max(
        Math.abs(px[i]-bg[0]),
        Math.abs(px[i+1]-bg[1]),
        Math.abs(px[i+2]-bg[2]),
      )
      if(d>tolerance&&d<softLimit){
        const alpha=Math.round(((d-tolerance)/(softLimit-tolerance))*255)
        px[i+3]=Math.min(px[i+3],alpha)
      }
    }

    ctx.putImageData(frame,0,0)
    return canvas.toDataURL('image/png')
  }catch{return src}
}

export default function OfferArtwork({src,alt,className,ariaHidden}:Props){
  const [displaySrc,setDisplaySrc]=useState(()=>isStoredMenuImageRef(src)?'':src)

  useEffect(()=>{
    let alive=true
    let objectUrl=''
    const prepare=async()=>{
      try{
        let source=src
        if(isStoredMenuImageRef(source)){
          setDisplaySrc('')
          source=await resolveStoredMenuImage(source)
          if(source.startsWith('blob:'))objectUrl=source
        }else setDisplaySrc(source)
        const next=await repairLegacyBlackBackground(source)
        if(alive)setDisplaySrc(next)
      }catch{
        if(alive)setDisplaySrc('/assets/menu-panda-main.png')
      }
    }
    void prepare()
    return()=>{
      alive=false
      if(objectUrl)URL.revokeObjectURL(objectUrl)
    }
  },[src])

  return <img src={displaySrc||'/assets/menu-panda-main.png'} alt={alt} className={className} aria-hidden={ariaHidden}/>
}
