
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  Heart,
  ImagePlus,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react'
import { GALLERY_SEED } from '../data/menu'

type Post = {
  id: string
  user: string
  caption: string
  image: string
  local?: boolean
  likes?: number
  createdAt?: number
}

type PhotoShape = 'portrait' | 'square' | 'landscape' | 'wide'

type AccessResponse = {
  success: boolean
  registered?: boolean
  canUpload?: boolean
  maxUploads?: number
  nextUploadAt?: string | null
  message?: string
}

type UploadResponse = {
  success: boolean
  message?: string
  uploadedCount?: number
  nextUploadAt?: string | null
}

type SelectedPhoto = {
  id: string
  file: File
  preview: string
}

type PublicPhoto = {
  id: string | number
  user?: string
  name?: string
  title?: string
  caption?: string
  description?: string
  image?: string
  imageUrl?: string
  image_url?: string
  createdAt?: number
  created_at?: string
  likes?: number
}

const API = '/api/gallery'
const MAX_PHOTOS = 2
const MAX_FILE_SIZE = 5 * 1024 * 1024
const AUTO_SLIDE_MS = 3800
const LIKES_KEY = 'zen-cafe-gallery-likes-v124'

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function emailLooksValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

type LikeRecord = {
  count: number
  liked: boolean
}

