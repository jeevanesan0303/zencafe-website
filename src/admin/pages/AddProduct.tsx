
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

const CATEGORY_STORAGE_KEY =
  'zen-admin-categories-v1'

const DEFAULT_CATEGORIES: Record<
  MenuKind,
  string[]
> = {
  food: [
    'Signature',
    'Rice Specials',
    'Wraps',
    'Street Grill',
    'Burgers',
    'Snacks',
    'Sandwiches',
    'Desserts',
    'Breakfast',
  ],

  drink: [
    'Milkshake',
    'Berry Special',
    'Chocolate',
    'Mojito',
    'Iced Coffee',
    'Hot Drinks',
    'Iced Drinks',
    'Smoothies',
    'Fresh Juices',
    'Tea',
  ],
}

/* ==========================================
   CATEGORY STORAGE
========================================== */

function readCategories(): Record<
  MenuKind,
  string[]
> {
  try {
    const raw = localStorage.getItem(
      CATEGORY_STORAGE_KEY
    )

    if (!raw) {
      return {
        food: [...DEFAULT_CATEGORIES.food],
        drink: [...DEFAULT_CATEGORIES.drink],
      }
    }

    const parsed: unknown = JSON.parse(raw)

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return {
        food: [...DEFAULT_CATEGORIES.food],
        drink: [...DEFAULT_CATEGORIES.drink],
      }
    }

    const saved = parsed as Partial<
      Record<MenuKind, string[]>
    >

    return {
      food: [
        ...new Set([
          ...DEFAULT_CATEGORIES.food,
          ...(Array.isArray(saved.food)
            ? saved.food.filter(
                (value): value is string =>
                  typeof value === 'string'
              )
            : []),
        ]),
      ],

      drink: [
        ...new Set([
          ...DEFAULT_CATEGORIES.drink,
          ...(Array.isArray(saved.drink)
            ? saved.drink.filter(
                (value): value is string =>
                  typeof value === 'string'
              )
            : []),
        ]),
      ],
    }
  } catch {
    return {
      food: [...DEFAULT_CATEGORIES.food],
      drink: [...DEFAULT_CATEGORIES.drink],
    }
  }
}

/* ==========================================
   ERROR HELPER
========================================== */

function getErrorMessage(
  error: unknown,
  fallback: string
) {
  return error instanceof Error
    ? error.message
    : fallback
}

