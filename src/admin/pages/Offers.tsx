
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type {
  ChangeEvent,
  FormEvent,
} from 'react'

import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Gift,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'

import type { AdminPage } from '../AdminApp'

import {
  readAdminOffers,
  loadAdminOffers,
  createAdminOffer,
  updateAdminOffer,
  deleteAdminOffer,
  subscribeAdminOffers,
  type AdminOffer,
} from '../../data/adminOfferStore'

import AdminAlert from '../utils/sweetAlert'

/* ==========================================
   TYPES
========================================== */

type Props = {
  onNavigate: (page: AdminPage) => void
  query?: string
}

type StatusFilter =
  | 'all'
  | 'active'
  | 'inactive'
  | 'expired'

type OfferDraft = {
  title: string
  description: string
  code: string
  discountType: 'percentage' | 'fixed'
  discountValue: string
  startDate: string
  endDate: string
  active: boolean
}

const EMPTY_DRAFT: OfferDraft = {
  title: '',
  description: '',
  code: '',
  discountType: 'percentage',
  discountValue: '',
  startDate: '',
  endDate: '',
  active: true,
}

/* ==========================================
   DATE HELPERS
========================================== */

function getToday(): string {
  const parts = new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }
  ).formatToParts(new Date())

  const year =
    parts.find(part => part.type === 'year')
      ?.value || ''

  const month =
    parts.find(part => part.type === 'month')
      ?.value || ''

  const day =
    parts.find(part => part.type === 'day')
      ?.value || ''

  return `${year}-${month}-${day}`
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00Z`)

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  )
}

function getOfferStatus(
  offer: AdminOffer
): 'active' | 'inactive' | 'scheduled' | 'expired' {
  const today = getToday()

  if (
    offer.endDate &&
    offer.endDate < today
  ) {
    return 'expired'
  }

  if (!offer.active) {
    return 'inactive'
  }

  if (
    offer.startDate &&
    offer.startDate > today
  ) {
    return 'scheduled'
  }

  return 'active'
}

function formatDiscount(offer: AdminOffer): string {
  const amount = Number(offer.discountValue) || 0

  return offer.discountType === 'percentage'
    ? `${amount}% OFF`
    : `LKR ${amount.toLocaleString('en-LK')} OFF`
}

function formatDate(value: string): string {
  if (!value) return '—'

  if (!isValidDate(value)) return value

  const date = new Date(`${value}T00:00:00Z`)

  return date.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getErrorMessage(
  error: unknown,
  fallback: string
): string {
  return error instanceof Error
    ? error.message
    : fallback
}

function getOfferDraft(
  offer: AdminOffer
): OfferDraft {
  return {
    title: offer.title || '',
    description: offer.description || '',
    code: offer.code || '',
    discountType: offer.discountType,
    discountValue: String(offer.discountValue),
    startDate: offer.startDate || '',
    endDate: offer.endDate || '',
    active: offer.active,
  }
}

/* ==========================================
   IMAGE PROCESSING
========================================== */

async function prepareOfferImage(
  file: File
): Promise<string> {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ]

  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      'Please upload a JPG, PNG or WebP image.'
    )
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error(
      'Image must be smaller than 5 MB.'
    )
  }

  const objectUrl = URL.createObjectURL(file)

  try {
    const image =
      await new Promise<HTMLImageElement>(
        (resolve, reject) => {
          const img = new Image()

          img.onload = () => resolve(img)

          img.onerror = () =>
            reject(
              new Error(
                'Unable to load the selected image.'
              )
            )

          img.src = objectUrl
        }
      )

    const canvas = document.createElement('canvas')

    const scale = Math.min(
      1,
      1000 /
        Math.max(
          image.naturalWidth,
          image.naturalHeight
        )
    )

    canvas.width = Math.max(
      1,
      Math.round(image.naturalWidth * scale)
    )

    canvas.height = Math.max(
      1,
      Math.round(image.naturalHeight * scale)
    )

    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error(
        'Image processing is unavailable.'
      )
    }

    context.fillStyle = '#ffffff'

    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    )

    context.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    )

    return canvas.toDataURL(
      'image/jpeg',
      0.68
    )
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/* ==========================================
   OFFERS COMPONENT
========================================== */

export default function Offers({
  onNavigate,
  query = '',
}: Props) {
  const [offers, setOffers] =
    useState<AdminOffer[]>(() => readAdminOffers())

  const [filter, setFilter] =
    useState<StatusFilter>('all')

  const [search, setSearch] = useState('')

  const [editing, setEditing] =
    useState<AdminOffer | null>(null)

  const [formOpen, setFormOpen] = useState(false)

  const [draft, setDraft] =
    useState<OfferDraft>({ ...EMPTY_DRAFT })

  const [offerImage, setOfferImage] = useState('')
  const [imageError, setImageError] = useState('')
  const [imageLoading, setImageLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [busyId, setBusyId] =
    useState<string | null>(null)

  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')

  const [today, setToday] = useState(getToday)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageRequestRef = useRef(0)
  const formLockRef = useRef(false)

  /* ==========================================
     DATA SYNCHRONIZATION
  ========================================== */

  useEffect(() => {
    let mounted = true

    const sync = () => {
      if (mounted) {
        setOffers(readAdminOffers())
        setToday(getToday())
      }
    }

    const refresh = () => {
      setToday(getToday())

      void loadAdminOffers()
        .then(items => {
          if (mounted) {
            setOffers(items)
            setError('')
          }
        })
        .catch(caughtError => {
          if (mounted) {
            setError(
              getErrorMessage(
                caughtError,
                'Unable to refresh promotions.'
              )
            )
          }
        })
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }

    refresh()

    const unsubscribe = subscribeAdminOffers(sync)

    window.addEventListener('focus', refresh)

    document.addEventListener(
      'visibilitychange',
      onVisibilityChange
    )

    const interval = window.setInterval(
      refresh,
      60000
    )

    return () => {
      mounted = false
      unsubscribe()

      window.removeEventListener('focus', refresh)

      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange
      )

      window.clearInterval(interval)

      imageRequestRef.current += 1
    }
  }, [])

  /* ==========================================
     OFFER STATISTICS
  ========================================== */

  const stats = useMemo(() => {
    const statuses = offers.map(getOfferStatus)

    return {
      total: offers.length,
      active: statuses.filter(
        status => status === 'active'
      ).length,
      scheduled: statuses.filter(
        status => status === 'scheduled'
      ).length,
      expired: statuses.filter(
        status => status === 'expired'
      ).length,
    }
  }, [offers, today])

  /* ==========================================
     FILTERED OFFERS
  ========================================== */

  const filtered = useMemo(() => {
    const local = search.trim().toLowerCase()
    const global = query.trim().toLowerCase()

    return offers.filter(offer => {
      const status = getOfferStatus(offer)

      const matchesStatus =
        filter === 'all' ||
        (filter === 'inactive'
          ? status === 'inactive' ||
            status === 'scheduled'
          : status === filter)

      const text = [
        offer.title,
        offer.description,
        offer.code,
      ]
        .join(' ')
        .toLowerCase()

      return (
        matchesStatus &&
        (!local || text.includes(local)) &&
        (!global || text.includes(global))
      )
    })
  }, [offers, filter, search, query, today])

  /* ==========================================
     DATE RESTRICTIONS
  ========================================== */

  const minimumStartDate = today

  const minimumEndDate =
    draft.startDate && draft.startDate > today
      ? draft.startDate
      : today

  const hasHistoricalStartDate = Boolean(
    editing &&
    draft.startDate &&
    draft.startDate < today &&
    draft.startDate === editing.startDate
  )

  const hasHistoricalEndDate = Boolean(
    editing &&
    draft.endDate &&
    draft.endDate < today &&
    draft.endDate === editing.endDate
  )

  /* ==========================================
     UNSAVED CHANGES
  ========================================== */

  const hasUnsavedChanges = useMemo(() => {
    if (!formOpen) return false

    const originalDraft = editing
      ? getOfferDraft(editing)
      : EMPTY_DRAFT

    const originalImage = editing?.image || ''

    return (
      JSON.stringify(draft) !==
        JSON.stringify(originalDraft) ||
      offerImage !== originalImage
    )
  }, [formOpen, editing, draft, offerImage])

  /* ==========================================
     FORM RESET
  ========================================== */

  function resetForm() {
    imageRequestRef.current += 1

    setFormOpen(false)
    setEditing(null)
    setDraft({ ...EMPTY_DRAFT })
    setOfferImage('')
    setImageError('')
    setImageLoading(false)
    setFormError('')

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function closeForm() {
    if (saving || formLockRef.current) {
      return
    }

    formLockRef.current = true

    try {
      if (hasUnsavedChanges) {
        const confirmed = await AdminAlert.confirm(
          'Discard Offer Changes?',
          'You have unsaved promotion details. Closing this form will discard your changes.',
          'Yes, Discard'
        )

        if (!confirmed) return
      }

      resetForm()
    } finally {
      formLockRef.current = false
    }
  }

  /* ==========================================
     OPEN CREATE / EDIT
  ========================================== */

  function openCreate() {
    if (saving || busyId) return

    imageRequestRef.current += 1

    setToday(getToday())
    setEditing(null)
    setDraft({ ...EMPTY_DRAFT })
    setOfferImage('')
    setImageError('')
    setImageLoading(false)
    setFormError('')
    setFormOpen(true)
  }

  function openEdit(offer: AdminOffer) {
    if (saving || busyId) return

    imageRequestRef.current += 1

    setToday(getToday())
    setEditing(offer)
    setDraft(getOfferDraft(offer))
    setOfferImage(offer.image || '')
    setImageError('')
    setImageLoading(false)
    setFormError('')
    setFormOpen(true)
  }

  /* ==========================================
     UPDATE FORM FIELDS
  ========================================== */

  function updateDraft<K extends keyof OfferDraft>(
    key: K,
    value: OfferDraft[K]
  ) {
    setDraft(previous => ({
      ...previous,
      [key]: value,
    }))

    setFormError('')
  }

  function updateStartDate(value: string) {
    const currentToday = getToday()

    setToday(currentToday)

    if (value && !isValidDate(value)) {
      setFormError('Please select a valid start date.')
      return
    }

    if (value && value < currentToday) {
      setFormError(
        'Previous dates cannot be selected. Choose today or a future date.'
      )
      return
    }

    setDraft(previous => {
      const minimumEnd =
        value && value > currentToday
          ? value
          : currentToday

      return {
        ...previous,
        startDate: value,
        endDate:
          previous.endDate &&
          previous.endDate < minimumEnd
            ? ''
            : previous.endDate,
      }
    })

    setFormError('')
  }

  function updateEndDate(value: string) {
    const currentToday = getToday()

    setToday(currentToday)

    const minimum =
      draft.startDate &&
      draft.startDate > currentToday
        ? draft.startDate
        : currentToday

    if (value && !isValidDate(value)) {
      setFormError('Please select a valid end date.')
      return
    }

    if (value && value < minimum) {
      setFormError(
        'End date must be today or later and cannot be before the start date.'
      )
      return
    }

    setDraft(previous => ({
      ...previous,
      endDate: value,
    }))

    setFormError('')
  }

  /* ==========================================
     IMAGE UPLOAD
  ========================================== */

  async function handleOfferImage(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]

    if (!file || saving) return

    const requestId = ++imageRequestRef.current

    setImageLoading(true)
    setImageError('')

    event.target.value = ''

    try {
      const preparedImage =
        await prepareOfferImage(file)

      if (
        requestId !== imageRequestRef.current
      ) {
        return
      }

      setOfferImage(preparedImage)
      setFormError('')
    } catch (caughtError) {
      if (
        requestId !== imageRequestRef.current
      ) {
        return
      }

      const message = getErrorMessage(
        caughtError,
        'Unable to process the image.'
      )

      setImageError(message)

      await AdminAlert.warning(
        'Image Upload Failed',
        message
      )
    } finally {
      if (
        requestId === imageRequestRef.current
      ) {
        setImageLoading(false)
      }
    }
  }

  async function removeOfferImage() {
    if (!offerImage || saving || imageLoading) {
      return
    }

    const confirmed = await AdminAlert.confirm(
      'Remove Offer Image?',
      'The promotional image will be removed from this offer when you save your changes.',
      'Yes, Remove'
    )

    if (!confirmed) return

    imageRequestRef.current += 1

    setOfferImage('')
    setImageError('')
    setImageLoading(false)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  /* ==========================================
     VALIDATION ALERT
  ========================================== */

  async function showValidationError(
    title: string,
    message: string
  ) {
    setFormError(message)

    await AdminAlert.warning(title, message)
  }

  /* ==========================================
     CREATE / UPDATE OFFER
  ========================================== */

  async function saveOffer(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (saving || formLockRef.current) {
      return
    }

    if (imageLoading) {
      await showValidationError(
        'Image Processing',
        'Please wait until the image finishes processing.'
      )
      return
    }

    const title = draft.title.trim()

    const discountValue = Number(
      draft.discountValue
    )

    if (!title) {
      await showValidationError(
        'Offer Title Required',
        'Please enter an offer title.'
      )
      return
    }

    if (
      draft.discountValue.trim() === '' ||
      !Number.isFinite(discountValue) ||
      discountValue <= 0 ||
      (draft.discountType === 'percentage' &&
        discountValue > 100)
    ) {
      await showValidationError(
        'Invalid Discount',
        draft.discountType === 'percentage'
          ? 'Please enter a percentage greater than 0 and no more than 100.'
          : 'Please enter a valid discount amount in LKR.'
      )
      return
    }

    /* ======================================
       DATE VALIDATION
    ====================================== */

    const currentToday = getToday()

    setToday(currentToday)

    if (
      draft.startDate &&
      !isValidDate(draft.startDate)
    ) {
      await showValidationError(
        'Invalid Start Date',
        'Please select a valid start date.'
      )
      return
    }

    if (
      draft.endDate &&
      !isValidDate(draft.endDate)
    ) {
      await showValidationError(
        'Invalid End Date',
        'Please select a valid end date.'
      )
      return
    }

    const startDateChanged =
      !editing ||
      draft.startDate !== editing.startDate

    const endDateChanged =
      !editing ||
      draft.endDate !== editing.endDate

    if (
      draft.startDate &&
      draft.startDate < currentToday &&
      startDateChanged
    ) {
      await showValidationError(
        'Invalid Start Date',
        'Start date cannot be earlier than today. Please select today or a future date.'
      )
      return
    }

    if (
      draft.endDate &&
      draft.endDate < currentToday &&
      endDateChanged
    ) {
      await showValidationError(
        'Invalid End Date',
        'End date cannot be earlier than today.'
      )
      return
    }

    if (
      draft.startDate &&
      draft.endDate &&
      draft.endDate < draft.startDate
    ) {
      await showValidationError(
        'Invalid Offer Dates',
        'End date cannot be before the start date.'
      )
      return
    }

    /* ======================================
       SAVE THROUGH EXISTING API STORE
    ====================================== */

    const isEditing = Boolean(editing)

    const payload = {
      title,
      description: draft.description.trim(),
      code: draft.code.trim().toUpperCase(),
      discountType: draft.discountType,
      discountValue,
      startDate: draft.startDate,
      endDate: draft.endDate,
      active: draft.active,
      image: offerImage,
    }

    formLockRef.current = true
    setSaving(true)
    setFormError('')

    try {
      if (editing) {
        await updateAdminOffer(
          editing.id,
          payload
        )
      } else {
        await createAdminOffer(payload)
      }

      resetForm()
      setError('')

      if (isEditing) {
        await AdminAlert.offerUpdated()
      } else {
        await AdminAlert.offerAdded()
      }
    } catch (caughtError) {
      const message = getErrorMessage(
        caughtError,
        'Unable to save the offer.'
      )

      setFormError(message)

      await AdminAlert.error(
        isEditing
          ? 'Offer Update Failed'
          : 'Offer Creation Failed',
        message
      )
    } finally {
      setSaving(false)
      formLockRef.current = false
    }
  }

  /* ==========================================
     ENABLE / DISABLE
  ========================================== */

  async function toggleOffer(offer: AdminOffer) {
    if (busyId || saving) return

    const nextActive = !offer.active

    const confirmed = await AdminAlert.confirm(
      nextActive
        ? 'Enable Promotion?'
        : 'Disable Promotion?',
      nextActive
        ? `"${offer.title}" will be enabled. Its dates will still determine when it runs.`
        : `"${offer.title}" will be disabled and no longer be active.`,
      nextActive
        ? 'Yes, Enable'
        : 'Yes, Disable'
    )

    if (!confirmed) return

    setBusyId(offer.id)
    setError('')

    try {
      await updateAdminOffer(offer.id, {
        active: nextActive,
      })

      await AdminAlert.success(
        nextActive
          ? 'Promotion Enabled!'
          : 'Promotion Disabled!',
        `"${offer.title}" has been updated successfully.`
      )
    } catch (caughtError) {
      const message = getErrorMessage(
        caughtError,
        'Unable to change offer status.'
      )

      setError(message)

      await AdminAlert.error(
        'Status Update Failed',
        message
      )
    } finally {
      setBusyId(null)
    }
  }

  /* ==========================================
     DELETE OFFER
  ========================================== */

  async function deleteOffer(offer: AdminOffer) {
    if (busyId || saving) return

    const confirmed =
      await AdminAlert.confirmDelete(
        `"${offer.title}"`
      )

    if (!confirmed) return

    setBusyId(offer.id)
    setError('')

    try {
      await deleteAdminOffer(offer.id)

      await AdminAlert.offerDeleted()
    } catch (caughtError) {
      const message = getErrorMessage(
        caughtError,
        'Unable to delete the offer.'
      )

      setError(message)

      await AdminAlert.error(
        'Delete Failed',
        message
      )
    } finally {
      setBusyId(null)
    }
  }

  /* ==========================================
     PAGE UI
  ========================================== */

  return (
    <div className="za-offers-page">

      {/* BREADCRUMB */}

      <div className="za-products-breadcrumb">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
        >
          Dashboard
        </button>

        <span>/</span>

        <strong>Offers & Promotions</strong>
      </div>

      {/* PAGE HEADER */}

      <div className="za-products-page-head">
        <div>
          <p className="za-kicker">
            PROMOTION MANAGEMENT
          </p>

          <h1>Offers & Promotions</h1>

          <p>
            Create special offers and manage
            your café promotions.
          </p>
        </div>

        <button
          type="button"
          className="za-primary"
          disabled={saving || busyId !== null}
          onClick={openCreate}
        >
          <Plus size={18} />
          Create New Offer
        </button>
      </div>

      {/* SUMMARY CARDS */}

      <div className="za-product-summary">
        <div className="za-product-summary-card">
          <span>Total Offers</span>
          <strong>{stats.total}</strong>
          <small>All promotions</small>
        </div>

        <div className="za-product-summary-card">
          <span>Active Offers</span>
          <strong>{stats.active}</strong>
          <small>Currently running</small>
        </div>

        <div className="za-product-summary-card">
          <span>Scheduled</span>
          <strong>{stats.scheduled}</strong>
          <small>Upcoming promotions</small>
        </div>

        <div className="za-product-summary-card">
          <span>Expired</span>
          <strong>{stats.expired}</strong>
          <small>Past promotions</small>
        </div>
      </div>

      {/* PAGE ERROR */}

      {error && (
        <p
          className="za-add-feedback za-add-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* PROMOTIONS TABLE */}

      <section className="za-product-management-card">
        <div className="za-product-management-top">
          <div>
            <h2>
              <Gift size={24} />
              All Promotions
            </h2>

            <p>
              Manage discount codes, availability
              and offer dates.
            </p>
          </div>

          <span className="za-products-count">
            {filtered.length} offers
          </span>
        </div>

        {/* FILTERS */}

        <div className="za-product-management-filters">
          <div className="za-filter-pills">
            {([
              ['all', 'All Offers'],
              ['active', 'Active'],
              ['inactive', 'Inactive / Upcoming'],
              ['expired', 'Expired'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  filter === value ? 'active' : ''
                }
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="za-product-search za-management-search">
            <Search size={17} />

            <input
              type="search"
              placeholder="Search offers..."
              value={search}
              onChange={event =>
                setSearch(event.target.value)
              }
            />
          </label>
        </div>

        {/* TABLE */}

        <div className="za-table-wrap">
          <table className="za-table za-management-table">
            <thead>
              <tr>
                <th>Promotion</th>
                <th>Discount</th>
                <th>Promo Code</th>
                <th>Validity</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(offer => {
                const status = getOfferStatus(offer)

                return (
                  <tr key={offer.id}>
                    <td>
                      <div className="za-management-product">
                        <div className="za-offer-table-icon">
                          {offer.image ? (
                            <img
                              src={offer.image}
                              alt={offer.title}
                              className="za-offer-table-image"
                            />
                          ) : (
                            <Tag size={21} />
                          )}
                        </div>

                        <div>
                          <strong>{offer.title}</strong>
                          <small>
                            {offer.description ||
                              'No description'}
                          </small>
                        </div>
                      </div>
                    </td>

                    <td className="za-management-price">
                      {formatDiscount(offer)}
                    </td>

                    <td>
                      <span className="za-offer-code">
                        {offer.code || 'No code'}
                      </span>
                    </td>

                    <td>
                      <div className="za-offer-dates">
                        <span>
                          {formatDate(offer.startDate)}
                        </span>

                        <small>
                          to {formatDate(offer.endDate)}
                        </small>
                      </div>
                    </td>

                    <td>
                      <button
                        type="button"
                        className={`za-availability-toggle ${
                          status === 'active'
                            ? 'is-active'
                            : ''
                        }`}
                        disabled={
                          busyId !== null || saving
                        }
                        onClick={() => {
                          void toggleOffer(offer)
                        }}
                        title="Enable or disable promotion"
                      >
                        {offer.active ? (
                          <Eye size={15} />
                        ) : (
                          <EyeOff size={15} />
                        )}

                        {status.charAt(0).toUpperCase() +
                          status.slice(1)}
                      </button>
                    </td>

                    <td>
                      <div className="za-table-actions">
                        <button
                          type="button"
                          className="za-row-action"
                          title={`Edit ${offer.title}`}
                          aria-label={`Edit ${offer.title}`}
                          disabled={
                            busyId !== null || saving
                          }
                          onClick={() => openEdit(offer)}
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          className="za-row-action za-delete"
                          title={`Delete ${offer.title}`}
                          aria-label={`Delete ${offer.title}`}
                          disabled={
                            busyId !== null || saving
                          }
                          onClick={() => {
                            void deleteOffer(offer)
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="za-management-empty">
              <Gift size={32} />

              <h3>No promotions found</h3>

              <p>
                Create your first offer or adjust
                the filters.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* CREATE / EDIT MODAL */}

      {formOpen && (
        <div
          className="za-edit-overlay"
          role="presentation"
          onMouseDown={event => {
            if (
              event.target === event.currentTarget
            ) {
              void closeForm()
            }
          }}
        >
          <div
            className="za-edit-dialog za-offer-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="za-offer-dialog-title"
          >
            {/* MODAL HEADER */}

            <div className="za-edit-dialog-head">
              <div>
                <p className="za-kicker">
                  PROMOTION MANAGEMENT
                </p>

                <h2 id="za-offer-dialog-title">
                  {editing
                    ? 'Edit Promotion'
                    : 'Create New Offer'}
                </h2>
              </div>

              <button
                type="button"
                className="za-icon-button"
                disabled={saving}
                onClick={() => {
                  void closeForm()
                }}
                aria-label="Close offer form"
              >
                <X size={22} />
              </button>
            </div>

            {/* OFFER FORM */}

            <form onSubmit={saveOffer} noValidate>

              {/* TITLE */}

              <label>
                Offer Title *

                <input
                  required
                  maxLength={100}
                  placeholder="e.g. Weekend Special"
                  value={draft.title}
                  disabled={saving}
                  onChange={event =>
                    updateDraft(
                      'title',
                      event.target.value
                    )
                  }
                />
              </label>

              {/* DESCRIPTION */}

              <label>
                Description

                <textarea
                  rows={3}
                  placeholder="Describe this promotion..."
                  value={draft.description}
                  disabled={saving}
                  onChange={event =>
                    updateDraft(
                      'description',
                      event.target.value
                    )
                  }
                />
              </label>

              {/* IMAGE UPLOAD */}

              <div className="za-offer-image-section">
                <label className="za-offer-image-label">
                  Offer Image / Promotional Banner
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  disabled={imageLoading || saving}
                  onChange={handleOfferImage}
                />

                <button
                  type="button"
                  className="za-offer-image-upload"
                  disabled={imageLoading || saving}
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                >
                  {offerImage ? (
                    <img
                      src={offerImage}
                      alt="Offer preview"
                    />
                  ) : (
                    <>
                      <UploadCloud size={32} />

                      <strong>
                        {imageLoading
                          ? 'Processing Image...'
                          : 'Browse Image'}
                      </strong>

                      <small>
                        JPG, PNG or WEBP · Max 5 MB
                      </small>
                    </>
                  )}
                </button>

                {offerImage && (
                  <div className="za-offer-image-actions">
                    <button
                      type="button"
                      disabled={imageLoading || saving}
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                    >
                      <ImagePlus size={15} />
                      Change Image
                    </button>

                    <button
                      type="button"
                      disabled={imageLoading || saving}
                      onClick={() => {
                        void removeOfferImage()
                      }}
                    >
                      <X size={15} />
                      Remove Image
                    </button>
                  </div>
                )}

                {imageError && (
                  <p
                    className="za-add-feedback za-add-error"
                    role="alert"
                  >
                    {imageError}
                  </p>
                )}
              </div>

              {/* DISCOUNT */}

              <div className="za-offer-form-grid">
                <label>
                  Discount Type

                  <select
                    value={draft.discountType}
                    disabled={saving}
                    onChange={event =>
                      updateDraft(
                        'discountType',
                        event.target.value as
                          | 'percentage'
                          | 'fixed'
                      )
                    }
                  >
                    <option value="percentage">
                      Percentage (%)
                    </option>

                    <option value="fixed">
                      Fixed Amount (LKR)
                    </option>
                  </select>
                </label>

                <label>
                  Discount Value *

                  <input
                    type="number"
                    required
                    min="0.01"
                    max={
                      draft.discountType === 'percentage'
                        ? 100
                        : undefined
                    }
                    step="0.01"
                    placeholder={
                      draft.discountType === 'percentage'
                        ? 'e.g. 15'
                        : 'e.g. 500'
                    }
                    value={draft.discountValue}
                    disabled={saving}
                    onChange={event =>
                      updateDraft(
                        'discountValue',
                        event.target.value
                      )
                    }
                  />
                </label>
              </div>

              {/* PROMO CODE */}

              <label>
                Promo Code (optional)

                <input
                  maxLength={30}
                  placeholder="e.g. ZEN15"
                  value={draft.code}
                  disabled={saving}
                  onChange={event =>
                    updateDraft(
                      'code',
                      event.target.value
                    )
                  }
                />
              </label>

              {/* ======================================
                  DATE SELECTION
                  NO PAST DATES FOR NEW OFFERS
              ====================================== */}

              <div className="za-offer-form-grid">
                <label>
                  Start Date

                  <input
                    type="date"
                    min={minimumStartDate}
                    value={draft.startDate}
                    disabled={saving}
                    onChange={event =>
                      updateStartDate(
                        event.target.value
                      )
                    }
                  />

                  {hasHistoricalStartDate && (
                    <small>
                      Existing start date is in the past.
                      Choose today or later to change it.
                    </small>
                  )}
                </label>

                <label>
                  End Date

                  <input
                    type="date"
                    min={minimumEndDate}
                    value={draft.endDate}
                    disabled={saving}
                    onChange={event =>
                      updateEndDate(
                        event.target.value
                      )
                    }
                  />

                  {hasHistoricalEndDate && (
                    <small>
                      Existing end date is in the past.
                      Choose today or later to change it.
                    </small>
                  )}
                </label>
              </div>

              {/* ENABLE PROMOTION */}

              <label className="za-edit-checkbox">
                <input
                  type="checkbox"
                  checked={draft.active}
                  disabled={saving}
                  onChange={event =>
                    updateDraft(
                      'active',
                      event.target.checked
                    )
                  }
                />

                Enable Promotion
              </label>

              {/* FORM ERROR */}

              {formError && (
                <p
                  className="za-add-feedback za-add-error"
                  role="alert"
                >
                  {formError}
                </p>
              )}

              {/* FORM ACTIONS */}

              <div className="za-edit-dialog-actions">
                <button
                  type="button"
                  className="za-edit-cancel"
                  disabled={saving}
                  onClick={() => {
                    void closeForm()
                  }}
                >
                  <ArrowLeft size={16} />
                  Cancel
                </button>

                <button
                  type="submit"
                  className="za-primary"
                  disabled={imageLoading || saving}
                >
                  <Check size={17} />

                  {saving
                    ? 'Saving...'
                    : editing
                      ? 'Save Changes'
                      : 'Create Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
