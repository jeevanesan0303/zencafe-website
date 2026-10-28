
import {
  type ChangeEvent,
  type FormEvent,
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

type Post = {
  id: string
  user: string
  caption: string
  image: string
  likes: number
  createdAt?: number
}

type PhotoShape = 'portrait' | 'square' | 'landscape' | 'wide'

type AccessResponse = {
  success: boolean
  registered?: boolean
  verified?: boolean
  canUpload?: boolean
  maxUploads?: number
  nextUploadAt?: string | null
  message?: string
  error?: string
}

type UploadResponse = {
  success: boolean
  message?: string
  error?: string
  uploadedCount?: number
  nextUploadAt?: string | null
  details?: {
    nextUploadAt?: string
  }
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
  createdAt?: string | number
  created_at?: string
  likes?: number
}

type PublicResponse = {
  success: boolean
  photos?: PublicPhoto[]
  message?: string
  error?: string
}

type SelectedPhoto = {
  id: string
  file: File
  preview: string
}

type LikeRecord = {
  count: number
  liked: boolean
}

const API = '/api/gallery'
const MAX_PHOTOS = 2
const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_BATCH_SIZE = 14 * 1024 * 1024
const AUTO_SLIDE_MS = 3800

const LIKES_KEY = 'zen-cafe-gallery-likes-v124'
const CUSTOMER_PROFILE_KEY =
  'zen-cafe-customer-registration-v149'

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function emailLooksValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    normalizeEmail(value),
  )
}

function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  return [hours, minutes, remainingSeconds]
    .map(value => String(value).padStart(2, '0'))
    .join(':')
}

function readLikeMap(): Record<string, LikeRecord> {
  try {
    const raw = localStorage.getItem(LIKES_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return {}
    }

    return parsed as Record<string, LikeRecord>
  } catch {
    return {}
  }
}

function saveLikeMap(
  map: Record<string, LikeRecord>,
): void {
  try {
    localStorage.setItem(LIKES_KEY, JSON.stringify(map))
  } catch {
    // Likes are stored locally and are optional.
  }
}

async function readApiResponse<T>(
  response: Response,
): Promise<T> {
  const contentType =
    response.headers.get('content-type') || ''

  if (!contentType.includes('application/json')) {
    throw new Error(
      'The gallery service is unavailable. Please try again.',
    )
  }

  return response.json() as Promise<T>
}

function getErrorMessage(
  data: {
    message?: string
    error?: string
  },
  fallback: string,
): string {
  return data.message || data.error || fallback
}

function parseTimestamp(
  value: string | number | undefined,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  const timestamp =
    typeof value === 'number'
      ? value
      : /^\d+$/.test(value)
        ? Number(value)
        : new Date(value).getTime()

  return Number.isFinite(timestamp)
    ? timestamp
    : undefined
}

function normalizePublicPhotos(
  photos: PublicPhoto[],
): Post[] {
  const likes = readLikeMap()

  return photos
    .filter(photo =>
      Boolean(
        photo.imageUrl ||
          photo.image_url ||
          photo.image,
      ),
    )
    .map(photo => {
      const id = String(photo.id)

      return {
        id,
        user:
          photo.user ||
          photo.name ||
          photo.title ||
          'Zen Guest',
        caption:
          photo.caption ||
          photo.description ||
          '',
        image:
          photo.imageUrl ||
          photo.image_url ||
          photo.image ||
          '',
        likes:
          likes[id]?.count ??
          Number(photo.likes ?? 0),
        createdAt: parseTimestamp(
          photo.createdAt ?? photo.created_at,
        ),
      }
    })
}

