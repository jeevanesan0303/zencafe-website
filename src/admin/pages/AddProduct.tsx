
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
  ChevronDown,
  Eye,
  ImagePlus,
  Plus,
  Save,
  UploadCloud,
  UtensilsCrossed,
  X,
} from 'lucide-react'

import type { AdminPage } from '../AdminApp'

import type {
  MenuItem,
  MenuKind,
  DietaryType,
  DairyType,
  SpiceLevel,
} from '../../data/menu'

import {
  addMenuProduct,
  prepareStoredMenuImage,
  deleteStoredMenuImage,
  readMenuCatalog,
  loadMenuCatalog,
  subscribeMenuCatalog,
  getMenuCategoriesFromProducts,
} from '../../data/menuStore'

import AdminAlert from '../utils/sweetAlert'

/* ==========================================
   TYPES
========================================== */

type Props = {
  onNavigate: (page: AdminPage) => void
}

type ProductDraft = {
  kind: MenuKind
  name: string
  category: string
  price: string
  description: string
  ingredients: string
  servingSize: string
  dietaryType: DietaryType
  dairyType: DairyType
  spiceLevel: SpiceLevel
  available: boolean
  featured: boolean
  isNew: boolean
}

/* ==========================================
   DEFAULT VALUES
========================================== */

const INITIAL_DRAFT: ProductDraft = {
  kind: 'food',
  name: '',
  category: '',
  price: '',
  description: '',
  ingredients: '',
  servingSize: '',
  dietaryType: 'veg',
  dairyType: 'milk',
  spiceLevel: 'none',
  available: true,
  featured: false,
  isNew: false,
}

/* ==========================================
   HELPERS
========================================== */

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error &&
    error.message.trim()
    ? error.message
    : fallback
}

function normalizeCategory(
  value: string,
): string {
  return value.trim().replace(/\s+/g, ' ')
}

function uniqueCategories(
  values: string[],
): string[] {
  const categories = new Map<
    string,
    string
  >()

  for (const value of values) {
    const normalized =
      normalizeCategory(value)

    if (!normalized) continue

    const key =
      normalized.toLocaleLowerCase()

    if (!categories.has(key)) {
      categories.set(key, normalized)
    }
  }

  return [...categories.values()].sort(
    (a, b) =>
      a.localeCompare(b, undefined, {
        sensitivity: 'base',
      }),
  )
}

function getKindLabel(
  kind: MenuKind,
): string {
  switch (kind) {
    case 'food':
      return 'Food'
    case 'drink':
      return 'Drink'
    case 'snacks':
      return 'Snacks'
    default:
      return 'Product'
  }
}

function isFoodOrSnacks(
  kind: MenuKind,
): boolean {
  return (
    kind === 'food' ||
    kind === 'snacks'
  )
}

/* ==========================================
   TOGGLE COMPONENT
========================================== */

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description: string
  disabled?: boolean
}) {
  return (
    <label className="za-add-toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>

      <input
        type="checkbox"
        className="za-add-switch-input"
        checked={checked}
        disabled={disabled}
        onChange={event =>
          onChange(event.target.checked)
        }
      />

      <span
        className="za-add-switch"
        aria-hidden="true"
      />
    </label>
  )
}

/* ==========================================
   ADD PRODUCT COMPONENT
========================================== */

