import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react'
import { BadgePercent, Edit3, Eye, EyeOff, Save, Trash2 } from 'lucide-react'
import { deleteStoredMenuImage, isStoredMenuImageRef, prepareStoredMenuImage } from '../data/menuStore'
import { readOffers, writeOffers, ZenOffer } from '../data/offerStore'
import OfferArtwork from './OfferArtwork'
import OfferComicBadge from './OfferComicBadge'

type OfferEditor=Omit<ZenOffer,'id'|'createdAt'>
const emptyOffer=():OfferEditor=>({
  title:'',
  subtitle:'Zen Café limited-time special',
  description:'',
  badge:'SPECIAL OFFER',
  image:'',
  active:true,
})

export default function OfferManager(){
  const [offers,setOffers]=useState<ZenOffer[]>(()=>readOffers())
  const [editor,setEditor]=useState<OfferEditor>(()=>emptyOffer())
  const [editingId,setEditingId]=useState<string|null>(null)
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  const fileRef=useRef<HTMLInputElement>(null)
  const activeCount=useMemo(()=>offers.filter(o=>o.active).length,[offers])

  const saveAll=(next:ZenOffer[])=>{
    try{writeOffers(next);setOffers(next);return true}
    catch{setMessage('Browser storage is unavailable or full. Enable site storage and try again.');return false}
  }
  const field=<K extends keyof OfferEditor>(key:K,value:OfferEditor[K])=>setEditor(v=>({...v,[key]:value}))
  const cleanupUnsavedImage=(source:string)=>{
    if(isStoredMenuImageRef(source)&&!offers.some(offer=>offer.image===source))void deleteStoredMenuImage(source).catch(()=>{})
  }
  const clear=()=>{cleanupUnsavedImage(editor.image);setEditor(emptyOffer());setEditingId(null);setMessage('');if(fileRef.current)fileRef.current.value=''}

  const upload=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return
    setBusy(true)
    try{
      const nextImage=await prepareStoredMenuImage(file)
      cleanupUnsavedImage(editor.image)
      field('image',nextImage)
      setMessage('Offer image ready — transparency preserved and the photo is stored safely in browser media storage. Review and save.')
    }catch{setMessage('Could not process the offer image.')}finally{setBusy(false)}
  }

  const submit=(e:FormEvent)=>{
    e.preventDefault()
    if(!editor.title.trim()||!editor.description.trim()){setMessage('Offer title and description are required.');return}
    const existing=editingId?offers.find(o=>o.id===editingId):undefined
    const offer:ZenOffer={
      ...editor,
      title:editor.title.trim(),
      subtitle:editor.subtitle.trim(),
      description:editor.description.trim(),
      badge:editor.badge.trim()||'SPECIAL OFFER',
      image:editor.image||'/assets/menu-panda-main.png',
      id:editingId||`offer-${crypto.randomUUID()}`,
      createdAt:existing?.createdAt||new Date().toISOString(),
    }
    const next=editingId?offers.map(o=>o.id===editingId?offer:o):[offer,...offers]
    if(!saveAll(next))return
    if(existing?.image&&existing.image!==offer.image)void deleteStoredMenuImage(existing.image).catch(()=>{})
    setMessage(editingId?'Offer updated.':'Offer added. The side Offer icon will light up while it is active.')
    setEditingId(null);setEditor(emptyOffer());if(fileRef.current)fileRef.current.value=''
  }

  const edit=(offer:ZenOffer)=>{setEditingId(offer.id);setEditor({title:offer.title,subtitle:offer.subtitle,description:offer.description,badge:offer.badge,image:offer.image,active:offer.active});window.scrollTo({top:0,behavior:'smooth'})}
  const toggle=(id:string)=>{saveAll(offers.map(o=>o.id===id?{...o,active:!o.active}:o))}
  const remove=(id:string)=>{
    if(!window.confirm('Delete this offer?'))return
    const target=offers.find(o=>o.id===id)
    if(!saveAll(offers.filter(o=>o.id!==id)))return
    if(target)void deleteStoredMenuImage(target.image).catch(()=>{})
  }

  return <section>
    <div className="mb-6 grid gap-4 sm:grid-cols-2">
      <div className="panel p-5"><p className="kicker">Offers</p><div className="mt-2 flex items-end justify-between"><p className="font-serif text-[42px]">{offers.length}</p><BadgePercent className="text-[#a32722]"/></div><p className="text-[10px] text-[#76665d]">All saved offers</p></div>
      <div className="panel p-5"><p className="kicker">Live now</p><div className="mt-2 flex items-end justify-between"><p className="font-serif text-[42px]">{activeCount}</p><span className={`h-3 w-3 rounded-full ${activeCount?'bg-[#e1a94c] shadow-[0_0_0_6px_rgba(225,169,76,.12),0_0_22px_rgba(225,169,76,.65)]':'bg-[#b7aaa1]'}`}/></div><p className="text-[10px] text-[#76665d]">The side Offer icon glows only when this is above 0.</p></div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
      <form onSubmit={submit} className="panel p-6 sm:p-8">
        <p className="kicker">Offer Editor</p><h2 className="mt-1 font-serif text-[34px] leading-none">{editingId?'Edit offer':'Add an offer'}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="field-label sm:col-span-2">Offer title<input className="field-input" value={editor.title} onChange={e=>field('title',e.target.value)} placeholder="Mutton Chukka Special"/></label>
          <label className="field-label">Short line<input className="field-input" value={editor.subtitle} onChange={e=>field('subtitle',e.target.value)} placeholder="Chef’s limited-time offer"/></label>
          <label className="field-label">Badge<input className="field-input" value={editor.badge} onChange={e=>field('badge',e.target.value)} placeholder="SPECIAL OFFER"/></label>
          <label className="field-label sm:col-span-2">Description<textarea className="field-input min-h-[110px] resize-y" value={editor.description} onChange={e=>field('description',e.target.value)} placeholder="Describe the offer clearly for customers…"/></label>
          <label className="field-label sm:col-span-2">Offer image<input ref={fileRef} type="file" accept="image/*" onChange={upload} className="field-input"/></label>
          <label className="admin-toggle-row sm:col-span-2"><input type="checkbox" checked={editor.active} onChange={e=>field('active',e.target.checked)}/><span><b>Offer live</b><small>When enabled, the floating Offer symbol gently lights/blinks.</small></span></label>
        </div>
        {message&&<div className="mt-5 rounded-[18px] border border-[#a32722]/12 bg-[#a32722]/5 px-4 py-3 text-[11px] leading-5 text-[#7d312d]">{message}</div>}
        <div className="mt-6 flex flex-wrap gap-3"><button disabled={busy} className="primary-pill disabled:opacity-50"><Save size={15}/>{editingId?'Save offer':'Add offer'}</button><button type="button" onClick={clear} className="secondary-pill">Clear</button></div>
      </form>

      <aside className="panel p-5 sm:p-6"><p className="kicker">Offer Preview</p><h3 className="mt-1 font-serif text-[30px]">Customer offer card</h3><div className="mt-5 overflow-hidden rounded-[28px] border border-[#513226]/8 bg-white shadow-soft"><div className="relative grid h-[320px] place-items-center overflow-hidden bg-[#f7eee6]"><OfferArtwork src={editor.image||'/assets/menu-panda-main.png'} className="h-full w-full object-contain object-bottom" alt="Offer preview"/><div className="absolute left-4 top-4 origin-top-left scale-[.92]"><OfferComicBadge text={editor.badge||'SPECIAL OFFER'} /></div></div><div className="p-5"><p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#a32722]">{editor.subtitle||'Zen Café special'}</p><h4 className="mt-2 font-serif text-[29px] leading-none">{editor.title||'Your offer title'}</h4><p className="mt-3 text-[11px] leading-6 text-[#6b5b53]">{editor.description||'Your offer description will appear here.'}</p></div></div></aside>
    </div>

    <div className="mt-8 panel p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="kicker">Saved Offers</p><h2 className="mt-1 font-serif text-[32px]">Manage live offers</h2></div><a href="/offers.html" target="_blank" rel="noreferrer" className="secondary-pill">Open Offers Page</a></div><div className="mt-6 grid gap-4 md:grid-cols-2">{offers.map(offer=><article key={offer.id} className={`overflow-hidden rounded-[24px] border bg-white shadow-soft ${offer.active?'border-[#d7a04d]/30':'border-[#513226]/8 opacity-70'}`}><div className="grid grid-cols-[112px_1fr]"><div className="grid min-h-[145px] place-items-center overflow-hidden bg-[#fff8f2]"><OfferArtwork src={offer.image||'/assets/menu-panda-main.png'} className="h-full w-full object-contain object-bottom" alt="" ariaHidden/></div><div className="min-w-0 p-4"><p className="text-[8px] font-extrabold uppercase tracking-[.12em] text-[#a32722]">{offer.badge}</p><h3 className="mt-1 font-serif text-[24px] leading-none">{offer.title}</h3><p className="mt-2 line-clamp-2 text-[10px] leading-5 text-[#74645b]">{offer.description}</p><div className="mt-3 flex flex-wrap gap-1.5"><button onClick={()=>edit(offer)} className="admin-mini-btn"><Edit3 size={12}/> Edit</button><button onClick={()=>toggle(offer.id)} className="admin-mini-btn">{offer.active?<><Eye size={12}/> Live</>:<><EyeOff size={12}/> Hidden</>}</button><button onClick={()=>remove(offer.id)} className="admin-mini-btn admin-mini-danger"><Trash2 size={12}/></button></div></div></div></article>)}</div></div>
  </section>
}
