
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from 'react'

import {
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  ImagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  UtensilsCrossed,
  X,
} from 'lucide-react'

import { getAdminAuthHeaders } from '../../admin-auth'

import {
  readMenuCatalog,
  loadMenuCatalog,
  subscribeMenuCatalog,
  updateMenuProduct,
  deleteMenuProduct,
  resolveStoredMenuImage,
  isStoredMenuImageRef,
  getMenuCategoriesFromProducts,
} from '../../data/menuStore'

import type { MenuItem } from '../../data/menu'
import type { AdminPage } from '../AdminApp'

import AdminAlert from '../utils/sweetAlert'

/* ==========================================
   TYPES
========================================== */

type Props = {
  onNavigate: (page: AdminPage) => void
  query?: string
}

type Filter = 'all' | 'food' | 'drink'

type EditDraft = {
  name: string
  category: string
  description: string
  ingredients: string
  serving: string
  price: string
  available: boolean
  featured: boolean
  isNew: boolean
}

type ImageUploadResponse = {
  success?: boolean
  image?: string
  url?: string
  key?: string
  data?: {
    image?: string
    url?: string
    key?: string
  }
  error?: string
  message?: string
}

/* ==========================================
   CONSTANTS
========================================== */

const FALLBACK_IMAGE = '/assets/menu-panda-main.png'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
]

const EMPTY_DRAFT: EditDraft = {
  name: '',
  category: '',
  description: '',
  ingredients: '',
  serving: '',
  price: '',
  available: true,
  featured: false,
  isNew: false,
}

/* ==========================================
   HELPERS
========================================== */

