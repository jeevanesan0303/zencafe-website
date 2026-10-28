import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, ChefHat, Clock3, Coffee, Download, Edit3, Eye, EyeOff,
  ImagePlus, LayoutDashboard, LogOut, Plus, RefreshCw, RotateCcw, Save, Search, Sparkles, Trash2,
  Users, Utensils, X
} from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import { mockLogout } from '../admin-auth'
import OfferManager from './OfferManager'
import FoodVisual from './FoodVisual'
import { MenuItem, MenuKind } from '../data/menu'
import { deleteStoredMenuImage, isStoredMenuImageRef, persistMenuCatalog, prepareStoredMenuImage, readMenuCatalog, resetMenuCatalog, subscribeMenuCatalog } from '../data/menuStore'
import { addCustomCategory, getCategoryOptions, isCustomCategory, removeCustomCategory, subscribeCategories } from '../data/categoryStore'
import { readOffers, subscribeOffers } from '../data/offerStore'

type Booking = {
  id:string; createdAt:string; status:'New'|'Confirmed'|'Done'; name:string; phone:string;
  date:string; time:string; guests:number; duration:number; occasion:string; note:string
}


const BOOKING_KEY='zen-room-bookings-v18'
const readBookings=():Booking[]=>{try{return JSON.parse(localStorage.getItem(BOOKING_KEY)||'[]') as Booking[]}catch{return[]}}


type EditorState = Omit<MenuItem,'id'|'createdAt'>
const emptyEditor=(kind:MenuKind='food'):EditorState=>({
  kind,
  name:'',
  category:kind==='food'?'Rice Specials':'Milkshake',
  description:'',
  ingredients:'',
  serving:'',
  image:'',
  accent:kind==='food'?'#a32722':'#4a9a68',
  available:true,
  featured:true,
  dietaryType:kind==='food'?'veg':undefined,
  dairyType:kind==='drink'?'dairy-free':undefined,
})