export default function CommunityGallery({
  toast,
}: {
  toast: (message: string) => void
}) {
  const [posts, setPosts] = useState<Post[]>([])
  const [galleryLoading, setGalleryLoading] =
    useState(true)
  const [galleryError, setGalleryError] =
    useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [caption, setCaption] = useState('')

  const [photos, setPhotos] =
    useState<SelectedPhoto[]>([])

  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploaded, setUploaded] = useState(false)

  const [checkedEmail, setCheckedEmail] =
    useState('')
  const [registered, setRegistered] =
    useState(false)
  const [eligible, setEligible] = useState(false)

  const [maxUploads, setMaxUploads] =
    useState(MAX_PHOTOS)

  const [nextUploadAt, setNextUploadAt] =
    useState<string | null>(null)

  const [now, setNow] = useState(Date.now())

  const [lightbox, setLightbox] =
    useState<Post | null>(null)
  const [lightboxClosing, setLightboxClosing] =
    useState(false)

  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  const [photoShapes, setPhotoShapes] = useState<
    Record<string, PhotoShape>
  >({})

  const [likedIds, setLikedIds] = useState<
    Record<string, boolean>
  >(() => {
    const map = readLikeMap()

    return Object.fromEntries(
      Object.entries(map)
        .filter(([, value]) => value.liked)
        .map(([id]) => [id, true]),
    )
  })

  const touch = useRef<number | null>(null)
  const navLock = useRef(false)
  const resumeTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef<SelectedPhoto[]>([])
  const checkRequestId = useRef(0)
  const mounted = useRef(true)

  const normalizedEmail = normalizeEmail(email)

  const cooldownRemaining = nextUploadAt
    ? Math.max(
        0,
        new Date(nextUploadAt).getTime() - now,
      )
    : 0

  const cooldownActive = cooldownRemaining > 0

  const emailConfirmed =
    registered &&
    checkedEmail === normalizedEmail &&
    emailLooksValid(normalizedEmail)

  const canUpload =
    emailConfirmed &&
    eligible &&
    !cooldownActive &&
    !busy &&
    !checking &&
    maxUploads > 0

  const guestUploads = posts.length

  const lightboxShape = lightbox
    ? photoShapes[lightbox.id] || 'landscape'
    : 'landscape'

  const galleryStatus = useMemo(() => {
    if (galleryLoading) {
      return 'Loading guest moments...'
    }

    if (galleryError) {
      return 'Gallery temporarily unavailable'
    }

    if (guestUploads === 0) {
      return 'No guest photos yet'
    }

    return `${guestUploads} guest ${
      guestUploads === 1 ? 'photo' : 'photos'
    }`
  }, [
    galleryLoading,
    galleryError,
    guestUploads,
  ])

  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  useEffect(() => {
    mounted.current = true

    return () => {
      mounted.current = false

      photosRef.current.forEach(photo => {
        URL.revokeObjectURL(photo.preview)
      })

      if (resumeTimer.current !== null) {
        window.clearTimeout(resumeTimer.current)
      }

      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  // Saved details are used only to prefill the form.
  // They never grant gallery upload permission.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(
        CUSTOMER_PROFILE_KEY,
      )

      if (!raw) return

      const profile = JSON.parse(raw) as {
        email?: string
        name?: string
      }

      if (profile.email) {
        setEmail(profile.email)
      }

      if (profile.name) {
        setName(profile.name)
      }
    } catch {
      // Continue with an empty form.
    }
  }, [])

  async function loadApprovedPhotos(
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) return

    setGalleryLoading(true)
    setGalleryError('')

    try {
      const response = await fetch(`${API}/public`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal,
      })

      const data =
        await readApiResponse<PublicResponse>(response)

      if (!response.ok || !data.success) {
        throw new Error(
          getErrorMessage(
            data,
            'Unable to load gallery photos.',
          ),
        )
      }

      if (!Array.isArray(data.photos)) {
        throw new Error('Invalid gallery response.')
      }

      if (signal?.aborted || !mounted.current) {
        return
      }

      setPosts(normalizePublicPhotos(data.photos))
      setActive(0)
    } catch (error) {
      if (signal?.aborted || !mounted.current) {
        return
      }

      setGalleryError(
        error instanceof Error
          ? error.message
          : 'Unable to load gallery photos.',
      )
    } finally {
      if (!signal?.aborted && mounted.current) {
        setGalleryLoading(false)
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    void loadApprovedPhotos(controller.signal)

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (
      posts.length <= 1 ||
      paused ||
      lightbox
    ) {
      return
    }

    const timer = window.setInterval(() => {
      setActive(current =>
        (current + 1) % posts.length,
      )
    }, AUTO_SLIDE_MS)

    return () => window.clearInterval(timer)
  }, [posts.length, paused, lightbox])

  useEffect(() => {
    if (active >= posts.length) {
      setActive(0)
    }
  }, [active, posts.length])

  useEffect(() => {
    if (!lightbox) return

    const previousOverflow =
      document.body.style.overflow

    document.body.style.overflow = 'hidden'
    document.body.classList.add(
      'zen-gallery-lightbox-open',
    )

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeLightbox()
      }
    }

    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow =
        previousOverflow

      document.body.classList.remove(
        'zen-gallery-lightbox-open',
      )

      window.removeEventListener(
        'keydown',
        onKey,
      )
    }
  }, [lightbox])

  function clearPhotos(): void {
    photosRef.current.forEach(photo => {
      URL.revokeObjectURL(photo.preview)
    })

    photosRef.current = []
    setPhotos([])

    if (fileRef.current) {
      fileRef.current.value = ''
    }
  }

  function resetAccess(): void {
    checkRequestId.current += 1

    setRegistered(false)
    setEligible(false)
    setCheckedEmail('')
    setNextUploadAt(null)
    setMaxUploads(MAX_PHOTOS)
    setUploaded(false)

    clearPhotos()
  }

  function handleEmailChange(value: string): void {
    if (busy) return

    setEmail(value)

    if (normalizeEmail(value) !== checkedEmail) {
      resetAccess()
    }
  }

  // Registered email is checked directly with PostgreSQL
  // through the backend. No customer session is required.
  async function checkEmail(): Promise<void> {
    if (checking || busy) return

    if (!emailLooksValid(email)) {
      toast('Please enter a valid email address.')
      emailRef.current?.focus()
      return
    }

    const targetEmail = normalizeEmail(email)
    const requestId = ++checkRequestId.current

    setChecking(true)
    setRegistered(false)
    setEligible(false)
    setCheckedEmail('')
    setUploaded(false)

    try {
      const response = await fetch(
        `${API}/check-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            email: targetEmail,
          }),
        },
      )

      const data =
        await readApiResponse<AccessResponse>(response)

      if (
        !mounted.current ||
        requestId !== checkRequestId.current
      ) {
        return
      }

      if (!response.ok || !data.success) {
        throw new Error(
          getErrorMessage(
            data,
            'Unable to check your email.',
          ),
        )
      }

      if (!data.registered) {
        resetAccess()

        toast(
          'Email not found or not verified. Please register and verify your email first.',
        )
        return
      }

      const allowedCount = Math.max(
        0,
        Math.min(
          MAX_PHOTOS,
          Number(data.maxUploads ?? MAX_PHOTOS),
        ),
      )

      setRegistered(true)
      setCheckedEmail(targetEmail)
      setMaxUploads(allowedCount)
      setNextUploadAt(data.nextUploadAt || null)
      setNow(Date.now())
      setEligible(Boolean(data.canUpload))

      if (data.canUpload) {
        toast(
          'Registered email verified. You can now upload your photos.',
        )
      } else {
        toast(
          data.message ||
            'Photo uploads are not available yet.',
        )
      }
    } catch (error) {
      if (
        !mounted.current ||
        requestId !== checkRequestId.current
      ) {
        return
      }

      resetAccess()

      toast(
        error instanceof Error
          ? error.message
          : 'Unable to check your email.',
      )
    } finally {
      if (
        mounted.current &&
        requestId === checkRequestId.current
      ) {
        setChecking(false)
      } else if (mounted.current) {
        setChecking(false)
      }
    }
  }

  function handlePhotoSelection(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const selected = Array.from(
      event.target.files || [],
    )

    if (!canUpload) {
      toast(
        'Please check your registered email first.',
      )
      event.target.value = ''
      return
    }

    if (selected.length === 0) return

    if (selected.length > maxUploads) {
      toast(
        `Please select a maximum of ${maxUploads} photos.`,
      )
      event.target.value = ''
      return
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ]

    let totalSize = 0

    for (const file of selected) {
      if (!allowedTypes.includes(file.type)) {
        toast(
          'Only JPEG, PNG and WebP photos are supported.',
        )
        event.target.value = ''
        return
      }

      if (
        file.size === 0 ||
        file.size > MAX_FILE_SIZE
      ) {
        toast(
          'Each photo must be between 1 byte and 5 MB.',
        )
        event.target.value = ''
        return
      }

      totalSize += file.size
    }

    if (totalSize > MAX_BATCH_SIZE) {
      toast('The selected photos are too large.')
      event.target.value = ''
      return
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
      `${prepared.length} ${
        prepared.length === 1
          ? 'photo is'
          : 'photos are'
      } ready to upload.`,
    )
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()

    if (busy || checking) return

    if (!emailConfirmed || !eligible) {
      toast(
        'Please check your registered email first.',
      )
      return
    }

    if (cooldownActive) {
      toast(
        `You can upload again in ${formatRemaining(
          cooldownRemaining,
        )}.`,
      )
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

    if (
      photos.length < 1 ||
      photos.length > maxUploads
    ) {
      toast(
        `Please select 1 to ${maxUploads} photos.`,
      )
      return
    }

    const form = new FormData()

    form.append('email', normalizedEmail)
    form.append('name', name.trim())
    form.append('caption', caption.trim())

    photos.forEach(photo => {
      form.append(
        'photos',
        photo.file,
        photo.file.name,
      )
    })

    setBusy(true)
    setUploaded(false)

    try {
      // No Authorization header.
      // No customer session token.
      // Server checks the registered email directly.
      const response = await fetch(
        `${API}/upload`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
          },
          body: form,
        },
      )

      const data =
        await readApiResponse<UploadResponse>(response)

      if (!response.ok || !data.success) {
        const cooldownDate =
          data.nextUploadAt ||
          data.details?.nextUploadAt

        if (cooldownDate) {
          setNextUploadAt(cooldownDate)
          setNow(Date.now())
          setEligible(false)
        }

        throw new Error(
          getErrorMessage(
            data,
            'Photo upload failed.',
          ),
        )
      }

      setNextUploadAt(data.nextUploadAt || null)
      setNow(Date.now())
      setEligible(false)

      setCaption('')
      clearPhotos()
      setUploaded(true)

      toast(
        'Photos uploaded successfully! Your photos are now visible in the Community Gallery.',
      )

      // Immediately reload published photos.
      await loadApprovedPhotos()
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : 'Unable to upload photos. Please try again.',
      )
    } finally {
      if (mounted.current) {
        setBusy(false)
      }
    }
  }

  function openLightbox(post: Post): void {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
    }

    setLightboxClosing(false)
    setLightbox(post)
  }

  function closeLightbox(): void {
    if (!lightbox || lightboxClosing) return

    setLightboxClosing(true)

    closeTimer.current = window.setTimeout(() => {
      setLightbox(null)
      setLightboxClosing(false)
      closeTimer.current = null
    }, 280)
  }

  function nav(direction: 1 | -1): void {
    if (
      posts.length <= 1 ||
      navLock.current
    ) {
      return
    }

    navLock.current = true
    setPaused(true)

    setActive(current =>
      (current + direction + posts.length) %
      posts.length,
    )

    window.setTimeout(() => {
      navLock.current = false
    }, 760)

    if (resumeTimer.current !== null) {
      window.clearTimeout(resumeTimer.current)
    }

    resumeTimer.current = window.setTimeout(() => {
      setPaused(false)
    }, 1500)
  }

  function goTo(index: number): void {
    if (
      index === active ||
      navLock.current
    ) {
      return
    }

    navLock.current = true
    setPaused(true)
    setActive(index)

    window.setTimeout(() => {
      navLock.current = false
    }, 760)

    if (resumeTimer.current !== null) {
      window.clearTimeout(resumeTimer.current)
    }

    resumeTimer.current = window.setTimeout(() => {
      setPaused(false)
    }, 1500)
  }

  function like(id: string): void {
    const current = posts.find(
      post => post.id === id,
    )

    if (!current) return

    const wasLiked = Boolean(likedIds[id])

    const nextCount = Math.max(
      0,
      current.likes + (wasLiked ? -1 : 1),
    )

    setPosts(previous =>
      previous.map(post =>
        post.id === id
          ? {
              ...post,
              likes: nextCount,
            }
          : post,
      ),
    )

    setLightbox(previous =>
      previous?.id === id
        ? {
            ...previous,
            likes: nextCount,
          }
        : previous,
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

  function role(index: number): string {
    const count = posts.length

    if (!count) return 'back'

    const diff =
      (index - active + count) % count

    if (diff === 0) return 'center'
    if (diff === 1) return 'right'
    if (diff === count - 1) return 'left'

    return 'back'
  }

  function detectShape(
    id: string,
    width: number,
    height: number,
  ): void {
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
        : {
            ...previous,
            [id]: shape,
          },
    )
  }

  return (
    <section
      id="gallery"
      data-zen-reveal
      className="zen-gallery-section section-shell zen-reveal relative overflow-hidden bg-[#eee2d5]"
    >
      <div className="gallery-section-inner mx-auto max-w-[1500px] px-5 py-24 sm:px-10 lg:px-12">
        <div className="gallery-section-head mb-10 grid gap-6 lg:grid-cols-[1fr_.7fr] lg:items-end">
          <div>
            <p className="kicker">
              Guest Moments
            </p>

            <h2 className="section-title">
              Your Zen moments.
              <br />
              <span>Shared beautifully.</span>
            </h2>
          </div>

          <p className="section-copy lg:justify-self-end">
            Registered and verified guests can share up
            to two photos. Your photos appear immediately
            after a successful upload. You can upload
            again after 24 hours.
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
                <p className="kicker">
                  Share a Memory
                </p>

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
                      handleEmailChange(
                        event.target.value,
                      )
                    }
                    className="field-input !pl-11"
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={busy}
                    required
                  />
                </div>
              </label>

              <button
                type="button"
                onClick={() => {
                  void checkEmail()
                }}
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
                } ${
                  cooldownActive ? 'is-limit' : ''
                }`}
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
                      ? `Upload again in ${formatRemaining(
                          cooldownRemaining,
                        )}.`
                      : canUpload
                        ? `Your email is verified. Upload up to ${maxUploads} photos.`
                        : emailConfirmed
                          ? 'Uploads are not available for this email yet.'
                          : 'Enter your registered email and check eligibility.'}
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
                  onChange={event =>
                    setName(event.target.value)
                  }
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
                onChange={event =>
                  setCaption(event.target.value)
                }
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
                    photos.length > 1
                      ? 'grid-cols-2'
                      : 'grid-cols-1'
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
                    <ImagePlus
                      className="mx-auto mb-3"
                      size={29}
                    />

                    <p className="text-sm">
                      Your photo preview appears here.
                    </p>

                    <p className="mt-1 text-[10px]">
                      Up to 2 photos · JPEG, PNG or WebP ·
                      5 MB each
                    </p>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={
                busy ||
                !canUpload ||
                photos.length === 0
              }
              className="gallery-upload-submit primary-pill mt-5 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy
                ? 'Uploading...'
                : `Upload ${
                    photos.length || ''
                  } photo${
                    photos.length === 1 ? '' : 's'
                  }`}

              <Camera size={16} />
            </button>

            {uploaded && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#2f7d55]/15 bg-[#eaf6ef] px-4 py-3 text-[11px] font-semibold text-[#315b46]">
                <CheckCircle2 size={17} />
                Photos uploaded successfully and
                published to the Community Gallery.
              </div>
            )}
          </form>

          <div
            className="gallery-carousel-shell"
            onTouchStart={event => {
              touch.current =
                event.changedTouches[0].clientX
            }}
            onTouchEnd={event => {
              if (touch.current === null) return

              const dx =
                event.changedTouches[0].clientX -
                touch.current

              touch.current = null

              if (Math.abs(dx) > 45) {
                nav(dx < 0 ? 1 : -1)
              }
            }}
          >
            <div className="gallery-carousel-head">
              <div>
                <p className="kicker">
                  Guest Stories
                </p>

                <h3 className="font-serif text-[31px]">
                  Moments from our guests
                </h3>
              </div>

              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#8b7469]">
                  Community Gallery
                </p>

                <p className="mt-1 text-[11px] text-[#6d5c53]">
                  {galleryStatus}
                </p>
              </div>
            </div>

            <div className="gallery-carousel-stage">
              <div className="gallery-carousel-aura" />

              {posts.length === 0 && (
                <div className="relative z-10 flex min-h-[380px] items-center justify-center px-6 text-center">
                  <div className="max-w-sm">
                    <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-white/70 text-[#a32722] shadow-sm">
                      {galleryLoading ? (
                        <Clock3 size={28} />
                      ) : (
                        <ImagePlus size={28} />
                      )}
                    </div>

                    <h4 className="font-serif text-2xl text-[#6d342c]">
                      {galleryLoading
                        ? 'Loading guest moments'
                        : galleryError
                          ? 'Unable to load photos'
                          : 'Your moments belong here'}
                    </h4>

                    <p className="mt-3 text-sm leading-6 text-[#806f64]">
                      {galleryLoading
                        ? 'Please wait while we load the gallery.'
                        : galleryError
                          ? galleryError
                          : 'No guest photos yet. Be among the first to share a Zen moment.'}
                    </p>

                    {galleryError && (
                      <button
                        type="button"
                        onClick={() => {
                          void loadApprovedPhotos()
                        }}
                        className="secondary-pill mt-5 !px-5 !py-3"
                      >
                        Try again
                      </button>
                    )}
                  </div>
                </div>
              )}

              {posts.map((post, index) => {
                const shape =
                  photoShapes[post.id] ||
                  'landscape'

                const position = role(index)

                return (
                  <article
                    key={post.id}
                    className={`gallery-slide gallery-slide-${position} gallery-shape-${shape}`}
                    aria-hidden={
                      position !== 'center'
                    }
                  >
                    <button
                      type="button"
                      onClick={() =>
                        openLightbox(post)
                      }
                      className="gallery-slide-media gallery-photo-trigger"
                      aria-label={`View photo by ${post.user}`}
                    >
                      <img
                        src={post.image}
                        alt=""
                        aria-hidden="true"
                        className="gallery-slide-backdrop"
                        loading={
                          position === 'center'
                            ? 'eager'
                            : 'lazy'
                        }
                      />

                      <img
                        src={post.image}
                        alt={post.caption}
                        className="gallery-slide-photo"
                        loading={
                          position === 'center'
                            ? 'eager'
                            : 'lazy'
                        }
                        onLoad={event => {
                          detectShape(
                            post.id,
                            event.currentTarget.naturalWidth,
                            event.currentTarget.naturalHeight,
                          )
                        }}
                        onError={event => {
                          event.currentTarget.style.display =
                            'none'
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
                          Guest moment
                        </p>

                        <h4>{post.user}</h4>
                        <p>{post.caption}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          like(post.id)
                        }
                        className={`zen-glass-mini gallery-like-button inline-flex items-center gap-1 rounded-full px-3 py-2 text-[10px] text-[#a32722] ${
                          likedIds[post.id]
                            ? 'is-liked'
                            : ''
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

                        {post.likes}
                      </button>
                    </div>
                  </article>
                )
              })}

              {posts.length > 1 && (
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
                        onClick={() =>
                          goTo(index)
                        }
                        className={
                          index === active
                            ? 'is-active'
                            : ''
                        }
                        aria-label={`Go to photo ${
                          index + 1
                        }`}
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
              )}

              {posts.length > 1 && (
                <div
                  className={`gallery-autoplay-indicator ${
                    paused ? 'is-paused' : ''
                  }`}
                >
                  <span />

                  <small>
                    {paused
                      ? 'Paused'
                      : 'Auto loop'}
                  </small>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="gallery-to-footer-fade"
        aria-hidden="true"
      />

      {lightbox &&
        createPortal(
          <div
            onClick={closeLightbox}
            className={`gallery-lightbox-backdrop gallery-lightbox-portal ${
              lightboxClosing
                ? 'is-closing'
                : ''
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Guest photo preview"
          >
            <div className="gallery-lightbox-glow" />

            <div
              onClick={event =>
                event.stopPropagation()
              }
              className={`gallery-lightbox-panel gallery-lightbox-${lightboxShape} ${
                lightboxClosing
                  ? 'is-closing'
                  : ''
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
                  onLoad={event => {
                    detectShape(
                      lightbox.id,
                      event.currentTarget.naturalWidth,
                      event.currentTarget.naturalHeight,
                    )
                  }}
                />

                <div className="gallery-lightbox-sheen" />
              </div>

              <div className="gallery-lightbox-info">
                <div>
                  <p className="gallery-lightbox-kicker">
                    Guest moment
                  </p>

                  <h4>{lightbox.user}</h4>
                  <p>{lightbox.caption}</p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    like(lightbox.id)
                  }
                  className={`gallery-lightbox-like ${
                    likedIds[lightbox.id]
                      ? 'is-liked'
                      : ''
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

                  {lightbox.likes}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  )
}