/* ==========================================
   TOGGLE COMPONENT
========================================== */

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description: string
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

  const [categories, setCategories] =
    useState(readCategories)

  const [newCategory, setNewCategory] =
    useState('')

  const [
    addingCategory,
    setAddingCategory,
  ] = useState(false)

  const [
    selectedFile,
    setSelectedFile,
  ] = useState<File | null>(null)

  const [previewUrl, setPreviewUrl] =
    useState('')

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const fileInputRef =
    useRef<HTMLInputElement>(null)

  const previewUrlRef = useRef('')

  /* ==========================================
     CLEAN UP IMAGE OBJECT URL
  ========================================== */

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(
          previewUrlRef.current
        )
      }
    }
  }, [])

  function setImagePreview(url: string) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(
        previewUrlRef.current
      )
    }

    previewUrlRef.current = url
    setPreviewUrl(url)
  }

  /* ==========================================
     AVAILABLE CATEGORIES
  ========================================== */

  const availableCategories = useMemo(
    () => categories[draft.kind],
    [categories, draft.kind]
  )

  /* ==========================================
     UNSAVED CHANGES
  ========================================== */

  const hasUnsavedChanges = useMemo(() => {
    const draftChanged =
      JSON.stringify(draft) !==
      JSON.stringify(INITIAL_DRAFT)

    return (
      draftChanged ||
      selectedFile !== null ||
      newCategory.trim() !== ''
    )
  }, [draft, selectedFile, newCategory])

  /* ==========================================
     UPDATE FIELD
  ========================================== */

  function update<K extends keyof ProductDraft>(
    key: K,
    value: ProductDraft[K]
  ) {
    setDraft(previous => ({
      ...previous,
      [key]: value,
    }))

    setError('')
  }

  /* ==========================================
     CHANGE PRODUCT TYPE
  ========================================== */

  function changeKind(kind: MenuKind) {
    if (saving) return

    setDraft(previous => ({
      ...previous,
      kind,
      category: '',
      spiceLevel: 'none',
    }))

    setError('')
  }

  /* ==========================================
     ADD NEW CATEGORY
  ========================================== */

  async function addCategory() {
    if (saving) return

    const name = newCategory.trim()

    if (!name) {
      const message =
        'Please enter a category name.'

      setError(message)

      await AdminAlert.warning(
        'Category Name Required',
        message
      )

      return
    }

    const existing =
      categories[draft.kind]

    if (
      existing.some(
        category =>
          category.toLowerCase() ===
          name.toLowerCase()
      )
    ) {
      const message =
        'This category already exists.'

      setError(message)

      await AdminAlert.warning(
        'Duplicate Category',
        message
      )

      return
    }

    const next = {
      ...categories,
      [draft.kind]: [...existing, name],
    }

    try {
      localStorage.setItem(
        CATEGORY_STORAGE_KEY,
        JSON.stringify(next)
      )

      setCategories(next)

      update('category', name)

      setNewCategory('')
      setAddingCategory(false)

      await AdminAlert.success(
        'Category Added!',
        `"${name}" has been added successfully.`
      )
    } catch (caughtError) {
      const message = getErrorMessage(
        caughtError,
        'Unable to save the new category.'
      )

      setError(message)

      await AdminAlert.error(
        'Category Save Failed',
        message
      )
    }
  }

  /* ==========================================
     IMAGE UPLOAD
  ========================================== */

  async function handleImage(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]

    if (!file) return

    event.target.value = ''

    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/webp',
    ]

    if (!allowedTypes.includes(file.type)) {
      const message =
        'Please select a JPG, PNG, or WebP image.'

      setError(message)

      await AdminAlert.warning(
        'Invalid Image Format',
        message
      )

      return
    }

    if (file.size > 12 * 1024 * 1024) {
      const message =
        'Image must be smaller than 12 MB.'

      setError(message)

      await AdminAlert.warning(
        'Image Too Large',
        message
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
        message
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
    if (!selectedFile || saving) return

    const confirmed =
      await AdminAlert.confirm(
        'Remove Product Image?',
        'The selected image will be removed from this product.',
        'Yes, Remove'
      )

    if (!confirmed) return

    clearImage()

    await AdminAlert.success(
      'Image Removed',
      'The product image has been removed.'
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
          'Yes, Discard'
        )

      if (!confirmed) return
    }

    onNavigate('products')
  }

  /* ==========================================
     SAVE PRODUCT
  ========================================== */

  async function handleSave(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (saving) return

    const name = draft.name.trim()
    const category = draft.category.trim()
    const priceText = draft.price.trim()
    const price = Number(priceText)

    if (!name) {
      const message =
        'Please enter a product name.'

      setError(message)

      await AdminAlert.warning(
        'Product Name Required',
        message
      )

      return
    }

    if (!category) {
      const message =
        'Please select a category.'

      setError(message)

      await AdminAlert.warning(
        'Category Required',
        message
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
        message
      )

      return
    }

    setSaving(true)
    setError('')

    let savedImage = ''
    let productCreated = false

    try {
      /* PREPARE IMAGE */

      if (selectedFile) {
        savedImage =
          await prepareStoredMenuImage(
            selectedFile
          )
      }

      /* CREATE PRODUCT */

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
            : '#a32722',

        available: draft.available,
        featured: draft.featured,
        isNew: draft.isNew,

        createdAt:
          new Date().toISOString(),

        ...(draft.kind === 'food'
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

      /* SAVE TO EXISTING MENU STORE */

      await addMenuProduct(product)
      productCreated = true

      /* RESET FORM */

      clearImage()
      setDraft({ ...INITIAL_DRAFT })
      setNewCategory('')
      setAddingCategory(false)

      /* SUCCESS SWEET ALERT */

      await AdminAlert.productAdded()

      /* RETURN TO PRODUCTS */

      onNavigate('products')
    } catch (caughtError) {
      /*
       * If image storage succeeded but
       * product creation failed, clean
       * up the stored image.
       *
       * Never delete an image after the
       * product has been successfully
       * created.
       */

      if (savedImage && !productCreated) {
        try {
          await deleteStoredMenuImage(
            savedImage
          )
        } catch {
          // Preserve the original error.
        }
      }

      const message = getErrorMessage(
        caughtError,
        'Unable to save the product.'
      )

      setError(message)

      await AdminAlert.error(
        'Product Creation Failed',
        message
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
            Create a food or drink item
            for your Zen Café menu.
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
                    onClick={() =>
                      changeKind('drink')
                    }
                  >
                    Drink
                  </button>

                </div>

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
                  placeholder="e.g. Chicken Biryani"
                  value={draft.name}
                  disabled={saving}
                  onChange={event =>
                    update(
                      'name',
                      event.target.value
                    )
                  }
                />

              </div>

              {/* CATEGORY AND PRICE */}

              <div className="za-add-two-columns">

                <div className="za-add-field">

                  <label htmlFor="za-add-category">
                    Category *
                  </label>

                  <select
                    id="za-add-category"
                    required
                    value={draft.category}
                    disabled={saving}
                    onChange={event =>
                      update(
                        'category',
                        event.target.value
                      )
                    }
                  >
                    <option value="">
                      Select category
                    </option>

                    {availableCategories.map(
                      category => (
                        <option
                          key={category}
                          value={category}
                        >
                          {category}
                        </option>
                      )
                    )}
                  </select>

                  <button
                    type="button"
                    className="za-add-category-button"
                    disabled={saving}
                    onClick={() =>
                      setAddingCategory(
                        previous => !previous
                      )
                    }
                  >
                    <Plus size={14} />
                    Add Category
                  </button>

                </div>

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
                        event.target.value
                      )
                    }
                  />

                </div>

              </div>

              {/* ADD NEW CATEGORY */}

              {addingCategory && (
                <div className="za-add-new-category">

                  <input
                    value={newCategory}
                    disabled={saving}
                    onChange={event =>
                      setNewCategory(
                        event.target.value
                      )
                    }
                    placeholder="New category name"
                    aria-label="New category name"
                  />

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      void addCategory()
                    }}
                  >
                    <Check size={16} />
                    Add
                  </button>

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
                  value={draft.description}
                  disabled={saving}
                  onChange={event =>
                    update(
                      'description',
                      event.target.value
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
                  placeholder="e.g. Rice, chicken, spices..."
                  value={draft.ingredients}
                  disabled={saving}
                  onChange={event =>
                    update(
                      'ingredients',
                      event.target.value
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
                    placeholder="e.g. 1 portion / 350 ml"
                    value={draft.servingSize}
                    disabled={saving}
                    onChange={event =>
                      update(
                        'servingSize',
                        event.target.value
                      )
                    }
                  />

                </div>

                {draft.kind === 'food' ? (

                  <div className="za-add-field">

                    <label htmlFor="za-add-dietary">
                      Dietary Type
                    </label>

                    <select
                      id="za-add-dietary"
                      value={draft.dietaryType}
                      disabled={saving}
                      onChange={event =>
                        update(
                          'dietaryType',
                          event.target.value as DietaryType
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
                      value={draft.dairyType}
                      disabled={saving}
                      onChange={event =>
                        update(
                          'dairyType',
                          event.target.value as DairyType
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

              {draft.kind === 'food' && (
                <div className="za-add-field">

                  <label htmlFor="za-add-spice">
                    Spice Level
                  </label>

                  <select
                    id="za-add-spice"
                    value={draft.spiceLevel}
                    disabled={saving}
                    onChange={event =>
                      update(
                        'spiceLevel',
                        event.target.value as SpiceLevel
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
                checked={draft.available}
                onChange={value =>
                  update('available', value)
                }
              />

              <Toggle
                label="Featured Product"
                description="Highlight this item on your menu."
                checked={draft.featured}
                onChange={value =>
                  update('featured', value)
                }
              />

              <Toggle
                label="New Arrival"
                description="Mark this product as new."
                checked={draft.isNew}
                onChange={value =>
                  update('isNew', value)
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
                onChange={handleImage}
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
                    <UploadCloud size={35} />

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

                    <UtensilsCrossed size={46} />

                  )}

                </div>

                <div className="za-add-preview-info">

                  <span>
                    {draft.category ||
                      'Category'}
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
                    {draft.price.trim() !== '' &&
                    Number.isFinite(
                      Number(draft.price)
                    )
                      ? `LKR ${Number(
                          draft.price
                        ).toLocaleString(
                          'en-LK'
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