function BookingManager(){
  const [bookings,setBookings]=useState<Booking[]>(()=>readBookings())
  const refresh=()=>setBookings(readBookings())
  useEffect(()=>{const onStorage=(e:StorageEvent)=>{if(e.key===BOOKING_KEY)refresh()};window.addEventListener('storage',onStorage);return()=>window.removeEventListener('storage',onStorage)},[])
  const save=(next:Booking[])=>{setBookings(next);localStorage.setItem(BOOKING_KEY,JSON.stringify(next))}
  const setStatus=(id:string,status:Booking['status'])=>save(bookings.map(b=>b.id===id?{...b,status}:b))
  const remove=(id:string)=>{if(window.confirm('Delete this booking request?'))save(bookings.filter(b=>b.id!==id))}
  const exportCsv=()=>{
    const rows=[['ID','Created','Name','Phone','Date','Time','Guests','Duration','Occasion','Note','Status'],...bookings.map(b=>[b.id,b.createdAt,b.name,b.phone,b.date,b.time,String(b.guests),String(b.duration),b.occasion,b.note,b.status])]
    const csv=rows.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='zen-room-bookings.csv';a.click();URL.revokeObjectURL(url)
  }
  const handleAccept=(b:Booking)=>{if(window.confirm(`Accept and confirm room booking for ${b.name}?`))setStatus(b.id,'Confirmed')}
  const handleReject=(b:Booking)=>{const reason=window.prompt(`Reason for rejecting ${b.name}'s booking:`);if(reason)setStatus(b.id,'Done')}
  const handleModify=(b:Booking)=>{const time=window.prompt(`Propose new time for ${b.name}:`,b.time);if(time)save(bookings.map(x=>x.id===b.id?{...x,time}:x))}
  return <section>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="kicker">Private Room</p><h2 className="mt-1 font-serif text-[34px] leading-none">Booking requests</h2></div><div className="flex gap-2"><button onClick={refresh} className="secondary-pill"><RefreshCw size={14}/> Refresh</button><button onClick={exportCsv} disabled={!bookings.length} className="primary-pill disabled:opacity-40"><Download size={14}/> Export CSV</button></div></div>
    {!bookings.length?<div className="panel grid min-h-[300px] place-items-center p-8 text-center"><div><CalendarDays className="mx-auto text-[#a32722]" size={32}/><h3 className="mt-4 font-serif text-[30px]">No room requests yet.</h3><p className="mt-2 text-[11px] leading-6 text-[#76665d]">New room forms will appear here in this browser.</p></div></div>:<div className="space-y-4">{bookings.map(b=><article key={b.id} className="panel p-5 sm:p-6"><div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#a32722]/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-[#a32722]">{b.id}</span><span className="text-[9px] text-[#8a786e]">{new Date(b.createdAt).toLocaleString()}</span><span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${b.status==='Confirmed'?'bg-emerald-100 text-emerald-800':b.status==='Done'?'bg-stone-200 text-stone-700':'bg-amber-100 text-amber-800'}`}>{b.status}</span></div><h3 className="mt-3 font-serif text-[30px] leading-none">{b.name}</h3><p className="mt-2 text-[12px] text-[#695950]">{b.phone} · {b.occasion}</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="metric !p-4"><CalendarDays size={16}/><span>Date</span><b>{b.date}</b><small>{b.time}</small></div><div className="metric !p-4"><Users size={16}/><span>Guests</span><b>{b.guests}</b><small>people</small></div><div className="metric !p-4"><Clock3 size={16}/><span>Duration</span><b>{b.duration} hr</b><small>maximum 3</small></div></div>{b.note&&<p className="mt-4 rounded-[18px] bg-[#f6ebe2] p-4 text-[11px] leading-6 text-[#67574f]">{b.note}</p>}</div><div className="flex shrink-0 flex-wrap items-center gap-2"><button type="button" onClick={()=>handleAccept(b)} className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition">ACCEPT</button><button type="button" onClick={()=>handleReject(b)} className="px-3 py-2 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition">REJECT</button><button type="button" onClick={()=>handleModify(b)} className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition">MODIFY</button><button onClick={()=>remove(b.id)} className="round-control !h-10 !w-10 ml-1" aria-label="Delete booking"><Trash2 size={16}/></button></div></div></article>)}</div>}
  </section>
}

function MenuManager(){
  const [items,setItems]=useState<MenuItem[]>(()=>readMenuCatalog())
  const [editor,setEditor]=useState<EditorState>(()=>emptyEditor())
  const [editingId,setEditingId]=useState<string|null>(null)
  const [filter,setFilter]=useState<'all'|MenuKind>('all')
  const [search,setSearch]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [categoryVersion,setCategoryVersion]=useState(0)
  const [addingCategory,setAddingCategory]=useState(false)
  const [newCategory,setNewCategory]=useState('')
  const fileRef=useRef<HTMLInputElement>(null)

  useEffect(()=>subscribeMenuCatalog(()=>setItems(readMenuCatalog())),[])
  useEffect(()=>subscribeCategories(()=>setCategoryVersion(v=>v+1)),[])
  useEffect(()=>{
    let active=true
    persistMenuCatalog(readMenuCatalog()).then(saved=>{
      if(active)setItems(saved)
    }).catch(()=>{
      if(active)setMessage('Legacy menu photos could not be migrated. Upload the product photo again and save.')
    })
    return()=>{active=false}
  },[])

  const saveCatalog=async(next:MenuItem[])=>{
    try{
      const saved=await persistMenuCatalog(next)
      setItems(saved)
      return true
    }catch(error){
      const quota=error instanceof DOMException && (error.name==='QuotaExceededError'||error.name==='NS_ERROR_DOM_QUOTA_REACHED')
      setMessage(quota?'Browser storage is full. Product photos now use media storage; reload this admin page once and retry.':error instanceof Error?error.message:'Could not save menu.')
      return false
    }
  }
  const filtered=useMemo(()=>items.filter(item=>(filter==='all'||item.kind===filter)&&(!search.trim()||`${item.name} ${item.category} ${item.description} ${item.dietaryType||''} ${item.dairyType||''}`.toLowerCase().includes(search.toLowerCase()))),[items,filter,search])
  const counts=useMemo(()=>({food:items.filter(x=>x.kind==='food').length,drinks:items.filter(x=>x.kind==='drink').length,live:items.filter(x=>x.available).length}),[items])

  const field=<K extends keyof EditorState>(key:K,value:EditorState[K])=>setEditor(v=>({...v,[key]:value}))
  const cleanupUnsavedImage=(source:string)=>{
    if(isStoredMenuImageRef(source)&&!items.some(item=>item.image===source))void deleteStoredMenuImage(source).catch(()=>{})
  }
  const switchKind=(kind:MenuKind)=>{cleanupUnsavedImage(editor.image);setEditor(v=>({...emptyEditor(kind),available:v.available,featured:v.featured}));setEditingId(null);setAddingCategory(false);setNewCategory('');if(fileRef.current)fileRef.current.value=''}
  const clear=()=>{cleanupUnsavedImage(editor.image);setEditingId(null);setEditor(emptyEditor(editor.kind));setAddingCategory(false);setNewCategory('');if(fileRef.current)fileRef.current.value='';setMessage('')}

  const imageUpload=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]
    if(!file)return
    setBusy(true);setMessage('Preparing photo…')
    try{
      const image=await prepareStoredMenuImage(file)
      cleanupUnsavedImage(editor.image)
      setEditor(v=>({...v,image}))
      setMessage('Photo ready. It is saved in browser media storage, so transparent PNG/WebP uploads no longer consume menu localStorage quota.')
    }catch(error){setMessage(error instanceof Error?error.message:'Could not prepare image.')}finally{setBusy(false)}
  }

  const submit=async(e:FormEvent)=>{
    e.preventDefault();setMessage('')
    if(!editor.name.trim()||!editor.category.trim()||!editor.description.trim()||!editor.image){setMessage('Name, category, description and photo are required.');return}
    const item:MenuItem={
      ...editor,
      name:editor.name.trim(),category:editor.category.trim(),description:editor.description.trim(),ingredients:editor.ingredients.trim(),serving:editor.serving.trim(),
      id:editingId||`zen-${crypto.randomUUID()}`,
      createdAt:editingId?(items.find(x=>x.id===editingId)?.createdAt||new Date().toISOString()):new Date().toISOString(),
    }
    const previousItem=editingId?items.find(x=>x.id===editingId):undefined
    const next=editingId?items.map(x=>x.id===editingId?item:x):[...items,item]
    if(await saveCatalog(next)){
      if(previousItem?.image&&previousItem.image!==item.image)void deleteStoredMenuImage(previousItem.image).catch(()=>{})
      setMessage(editingId?'Item updated successfully.':'Item added successfully.');setEditingId(null);setEditor(emptyEditor(editor.kind));if(fileRef.current)fileRef.current.value=''
    }
  }

  const edit=(item:MenuItem)=>{
    setEditingId(item.id)
    setEditor({
      kind:item.kind,name:item.name,category:item.category,description:item.description,ingredients:item.ingredients,serving:item.serving,image:item.image,accent:item.accent,available:item.available,featured:item.featured,
      dietaryType:item.dietaryType,dairyType:item.dairyType,
    })
    window.scrollTo({top:0,behavior:'smooth'})
  }
  const remove=async(id:string)=>{
    if(!window.confirm('Delete this menu item?'))return
    const target=items.find(x=>x.id===id)
    if(await saveCatalog(items.filter(x=>x.id!==id)) && target)void deleteStoredMenuImage(target.image).catch(()=>{})
  }
  const toggle=(id:string,key:'available'|'featured')=>{void saveCatalog(items.map(x=>x.id===id?{...x,[key]:!x[key]}:x))}
  const restore=()=>{if(window.confirm('Restore the original Zen food and drink menu? This removes admin-added items.')){const oldItems=[...items];resetMenuCatalog();setItems(readMenuCatalog());oldItems.forEach(item=>{void deleteStoredMenuImage(item.image).catch(()=>{})});clear()}}
  const categoryOptions=useMemo(()=>getCategoryOptions(editor.kind,items),[editor.kind,items,categoryVersion])
  const customCategories=useMemo(()=>categoryOptions.filter(category=>isCustomCategory(editor.kind,category)),[categoryOptions,editor.kind,categoryVersion])
  const addCategory=()=>{
    try{const added=addCustomCategory(editor.kind,newCategory);field('category',added);setNewCategory('');setAddingCategory(false);setMessage(`${editor.kind==='food'?'Food':'Drink'} category “${added}” added and selected.`)}
    catch(error){setMessage(error instanceof Error?error.message:'Could not add category.')}
  }
  const deleteCategory=(category:string)=>{
    if(!window.confirm(`Remove custom category “${category}” from the category list? Existing menu items will keep their current category.`))return
    removeCustomCategory(editor.kind,category);setMessage(`Custom category “${category}” removed from the quick-select list.`)
  }

  const previewItem:MenuItem={id:'preview',createdAt:new Date().toISOString(),...editor,name:editor.name||'Menu item name',category:editor.category||'Category',description:editor.description||'Your description will appear here.'}

  return <section>
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <div className="panel p-5"><p className="kicker">Food items</p><div className="mt-2 flex items-end justify-between"><p className="font-serif text-[42px]">{counts.food}</p><ChefHat className="text-[#a32722]"/></div><p className="text-[10px] text-[#76665d]">Shown in Zen Kitchen</p></div>
      <div className="panel p-5"><p className="kicker">Cool drinks</p><div className="mt-2 flex items-end justify-between"><p className="font-serif text-[42px]">{counts.drinks}</p><Coffee className="text-[#a32722]"/></div><p className="text-[10px] text-[#76665d]">Shown on the Café menu</p></div>
      <div className="panel p-5"><p className="kicker">Live items</p><div className="mt-2 flex items-end justify-between"><p className="font-serif text-[42px]">{counts.live}</p><Eye className="text-[#a32722]"/></div><p className="text-[10px] text-[#76665d]">Visible to guests now</p></div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[1.06fr_.94fr]">
      <form onSubmit={submit} className="panel p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="kicker">Menu Editor</p><h2 className="mt-1 font-serif text-[34px] leading-none">{editingId?'Edit menu item':'Add a new menu item'}</h2><p className="mt-2 text-[11px] leading-6 text-[#76665d]">Add the details and upload one clean product photo. That photo is used directly across the menu.</p></div><div className="inline-flex rounded-full border border-[#513226]/10 bg-[#f1e4da] p-1.5">{(['food','drink'] as const).map(kind=><button key={kind} type="button" onClick={()=>switchKind(kind)} className={`rounded-full px-4 py-3 text-[8px] font-extrabold uppercase tracking-[.12em] ${editor.kind===kind?'bg-[#a32722] text-white':'text-[#6b5b53]'}`}>{kind==='food'?'Food / Kitchen':'Cool Drink'}</button>)}</div></div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="field-label">Item name<input value={editor.name} onChange={e=>field('name',e.target.value)} className="field-input" placeholder={editor.kind==='food'?'Mutton Chukka':'Blueberry Milkshake'}/></label>
          <div className="field-label"><span>Category</span><div className="mt-2 flex gap-2"><select value={categoryOptions.includes(editor.category)?editor.category:''} onChange={e=>{const value=e.target.value;if(value==='__new__'){setAddingCategory(true);setNewCategory('')}else{field('category',value);setAddingCategory(false)}}} className="field-input min-w-0 flex-1"><option value="" disabled>Choose category</option>{categoryOptions.map(category=><option key={category} value={category}>{category}</option>)}<option value="__new__">＋ Add new category…</option></select><button type="button" onClick={()=>{setAddingCategory(v=>!v);setNewCategory('')}} className="zen-category-add-btn" aria-label="Add category"><Plus size={16}/></button></div>{addingCategory&&<div className="zen-category-create mt-3"><input value={newCategory} onChange={e=>setNewCategory(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCategory()}}} className="field-input" placeholder={editor.kind==='food'?'e.g. Kottu, Pasta, Soup':'e.g. Bubble Tea, Faluda, Mocktail'}/><button type="button" onClick={addCategory} className="primary-pill !px-4 !py-3"><Plus size={14}/> Add</button><button type="button" onClick={()=>{setAddingCategory(false);setNewCategory('')}} className="round-control !h-11 !w-11" aria-label="Cancel category"><X size={15}/></button></div>}<p className="mt-2 text-[9px] leading-4 text-[#8a786e]">Choose an existing category or add your own.</p></div>

          {customCategories.length>0&&<div className="sm:col-span-2 rounded-[20px] border border-[#513226]/8 bg-[#fff8f2] px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[8px] font-extrabold uppercase tracking-[.15em] text-[#8f211e]">Your custom categories</p><span className="rounded-full bg-[#a32722]/8 px-3 py-1.5 text-[8px] font-bold text-[#8f211e]">{customCategories.length}</span></div><div className="mt-3 flex flex-wrap gap-2">{customCategories.map(category=><div key={category} className={`zen-custom-category-chip ${editor.category===category?'is-active':''}`}><button type="button" onClick={()=>field('category',category)}>{category}</button><button type="button" onClick={()=>deleteCategory(category)} aria-label={`Remove ${category}`}><X size={11}/></button></div>)}</div></div>}

          <label className="field-label sm:col-span-2">Description<textarea value={editor.description} onChange={e=>field('description',e.target.value)} className="field-input min-h-[96px] resize-y" placeholder="Short guest-facing description…"/></label>
          <label className="field-label sm:col-span-2">Ingredients / contents<textarea value={editor.ingredients} onChange={e=>field('ingredients',e.target.value)} className="field-input min-h-[82px] resize-y" placeholder="Main ingredients or drink contents…"/></label>
          <label className="field-label">Serving detail<input value={editor.serving} onChange={e=>field('serving',e.target.value)} className="field-input" placeholder={editor.kind==='food'?'Served warm · main course':'Served chilled'}/></label>
          <label className="field-label">Accent colour<div className="flex gap-2"><input type="color" value={editor.accent} onChange={e=>field('accent',e.target.value)} className="h-[48px] w-[58px] rounded-[14px] border border-[#513226]/10 bg-white p-1.5"/><input value={editor.accent} onChange={e=>field('accent',e.target.value)} className="field-input" placeholder="#a32722"/></div></label>

          {editor.kind==='food'&&<div className="sm:col-span-2 rounded-[22px] border border-[#513226]/8 bg-[#fff8f2] p-4"><p className="text-[9px] font-extrabold uppercase tracking-[.16em] text-[#8f211e]">Food type</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><button type="button" onClick={()=>field('dietaryType','veg')} className={`zen-classification-option ${editor.dietaryType==='veg'?'is-selected is-veg':''}`}><span className="zen-classification-dot"/><b>Vegetarian</b><small>Veg</small></button><button type="button" onClick={()=>field('dietaryType','non-veg')} className={`zen-classification-option ${editor.dietaryType==='non-veg'?'is-selected is-nonveg':''}`}><span className="zen-classification-dot"/><b>Non-Vegetarian</b><small>Non Veg</small></button></div></div>}
          {editor.kind==='drink'&&<div className="sm:col-span-2 rounded-[22px] border border-[#513226]/8 bg-[#fff8f2] p-4"><p className="text-[9px] font-extrabold uppercase tracking-[.16em] text-[#8f211e]">Drink milk detail</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><button type="button" onClick={()=>field('dairyType','milk')} className={`zen-classification-option ${editor.dairyType==='milk'?'is-selected is-milk':''}`}><span className="zen-classification-dot"/><b>Fresh Milk</b><small>Milk</small></button><button type="button" onClick={()=>field('dairyType','milk-powder')} className={`zen-classification-option ${editor.dairyType==='milk-powder'?'is-selected is-powder':''}`}><span className="zen-classification-dot"/><b>Milk Powder</b><small>Powder</small></button><button type="button" onClick={()=>field('dairyType','dairy-free')} className={`zen-classification-option ${editor.dairyType==='dairy-free'?'is-selected is-free':''}`}><span className="zen-classification-dot"/><b>No Milk</b><small>Dairy Free</small></button></div></div>}

          <label className="field-label sm:col-span-2">Upload photo<input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={imageUpload} className="field-input file:mr-3 file:rounded-full file:border-0 file:bg-[#a32722] file:px-3 file:py-2 file:text-white"/><small className="mt-1 block normal-case tracking-normal text-[#8a786e]">Transparent PNG/WebP keeps its alpha. Product photos are stored in browser media storage instead of localStorage, so high-resolution uploads can be saved safely.</small></label>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="admin-toggle-row"><input type="checkbox" checked={editor.available} onChange={e=>field('available',e.target.checked)}/><span><b>Available</b><small>Guests can see this item</small></span></label><label className="admin-toggle-row"><input type="checkbox" checked={editor.featured} onChange={e=>field('featured',e.target.checked)}/><span><b>Featured</b><small>Prioritise in hero/carousel</small></span></label></div>
        {message&&<div className="mt-5 rounded-[18px] border border-[#a32722]/12 bg-[#a32722]/5 px-4 py-3 text-[11px] leading-5 text-[#7d312d]">{message}</div>}
        <div className="mt-6 flex flex-wrap gap-3"><button disabled={busy} className="primary-pill disabled:opacity-50"><Save size={15}/> {busy?'Preparing photo…':editingId?'Save changes':'Add menu item'}</button><button type="button" onClick={clear} className="secondary-pill">Clear form</button></div>
      </form>

      <aside className="panel overflow-hidden p-5 sm:p-6">
        <div className="flex items-center justify-between"><div><p className="kicker">Live Preview</p><h3 className="mt-1 font-serif text-[30px]">{editor.kind==='food'?'Zen Kitchen item':'Café drink card'}</h3></div><span className="rounded-full px-3 py-2 text-[8px] font-extrabold uppercase tracking-[.13em] text-white" style={{background:editor.accent}}>{editor.kind==='food'?'Food':'Cool Drink'}</span></div>
        <div className="mt-5 overflow-hidden rounded-[28px] border border-[#513226]/8 bg-[#fff8f2] shadow-soft"><div className="admin-upload-preview-bg zen-transparent-menu-media relative grid h-[440px] place-items-center overflow-hidden sm:h-[560px]">{editor.image?<FoodVisual item={previewItem} className="h-full w-full" imageClassName="h-full w-full object-contain object-center p-5"/>:<div className="text-center text-[#8a786e]"><ImagePlus className="mx-auto" size={34}/><p className="mt-3 text-[11px]">Upload a product photo to preview it here.</p></div>}</div><div className="p-5"><div className="flex flex-wrap items-center gap-2"><p className="text-[9px] font-bold uppercase tracking-[.14em]" style={{color:editor.accent}}>{previewItem.category}</p>{previewItem.kind==='food'&&<span className={`zen-menu-badge ${previewItem.dietaryType==='non-veg'?'zen-menu-badge-nonveg':'zen-menu-badge-veg'}`}>{previewItem.dietaryType==='non-veg'?'Non Veg':'Vegetarian'}</span>}{previewItem.kind==='drink'&&<span className="zen-menu-badge zen-menu-badge-milk">{previewItem.dairyType==='milk-powder'?'Milk Powder':previewItem.dairyType==='milk'?'Fresh Milk':'No Milk'}</span>}</div><h4 className="mt-2 font-serif text-[29px] leading-none">{previewItem.name}</h4><p className="mt-3 text-[11px] leading-5 text-[#6b5b53]">{previewItem.description}</p>{previewItem.ingredients&&<p className="mt-3 text-[10px] leading-5 text-[#817067]"><b>Ingredients:</b> {previewItem.ingredients}</p>}{previewItem.serving&&<p className="mt-3 text-[9px] font-bold uppercase tracking-[.1em] text-[#8a786e]">{previewItem.serving}</p>}</div></div>
      </aside>
    </div>

    <div className="mt-8 panel p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="kicker">Live Catalogue</p><h2 className="mt-1 font-serif text-[32px]">Manage food & cool drinks</h2></div><div className="flex flex-wrap gap-2"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8c7b72]" size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} className="field-input !w-[230px] !py-3 !pl-9" placeholder="Search menu…"/></div>{(['all','food','drink'] as const).map(value=><button key={value} onClick={()=>setFilter(value)} className={`rounded-full px-4 py-3 text-[8px] font-extrabold uppercase tracking-[.12em] ${filter===value?'bg-[#a32722] text-white':'bg-[#f3e8df] text-[#6b5b53]'}`}>{value==='all'?'All':value==='food'?'Food':'Cool Drinks'}</button>)}<button onClick={restore} className="secondary-pill !px-4"><RotateCcw size={14}/> Restore defaults</button></div></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{filtered.map(item=><article key={item.id} className={`overflow-hidden rounded-[26px] border bg-white shadow-soft transition ${item.available?'border-[#513226]/8':'border-[#513226]/5 opacity-60'}`}><div className="grid grid-cols-[118px_1fr]"><div className="admin-menu-thumb-media zen-transparent-menu-media relative grid min-h-[150px] place-items-center overflow-hidden"><FoodVisual item={item} className="h-full w-full" imageClassName="h-full w-full object-contain object-center p-2"/><span className="absolute left-2 top-2 rounded-full bg-[#17100d]/72 px-2 py-1 text-[7px] font-bold uppercase tracking-[.1em] text-white">{item.kind==='food'?'Kitchen':'Drinks'}</span></div><div className="min-w-0 p-4"><div className="flex items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-1.5"><p className="text-[8px] font-extrabold uppercase tracking-[.12em]" style={{color:item.accent}}>{item.category}</p>{item.kind==='food'&&<span className={`zen-menu-badge ${item.dietaryType==='non-veg'?'zen-menu-badge-nonveg':'zen-menu-badge-veg'}`}>{item.dietaryType==='non-veg'?'Non Veg':'Veg'}</span>}{item.kind==='drink'&&<span className="zen-menu-badge zen-menu-badge-milk">{item.dairyType==='milk-powder'?'Milk Powder':item.dairyType==='milk'?'Milk':'No Milk'}</span>}</div><h3 className="mt-1 font-serif text-[23px] leading-none">{item.name}</h3></div>{item.featured&&<Sparkles size={15} className="shrink-0 text-[#b98b43]"/>}</div><p className="mt-2 line-clamp-2 text-[10px] leading-5 text-[#74645b]">{item.description}</p><div className="mt-3 flex flex-wrap gap-1.5"><button onClick={()=>edit(item)} className="admin-mini-btn"><Edit3 size={12}/> Edit</button><button onClick={()=>toggle(item.id,'available')} className="admin-mini-btn">{item.available?<><Eye size={12}/> Live</>:<><EyeOff size={12}/> Hidden</>}</button><button onClick={()=>toggle(item.id,'featured')} className="admin-mini-btn"><Sparkles size={12}/> {item.featured?'Featured':'Normal'}</button><button onClick={()=>remove(item.id)} className="admin-mini-btn admin-mini-danger"><Trash2 size={12}/></button></div></div></div></article>)}</div>
      {!filtered.length&&<div className="mt-6 grid min-h-[180px] place-items-center rounded-[24px] border border-dashed border-[#513226]/12 text-center"><div><Search className="mx-auto text-[#a32722]"/><p className="mt-3 text-[12px] text-[#74645b]">No menu items match this filter.</p></div></div>}
    </div>
  </section>
}