function formatPrice(value?: number): string {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return 'Not set'
  }

  return `LKR ${value.toLocaleString('en-LK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

function getInitialDraft(product: MenuItem): EditDraft {
  return {
    name: product.name,
    category: product.category,
    description: product.description || '',
    ingredients: product.ingredients || '',
    serving: product.serving || '',
    price:
      typeof product.price === 'number'
        ? String(product.price)
        : '',
    available: product.available,
    featured: product.featured,
    isNew: product.isNew === true,
  }
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback
}

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Please select a JPG, PNG, or WebP image.'
  }

  if (file.size === 0) {
    return 'The selected image file is empty.'
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return 'The image must be 5 MB or smaller.'
  }

  return null
}

/* ==========================================
   IMAGE UPLOAD SERVICE
========================================== */

function productImageUploadEndpoint(
  productId: string,
): string {
  return `/api/products/${encodeURIComponent(productId)}/image`
}

function extractUploadedImage(
  payload: ImageUploadResponse,
): string {
  const image =
    payload.data?.image ||
    payload.data?.url ||
    payload.data?.key ||
    payload.image ||
    payload.url ||
    payload.key

  if (typeof image !== 'string' || !image.trim()) {
    throw new Error(
      'The image upload response did not include an image URL or storage key.',
    )
  }

  return image.trim()
}

async function uploadProductImage(
  productId: string,
  file: File,
): Promise<string> {
  const validationError = validateImageFile(file)

  if (validationError) {
    throw new Error(validationError)
  }

  const formData = new FormData()
  formData.append('image', file, file.name)

  const response = await fetch(
    productImageUploadEndpoint(productId),
    {
      method: 'POST',
      headers: {
        ...getAdminAuthHeaders(),
        Accept: 'application/json',
      },
      body: formData,
    },
  )

  if (!response.ok) {
    let message = ''

    try {
      const payload =
        (await response.json()) as ImageUploadResponse

      message = payload.error || payload.message || ''
    } catch {
      // The server may return a non-JSON error.
    }

    if (response.status === 401) {
      throw new Error(
        message ||
          'Your administrator session has expired. Please log in again.',
      )
    }

    if (response.status === 403) {
      throw new Error(
        message ||
          'You do not have permission to upload product images.',
      )
    }

    if (response.status === 404) {
      throw new Error(
        'Product image upload endpoint not found (HTTP 404). Verify that the Cloudflare Worker has been deployed.',
      )
    }

    if (response.status === 413) {
      throw new Error(
        message ||
          'The selected image exceeds the upload limit.',
      )
    }

    throw new Error(
      message ||
        `Product image upload failed (HTTP ${response.status}).`,
    )
  }

  let payload: ImageUploadResponse

  try {
    payload =
      (await response.json()) as ImageUploadResponse
  } catch {
    throw new Error(
      'The image upload API returned an invalid JSON response.',
    )
  }

  if (payload.success === false) {
    throw new Error(
      payload.error ||
        payload.message ||
        'Product image upload failed.',
    )
  }

  return extractUploadedImage(payload)
}

/* ==========================================
   PRODUCT IMAGE
========================================== */

function ProductImage({
  product,
}: {
  product: MenuItem
}) {
  const [source, setSource] = useState(
    isStoredMenuImageRef(product.image)
      ? FALLBACK_IMAGE
      : product.image || FALLBACK_IMAGE,
  )

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    const image = product.image

    if (!image) {
      setSource(FALLBACK_IMAGE)
      return
    }

    if (!isStoredMenuImageRef(image)) {
      setSource(image)
      return
    }

    setSource(FALLBACK_IMAGE)

    resolveStoredMenuImage(image)
      .then(url => {
        if (cancelled) {
          if (url.startsWith('blob:')) {
            URL.revokeObjectURL(url)
          }
          return
        }

        objectUrl = url.startsWith('blob:') ? url : null
        setSource(url || FALLBACK_IMAGE)
      })
      .catch(() => {
        if (!cancelled) {
          setSource(FALLBACK_IMAGE)
        }
      })

    return () => {
      cancelled = true

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [product.image])

  return (
    <img
      src={source}
      alt={product.name}
      onError={event => {
        event.currentTarget.onerror = null
        event.currentTarget.src = FALLBACK_IMAGE
      }}
    />
  )
}

/* ==========================================
   SHARED CATEGORY SELECTOR

   Categories are derived from existing
   products of the selected product type.

   New categories become persistent when
   the product is saved successfully.
========================================== */

type CategorySelectorProps = {
  value: string
  categories: string[]
  disabled: boolean
  onChange: (category: string) => void
}

function CategorySelector({
  value,
  categories,
  disabled,
  onChange,
}: CategorySelectorProps) {
  const [addingNew, setAddingNew] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [categoryError, setCategoryError] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  const availableCategories = useMemo(() => {
    const unique = new Map<string, string>()

    for (const category of [...categories, value]) {
      const trimmed = category.trim()

      if (!trimmed) continue

      const key = trimmed.toLocaleLowerCase()

      if (!unique.has(key)) {
        unique.set(key, trimmed)
      }
    }

    return [...unique.values()].sort((a, b) =>
      a.localeCompare(b, undefined, {
        sensitivity: 'base',
      }),
    )
  }, [categories, value])

  useEffect(() => {
    if (addingNew) {
      inputRef.current?.focus()
    }
  }, [addingNew])

  function addCategory() {
    const normalized = newCategory
      .trim()
      .replace(/\s+/g, ' ')

    if (!normalized) {
      setCategoryError('Enter a category name.')
      return
    }

    if (normalized.length > 80) {
      setCategoryError(
        'Category name must be 80 characters or fewer.',
      )
      return
    }

    const existing = availableCategories.find(
      category =>
        category.toLocaleLowerCase() ===
        normalized.toLocaleLowerCase(),
    )

    onChange(existing || normalized)

    setAddingNew(false)
    setNewCategory('')
    setCategoryError('')
  }

  function cancelAddCategory() {
    setAddingNew(false)
    setNewCategory('')
    setCategoryError('')
  }

  const selectStyle: CSSProperties = {
    width: '100%',
    minHeight: '48px',
    padding: '11px 42px 11px 14px',
    border: '1px solid #e4cfc4',
    borderRadius: '10px',
    background: '#ffffff',
    color: '#35231e',
    fontSize: '14px',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    outlineOffset: '3px',
  }

  return (
    <div
      className="za-category-selector"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
        marginBottom: '20px',
      }}
    >
      <label
        htmlFor="za-edit-product-category"
        style={{
          display: 'block',
          fontSize: '13px',
          fontWeight: 700,
          color: '#3b241e',
        }}
      >
        Category
      </label>

      {!addingNew ? (
        <div style={{ position: 'relative' }}>
          <select
            id="za-edit-product-category"
            value={value}
            required
            disabled={disabled}
            onChange={event => {
              const next = event.target.value

              if (next === '__add_new_category__') {
                setAddingNew(true)
                setNewCategory('')
                setCategoryError('')
                return
              }

              onChange(next)
            }}
            style={selectStyle}
          >
            {!value && (
              <option value="">
                Select a category
              </option>
            )}

            {availableCategories.map(category => (
              <option
                key={category.toLocaleLowerCase()}
                value={category}
              >
                {category}
              </option>
            ))}

            <option
              value="__add_new_category__"
              style={{ fontWeight: 700 }}
            >
              + Add New Category
            </option>
          </select>

          <ChevronDown
            size={18}
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: '#a32722',
            }}
          />
        </div>
      ) : (
        <div
          style={{
            padding: '14px',
            border: '1px solid #ead4c9',
            borderRadius: '12px',
            background: '#fff9f5',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px',
              color: '#a32722',
              fontWeight: 700,
              fontSize: '13px',
            }}
          >
            <Plus size={16} />
            Add New Category
          </div>

          <input
            ref={inputRef}
            type="text"
            value={newCategory}
            maxLength={80}
            placeholder="Enter category name"
            disabled={disabled}
            onChange={event => {
              setNewCategory(event.target.value)
              setCategoryError('')
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addCategory()
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                cancelAddCategory()
              }
            }}
            style={{
              width: '100%',
              minHeight: '45px',
              border: '1px solid #e4cfc4',
              borderRadius: '9px',
              padding: '10px 12px',
              background: '#ffffff',
              fontSize: '13px',
              boxSizing: 'border-box',
            }}
          />

          {categoryError && (
            <p
              role="alert"
              style={{
                color: '#a32722',
                fontSize: '12px',
                marginTop: '8px',
              }}
            >
              {categoryError}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
              marginTop: '12px',
            }}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={cancelAddCategory}
              style={{
                padding: '9px 13px',
                border: '1px solid #e4cfc4',
                borderRadius: '8px',
                background: '#ffffff',
                color: '#573b31',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={disabled || !newCategory.trim()}
              onClick={addCategory}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 13px',
                border: 'none',
                borderRadius: '8px',
                background: '#a32722',
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer',
                opacity:
                  disabled || !newCategory.trim()
                    ? 0.6
                    : 1,
              }}
            >
              <Check size={15} />
              Use Category
            </button>
          </div>
        </div>
      )}

      <small
        style={{
          fontSize: '11px',
          color: '#907a70',
          lineHeight: 1.5,
        }}
      >
        Categories are shared with Add Product and
        filtered by product type. New categories are
        saved when you save the product.
      </small>
    </div>
  )
}

/* ==========================================
   PRODUCTS PAGE
========================================== */

export default function Products({
  onNavigate,
  query = '',
}: Props) {
  const [catalog, setCatalog] = useState<MenuItem[]>(
    () => readMenuCatalog(),
  )

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const [editing, setEditing] =
    useState<MenuItem | null>(null)

  const [draft, setDraft] =
    useState<EditDraft>(EMPTY_DRAFT)

  const [selectedImage, setSelectedImage] =
    useState<File | null>(null)

  const [imagePreview, setImagePreview] =
    useState<string | null>(null)

  const [imageError, setImageError] = useState('')
  const [draggingImage, setDraggingImage] =
    useState(false)

  const imageInputRef = useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)

  const [busyId, setBusyId] =
    useState<string | null>(null)

  const [error, setError] = useState('')
  const [editError, setEditError] = useState('')
  const [loading, setLoading] = useState(false)

  /* ========================================
     LOAD AND SUBSCRIBE TO CATALOG
  ======================================== */

  useEffect(() => {
    let active = true

    setLoading(true)

    loadMenuCatalog({ all: true })
      .then(items => {
        if (!active) return

        setCatalog(items)
        setError('')
      })
      .catch(caughtError => {
        if (!active) return

        setError(
          getErrorMessage(
            caughtError,
            'Unable to load products from database.',
          ),
        )
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    const unsubscribe = subscribeMenuCatalog(() => {
      if (active) {
        setCatalog(readMenuCatalog())
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  /* ========================================
     IMAGE PREVIEW
  ======================================== */

  useEffect(() => {
    if (!selectedImage) {
      setImagePreview(null)
      return
    }

    const objectUrl = URL.createObjectURL(selectedImage)

    setImagePreview(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [selectedImage])

  /* ========================================
     PRODUCTS AND CATEGORY OPTIONS
  ======================================== */

  const products = useMemo(
    () => [...catalog],
    [catalog],
  )

  /*
   * IMPORTANT:
   * Use the same shared category helper as
   * AddProduct.tsx.
   *
   * Food and Drink categories remain separate.
   * Categories from unavailable products are
   * included because the admin loads all items.
   */
  const categoriesByKind = useMemo(
    () => getMenuCategoriesFromProducts(products),
    [products],
  )

  const editCategories = useMemo(() => {
    if (!editing) return []

    return categoriesByKind[editing.kind] || []
  }, [categoriesByKind, editing])

  const filtered = useMemo(() => {
    const localSearch = search.trim().toLowerCase()
    const globalSearch = query.trim().toLowerCase()

    return products.filter(product => {
      const matchesType =
        filter === 'all' || product.kind === filter

      const searchableText = [
        product.name,
        product.category,
        product.description,
        product.ingredients,
        product.kind,
      ]
        .join(' ')
        .toLowerCase()

      return (
        matchesType &&
        (!localSearch ||
          searchableText.includes(localSearch)) &&
        (!globalSearch ||
          searchableText.includes(globalSearch))
      )
    })
  }, [products, filter, search, query])

  const foodCount = products.filter(
    product => product.kind === 'food',
  ).length

  const drinkCount = products.filter(
    product => product.kind === 'drink',
  ).length

  const availableCount = products.filter(
    product => product.available,
  ).length

  /* ========================================
     IMAGE SELECTION
  ======================================== */

  async function selectImage(
    file: File | null,
  ): Promise<void> {
    if (!file || saving) return

    const validationError = validateImageFile(file)

    if (validationError) {
      setImageError(validationError)

      await AdminAlert.warning(
        'Invalid Product Image',
        validationError,
      )

      return
    }

    setSelectedImage(file)
    setImageError('')
    setEditError('')
  }

  function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file = event.target.files?.[0] || null

    void selectImage(file)

    event.target.value = ''
  }

  function removeSelectedImage(): void {
    if (saving) return

    setSelectedImage(null)
    setImagePreview(null)
    setImageError('')

    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
  }

  /* ========================================
     EDIT PRODUCT
  ======================================== */

  function startEdit(product: MenuItem): void {
    if (busyId || saving) return

    setEditing(product)
    setDraft(getInitialDraft(product))

    setSelectedImage(null)
    setImagePreview(null)
    setImageError('')
    setDraggingImage(false)

    setEditError('')
    setError('')
  }

  function updateDraft<K extends keyof EditDraft>(
    key: K,
    value: EditDraft[K],
  ): void {
    setDraft(previous => ({
      ...previous,
      [key]: value,
    }))

    setEditError('')
  }

  async function closeEdit(): Promise<void> {
    if (saving || !editing) return

    const initialDraft = getInitialDraft(editing)

    const hasUnsavedChanges =
      JSON.stringify(draft) !==
        JSON.stringify(initialDraft) ||
      selectedImage !== null

    if (hasUnsavedChanges) {
      const confirmed = await AdminAlert.confirm(
        'Discard Changes?',
        'Your unsaved product changes, including any selected replacement image, will be lost.',
        'Yes, Discard',
      )

      if (!confirmed) return
    }

    setEditing(null)
    setSelectedImage(null)
    setImagePreview(null)
    setImageError('')
    setEditError('')
  }

  /* ========================================
     SAVE PRODUCT
  ======================================== */

  async function saveEdit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()

    if (!editing || saving) return

    const name = draft.name.trim()
    const category = draft.category.trim()
    const priceText = draft.price.trim()

    if (!name) {
      const message = 'Product name is required.'

      setEditError(message)

      await AdminAlert.warning(
        'Product Name Required',
        message,
      )

      return
    }

    if (!category) {
      const message = 'Product category is required.'

      setEditError(message)

      await AdminAlert.warning(
        'Category Required',
        message,
      )

      return
    }

    const price =
      priceText === '' ? undefined : Number(priceText)

    if (
      priceText !== '' &&
      (
        price === undefined ||
        !Number.isFinite(price) ||
        price < 0
      )
    ) {
      const message = 'Enter a valid price in LKR.'

      setEditError(message)

      await AdminAlert.warning(
        'Invalid Product Price',
        message,
      )

      return
    }

    setSaving(true)
    setEditError('')
    setImageError('')

    try {
      let uploadedImage: string | undefined

      if (selectedImage) {
        uploadedImage = await uploadProductImage(
          editing.id,
          selectedImage,
        )
      }

      await updateMenuProduct(editing.id, {
        name,
        category,
        description: draft.description.trim(),
        ingredients: draft.ingredients.trim(),
        serving: draft.serving.trim(),
        price,
        available: draft.available,
        featured: draft.featured,
        isNew: draft.isNew,
        ...(uploadedImage
          ? { image: uploadedImage }
          : {}),
      })

      setEditing(null)
      setSelectedImage(null)
      setImagePreview(null)
      setImageError('')
      setEditError('')
      setError('')

      await AdminAlert.productUpdated()
    } catch (caughtError) {
      const message = getErrorMessage(
        caughtError,
        'Unable to save product changes.',
      )

      setEditError(message)

      await AdminAlert.error(
        'Update Failed',
        message,
      )
    } finally {
      setSaving(false)
    }
  }

  /* ========================================
     PRODUCT AVAILABILITY
  ======================================== */

  async function toggleAvailability(
    product: MenuItem,
  ): Promise<void> {
    if (busyId || saving) return

    const nextAvailable = !product.available

    const confirmed = await AdminAlert.confirm(
      nextAvailable
        ? 'Make Product Available?'
        : 'Hide This Product?',
      nextAvailable
        ? `"${product.name}" will become available on the menu.`
        : `"${product.name}" will be hidden from the menu.`,
      nextAvailable
        ? 'Yes, Make Available'
        : 'Yes, Hide Product',
    )

    if (!confirmed) return

    setBusyId(product.id)
    setError('')

    try {
      await updateMenuProduct(product.id, {
        available: nextAvailable,
      })

      await AdminAlert.success(
        nextAvailable
          ? 'Product Available!'
          : 'Product Hidden!',
        nextAvailable
          ? `"${product.name}" is now available on your menu.`
          : `"${product.name}" has been hidden from your menu.`,
      )
    } catch (caughtError) {
      const message = getErrorMessage(
        caughtError,
        'Unable to update product availability.',
      )

      setError(message)

      await AdminAlert.error(
        'Availability Update Failed',
        message,
      )
    } finally {
      setBusyId(null)
    }
  }

  /* ========================================
     DELETE PRODUCT
  ======================================== */

  async function requestDelete(
    product: MenuItem,
  ): Promise<void> {
    if (busyId || saving) return

    const confirmed = await AdminAlert.confirmDelete(
      `"${product.name}"`,
    )

    if (!confirmed) return

    setBusyId(product.id)
    setError('')

    try {
      await deleteMenuProduct(product.id)

      await AdminAlert.productDeleted()
    } catch (caughtError) {
      const message = getErrorMessage(
        caughtError,
        'Unable to delete the product.',
      )

      setError(message)

      await AdminAlert.error(
        'Delete Failed',
        message,
      )
    } finally {
      setBusyId(null)
    }
  }

  /* ========================================
     PAGE RENDER
  ======================================== */

  return (
    <div className="za-products-page">

      {/* BREADCRUMB */}

      <div className="za-products-breadcrumb">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
        >
          Dashboard
        </button>

        <span>/</span>
        <strong>Menu / Products</strong>
      </div>

      {/* PAGE HEADER */}

      <div className="za-products-page-head">
        <div>
          <p className="za-kicker">
            MENU MANAGEMENT
          </p>

          <h1>Menu / Products</h1>

          <p>
            Manage the food and drinks
            displayed on your café menu.
          </p>
        </div>

        <button
          type="button"
          className="za-primary"
          onClick={() => onNavigate('add-product')}
        >
          <Plus size={18} />
          Add New Product
        </button>
      </div>

      {/* SUMMARY */}

      <div className="za-product-summary">
        <div className="za-product-summary-card">
          <span>Total Products</span>
          <strong>{products.length}</strong>
          <small>Items in your menu</small>
        </div>

        <div className="za-product-summary-card">
          <span>Food Items</span>
          <strong>{foodCount}</strong>
          <small>Food products</small>
        </div>

        <div className="za-product-summary-card">
          <span>Drinks</span>
          <strong>{drinkCount}</strong>
          <small>Beverages</small>
        </div>

        <div className="za-product-summary-card">
          <span>Available</span>
          <strong>{availableCount}</strong>
          <small>Currently marked available</small>
        </div>
      </div>

      {error && (
        <p
          className="za-add-feedback za-add-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* PRODUCT MANAGEMENT */}

      <section className="za-product-management-card">
        <div className="za-product-management-top">
          <div>
            <h2>
              <UtensilsCrossed size={24} />
              All Menu Products
            </h2>

            <p>
              View, filter and manage
              your existing menu items.
            </p>
          </div>

          <span className="za-products-count">
            {filtered.length} products
          </span>
        </div>

        {/* FILTERS */}

        <div className="za-product-management-filters">
          <div className="za-filter-pills">
            {(
              [
                ['all', 'All Products'],
                ['food', 'Food'],
                ['drink', 'Drinks'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  filter === value ? 'active' : ''
                }
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="za-product-search za-management-search">
            <Search size={17} />

            <input
              type="search"
              placeholder="Search menu products..."
              value={search}
              onChange={event =>
                setSearch(event.target.value)
              }
            />
          </label>
        </div>

        {/* PRODUCTS TABLE */}

        <div className="za-table-wrap">
          <table className="za-table za-management-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Type</th>
                <th>Category</th>
                <th>Price</th>
                <th>Availability</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(product => (
                <tr key={product.id}>
                  <td>
                    <div className="za-management-product">
                      <ProductImage product={product} />

                      <div>
                        <strong>
                          {product.name}

                          {product.featured && (
                            <span
                              style={{
                                marginLeft: '8px',
                                fontSize: '10px',
                                padding: '2px 7px',
                                borderRadius: '999px',
                                background:
                                  'rgba(163,39,34,0.12)',
                                color: '#a32722',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                verticalAlign: 'middle',
                              }}
                            >
                              Featured
                            </span>
                          )}
                        </strong>

                        <small>
                          {product.description ||
                            'No description'}
                        </small>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span className="za-type-pill">
                      {product.kind === 'drink'
                        ? 'Drink'
                        : 'Food'}
                    </span>
                  </td>

                  <td>{product.category}</td>

                  <td className="za-management-price">
                    {formatPrice(product.price)}
                  </td>

                  <td>
                    <button
                      type="button"
                      className={`za-availability-toggle ${
                        product.available
                          ? 'is-active'
                          : ''
                      }`}
                      disabled={
                        busyId !== null || saving
                      }
                      onClick={() =>
                        void toggleAvailability(product)
                      }
                    >
                      {product.available ? (
                        <Eye size={15} />
                      ) : (
                        <EyeOff size={15} />
                      )}

                      {product.available
                        ? 'Available'
                        : 'Hidden'}
                    </button>
                  </td>

                  <td>
                    <div className="za-table-actions">
                      <button
                        type="button"
                        className="za-row-action"
                        title={`Edit ${product.name}`}
                        aria-label={`Edit ${product.name}`}
                        disabled={
                          busyId !== null || saving
                        }
                        onClick={() =>
                          startEdit(product)
                        }
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        type="button"
                        className="za-row-action za-delete"
                        title={`Delete ${product.name}`}
                        aria-label={`Delete ${product.name}`}
                        disabled={
                          busyId !== null || saving
                        }
                        onClick={() =>
                          void requestDelete(product)
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* EMPTY STATE */}

          {filtered.length === 0 && (
            <div className="za-management-empty">
              {loading ? (
                <>
                  <RefreshCw
                    size={30}
                    className="animate-spin"
                  />

                  <h3>Loading products...</h3>

                  <p>
                    Fetching latest menu items
                    from PostgreSQL database.
                  </p>
                </>
              ) : (
                <>
                  <Search size={30} />

                  <h3>No products found</h3>

                  <p>
                    Try changing the filter
                    or search term.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ====================================
          EDIT PRODUCT MODAL
      ==================================== */}

      {editing && (
        <div
          className="za-edit-overlay"
          role="presentation"
          onMouseDown={event => {
            if (
              event.target === event.currentTarget
            ) {
              void closeEdit()
            }
          }}
        >
          <div
            className="za-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="za-edit-title"
          >
            {/* HEADER */}

            <div className="za-edit-dialog-head">
              <div>
                <p className="za-kicker">
                  MENU MANAGEMENT
                </p>

                <h2 id="za-edit-title">
                  Edit Product
                </h2>
              </div>

              <button
                type="button"
                className="za-icon-button"
                onClick={() => void closeEdit()}
                disabled={saving}
                aria-label="Close editor"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={saveEdit} noValidate>

              {/* PRODUCT NAME */}

              <label>
                Product Name

                <input
                  required
                  maxLength={100}
                  value={draft.name}
                  disabled={saving}
                  onChange={event =>
                    updateDraft(
                      'name',
                      event.target.value,
                    )
                  }
                />
              </label>

              {/* ==================================
                  CATEGORY DROPDOWN

                  Shared with Add Product.
                  Food/Drink categories separated.
              ================================== */}

              <CategorySelector
                key={editing.id}
                value={draft.category}
                categories={editCategories}
                disabled={saving}
                onChange={category =>
                  updateDraft('category', category)
                }
              />

              {/* ==================================
                  PRODUCT IMAGE
              ================================== */}

              <div
                className="za-edit-image-section"
                style={{
                  marginBottom: '20px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '10px',
                  }}
                >
                  <strong
                    style={{
                      fontSize: '13px',
                      color: '#3b241e',
                    }}
                  >
                    Product Image
                  </strong>

                  <span
                    style={{
                      fontSize: '11px',
                      color: '#927c72',
                    }}
                  >
                    JPG, PNG, WebP
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '14px',
                    alignItems: 'stretch',
                  }}
                >
                  {/* CURRENT / NEW PREVIEW */}

                  <div
                    style={{
                      position: 'relative',
                      width: '118px',
                      minWidth: '118px',
                      height: '118px',
                      borderRadius: '14px',
                      border: '1px solid #eadbd2',
                      background: '#faf4ee',
                      overflow: 'hidden',
                    }}
                  >
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="New product image preview"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                        }}
                      >
                        <ProductImage
                          product={editing}
                        />
                      </div>
                    )}

                    <span
                      style={{
                        position: 'absolute',
                        bottom: '5px',
                        left: '5px',
                        right: '5px',
                        padding: '4px 5px',
                        textAlign: 'center',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#fff',
                        background:
                          'rgba(33,24,21,0.76)',
                        borderRadius: '5px',
                      }}
                    >
                      {selectedImage
                        ? 'New Preview'
                        : 'Current Image'}
                    </span>
                  </div>

                  {/* UPLOAD CONTROL */}

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={saving}
                      onChange={handleImageChange}
                      style={{ display: 'none' }}
                      aria-label="Select replacement product image"
                    />

                    <div
                      onDragOver={event => {
                        event.preventDefault()

                        if (!saving) {
                          setDraggingImage(true)
                        }
                      }}
                      onDragLeave={() =>
                        setDraggingImage(false)
                      }
                      onDrop={event => {
                        event.preventDefault()
                        setDraggingImage(false)

                        if (saving) return

                        const file =
                          event.dataTransfer.files[0]

                        void selectImage(file || null)
                      }}
                      style={{
                        border: draggingImage
                          ? '2px dashed #a32722'
                          : '1px dashed #d9bcb0',
                        borderRadius: '12px',
                        padding: '13px 10px',
                        textAlign: 'center',
                        background: draggingImage
                          ? '#fff1ec'
                          : '#fffaf7',
                      }}
                    >
                      <UploadCloud
                        size={24}
                        color="#a32722"
                        style={{
                          margin: '0 auto 7px',
                        }}
                      />

                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          imageInputRef.current?.click()
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          background: '#a32722',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: saving
                            ? 'not-allowed'
                            : 'pointer',
                        }}
                      >
                        <ImagePlus size={15} />

                        {selectedImage
                          ? 'Change Image'
                          : 'Replace Image'}
                      </button>

                      <p
                        style={{
                          fontSize: '11px',
                          color: '#907a70',
                          margin: '8px 0 0',
                        }}
                      >
                        Drag and drop or browse
                      </p>
                    </div>
                  </div>
                </div>

                {/* SELECTED IMAGE */}

                {selectedImage && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      marginTop: '10px',
                      padding: '9px 11px',
                      background: '#f7eee8',
                      borderRadius: '9px',
                    }}
                  >
                    <span
                      style={{
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '12px',
                        color: '#573b31',
                      }}
                      title={selectedImage.name}
                    >
                      {selectedImage.name}
                      {' · '}
                      {(
                        selectedImage.size /
                        1024 /
                        1024
                      ).toFixed(2)}
                      {' MB'}
                    </span>

                    <button
                      type="button"
                      onClick={removeSelectedImage}
                      disabled={saving}
                      aria-label="Discard selected image"
                      title="Discard selected image"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: 'none',
                        background: 'transparent',
                        color: '#a32722',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={17} />
                    </button>
                  </div>
                )}

                <p
                  style={{
                    marginTop: '9px',
                    fontSize: '11px',
                    lineHeight: 1.5,
                    color: '#8d776c',
                  }}
                >
                  Maximum file size: 5 MB.
                  The existing image remains
                  unchanged until a replacement
                  is successfully saved.
                </p>

                {imageError && (
                  <p
                    className="za-add-feedback za-add-error"
                    role="alert"
                  >
                    {imageError}
                  </p>
                )}
              </div>

              {/* PRICE */}

              <label>
                Price (LKR)

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Enter price"
                  value={draft.price}
                  disabled={saving}
                  onChange={event =>
                    updateDraft(
                      'price',
                      event.target.value,
                    )
                  }
                />
              </label>

              {/* DESCRIPTION */}

              <label>
                Description

                <textarea
                  rows={3}
                  value={draft.description}
                  disabled={saving}
                  onChange={event =>
                    updateDraft(
                      'description',
                      event.target.value,
                    )
                  }
                />
              </label>

              {/* INGREDIENTS */}

              <label>
                Ingredients

                <textarea
                  rows={3}
                  value={draft.ingredients}
                  disabled={saving}
                  onChange={event =>
                    updateDraft(
                      'ingredients',
                      event.target.value,
                    )
                  }
                />
              </label>

              {/* SERVING SIZE */}

              <label>
                Serving Size

                <input
                  value={draft.serving}
                  disabled={saving}
                  onChange={event =>
                    updateDraft(
                      'serving',
                      event.target.value,
                    )
                  }
                />
              </label>

              {/* AVAILABILITY */}

              <label className="za-edit-checkbox">
                <input
                  type="checkbox"
                  checked={draft.available}
                  disabled={saving}
                  onChange={event =>
                    updateDraft(
                      'available',
                      event.target.checked,
                    )
                  }
                />

                Available on menu
              </label>

              {/* FEATURED */}

              <label className="za-edit-checkbox">
                <input
                  type="checkbox"
                  checked={draft.featured}
                  disabled={saving}
                  onChange={event =>
                    updateDraft(
                      'featured',
                      event.target.checked,
                    )
                  }
                />

                Featured Product
              </label>

              {/* NEW ARRIVAL */}

              <label className="za-edit-checkbox">
                <input
                  type="checkbox"
                  checked={draft.isNew}
                  disabled={saving}
                  onChange={event =>
                    updateDraft(
                      'isNew',
                      event.target.checked,
                    )
                  }
                />

                New Arrival
              </label>

              {/* ERROR */}

              {editError && (
                <p
                  className="za-add-feedback za-add-error"
                  role="alert"
                >
                  {editError}
                </p>
              )}

              {/* ACTIONS */}

              <div className="za-edit-dialog-actions">
                <button
                  type="button"
                  className="za-edit-cancel"
                  onClick={() => void closeEdit()}
                  disabled={saving}
                >
                  <ArrowLeft size={16} />
                  Cancel
                </button>

                <button
                  type="submit"
                  className="za-primary"
                  disabled={saving}
                >
                  {saving ? (
                    <RefreshCw
                      size={17}
                      className="animate-spin"
                    />
                  ) : (
                    <Check size={17} />
                  )}

                  {saving
                    ? 'Saving...'
                    : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