function readLikeMap(): Record<string, LikeRecord> {
  try {
    return JSON.parse(localStorage.getItem(LIKES_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveLikeMap(map: Record<string, LikeRecord>) {
  try {
    localStorage.setItem(LIKES_KEY, JSON.stringify(map))
  } catch {
    // Likes are optional local UI preferences.
  }
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''

  if (!contentType.includes('application/json')) {
    throw new Error('The gallery API is unavailable. Please try again.')
  }

  return response.json() as Promise<T>
}

export default function CommunityGallery({
  toast,
}: {
  toast: (message: string) => void
}) {
  const seed = useMemo<Post[]>(() => {
    const savedLikes = readLikeMap()

    return GALLERY_SEED.map((post, index) => ({
      ...post,
      likes: savedLikes[post.id]?.count ?? (126 + index * 9),
    }))
  }, [])

  const [posts, setPosts] = useState<Post[]>(seed)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [caption, setCaption] = useState('')

  const [photos, setPhotos] = useState<SelectedPhoto[]>([])

  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploaded, setUploaded] = useState(false)

  const [verifiedEmail, setVerifiedEmail] = useState('')
  const [registered, setRegistered] = useState(false)
  const [maxUploads, setMaxUploads] = useState(MAX_PHOTOS)
  const [nextUploadAt, setNextUploadAt] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const [lightbox, setLightbox] = useState<Post | null>(null)
  const [lightboxClosing, setLightboxClosing] = useState(false)

  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  const [photoShapes, setPhotoShapes] = useState<Record<string, PhotoShape>>({})

  const [likedIds, setLikedIds] = useState<Record<string, boolean>>(() => {
    const map = readLikeMap()

    return Object.fromEntries(
      Object.entries(map)
        .filter(([, value]) => value.liked)
        .map(([id]) => [id, true])
    )
  })

  const touch = useRef<number | null>(null)
  const navLock = useRef(false)
  const resumeTimer = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef<SelectedPhoto[]>([])
  const emailRef = useRef<HTMLInputElement>(null)

  const normalizedEmail = normalizeEmail(email)

  const cooldownRemaining = nextUploadAt
    ? Math.max(0, new Date(nextUploadAt).getTime() - now)
    : 0

  const cooldownActive = cooldownRemaining > 0

  const emailConfirmed =
    registered &&
    verifiedEmail === normalizedEmail &&
    emailLooksValid(normalizedEmail)

  const canUpload =
    emailConfirmed &&
    !cooldownActive &&
    !busy &&
    !checking &&
    maxUploads > 0

  const guestUploads = useMemo(
    () => posts.filter(post => post.local).length,
    [posts]
  )

  // Keep object URLs synchronized for cleanup.
  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  useEffect(() => {
    return () => {
      photosRef.current.forEach(photo => {
        URL.revokeObjectURL(photo.preview)
      })
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  // Pre-load saved customer profile if user previously registered
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem('zen-cafe-customer-registration-v149')
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile)
        if (parsed.email && !email) {
          setEmail(parsed.email)
        }
        if (parsed.name && !name) {
          setName(parsed.name)
        }
      }
    } catch {
      // ignore
    }
  }, [])

  // Retrieve approved public photos when the public API is available.
  // The existing seed carousel remains visible until that endpoint
  // is implemented.
  useEffect(() => {
    let cancelled = false

    async function loadApprovedPhotos() {
      try {
        const response = await fetch(`${API}/public`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        })

        if (!response.ok) return

        const result = await readApiResponse<{
          success: boolean
          photos?: PublicPhoto[]
        }>(response)

        if (!result.success || !Array.isArray(result.photos)) return

        const approved: Post[] = result.photos
          .filter(photo =>
            Boolean(photo.imageUrl || photo.image_url || photo.image)
          )
          .map(photo => ({
            id: String(photo.id),
            user: photo.user || photo.name || photo.title || 'Zen Guest',
            caption: photo.caption || photo.description || '',
            image: photo.imageUrl || photo.image_url || photo.image || '',
            local: true,
            likes: photo.likes ?? 0,
            createdAt: photo.createdAt ||
              (photo.created_at
                ? new Date(photo.created_at).getTime()
                : Date.now()),
          }))

        if (cancelled) return

        const likes = readLikeMap()

        setPosts([
          ...approved.map(post => ({
            ...post,
            likes: likes[post.id]?.count ?? post.likes,
          })),
          ...seed,
        ])
      } catch {
        // The public gallery endpoint will be added separately.
      }
    }

    void loadApprovedPhotos()

    return () => {
      cancelled = true
    }
  }, [seed])

  useEffect(() => {
    if (posts.length <= 1 || paused || lightbox) return

    const timer = window.setInterval(() => {
      setActive(current => (current + 1) % posts.length)
    }, AUTO_SLIDE_MS)

    return () => window.clearInterval(timer)
  }, [posts.length, paused, lightbox])

  useEffect(() => {
    if (active >= posts.length && posts.length) {
      setActive(0)
    }
  }, [active, posts.length])

  useEffect(() => {
    return () => {
      if (resumeTimer.current) {
        window.clearTimeout(resumeTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!lightbox) return

    const previous = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    document.body.classList.add('zen-gallery-lightbox-open')

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightboxClosing(true)
        window.setTimeout(() => {
          setLightbox(null)
          setLightboxClosing(false)
        }, 280)
      }
    }

    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = previous
      document.body.classList.remove('zen-gallery-lightbox-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [lightbox])

  function clearPhotos() {
    photosRef.current.forEach(photo => {
      URL.revokeObjectURL(photo.preview)
    })

    photosRef.current = []
    setPhotos([])

    if (fileRef.current) {
      fileRef.current.value = ''
    }
  }

  function handleEmailChange(value: string) {
    const normalized = normalizeEmail(value)

    setEmail(value)
    setUploaded(false)

    if (normalized !== verifiedEmail) {
      setRegistered(false)
      setVerifiedEmail('')
      setNextUploadAt(null)
      setMaxUploads(MAX_PHOTOS)
      clearPhotos()
    }
  }

  // ==========================================
  // CHECK REGISTERED EMAIL IN POSTGRESQL
  // ==========================================

  async function checkEmail() {
    if (!emailLooksValid(email)) {
      toast('Please enter a valid email address.')
      return
    }

    setChecking(true)
    setRegistered(false)
    setVerifiedEmail('')
    setUploaded(false)

    try {
      const response = await fetch(`${API}/check-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
        }),
      })

      const data = await readApiResponse<AccessResponse>(response)

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to check email.')
      }

      if (!data.registered) {
        setRegistered(false)
        setNextUploadAt(null)
        clearPhotos()
        toast('Email not found. Please register and verify your email first.')
        return
      }

      setRegistered(true)
      setVerifiedEmail(normalizedEmail)
      setMaxUploads(Math.max(0, Math.min(MAX_PHOTOS, data.maxUploads ?? 2)))
      setNextUploadAt(data.nextUploadAt || null)

      if (data.canUpload) {
        toast('Registered email found. You can upload photos now.')
      } else {
        toast(data.message || 'Your upload cooldown is active.')
      }
    } catch (error) {
      setRegistered(false)
      setVerifiedEmail('')
      toast(
        error instanceof Error
          ? error.message
          : 'Unable to verify your registered email.'
      )
    } finally {
      setChecking(false)
    }
  }

  // ==========================================
  // SELECT 1 OR 2 PHOTOS
  // ==========================================

  function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || [])

    if (!canUpload) {
      toast('Please check your registered email first.')
      event.target.value = ''
      return
    }

    if (!selected.length) return

    if (selected.length > maxUploads) {
      toast(`Please select a maximum of ${maxUploads} photos.`)
      event.target.value = ''
      return
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp']

    for (const file of selected) {
      if (!allowed.includes(file.type)) {
        toast('Only JPEG, PNG and WebP photos are supported.')
        event.target.value = ''
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        toast('Each photo must be smaller than 5 MB.')
        event.target.value = ''
        return
      }

      if (file.size === 0) {
        toast('Empty image files cannot be uploaded.')
        event.target.value = ''
        return
      }
    }

    clearPhotos()

    const prepared = selected.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
    }))

    photosRef.current = prepared
    setPhotos(prepared)
    setUploaded(false)

    toast(
      `${prepared.length} photo${prepared.length > 1 ? 's' : ''} ready to upload.`
    )
  }

  // ==========================================
  // UPLOAD TO CLOUDFLARE R2
  // ==========================================

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!emailConfirmed) {
      toast('Check your registered email first.')
      return
    }

    if (cooldownActive) {
      toast(`You can upload again in ${formatRemaining(cooldownRemaining)}.`)
      return
    }

    if (!name.trim()) {
      toast('Please enter your name.')
      return
    }

    if (!caption.trim()) {
      toast('Please add a caption.')
      return
    }

    if (photos.length < 1 || photos.length > maxUploads) {
      toast(`Please select 1 to ${maxUploads} photos.`)
      return
    }

    const form = new FormData()

    form.append('email', normalizedEmail)
    form.append('name', name.trim())
    form.append('caption', caption.trim())

    photos.forEach(photo => {
      form.append('photos', photo.file, photo.file.name)
    })

    setBusy(true)
    setUploaded(false)

    const token = localStorage.getItem('zen-cafe-customer-session-token-v1')
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const response = await fetch(`${API}/upload`, {
        method: 'POST',
        headers,
        body: form,
      })

      const data = await readApiResponse<UploadResponse>(response)

      if (!response.ok || !data.success) {
        if (data.nextUploadAt) {
          setNextUploadAt(data.nextUploadAt)
        }

        throw new Error(data.message || 'Photo upload failed.')
      }

      setNextUploadAt(data.nextUploadAt || null)
      setNow(Date.now())

      setName('')
      setCaption('')
      clearPhotos()

      setUploaded(true)

      toast(
        'Photos uploaded successfully. They will appear after admin approval.'
      )

      window.setTimeout(() => {
        setUploaded(false)
      }, 5000)
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : 'Unable to upload photos. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  // ==========================================
  // CAROUSEL
  // ==========================================

  function openLightbox(post: Post) {
    setLightboxClosing(false)
    setLightbox(post)
  }

  function closeLightbox() {
    if (!lightbox || lightboxClosing) return

    setLightboxClosing(true)

    window.setTimeout(() => {
      setLightbox(null)
      setLightboxClosing(false)
    }, 280)
  }

  function nav(direction: 1 | -1) {
    if (posts.length <= 1 || navLock.current) return

    navLock.current = true
    setPaused(true)

    setActive(current =>
      (current + direction + posts.length) % posts.length
    )

    window.setTimeout(() => {
      navLock.current = false
    }, 760)

    if (resumeTimer.current) {
      window.clearTimeout(resumeTimer.current)
    }

    resumeTimer.current = window.setTimeout(() => {
      setPaused(false)
    }, 1500)
  }

  function goTo(index: number) {
    if (index === active || navLock.current) return

    navLock.current = true
    setPaused(true)
    setActive(index)

    window.setTimeout(() => {
      navLock.current = false
    }, 760)

    if (resumeTimer.current) {
      window.clearTimeout(resumeTimer.current)
    }

    resumeTimer.current = window.setTimeout(() => {
      setPaused(false)
    }, 1500)
  }

  function like(id: string) {
    const current = posts.find(post => post.id === id)
    if (!current) return

    const wasLiked = Boolean(likedIds[id])

    const nextCount = Math.max(
      0,
      (current.likes || 0) + (wasLiked ? -1 : 1)
    )

    setPosts(previous =>
      previous.map(post =>
        post.id === id
          ? { ...post, likes: nextCount }
          : post
      )
    )

    setLikedIds(previous => ({
      ...previous,
      [id]: !wasLiked,
    }))

    const map = readLikeMap()

    map[id] = {
      count: nextCount,
      liked: !wasLiked,
    }

    saveLikeMap(map)
  }

  function role(index: number) {
    const count = posts.length

    if (!count) return 'back'

    const diff = (index - active + count) % count

    if (diff === 0) return 'center'
    if (diff === 1) return 'right'
    if (diff === count - 1) return 'left'

    return 'back'
  }

  function detectShape(id: string, width: number, height: number) {
    if (!width || !height) return

    const ratio = width / height

    const shape: PhotoShape =
      ratio < 0.82
        ? 'portrait'
        : ratio < 1.16
          ? 'square'
          : ratio > 1.85
            ? 'wide'
            : 'landscape'

    setPhotoShapes(previous =>
      previous[id] === shape
        ? previous
        : { ...previous, [id]: shape }
    )
  }

  const lightboxShape = lightbox
    ? photoShapes[lightbox.id] || 'landscape'
    : 'landscape'

  return (
    <section
      id="gallery"
      data-zen-reveal
      className="zen-gallery-section section-shell zen-reveal relative overflow-hidden bg-[#eee2d5]"
    >
      <div className="gallery-section-inner mx-auto max-w-[1500px] px-5 py-24 sm:px-10 lg:px-12">
        <div className="gallery-section-head mb-10 grid gap-6 lg:grid-cols-[1fr_.7fr] lg:items-end">
          <div>
            <p className="kicker">Guest Moments</p>
            <h2 className="section-title">
              Your Zen moments.
              <br />
              <span>Shared beautifully.</span>
            </h2>
          </div>

          <p className="section-copy lg:justify-self-end">
            Registered guests can share up to 2 photos immediately.
            After uploading, a 24-hour cooldown applies.
            Photos appear after approval.
          </p>
        </div>

        <div className="gallery-main-grid grid gap-7 xl:grid-cols-[.78fr_1.22fr]">
          <form
            onSubmit={submit}
            className="gallery-upload-form panel p-6 sm:p-8"
          >
            <div className="gallery-upload-head flex items-center gap-3">
              <div className="gallery-upload-icon grid h-12 w-12 place-items-center rounded-2xl bg-[#a32722] text-white">
                <UploadCloud size={21} />
              </div>

              <div>
                <p className="kicker">Share a Memory</p>
                <h3 className="font-serif text-[32px]">
                  Add your Zen moment
                </h3>
              </div>
            </div>

            <div className="gallery-access-card mt-6 rounded-[26px] border border-[#a32722]/10 bg-[#fff9f4]/86 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.75)]">
              <label className="field-label">
                Registered email address

                <div className="relative">
                  <Mail
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9b332d]"
                    size={16}
                  />

                  <input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={event =>
                      handleEmailChange(event.target.value)
                    }
                    className="field-input !pl-11"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </label>

              <button
                type="button"
                onClick={checkEmail}
                disabled={checking || busy}
                className="secondary-pill mt-3 !px-4 !py-3 disabled:opacity-50"
              >
                <ShieldCheck size={15} />

                {checking
                  ? 'Checking email...'
                  : emailConfirmed
                    ? 'Check again'
                    : 'Check registered email'}
              </button>

              <div
                className={`gallery-access-state mt-4 ${
                  canUpload ? 'is-ready' : ''
                } ${cooldownActive ? 'is-limit' : ''}`}
              >
                <div className="gallery-access-icon">
                  {cooldownActive ? (
                    <Clock3 size={18} />
                  ) : canUpload ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <LockKeyhole size={18} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-extrabold uppercase tracking-[.14em]">
                    {cooldownActive
                      ? '24-hour cooldown active'
                      : canUpload
                        ? 'Upload access ready'
                        : checking
                          ? 'Checking registration'
                          : 'Check your registered email'}
                  </p>

                  <p className="mt-1 text-[11px] leading-5 text-[#6c5c53]">
                    {cooldownActive
                      ? `Upload again in ${formatRemaining(cooldownRemaining)}.`
                      : canUpload
                        ? `Registered email found. You can upload up to ${maxUploads} photos now.`
                        : 'Enter your registered and verified email to check upload eligibility.'}
                  </p>
                </div>

                <span className="gallery-upload-count">
                  {photos.length}/{maxUploads}
                </span>
              </div>
            </div>

            <div className="gallery-upload-fields mt-5 grid gap-4 sm:grid-cols-2">
              <label className="field-label">
                Your name

                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  className="field-input"
                  placeholder="Enter your name"
                  maxLength={40}
                  disabled={!canUpload}
                  required
                />
              </label>

              <label className="field-label">
                Photos

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handlePhotoSelection}
                  disabled={!canUpload}
                  className="field-input file:mr-3 file:rounded-full file:border-0 file:bg-[#a32722] file:px-3 file:py-2 file:text-white disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
            </div>

            <label className="gallery-caption-field field-label mt-4">
              Caption

              <textarea
                value={caption}
                onChange={event => setCaption(event.target.value)}
                disabled={!canUpload}
                className="field-input min-h-[110px] resize-y disabled:cursor-not-allowed disabled:opacity-45"
                maxLength={160}
                placeholder="Write a short caption about your Zen moment…"
                required
              />
            </label>

            <div className="gallery-upload-preview mt-5 overflow-hidden rounded-[26px] border border-dashed border-[#a32722]/20 bg-[#fff8f1]">
              {photos.length > 0 ? (
                <div
                  className={`grid gap-2 p-3 ${
                    photos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
                  }`}
                >
                  {photos.map(photo => (
                    <div
                      key={photo.id}
                      className="relative overflow-hidden rounded-2xl bg-white"
                    >
                      <img
                        src={photo.preview}
                        alt={photo.file.name}
                        className="h-[250px] w-full object-contain"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid h-[250px] place-items-center text-center text-[#76675e]">
                  <div>
                    <ImagePlus className="mx-auto mb-3" size={29} />

                    <p className="text-sm">
                      Your photo preview appears here.
                    </p>

                    <p className="mt-1 text-[10px]">
                      Up to 2 photos · JPEG, PNG or WebP · 5 MB each
                    </p>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={busy || !canUpload || photos.length === 0}
              className="gallery-upload-submit primary-pill mt-5 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy
                ? 'Uploading...'
                : `Upload ${photos.length || ''} photo${photos.length === 1 ? '' : 's'}`}

              <Camera size={16} />
            </button>

            {uploaded && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#2f7d55]/15 bg-[#eaf6ef] px-4 py-3 text-[11px] font-semibold text-[#315b46]">
                <CheckCircle2 size={17} />
                Photos uploaded successfully. Waiting for admin approval.
              </div>
            )}
          </form>

          <div
            className="gallery-carousel-shell"
            onTouchStart={event => {
              touch.current = event.changedTouches[0].clientX
            }}
            onTouchEnd={event => {
              if (touch.current === null) return

              const dx =
                event.changedTouches[0].clientX - touch.current

              touch.current = null

              if (Math.abs(dx) > 45) {
                nav(dx < 0 ? 1 : -1)
              }
            }}
          >
            <div className="gallery-carousel-head">
              <div>
                <p className="kicker">Guest Stories</p>
                <h3 className="font-serif text-[31px]">
                  Moments from our guests
                </h3>
              </div>

              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#8b7469]">
                  Auto slide
                </p>

                <p className="mt-1 text-[11px] text-[#6d5c53]">
                  {seed.length} sample photos · {guestUploads} approved guest uploads
                </p>
              </div>
            </div>

            <div className="gallery-carousel-stage">
              <div className="gallery-carousel-aura" />

              {posts.map((post, index) => {
                const shape = photoShapes[post.id] || 'landscape'

                return (
                  <article
                    key={post.id}
                    className={`gallery-slide gallery-slide-${role(index)} gallery-shape-${shape}`}
                    aria-hidden={role(index) !== 'center'}
                  >
                    <button
                      type="button"
                      onClick={() => openLightbox(post)}
                      className="gallery-slide-media gallery-photo-trigger"
                    >
                      <img
                        src={post.image}
                        alt=""
                        aria-hidden="true"
                        className="gallery-slide-backdrop"
                        loading={role(index) === 'center' ? 'eager' : 'lazy'}
                      />

                      <img
                        src={post.image}
                        alt={post.caption}
                        className="gallery-slide-photo"
                        loading={role(index) === 'center' ? 'eager' : 'lazy'}
                        onLoad={event =>
                          detectShape(
                            post.id,
                            event.currentTarget.naturalWidth,
                            event.currentTarget.naturalHeight
                          )
                        }
                        onError={event => {
                          event.currentTarget.style.display = 'none'
                        }}
                      />

                      <span
                        className="gallery-slide-shine"
                        aria-hidden="true"
                      />

                      <span className="gallery-slide-view">
                        View photo
                      </span>
                    </button>

                    <div className="gallery-slide-info">
                      <div>
                        <p className="gallery-slide-kicker">
                          {post.local ? 'Guest upload' : 'Zen gallery'}
                        </p>

                        <h4>{post.user}</h4>
                        <p>{post.caption}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => like(post.id)}
                        className={`zen-glass-mini gallery-like-button inline-flex items-center gap-1 rounded-full px-3 py-2 text-[10px] text-[#a32722] ${
                          likedIds[post.id] ? 'is-liked' : ''
                        }`}
                        aria-label={
                          likedIds[post.id]
                            ? 'Unlike photo'
                            : 'Like photo'
                        }
                      >
                        <Heart
                          size={13}
                          fill={
                            likedIds[post.id]
                              ? 'currentColor'
                              : 'none'
                          }
                        />
                        {post.likes || 0}
                      </button>
                    </div>
                  </article>
                )
              })}

              <div className="gallery-carousel-controls">
                <button
                  type="button"
                  onClick={() => nav(-1)}
                  className="round-control"
                  aria-label="Previous photo"
                >
                  <ArrowLeft size={19} />
                </button>

                <div className="gallery-carousel-dots">
                  {posts.map((post, index) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => goTo(index)}
                      className={index === active ? 'is-active' : ''}
                      aria-label={`Go to photo ${index + 1}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => nav(1)}
                  className="round-control"
                  aria-label="Next photo"
                >
                  <ArrowRight size={19} />
                </button>
              </div>

              <div
                className={`gallery-autoplay-indicator ${
                  paused ? 'is-paused' : ''
                }`}
              >
                <span />
                <small>{paused ? 'Paused' : 'Auto loop'}</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="gallery-to-footer-fade" aria-hidden="true" />

      {lightbox &&
        createPortal(
          <div
            onClick={closeLightbox}
            className={`gallery-lightbox-backdrop gallery-lightbox-portal ${
              lightboxClosing ? 'is-closing' : ''
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Guest photo preview"
          >
            <div className="gallery-lightbox-glow" />

            <div
              onClick={event => event.stopPropagation()}
              className={`gallery-lightbox-panel gallery-lightbox-${lightboxShape} ${
                lightboxClosing ? 'is-closing' : ''
              }`}
            >
              <button
                type="button"
                onClick={closeLightbox}
                className="gallery-lightbox-close zen-glass-dark"
                aria-label="Close photo viewer"
              >
                <X size={19} />
              </button>

              <div className="gallery-lightbox-media">
                <div
                  className="gallery-lightbox-media-aura"
                  aria-hidden="true"
                />

                <img
                  src={lightbox.image}
                  alt={lightbox.caption}
                  className="gallery-lightbox-image"
                  onLoad={event =>
                    detectShape(
                      lightbox.id,
                      event.currentTarget.naturalWidth,
                      event.currentTarget.naturalHeight
                    )
                  }
                />

                <div className="gallery-lightbox-sheen" />
              </div>

              <div className="gallery-lightbox-info">
                <div>
                  <p className="gallery-lightbox-kicker">
                    {lightbox.local ? 'Guest moment' : 'Zen moments'}
                  </p>

                  <h4>{lightbox.user}</h4>
                  <p>{lightbox.caption}</p>
                </div>

                <button
                  type="button"
                  onClick={() => like(lightbox.id)}
                  className={`gallery-lightbox-like ${
                    likedIds[lightbox.id] ? 'is-liked' : ''
                  }`}
                  aria-label={
                    likedIds[lightbox.id]
                      ? 'Unlike photo'
                      : 'Like photo'
                  }
                >
                  <Heart
                    size={14}
                    fill={
                      likedIds[lightbox.id]
                        ? 'currentColor'
                        : 'none'
                    }
                  />
                  {lightbox.likes || 0}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  )
}
