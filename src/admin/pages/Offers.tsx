
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
  Minus,
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
  calculateOfferPricing,
  type AdminOffer,
  type OfferProduct,
  type OfferType,
  type OfferPricingMode,
  type OfferDiscountType,
} from '../../data/adminOfferStore'

import { getVisibleMenu } from '../../data/menuStore'
import type { MenuItem } from '../../data/menu'
/* ==========================================
   GET ALL MENU PRODUCTS
   Food + Drink + Snacks
========================================== */

function getAllOfferProducts(): MenuItem[] {
  return [
    ...getVisibleMenu('food'),
    ...getVisibleMenu('drink'),
    ...getVisibleMenu('snacks'),
  ]
}

import AdminAlert from '../utils/sweetAlert'

/* ==========================================
   ZEN CAFÉ — OFFERS & PROMOTIONS

   Supports:
   - General promotions
   - Single-product offers
   - Combo offers
   - Food / Drink / Snacks
   - Product quantities
   - Percentage and fixed discounts
   - Custom final offer prices
   - Live pricing calculations
   - Existing offer CRUD
   - Existing image processing
   - Existing date restrictions
   - Existing SweetAlert confirmations
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

type ProductFilter =
  | 'all'
  | 'food'
  | 'drink'
  | 'snacks'

type OfferDraft = {
  title: string
  description: string
  code: string
  discountType: OfferDiscountType
  discountValue: string
  startDate: string
  endDate: string
  active: boolean

  offerType: OfferType
  pricingMode: OfferPricingMode
  customFinalPrice: string
  products: OfferProduct[]
}

function emptyDraft(): OfferDraft {
  return {
    title: '',
    description: '',
    code: '',
    discountType: 'percentage',
    discountValue: '',
    startDate: '',
    endDate: '',
    active: true,

    offerType: 'general',
    pricingMode: 'discount',
    customFinalPrice: '',
    products: [],
  }
}

/* ==========================================
   HELPERS
========================================== */