export default function AddProduct({
  onNavigate,
}: Props) {
  const [draft, setDraft] =
    useState<ProductDraft>({
      ...INITIAL_DRAFT,
    })

  /* ==========================================
     LIVE PRODUCT CATALOG
  ========================================== */

  const [catalog, setCatalog] =
    useState<MenuItem[]>(() =>
      readMenuCatalog(),
    )

  const [
    loadingCategories,
    setLoadingCategories,
  ] = useState(true)

  const [
    categoryLoadError,
    setCategoryLoadError,
  ] = useState('')

  const [
    newCategory,
    setNewCategory,
  ] = useState('')

  const [
    addingCategory,
    setAddingCategory,
  ] = useState(false)

  const [
    categoryError,
    setCategoryError,
  ] = useState('')

  /* ==========================================
     IMAGE STATE
  ========================================== */

  const [
    selectedFile,
    setSelectedFile,
  ] = useState<File | null>(null)

  const [
    previewUrl,
    setPreviewUrl,
  ] = useState('')

  const [error, setError] = useState('')
  const [saving, setSaving] =
    useState(false)

  const fileInputRef =
    useRef<HTMLInputElement>(null)

  const categoryInputRef =
    useRef<HTMLInputElement>(null)

  const previewUrlRef = useRef('')

  /* ==========================================
     LOAD CATEGORIES FROM DATABASE

     Food, Drink and Snacks each use
     their own existing categories.
  ========================================== */

  useEffect(() => {
    let active = true

    setLoadingCategories(true)
    setCategoryLoadError('')

    const unsubscribe =
      subscribeMenuCatalog(() => {
        if (active) {
          setCatalog(readMenuCatalog())
        }
      })

    loadMenuCatalog({ all: true })
      .then(items => {
        if (!active) return

        setCatalog(items)
        setCategoryLoadError('')
      })
      .catch(caughtError => {
        if (!active) return

        setCategoryLoadError(
          getErrorMessage(
            caughtError,
            'Unable to load categories from the database.',
          ),
        )
      })
      .finally(() => {
        if (active) {
          setLoadingCategories(false)
        }
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  /* ==========================================
     IMAGE CLEANUP
  ========================================== */

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(
          previewUrlRef.current,
        )
      }
    }
  }, [])

  function setImagePreview(
    url: string,
  ) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(
        previewUrlRef.current,
      )
    }

    previewUrlRef.current = url
    setPreviewUrl(url)
  }

  /* ==========================================
     CATEGORY DATA

     Shared helper from menuStore.ts.
     No hardcoded categories.
  ========================================== */

  const categoriesByKind = useMemo(
    () =>
      getMenuCategoriesFromProducts(
        catalog,
      ),
    [catalog],
  )

  const availableCategories =
    useMemo(() => {
      const existing =
        categoriesByKind[draft.kind] || []

      return uniqueCategories([
        ...existing,
        draft.category,
      ])
    }, [
      categoriesByKind,
      draft.kind,
      draft.category,
    ])

  /* ==========================================
     FOCUS NEW CATEGORY INPUT
  ========================================== */

  useEffect(() => {
    if (addingCategory) {
      categoryInputRef.current?.focus()
    }
  }, [addingCategory])

  /* ==========================================
     UNSAVED CHANGES
  ========================================== */

  const hasUnsavedChanges =
    useMemo(() => {
      return (
        JSON.stringify(draft) !==
          JSON.stringify(INITIAL_DRAFT) ||
        selectedFile !== null ||
        newCategory.trim() !== ''
      )
    }, [
      draft,
      selectedFile,
      newCategory,
    ])

  /* ==========================================
     UPDATE FIELD
  ========================================== */

  function update<
    K extends keyof ProductDraft
  >(
    key: K,
    value: ProductDraft[K],
  ) {
    setDraft(previous => ({
      ...previous,
      [key]: value,
    }))

    setError('')
  }

  /* ==========================================
     CHANGE PRODUCT TYPE

     Food -> Zen Kitchen
     Drink -> Drinks menu
     Snacks -> Zen Kitchen snacks
  ========================================== */

  function changeKind(
    kind: MenuKind,
  ) {
    if (
      saving ||
      kind === draft.kind
    ) {
      return
    }

    setDraft(previous => ({
      ...previous,
      kind,
      category: '',
      spiceLevel: 'none',
    }))

    setNewCategory('')
    setAddingCategory(false)
    setCategoryError('')
    setError('')
  }

  /* ==========================================
     NEW CATEGORY CONTROLS
  ========================================== */

  function openNewCategory() {
    if (saving) return

    setAddingCategory(true)
    setNewCategory('')
    setCategoryError('')
    setError('')
  }

  function cancelNewCategory() {
    if (saving) return

    setAddingCategory(false)
    setNewCategory('')
    setCategoryError('')
  }

  /* ==========================================
     ADD NEW CATEGORY

     The category is persisted when
     its product is saved to the API.
  ========================================== */

  async function addCategory() {
    if (saving) return

    const name =
      normalizeCategory(newCategory)

    if (!name) {
      const message =
        'Please enter a category name.'

      setCategoryError(message)

      await AdminAlert.warning(
        'Category Name Required',
        message,
      )

      return
    }

    if (name.length > 80) {
      const message =
        'Category name must be 80 characters or fewer.'

      setCategoryError(message)

      await AdminAlert.warning(
        'Category Name Too Long',
        message,
      )

      return
    }

    const existing =
      availableCategories.find(
        category =>
          category.toLocaleLowerCase() ===
          name.toLocaleLowerCase(),
      )

    if (existing) {
      update('category', existing)

      setNewCategory('')
      setAddingCategory(false)
      setCategoryError('')

      await AdminAlert.warning(
        'Category Already Exists',
        `"${existing}" already exists and has been selected.`,
      )

      return
    }

    update('category', name)

    setNewCategory('')
    setAddingCategory(false)
    setCategoryError('')

    await AdminAlert.success(
      'Category Selected!',
      `"${name}" is ready to use. Save the product to add this category to your menu.`,
    )
  }

  /* ==========================================
     IMAGE UPLOAD
  ========================================== */

  async function handleImage(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target.files?.[0]

    if (!file) return

    event.target.value = ''

    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/webp',
    ]

    if (
      !allowedTypes.includes(file.type)
    ) {
      const message =
        'Please select a JPG, PNG, or WebP image.'

      setError(message)

      await AdminAlert.warning(
        'Invalid Image Format',
        message,
      )

      return
    }

    if (file.size === 0) {
      const message =
        'The selected image is empty.'

      setError(message)

      await AdminAlert.warning(
        'Invalid Image',
        message,
      )

      return
    }

    if (
      file.size >
      12 * 1024 * 1024
    ) {
      const message =
        'Image must be smaller than 12 MB.'

      setError(message)

      await AdminAlert.warning(
        'Image Too Large',
        message,
      )

      return
    }

    try {
      const url =
        URL.createObjectURL(file)

      setImagePreview(url)
      setSelectedFile(file)
      setError('')
    } catch {
      const message =
        'Unable to preview the selected image.'

      setError(message)

      await AdminAlert.error(
        'Image Upload Error',
        message,
      )
    }
  }

  /* ==========================================
     REMOVE IMAGE
  ========================================== */

  function clearImage() {
    setImagePreview('')
    setSelectedFile(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function removeImage() {
    if (
      !selectedFile ||
      saving
    ) {
      return
    }

    const confirmed =
      await AdminAlert.confirm(
        'Remove Product Image?',
        'The selected image will be removed from this product.',
        'Yes, Remove',
      )

    if (!confirmed) return

    clearImage()

    await AdminAlert.success(
      'Image Removed',
      'The product image has been removed.',
    )
  }

  /* ==========================================
     CANCEL / BACK
  ========================================== */

  async function handleCancel() {
    if (saving) return

    if (hasUnsavedChanges) {
      const confirmed =
        await AdminAlert.confirm(
          'Discard New Product?',
          'You have unsaved product information. Leaving this page will discard your changes.',
          'Yes, Discard',
        )

      if (!confirmed) return
    }

    onNavigate('products')
  }

  /* ==========================================
     SAVE PRODUCT
  ========================================== */

  async function handleSave(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (saving) return

    const name = draft.name.trim()

    const category =
      normalizeCategory(
        draft.category,
      )

    const priceText =
      draft.price.trim()

    const price =
      Number(priceText)

    if (!name) {
      const message =
        'Please enter a product name.'

      setError(message)

      await AdminAlert.warning(
        'Product Name Required',
        message,
      )

      return
    }

    if (!category) {
      const message =
        'Please select a category.'

      setError(message)

      await AdminAlert.warning(
        'Category Required',
        message,
      )

      return
    }

    if (addingCategory) {
      const message =
        'Please finish adding or cancel the new category before saving.'

      setError(message)

      await AdminAlert.warning(
        'Finish Category Selection',
        message,
      )

      return
    }

    if (
      priceText === '' ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      const message =
        'Please enter a valid price in LKR.'

      setError(message)

      await AdminAlert.warning(
        'Invalid Product Price',
        message,
      )

      return
    }

    setSaving(true)
    setError('')

    let savedImage = ''
    let productCreated = false

    try {
      /* PREPARE PRODUCT IMAGE */

      if (selectedFile) {
        savedImage =
          await prepareStoredMenuImage(
            selectedFile,
          )
      }

      /* PRODUCT DATA */

      const product: MenuItem = {
        id: crypto.randomUUID(),

        kind: draft.kind,
        name,
        category,

        description:
          draft.description.trim(),

        ingredients:
          draft.ingredients.trim(),

        serving:
          draft.servingSize.trim(),

        price,

        image:
          savedImage ||
          '/assets/menu-panda-main.png',

        accent:
          draft.kind === 'drink'
            ? '#4a9a68'
            : draft.kind === 'snacks'
              ? '#c47729'
              : '#a32722',

        available:
          draft.available,

        featured:
          draft.featured,

        isNew:
          draft.isNew,

        createdAt:
          new Date().toISOString(),

        ...(isFoodOrSnacks(
          draft.kind,
        )
          ? {
              dietaryType:
                draft.dietaryType,

              spiceLevel:
                draft.spiceLevel,
            }
          : {
              dairyType:
                draft.dairyType,
            }),
      }

      /* SAVE TO DATABASE API */

      await addMenuProduct(product)

      productCreated = true

      /* RESET FORM */

      clearImage()

      setDraft({
        ...INITIAL_DRAFT,
      })

      setNewCategory('')
      setAddingCategory(false)
      setCategoryError('')

      /* SUCCESS ALERT */

      await AdminAlert.productAdded()

      /* RETURN TO PRODUCTS */

      onNavigate('products')
    } catch (caughtError) {
      if (
        savedImage &&
        !productCreated
      ) {
        try {
          await deleteStoredMenuImage(
            savedImage,
          )
        } catch {
          // Preserve original error.
        }
      }

      const message =
        getErrorMessage(
          caughtError,
          'Unable to save the product.',
        )

      setError(message)

      await AdminAlert.error(
        'Product Creation Failed',
        message,
      )
    } finally {
      setSaving(false)
    }
  }

  /* ==========================================
     PAGE UI
  ========================================== */

  return (
    <div className="za-add-product-page">

      {/* BREADCRUMB */}

      <div className="za-products-breadcrumb">
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void handleCancel()
          }}
        >
          Menu / Products
        </button>

        <span>/</span>

        <strong>
          Add New Product
        </strong>
      </div>

      {/* PAGE HEADER */}

      <div className="za-add-page-head">
        <div>
          <p className="za-kicker">
            MENU MANAGEMENT
          </p>

          <h1>
            Add New Menu Product
          </h1>

          <p>
            Create a food, drink or snacks
            item for your Zen Café menu.
          </p>
        </div>

        <button
          type="button"
          className="za-add-back"
          disabled={saving}
          onClick={() => {
            void handleCancel()
          }}
        >
          <ArrowLeft size={17} />
          Back to Products
        </button>
      </div>

      {/* MAIN FORM */}

      <form
        onSubmit={handleSave}
        noValidate
      >
        <div className="za-add-product-grid">

          {/* LEFT COLUMN */}

          <div className="za-add-product-left">

            {/* PRODUCT INFORMATION */}

            <section className="za-add-card">

              <div className="za-add-card-heading">
                <UtensilsCrossed size={22} />

                <div>
                  <h2>
                    Product Information
                  </h2>

                  <p>
                    Enter the details of
                    your menu item.
                  </p>
                </div>
              </div>

              {/* PRODUCT TYPE */}

              <div className="za-add-field">
                <label>
                  Product Type *
                </label>

                <div className="za-add-kind-picker">

                  <button
                    type="button"
                    className={
                      draft.kind === 'food'
                        ? 'active'
                        : ''
                    }
                    disabled={saving}
                    aria-pressed={
                      draft.kind === 'food'
                    }
                    onClick={() =>
                      changeKind('food')
                    }
                  >
                    Food
                  </button>

                  <button
                    type="button"
                    className={
                      draft.kind === 'drink'
                        ? 'active'
                        : ''
                    }
                    disabled={saving}
                    aria-pressed={
                      draft.kind === 'drink'
                    }
                    onClick={() =>
                      changeKind('drink')
                    }
                  >
                    Drink
                  </button>

                  <button
                    type="button"
                    className={
                      draft.kind === 'snacks'
                        ? 'active'
                        : ''
                    }
                    disabled={saving}
                    aria-pressed={
                      draft.kind === 'snacks'
                    }
                    onClick={() =>
                      changeKind('snacks')
                    }
                  >
                    Snacks
                  </button>

                </div>

                {draft.kind === 'snacks' && (
                  <small
                    style={{
                      display: 'block',
                      marginTop: '8px',
                      color: '#8d776c',
                    }}
                  >
                    Snacks are managed
                    separately from Food and
                    Drinks and are intended
                    for the Zen Kitchen
                    snacks section.
                  </small>
                )}
              </div>

              {/* PRODUCT NAME */}

              <div className="za-add-field">
                <label htmlFor="za-add-name">
                  Product Name *
                </label>

                <input
                  id="za-add-name"
                  required
                  maxLength={100}
                  placeholder={
                    draft.kind === 'snacks'
                      ? 'e.g. Chicken Samosa'
                      : draft.kind === 'drink'
                        ? 'e.g. Iced Coffee'
                        : 'e.g. Chicken Biryani'
                  }
                  value={draft.name}
                  disabled={saving}
                  onChange={event =>
                    update(
                      'name',
                      event.target.value,
                    )
                  }
                />
              </div>

              {/* CATEGORY AND PRICE */}

              <div className="za-add-two-columns">

                {/* CATEGORY */}

                <div className="za-add-field">
                  <label htmlFor="za-add-category">
                    Category *
                  </label>

                  <div
                    style={{
                      position: 'relative',
                    }}
                  >
                    <select
                      id="za-add-category"
                      required
                      value={draft.category}
                      disabled={saving}
                      style={{
                        width: '100%',
                        paddingRight: '36px',
                      }}
                      onChange={event => {
                        const value =
                          event.target.value

                        if (
                          value ===
                          '__add_new_category__'
                        ) {
                          openNewCategory()
                          return
                        }

                        update(
                          'category',
                          value,
                        )

                        setCategoryError('')
                      }}
                    >
                      <option value="">
                        {loadingCategories
                          ? 'Loading categories...'
                          : 'Select category'}
                      </option>

                      {availableCategories.map(
                        category => (
                          <option
                            key={
                              category.toLocaleLowerCase()
                            }
                            value={category}
                          >
                            {category}
                          </option>
                        ),
                      )}

                      <option
                        value="__add_new_category__"
                      >
                        + Add New Category
                      </option>
                    </select>

                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: '50%',
                        right: '12px',
                        transform:
                          'translateY(-50%)',
                        pointerEvents: 'none',
                        color: '#a32722',
                      }}
                    />
                  </div>

                  {categoryLoadError && (
                    <p
                      role="alert"
                      style={{
                        marginTop: '8px',
                        color: '#a32722',
                        fontSize: '12px',
                      }}
                    >
                      {categoryLoadError}
                    </p>
                  )}

                  {!loadingCategories &&
                    !categoryLoadError &&
                    availableCategories.length ===
                      0 && (
                      <small
                        style={{
                          display: 'block',
                          marginTop: '8px',
                          color: '#8d776c',
                        }}
                      >
                        No existing{' '}
                        {getKindLabel(
                          draft.kind,
                        ).toLowerCase()}{' '}
                        categories. Select
                        + Add New Category.
                      </small>
                    )}
                </div>

                {/* PRICE */}

                <div className="za-add-field">
                  <label htmlFor="za-add-price">
                    Price (LKR) *
                  </label>

                  <input
                    id="za-add-price"
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    placeholder="e.g. 850"
                    value={draft.price}
                    disabled={saving}
                    onChange={event =>
                      update(
                        'price',
                        event.target.value,
                      )
                    }
                  />
                </div>
              </div>

              {/* ADD NEW CATEGORY */}

              {addingCategory && (
                <div
                  className="za-add-new-category"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: '10px',
                    padding: '14px',
                    marginBottom: '18px',
                    border:
                      '1px solid #ead4c9',
                    borderRadius: '12px',
                    background: '#fff9f5',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#a32722',
                      fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >
                    <Plus size={16} />

                    Add New{' '}
                    {getKindLabel(
                      draft.kind,
                    )}{' '}
                    Category
                  </div>

                  <input
                    ref={categoryInputRef}
                    type="text"
                    maxLength={80}
                    value={newCategory}
                    disabled={saving}
                    onChange={event => {
                      setNewCategory(
                        event.target.value,
                      )

                      setCategoryError('')
                    }}
                    onKeyDown={event => {
                      if (
                        event.key === 'Enter'
                      ) {
                        event.preventDefault()
                        void addCategory()
                      }

                      if (
                        event.key === 'Escape'
                      ) {
                        event.preventDefault()
                        cancelNewCategory()
                      }
                    }}
                    placeholder="Enter new category name"
                    aria-label="New category name"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />

                  {categoryError && (
                    <p
                      role="alert"
                      style={{
                        margin: 0,
                        color: '#a32722',
                        fontSize: '12px',
                      }}
                    >
                      {categoryError}
                    </p>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent:
                        'flex-end',
                      gap: '8px',
                    }}
                  >
                    <button
                      type="button"
                      disabled={saving}
                      onClick={
                        cancelNewCategory
                      }
                      style={{
                        padding:
                          '9px 13px',
                        border:
                          '1px solid #e4cfc4',
                        borderRadius: '8px',
                        background:
                          '#ffffff',
                        color: '#573b31',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      disabled={
                        saving ||
                        !newCategory.trim()
                      }
                      onClick={() => {
                        void addCategory()
                      }}
                      style={{
                        display:
                          'inline-flex',
                        alignItems:
                          'center',
                        gap: '6px',
                        padding:
                          '9px 13px',
                        border: 'none',
                        borderRadius: '8px',
                        background:
                          '#a32722',
                        color: '#ffffff',
                        fontWeight: 700,
                        cursor: 'pointer',
                        opacity:
                          !newCategory.trim()
                            ? 0.6
                            : 1,
                      }}
                    >
                      <Check size={15} />
                      Use Category
                    </button>
                  </div>

                  <small
                    style={{
                      color: '#907a70',
                      fontSize: '11px',
                      lineHeight: 1.5,
                    }}
                  >
                    This category will become
                    available in Add Product
                    and Edit Product after
                    the product is
                    successfully saved.
                  </small>
                </div>
              )}

              {/* DESCRIPTION */}

              <div className="za-add-field">
                <label htmlFor="za-add-description">
                  Description
                </label>

                <textarea
                  id="za-add-description"
                  rows={4}
                  maxLength={500}
                  placeholder="Write a short description..."
                  value={
                    draft.description
                  }
                  disabled={saving}
                  onChange={event =>
                    update(
                      'description',
                      event.target.value,
                    )
                  }
                />
              </div>

              {/* INGREDIENTS */}

              <div className="za-add-field">
                <label htmlFor="za-add-ingredients">
                  Ingredients
                </label>

                <textarea
                  id="za-add-ingredients"
                  rows={3}
                  placeholder={
                    draft.kind === 'drink'
                      ? 'e.g. Milk, coffee, ice...'
                      : draft.kind === 'snacks'
                        ? 'e.g. Potato, pastry, spices...'
                        : 'e.g. Rice, chicken, spices...'
                  }
                  value={
                    draft.ingredients
                  }
                  disabled={saving}
                  onChange={event =>
                    update(
                      'ingredients',
                      event.target.value,
                    )
                  }
                />
              </div>

              {/* SERVING AND DIETARY */}

              <div className="za-add-two-columns">

                <div className="za-add-field">
                  <label htmlFor="za-add-serving">
                    Serving Size
                  </label>

                  <input
                    id="za-add-serving"
                    placeholder={
                      draft.kind === 'drink'
                        ? 'e.g. 350 ml'
                        : draft.kind === 'snacks'
                          ? 'e.g. 2 pieces'
                          : 'e.g. 1 portion'
                    }
                    value={
                      draft.servingSize
                    }
                    disabled={saving}
                    onChange={event =>
                      update(
                        'servingSize',
                        event.target.value,
                      )
                    }
                  />
                </div>

                {isFoodOrSnacks(
                  draft.kind,
                ) ? (
                  <div className="za-add-field">
                    <label htmlFor="za-add-dietary">
                      Dietary Type
                    </label>

                    <select
                      id="za-add-dietary"
                      value={
                        draft.dietaryType
                      }
                      disabled={saving}
                      onChange={event =>
                        update(
                          'dietaryType',
                          event.target
                            .value as DietaryType,
                        )
                      }
                    >
                      <option value="veg">
                        Vegetarian
                      </option>

                      <option value="non-veg">
                        Non-Vegetarian
                      </option>
                    </select>
                  </div>
                ) : (
                  <div className="za-add-field">
                    <label htmlFor="za-add-dairy">
                      Dairy Type
                    </label>

                    <select
                      id="za-add-dairy"
                      value={
                        draft.dairyType
                      }
                      disabled={saving}
                      onChange={event =>
                        update(
                          'dairyType',
                          event.target
                            .value as DairyType,
                        )
                      }
                    >
                      <option value="milk">
                        Fresh Milk
                      </option>

                      <option value="milk-powder">
                        Milk Powder
                      </option>

                      <option value="dairy-free">
                        Dairy Free
                      </option>
                    </select>
                  </div>
                )}
              </div>

              {/* SPICE LEVEL */}

              {isFoodOrSnacks(
                draft.kind,
              ) && (
                <div className="za-add-field">
                  <label htmlFor="za-add-spice">
                    Spice Level
                  </label>

                  <select
                    id="za-add-spice"
                    value={
                      draft.spiceLevel
                    }
                    disabled={saving}
                    onChange={event =>
                      update(
                        'spiceLevel',
                        event.target
                          .value as SpiceLevel,
                      )
                    }
                  >
                    <option value="none">
                      Not Spicy
                    </option>

                    <option value="mild">
                      Mild
                    </option>

                    <option value="medium">
                      Medium
                    </option>

                    <option value="hot">
                      Hot
                    </option>
                  </select>
                </div>
              )}

            </section>

            {/* PRODUCT VISIBILITY */}

            <section className="za-add-card">
              <div className="za-add-card-heading">
                <Check size={22} />

                <div>
                  <h2>
                    Product Visibility
                  </h2>

                  <p>
                    Choose how the product
                    should appear.
                  </p>
                </div>
              </div>

              <Toggle
                label="Available"
                description="Show this product on the customer menu."
                checked={
                  draft.available
                }
                disabled={saving}
                onChange={value =>
                  update(
                    'available',
                    value,
                  )
                }
              />

              <Toggle
                label="Featured Product"
                description="Highlight this item on your menu."
                checked={
                  draft.featured
                }
                disabled={saving}
                onChange={value =>
                  update(
                    'featured',
                    value,
                  )
                }
              />

              <Toggle
                label="New Arrival"
                description="Mark this product as new."
                checked={draft.isNew}
                disabled={saving}
                onChange={value =>
                  update(
                    'isNew',
                    value,
                  )
                }
              />
            </section>

          </div>

          {/* RIGHT COLUMN */}

          <div className="za-add-product-right">

            {/* IMAGE UPLOAD */}

            <section className="za-add-card">
              <div className="za-add-card-heading">
                <ImagePlus size={22} />

                <div>
                  <h2>
                    Product Image
                  </h2>

                  <p>
                    Upload a photo of
                    your menu item.
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                disabled={saving}
                onChange={
                  handleImage
                }
              />

              <button
                type="button"
                className="za-add-upload"
                disabled={saving}
                onClick={() =>
                  fileInputRef.current?.click()
                }
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Selected product"
                  />
                ) : (
                  <>
                    <UploadCloud
                      size={35}
                    />

                    <strong>
                      Click to Upload Image
                    </strong>

                    <small>
                      JPG, PNG or WEBP · Max 12 MB
                    </small>
                  </>
                )}
              </button>

              {previewUrl && (
                <button
                  type="button"
                  className="za-add-remove-image"
                  disabled={saving}
                  onClick={() => {
                    void removeImage()
                  }}
                >
                  <X size={15} />
                  Remove Image
                </button>
              )}
            </section>

            {/* LIVE PREVIEW */}

            <section className="za-add-card">
              <div className="za-add-card-heading">
                <Eye size={22} />

                <div>
                  <h2>
                    Live Menu Preview
                  </h2>

                  <p>
                    Preview how your
                    product will look.
                  </p>
                </div>
              </div>

              <div className="za-add-preview">

                <div className="za-add-preview-image">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={
                        draft.name ||
                        'Product preview'
                      }
                    />
                  ) : (
                    <UtensilsCrossed
                      size={46}
                    />
                  )}
                </div>

                <div className="za-add-preview-info">
                  <span>
                    {draft.category ||
                      getKindLabel(
                        draft.kind,
                      )}
                  </span>

                  <h3>
                    {draft.name ||
                      'Your Product Name'}
                  </h3>

                  <p>
                    {draft.description ||
                      'Your product description will appear here.'}
                  </p>

                  <strong>
                    {draft.price.trim() !==
                      '' &&
                    Number.isFinite(
                      Number(
                        draft.price,
                      ),
                    )
                      ? `LKR ${Number(
                          draft.price,
                        ).toLocaleString(
                          'en-LK',
                        )}`
                      : 'LKR 0'}
                  </strong>
                </div>

                <div className="za-add-preview-badges">

                  {draft.featured && (
                    <span>
                      Featured
                    </span>
                  )}

                  {draft.isNew && (
                    <span>
                      New
                    </span>
                  )}

                  {!draft.available && (
                    <span>
                      Unavailable
                    </span>
                  )}

                </div>
              </div>
            </section>

          </div>
        </div>

        {/* ERROR MESSAGE */}

        {error && (
          <p
            className="za-add-feedback za-add-error"
            role="alert"
          >
            {error}
          </p>
        )}

        {/* SAVE / CANCEL */}

        <div className="za-add-actions">
          <button
            type="button"
            className="za-add-cancel"
            disabled={saving}
            onClick={() => {
              void handleCancel()
            }}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="za-primary"
            disabled={saving}
          >
            <Save size={17} />

            {saving
              ? 'Saving Product...'
              : 'Save Product'}
          </button>
        </div>

      </form>
    </div>
  )
}