export default function AdminBookings(){
  const handleLogout=()=>{
    if(window.confirm('Are you sure you want to log out of Zen Admin?')){
      mockLogout()
    }
  }
  const [tab,setTab]=useState<'menu'|'offers'|'bookings'>('menu')
  const [catalogCount,setCatalogCount]=useState(()=>readMenuCatalog().length)
  const [bookingCount,setBookingCount]=useState(()=>readBookings().length)
  const [offerCount,setOfferCount]=useState(()=>readOffers().filter(o=>o.active).length)
  useEffect(()=>subscribeMenuCatalog(()=>setCatalogCount(readMenuCatalog().length)),[])
  useEffect(()=>subscribeOffers(()=>setOfferCount(readOffers().filter(o=>o.active).length)),[])
  useEffect(()=>{const sync=()=>setBookingCount(readBookings().length);window.addEventListener('storage',sync);const timer=window.setInterval(sync,1500);return()=>{window.removeEventListener('storage',sync);window.clearInterval(timer)}},[])

  return <main className="zen-dark-scope zen-admin-shell min-h-screen bg-[#f5ece4] px-5 py-8 text-[#251914] sm:px-10 lg:px-12">
    <div className="mx-auto max-w-[1500px]">
      <header className="rounded-[34px] border border-[#4d2e22]/8 bg-[#fffaf5]/90 p-5 shadow-soft backdrop-blur-xl sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-center gap-4"><img src="/assets/zen-logo.png" className="h-16 w-16 rounded-full" alt="Zen Café"/><div><p className="kicker">Zen Admin</p><h1 className="font-serif text-[38px] leading-none">Dashboard</h1><p className="mt-2 text-[11px] text-[#76665d]">Control Café drinks, Zen Kitchen food, categories, offers and room requests.</p></div></div><div className="flex flex-wrap items-center gap-2"><ThemeToggle/><a href="/" className="secondary-pill"><LayoutDashboard size={14}/> Café</a><a href="/zen-kitchen" className="secondary-pill"><ChefHat size={14}/> Zen Kitchen</a><button type="button" onClick={handleLogout} className="primary-pill"><LogOut size={14}/> Logout</button></div></div>
        <nav className="mt-5 grid max-w-[840px] grid-cols-1 gap-2 rounded-[22px] border border-[#513226]/8 bg-[#f1e4da] p-1.5 sm:grid-cols-3"><button onClick={()=>setTab('menu')} className={`admin-tab ${tab==='menu'?'admin-tab-active':''}`}><Utensils size={15}/><span>Menu Manager</span><b>{catalogCount}</b></button><button onClick={()=>setTab('offers')} className={`admin-tab ${tab==='offers'?'admin-tab-active':''}`}><Sparkles size={15}/><span>Offers</span><b>{offerCount}</b></button><button onClick={()=>setTab('bookings')} className={`admin-tab ${tab==='bookings'?'admin-tab-active':''}`}><CalendarDays size={15}/><span>Room Bookings</span><b>{bookingCount}</b></button></nav>
      </header>
      <div className="mt-7">{tab==='menu'?<MenuManager/>:tab==='offers'?<OfferManager/>:<BookingManager/>}</div>
    </div>
  </main>
}