function money(value: number): string {
  return `LKR ${value.toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function roundMoney(value: number): number {
  return Math.round(
    (value + Number.EPSILON) * 100
  ) / 100
}

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
    parts.find(p => p.type === 'year')?.value || ''

  const month =
    parts.find(p => p.type === 'month')?.value || ''

  const day =
    parts.find(p => p.type === 'day')?.value || ''

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

function formatDate(value: string): string {
  if (!value) return '—'
  if (!isValidDate(value)) return value

  return new Date(
    `${value}T00:00:00Z`
  ).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getOfferStatus(
  offer: AdminOffer
): 'active' | 'inactive' | 'scheduled' | 'expired' {
  const today = getToday()

  if (offer.endDate && offer.endDate < today) {
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
  if (
    offer.pricingMode === 'custom' &&
    offer.finalPrice !== undefined
  ) {
    return money(offer.finalPrice)
  }

  const value = Number(offer.discountValue) || 0

  return offer.discountType === 'percentage'
    ? `${value}% OFF`
    : `${money(value)} OFF`
}

function errorMessage(
  error: unknown,
  fallback: string
): string {
  return error instanceof Error
    ? error.message
    : fallback
}

function productPrice(product: MenuItem): number {
  const value = Number(product.price)

  return Number.isFinite(value) && value >= 0
    ? roundMoney(value)
    : 0
}

function makeOfferProduct(
  product: MenuItem,
  quantity = 1
): OfferProduct {
  const unitPrice = productPrice(product)

  return {
    productId: product.id,
    name: product.name,
    kind: product.kind,
    image: product.image,
    quantity,
    unitPrice,
    lineTotal: roundMoney(unitPrice * quantity),
  }
}

function draftFromOffer(
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

    offerType: offer.offerType || 'general',
    pricingMode: offer.pricingMode || 'discount',

    customFinalPrice:
      offer.pricingMode === 'custom' &&
      offer.finalPrice !== undefined
        ? String(offer.finalPrice)
        : '',

    products: (offer.products || []).map(
      product => ({ ...product })
    ),
  }
}

/* ==========================================
   IMAGE PROCESSING
========================================== */

async function prepareOfferImage(
  file: File
): Promise<string> {
  const allowed = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ]

  if (!allowed.includes(file.type)) {
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

    const canvas =
      document.createElement('canvas')

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
   COMPONENT
========================================== */

export default function Offers({
  onNavigate,
  query = '',
}: Props) {
  const [offers, setOffers] =
    useState<AdminOffer[]>(() => readAdminOffers())

  const [catalog, setCatalog] =
    useState<MenuItem[]>(() => getAllOfferProducts())

  const [filter, setFilter] =
    useState<StatusFilter>('all')

  const [search, setSearch] = useState('')

  const [editing, setEditing] =
    useState<AdminOffer | null>(null)

  const [formOpen, setFormOpen] = useState(false)

  const [draft, setDraft] =
    useState<OfferDraft>(emptyDraft)

  const [productSearch, setProductSearch] =
    useState('')

  const [productFilter, setProductFilter] =
    useState<ProductFilter>('all')

  const [offerImage, setOfferImage] = useState('')
  const [imageError, setImageError] = useState('')
  const [imageLoading, setImageLoading] =
    useState(false)

  const [saving, setSaving] = useState(false)

  const [busyId, setBusyId] =
    useState<string | null>(null)

  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')

  const [today, setToday] = useState(getToday)

  const fileInputRef =
    useRef<HTMLInputElement>(null)

  const imageRequestRef = useRef(0)
  const formLockRef = useRef(false)

  /* ==========================================
     DATA SYNCHRONIZATION
  ========================================== */

  useEffect(() => {
    let mounted = true

    const sync = () => {
      if (!mounted) return

      setOffers(readAdminOffers())
      setCatalog(getAllOfferProducts())
      setToday(getToday())
    }

    const refresh = () => {
      if (!mounted) return

      setToday(getToday())
      setCatalog(getAllOfferProducts())

      void loadAdminOffers()
        .then(items => {
          if (!mounted) return

          setOffers(items)
          setError('')
        })
        .catch(caught => {
          if (!mounted) return

          setError(
            errorMessage(
              caught,
              'Unable to refresh promotions.'
            )
          )
        })
    }

    const onVisibilityChange = () => {
      if (
        document.visibilityState === 'visible'
      ) {
        refresh()
      }
    }

    refresh()

    const unsubscribe =
      subscribeAdminOffers(sync)

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

      window.removeEventListener(
        'focus',
        refresh
      )

      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange
      )

      window.clearInterval(interval)
      imageRequestRef.current += 1
    }
  }, [])

  /* ==========================================
     STATISTICS
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
     FILTERED PROMOTIONS
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

      const searchable = [
        offer.title,
        offer.description,
        offer.code,
        ...(offer.products || []).map(
          product => product.name || ''
        ),
      ]
        .join(' ')
        .toLowerCase()

      return (
        matchesStatus &&
        (!local || searchable.includes(local)) &&
        (!global || searchable.includes(global))
      )
    })
  }, [offers, filter, search, query, today])

  /* ==========================================
     PRODUCT CATALOG
  ========================================== */

  const filteredProducts = useMemo(() => {
    const term =
      productSearch.trim().toLowerCase()

    return catalog.filter(product => {
      const matchesKind =
        productFilter === 'all' ||
        product.kind === productFilter

      const searchable = [
        product.name,
        product.category,
        product.description,
      ]
        .join(' ')
        .toLowerCase()

      return (
        product.available &&
        matchesKind &&
        (!term || searchable.includes(term))
      )
    })
  }, [catalog, productSearch, productFilter])

  const selectedProductIds = useMemo(
    () =>
      new Set(
        draft.products.map(
          product => product.productId
        )
      ),
    [draft.products]
  )

  /* ==========================================
     PRICING
  ========================================== */

  const discountValue =
    Number(draft.discountValue) || 0

  const customFinalPrice =
    draft.customFinalPrice.trim() === ''
      ? undefined
      : Number(draft.customFinalPrice)

  const pricing = useMemo(
    () =>
      calculateOfferPricing(
        draft.products,
        draft.discountType,
        discountValue,
        draft.pricingMode,
        customFinalPrice
      ),
    [
      draft.products,
      draft.discountType,
      discountValue,
      draft.pricingMode,
      customFinalPrice,
    ]
  )

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

    const original = editing
      ? draftFromOffer(editing)
      : emptyDraft()

    return (
      JSON.stringify(draft) !==
        JSON.stringify(original) ||
      offerImage !== (editing?.image || '')
    )
  }, [formOpen, editing, draft, offerImage])

  /* ==========================================
     FORM HELPERS
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

  function resetForm() {
    imageRequestRef.current += 1

    setFormOpen(false)
    setEditing(null)
    setDraft(emptyDraft())

    setOfferImage('')
    setImageError('')
    setImageLoading(false)

    setProductSearch('')
    setProductFilter('all')

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
        const confirmed =
          await AdminAlert.confirm(
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

  function openCreate() {
    if (saving || busyId) return

    imageRequestRef.current += 1

    setToday(getToday())
    setCatalog(getAllOfferProducts())

    setEditing(null)
    setDraft(emptyDraft())

    setOfferImage('')
    setImageError('')
    setImageLoading(false)

    setProductSearch('')
    setProductFilter('all')

    setFormError('')
    setFormOpen(true)
  }

  function openEdit(offer: AdminOffer) {
    if (saving || busyId) return

    imageRequestRef.current += 1

    setToday(getToday())
    setCatalog(getAllOfferProducts())

    setEditing(offer)
    setDraft(draftFromOffer(offer))

    setOfferImage(offer.image || '')
    setImageError('')
    setImageLoading(false)

    setProductSearch('')
    setProductFilter('all')

    setFormError('')
    setFormOpen(true)
  }

  /* ==========================================
     OFFER TYPE
  ========================================== */

  function changeOfferType(type: OfferType) {
    if (saving) return

    setDraft(previous => ({
      ...previous,
      offerType: type,
      products:
        type === 'general'
          ? []
          : type === 'single'
            ? previous.products.slice(0, 1)
            : previous.products,
    }))

    setFormError('')
  }

  /* ==========================================
     PRODUCT SELECTION
  ========================================== */

  function toggleProduct(product: MenuItem) {
    if (saving) return

    setDraft(previous => {
      if (previous.offerType === 'general') {
        return previous
      }

      const exists = previous.products.some(
        item => item.productId === product.id
      )

      if (exists) {
        return {
          ...previous,
          products: previous.products.filter(
            item => item.productId !== product.id
          ),
        }
      }

      const selected = makeOfferProduct(product)

      if (previous.offerType === 'single') {
        return {
          ...previous,
          products: [selected],
        }
      }

      return {
        ...previous,
        products: [
          ...previous.products,
          selected,
        ],
      }
    })

    setFormError('')
  }

  function changeQuantity(
    productId: string,
    quantity: number
  ) {
    if (saving) return

    const nextQuantity = Math.max(
      1,
      Math.min(999, Math.trunc(quantity))
    )

    setDraft(previous => ({
      ...previous,
      products: previous.products.map(product =>
        product.productId === productId
          ? {
              ...product,
              quantity: nextQuantity,
              lineTotal: roundMoney(
                product.unitPrice * nextQuantity
              ),
            }
          : product
      ),
    }))

    setFormError('')
  }

  function removeProduct(productId: string) {
    if (saving) return

    setDraft(previous => ({
      ...previous,
      products: previous.products.filter(
        product => product.productId !== productId
      ),
    }))

    setFormError('')
  }

  /* ==========================================
     DATE INPUTS
  ========================================== */

  function updateStartDate(value: string) {
    const currentToday = getToday()
    setToday(currentToday)

    if (value && !isValidDate(value)) {
      setFormError(
        'Please select a valid start date.'
      )
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
      setFormError(
        'Please select a valid end date.'
      )
      return
    }

    if (value && value < minimum) {
      setFormError(
        'End date must be today or later and cannot be before the start date.'
      )
      return
    }

    updateDraft('endDate', value)
  }

  /* ==========================================
     IMAGE UPLOAD
  ========================================== */

  async function handleOfferImage(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]

    if (!file || saving) return

    const requestId =
      ++imageRequestRef.current

    setImageLoading(true)
    setImageError('')

    event.target.value = ''

    try {
      const prepared =
        await prepareOfferImage(file)

      if (
        requestId !== imageRequestRef.current
      ) {
        return
      }

      setOfferImage(prepared)
      setFormError('')
    } catch (caught) {
      if (
        requestId !== imageRequestRef.current
      ) {
        return
      }

      const message = errorMessage(
        caught,
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
    if (
      !offerImage ||
      saving ||
      imageLoading
    ) {
      return
    }

    const confirmed =
      await AdminAlert.confirm(
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
     VALIDATION
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

    if (!title) {
      await showValidationError(
        'Offer Title Required',
        'Please enter an offer title.'
      )
      return
    }

    const linked =
      draft.offerType !== 'general'

    if (linked) {
      const count = draft.products.length

      if (
        (draft.offerType === 'single' &&
          count !== 1) ||
        (draft.offerType === 'combo' &&
          count < 2)
      ) {
        await showValidationError(
          'Select Products',
          draft.offerType === 'single'
            ? 'Please select exactly one product.'
            : 'Please select at least two products for a combo offer.'
        )
        return
      }

      const invalidProduct = draft.products.find(
        product =>
          !Number.isSafeInteger(product.quantity) ||
          product.quantity < 1 ||
          !Number.isFinite(product.unitPrice) ||
          product.unitPrice <= 0
      )

      if (invalidProduct) {
        await showValidationError(
          'Invalid Product Price',
          'Every selected product must have a valid price greater than zero and a valid quantity. Please update its price in Menu / Products.'
        )
        return
      }

      const unavailable = draft.products.find(
        product => {
          const catalogProduct = catalog.find(
            item => item.id === product.productId
          )

          return (
            !catalogProduct ||
            !catalogProduct.available
          )
        }
      )

      if (unavailable) {
        await showValidationError(
          'Unavailable Product',
          'One or more selected products are unavailable. Please update your selection.'
        )
        return
      }
    }

    const discount = Number(
      draft.discountValue
    )

    if (
      draft.pricingMode === 'discount' ||
      !linked
    ) {
      if (
        draft.discountValue.trim() === '' ||
        !Number.isFinite(discount) ||
        discount <= 0 ||
        (draft.discountType === 'percentage' &&
          discount > 100)
      ) {
        await showValidationError(
          'Invalid Discount',
          draft.discountType === 'percentage'
            ? 'Enter a percentage greater than 0 and no more than 100.'
            : 'Enter a valid discount amount in LKR.'
        )
        return
      }

      if (
        linked &&
        draft.discountType === 'fixed' &&
        discount > pricing.originalTotal
      ) {
        await showValidationError(
          'Discount Too High',
          'Fixed discount cannot exceed the original product total.'
        )
        return
      }
    }

    if (
      linked &&
      draft.pricingMode === 'custom'
    ) {
      const custom = Number(
        draft.customFinalPrice
      )

      if (
        draft.customFinalPrice.trim() === '' ||
        !Number.isFinite(custom) ||
        custom < 0 ||
        custom >= pricing.originalTotal
      ) {
        await showValidationError(
          'Invalid Offer Price',
          'Enter a final offer price of zero or more, below the original product total.'
        )
        return
      }
    }

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

    const startChanged =
      !editing ||
      draft.startDate !== editing.startDate

    const endChanged =
      !editing ||
      draft.endDate !== editing.endDate

    if (
      draft.startDate &&
      draft.startDate < currentToday &&
      startChanged
    ) {
      await showValidationError(
        'Invalid Start Date',
        'Start date cannot be earlier than today.'
      )
      return
    }

    if (
      draft.endDate &&
      draft.endDate < currentToday &&
      endChanged
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

    const isEditing = Boolean(editing)

    const payload = {
      title,
      description: draft.description.trim(),
      code: draft.code.trim().toUpperCase(),

      discountType: draft.discountType,

      discountValue:
        linked &&
        draft.pricingMode === 'custom'
          ? draft.discountType === 'percentage'
            ? pricing.savingsPercentage
            : pricing.discountAmount
          : discount,

      startDate: draft.startDate,
      endDate: draft.endDate,
      active: draft.active,
      image: offerImage,

      offerType: draft.offerType,

      products: linked
        ? draft.products.map(product => ({
            ...product,
            lineTotal: roundMoney(
              product.unitPrice * product.quantity
            ),
          }))
        : [],

      pricingMode: linked
        ? draft.pricingMode
        : ('discount' as const),

      originalTotal: linked
        ? pricing.originalTotal
        : 0,

      discountAmount: linked
        ? pricing.discountAmount
        : 0,

      finalPrice: linked
        ? pricing.finalPrice
        : 0,
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
    } catch (caught) {
      const message = errorMessage(
        caught,
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

  async function toggleOffer(
    offer: AdminOffer
  ) {
    if (busyId || saving) return

    const nextActive = !offer.active

    const confirmed =
      await AdminAlert.confirm(
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
    } catch (caught) {
      const message = errorMessage(
        caught,
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
     DELETE
  ========================================== */

  async function deleteOffer(
    offer: AdminOffer
  ) {
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
    } catch (caught) {
      const message = errorMessage(
        caught,
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
     UI
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

      {/* HEADER */}

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

      {/* SUMMARY */}

      <div className="za-product-summary">
        {[
          {
            label: 'Total Offers',
            value: stats.total,
            hint: 'All promotions',
          },
          {
            label: 'Active Offers',
            value: stats.active,
            hint: 'Currently running',
          },
          {
            label: 'Scheduled',
            value: stats.scheduled,
            hint: 'Upcoming promotions',
          },
          {
            label: 'Expired',
            value: stats.expired,
            hint: 'Past promotions',
          },
        ].map(item => (
          <div
            className="za-product-summary-card"
            key={item.label}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.hint}</small>
          </div>
        ))}
      </div>

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
              Manage product offers, combo
              pricing, discounts and offer dates.
            </p>
          </div>

          <span className="za-products-count">
            {filtered.length} offers
          </span>
        </div>

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

        <div className="za-table-wrap">
          <table className="za-table za-management-table">
            <thead>
              <tr>
                <th>Promotion</th>
                <th>Discount / Price</th>
                <th>Promo Code</th>
                <th>Validity</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(offer => {
                const status =
                  getOfferStatus(offer)

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
                          <strong>
                            {offer.title}
                          </strong>

                          <small>
                            {offer.description ||
                              'No description'}
                          </small>

                          {offer.offerType &&
                            offer.offerType !==
                              'general' && (
                              <small>
                                {offer.offerType ===
                                'combo'
                                  ? 'Combo Offer'
                                  : 'Single Product'}

                                {' · '}

                                {offer.products?.length ||
                                  0}{' '}
                                products
                              </small>
                            )}
                        </div>
                      </div>
                    </td>

                    <td className="za-management-price">
                      {formatDiscount(offer)}

                      {offer.offerType !==
                        'general' &&
                        offer.finalPrice !==
                          undefined &&
                        offer.pricingMode !==
                          'custom' && (
                          <small
                            style={{
                              display: 'block',
                              marginTop: 4,
                            }}
                          >
                            Final:{' '}
                            {money(
                              offer.finalPrice
                            )}
                          </small>
                        )}
                    </td>

                    <td>
                      <span className="za-offer-code">
                        {offer.code || 'No code'}
                      </span>
                    </td>

                    <td>
                      <div className="za-offer-dates">
                        <span>
                          {formatDate(
                            offer.startDate
                          )}
                        </span>

                        <small>
                          to{' '}
                          {formatDate(
                            offer.endDate
                          )}
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

                        {status
                          .charAt(0)
                          .toUpperCase() +
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
                          onClick={() =>
                            openEdit(offer)
                          }
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
              event.target ===
              event.currentTarget
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
            style={{
              maxWidth: 740,
              width: 'calc(100% - 32px)',
            }}
          >
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

            <form
              onSubmit={saveOffer}
              noValidate
            >
              {/* TITLE */}

              <label>
                Offer Title *

                <input
                  required
                  maxLength={100}
                  placeholder="e.g. Weekend Combo Special"
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

              {/* OFFER TYPE */}

              <div
                style={{
                  marginTop: 18,
                  marginBottom: 18,
                }}
              >
                <label
                  style={{
                    display: 'block',
                    marginBottom: 10,
                    fontWeight: 600,
                  }}
                >
                  Offer Type *
                </label>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(3, minmax(0, 1fr))',
                    gap: 8,
                  }}
                >
                  {([
                    ['general', 'General'],
                    ['single', 'Single Product'],
                    ['combo', 'Combo Offer'],
                  ] as const).map(
                    ([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        disabled={saving}
                        aria-pressed={
                          draft.offerType === value
                        }
                        onClick={() =>
                          changeOfferType(value)
                        }
                        style={{
                          padding: '12px 6px',
                          borderRadius: 10,
                          border:
                            draft.offerType === value
                              ? '2px solid #a32722'
                              : '1px solid #e8d9d2',
                          background:
                            draft.offerType === value
                              ? '#fff2ef'
                              : '#ffffff',
                          color:
                            draft.offerType === value
                              ? '#a32722'
                              : '#333333',
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>

                <small
                  style={{
                    display: 'block',
                    marginTop: 8,
                    color: '#777',
                  }}
                >
                  {draft.offerType === 'general'
                    ? 'A standard promotion without linked products.'
                    : draft.offerType === 'single'
                      ? 'Select one menu product for this offer.'
                      : 'Combine two or more menu products into one offer.'}
                </small>
              </div>

              {/* PRODUCT SELECTOR */}

              {draft.offerType !== 'general' && (
                <section
                  style={{
                    marginBottom: 20,
                    padding: 16,
                    border:
                      '1px solid #eadbd4',
                    borderRadius: 14,
                    background: '#fffaf7',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent:
                        'space-between',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 14,
                    }}
                  >
                    <strong>
                      Select Menu Products *
                    </strong>

                    <span
                      style={{
                        fontSize: 12,
                        color: '#a32722',
                        fontWeight: 600,
                      }}
                    >
                      {draft.products.length}{' '}
                      selected
                    </span>
                  </div>

                  <label
                    style={{
                      display: 'block',
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 5,
                      }}
                    >
                      <Search size={15} />
                      Search Products
                    </span>

                    <input
                      type="search"
                      placeholder="Search food, drinks or snacks..."
                      value={productSearch}
                      disabled={saving}
                      onChange={event =>
                        setProductSearch(
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 7,
                      marginBottom: 12,
                    }}
                  >
                    {([
                      ['all', 'All'],
                      ['food', 'Food'],
                      ['drink', 'Drinks'],
                      ['snacks', 'Snacks'],
                    ] as const).map(
                      ([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            setProductFilter(value)
                          }
                          style={{
                            padding: '7px 13px',
                            borderRadius: 20,
                            border:
                              '1px solid #e5d2c9',
                            background:
                              productFilter === value
                                ? '#a32722'
                                : '#ffffff',
                            color:
                              productFilter === value
                                ? '#ffffff'
                                : '#555555',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {label}
                        </button>
                      )
                    )}
                  </div>

                  <div
                    style={{
                      maxHeight: 260,
                      overflowY: 'auto',
                      border:
                        '1px solid #eee1da',
                      borderRadius: 10,
                      background: '#ffffff',
                    }}
                  >
                    {filteredProducts.length === 0 ? (
                      <p
                        style={{
                          padding: 18,
                          color: '#777',
                          textAlign: 'center',
                        }}
                      >
                        No available products found.
                      </p>
                    ) : (
                      filteredProducts.map(product => {
                        const selected =
                          selectedProductIds.has(
                            product.id
                          )

                        return (
                          <button
                            key={product.id}
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              toggleProduct(product)
                            }
                            aria-pressed={selected}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: 10,
                              textAlign: 'left',
                              background: selected
                                ? '#fff2ef'
                                : '#ffffff',
                              border: 'none',
                              borderBottom:
                                '1px solid #f0e5df',
                              cursor: 'pointer',
                            }}
                          >
                            <div
                              style={{
                                width: 46,
                                height: 46,
                                flexShrink: 0,
                                borderRadius: 8,
                                overflow: 'hidden',
                                background: '#f4eae4',
                              }}
                            >
                              {product.image && (
                                <img
                                  src={product.image}
                                  alt=""
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                  }}
                                />
                              )}
                            </div>

                            <div
                              style={{
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <strong
                                style={{
                                  display: 'block',
                                  fontSize: 13,
                                }}
                              >
                                {product.name}
                              </strong>

                              <small
                                style={{
                                  display: 'block',
                                  color: '#888',
                                }}
                              >
                                {product.kind} ·{' '}
                                {product.category}
                              </small>

                              <small
                                style={{
                                  color: '#a32722',
                                  fontWeight: 700,
                                }}
                              >
                                {money(
                                  productPrice(product)
                                )}
                              </small>
                            </div>

                            <span
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 6,
                                border:
                                  '1px solid #a32722',
                                background: selected
                                  ? '#a32722'
                                  : '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent:
                                  'center',
                                color: '#ffffff',
                                flexShrink: 0,
                              }}
                            >
                              {selected && (
                                <Check size={15} />
                              )}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>

                  {/* SELECTED PRODUCTS */}

                  {draft.products.length > 0 && (
                    <div
                      style={{
                        marginTop: 18,
                      }}
                    >
                      <strong
                        style={{
                          display: 'block',
                          marginBottom: 10,
                        }}
                      >
                        Selected Products
                      </strong>

                      {draft.products.map(product => (
                        <div
                          key={product.productId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 0',
                            borderBottom:
                              '1px solid #eadbd4',
                          }}
                        >
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <strong
                              style={{
                                display: 'block',
                                fontSize: 13,
                              }}
                            >
                              {product.name ||
                                product.productId}
                            </strong>

                            <small
                              style={{
                                color: '#777',
                              }}
                            >
                              {money(
                                product.unitPrice
                              )}{' '}
                              each
                            </small>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 7,
                            }}
                          >
                            <button
                              type="button"
                              disabled={
                                saving ||
                                product.quantity <= 1
                              }
                              onClick={() =>
                                changeQuantity(
                                  product.productId,
                                  product.quantity - 1
                                )
                              }
                              aria-label="Decrease quantity"
                              style={{
                                padding: 5,
                                border:
                                  '1px solid #ddd',
                                borderRadius: 6,
                                background: '#fff',
                              }}
                            >
                              <Minus size={14} />
                            </button>

                            <strong>
                              {product.quantity}
                            </strong>

                            <button
                              type="button"
                              disabled={
                                saving ||
                                product.quantity >= 999
                              }
                              onClick={() =>
                                changeQuantity(
                                  product.productId,
                                  product.quantity + 1
                                )
                              }
                              aria-label="Increase quantity"
                              style={{
                                padding: 5,
                                border:
                                  '1px solid #ddd',
                                borderRadius: 6,
                                background: '#fff',
                              }}
                            >
                              <Plus size={14} />
                            </button>
                          </div>

                          <strong
                            style={{
                              fontSize: 12,
                              minWidth: 90,
                              textAlign: 'right',
                            }}
                          >
                            {money(
                              product.unitPrice *
                                product.quantity
                            )}
                          </strong>

                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              removeProduct(
                                product.productId
                              )
                            }
                            aria-label="Remove product"
                            style={{
                              border: 'none',
                              background: 'none',
                              color: '#a32722',
                              cursor: 'pointer',
                            }}
                          >
                            <X size={17} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

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

              {/* IMAGE */}

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
                      disabled={
                        imageLoading || saving
                      }
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                    >
                      <ImagePlus size={15} />
                      Change Image
                    </button>

                    <button
                      type="button"
                      disabled={
                        imageLoading || saving
                      }
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

              {/* PRICING MODE */}

              {draft.offerType !== 'general' && (
                <div
                  style={{
                    marginTop: 20,
                    marginBottom: 16,
                  }}
                >
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 10,
                      fontWeight: 600,
                    }}
                  >
                    Offer Pricing Method
                  </label>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    {([
                      ['discount', 'Apply Discount'],
                      ['custom', 'Custom Offer Price'],
                    ] as const).map(
                      ([value, label]) => (
                        <label
                          key={value}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="radio"
                            name="offer-pricing-mode"
                            checked={
                              draft.pricingMode ===
                              value
                            }
                            disabled={saving}
                            onChange={() =>
                              updateDraft(
                                'pricingMode',
                                value
                              )
                            }
                          />

                          {label}
                        </label>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* DISCOUNT */}

              {(draft.offerType === 'general' ||
                draft.pricingMode ===
                  'discount') && (
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
                            OfferDiscountType
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
                        draft.discountType ===
                        'percentage'
                          ? 100
                          : undefined
                      }
                      step="0.01"
                      placeholder={
                        draft.discountType ===
                        'percentage'
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
              )}

              {/* CUSTOM PRICE */}

              {draft.offerType !== 'general' &&
                draft.pricingMode === 'custom' && (
                  <label>
                    Final Offer Price (LKR) *

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Enter final selling price"
                      value={
                        draft.customFinalPrice
                      }
                      disabled={saving}
                      onChange={event =>
                        updateDraft(
                          'customFinalPrice',
                          event.target.value
                        )
                      }
                    />
                  </label>
                )}

              {/* PRICE SUMMARY */}

              {draft.offerType !== 'general' &&
                draft.products.length > 0 && (
                  <div
                    style={{
                      marginTop: 20,
                      marginBottom: 20,
                      padding: 18,
                      borderRadius: 14,
                      border:
                        '1px solid #ead7ce',
                      background: '#fff7f2',
                    }}
                  >
                    <strong
                      style={{
                        display: 'block',
                        marginBottom: 14,
                        fontSize: 15,
                      }}
                    >
                      Offer Price Summary
                    </strong>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent:
                          'space-between',
                        marginBottom: 10,
                      }}
                    >
                      <span>Original Total</span>

                      <strong>
                        {money(
                          pricing.originalTotal
                        )}
                      </strong>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent:
                          'space-between',
                        marginBottom: 10,
                      }}
                    >
                      <span>Discount / Savings</span>

                      <strong
                        style={{
                          color: '#a32722',
                        }}
                      >
                        -{money(
                          pricing.discountAmount
                        )}
                      </strong>
                    </div>

                    <div
                      style={{
                        borderTop:
                          '1px solid #ead7ce',
                        paddingTop: 14,
                        marginTop: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent:
                          'space-between',
                        gap: 10,
                      }}
                    >
                      <strong>
                        Final Offer Price
                      </strong>

                      <strong
                        style={{
                          fontSize: 22,
                          color: '#a32722',
                        }}
                      >
                        {money(
                          pricing.finalPrice
                        )}
                      </strong>
                    </div>

                    <small
                      style={{
                        display: 'block',
                        marginTop: 8,
                        color: '#777',
                      }}
                    >
                      Customer saves{' '}
                      {pricing.savingsPercentage}%
                      compared with the original
                      product total.
                    </small>
                  </div>
                )}

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

              {/* DATES */}

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
                      Existing start date is in
                      the past. Choose today or
                      later to change it.
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
                      Existing end date is in
                      the past. Choose today or
                      later to change it.
                    </small>
                  )}
                </label>
              </div>

              {/* ACTIVE */}

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

              {/* ERROR */}

              {formError && (
                <p
                  className="za-add-feedback za-add-error"
                  role="alert"
                >
                  {formError}
                </p>
              )}

              {/* ACTIONS */}

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
                  disabled={
                    imageLoading || saving
                  }
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
