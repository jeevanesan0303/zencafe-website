
import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import type { FormEvent } from 'react'

import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react'

import {
  readMenuCatalog,
  loadMenuCatalog,
  subscribeMenuCatalog,
  updateMenuProduct,
  deleteMenuProduct,
  resolveStoredMenuImage,
  isStoredMenuImageRef,
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

const FALLBACK_IMAGE =
  '/assets/menu-panda-main.png'

/* ==========================================
   HELPERS
========================================== */

function formatPrice(value?: number) {
  return typeof value === 'number' &&
    Number.isFinite(value)
    ? `LKR ${value.toLocaleString('en-LK', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}`
    : 'Not set'
}

function getInitialDraft(
  product: MenuItem
): EditDraft {
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
  fallback: string
) {
  return error instanceof Error
    ? error.message
    : fallback
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
      : product.image || FALLBACK_IMAGE
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

        objectUrl = url.startsWith('blob:')
          ? url
          : null

        setSource(url)
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
        event.currentTarget.src =
          FALLBACK_IMAGE
      }}
    />
  )
}

/* ==========================================
   PRODUCTS PAGE
========================================== */

export default function Products({
  onNavigate,
  query = '',
}: Props) {
  const [catalog, setCatalog] =
    useState<MenuItem[]>(
      () => readMenuCatalog()
    )

  const [filter, setFilter] =
    useState<Filter>('all')

  const [search, setSearch] = useState('')

  const [editing, setEditing] =
    useState<MenuItem | null>(null)

  const [draft, setDraft] =
    useState<EditDraft>({
      name: '',
      category: '',
      description: '',
      ingredients: '',
      serving: '',
      price: '',
      available: true,
      featured: false,
      isNew: false,
    })

  const [saving, setSaving] = useState(false)

  const [busyId, setBusyId] =
    useState<string | null>(null)

  const [error, setError] = useState('')
  const [editError, setEditError] = useState('')
  const [loading, setLoading] = useState(false)

  /* ==========================================
     SYNC PRODUCT CATALOG
  ========================================== */

  useEffect(() => {
    let active = true
    setLoading(true)

    loadMenuCatalog({ all: true })
      .then(items => {
        if (active) {
          setCatalog(items)
          setError('')
        }
      })
      .catch(caughtError => {
        if (active) {
          setError(
            getErrorMessage(
              caughtError,
              'Unable to load products from database.'
            )
          )
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    const sync = () => {
      setCatalog(readMenuCatalog())
    }

    const unsubscribe =
      subscribeMenuCatalog(sync)

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  /* ==========================================
     FILTERING AND COUNTS
  ========================================== */

  const products = useMemo(
    () => [...catalog],
    [catalog]
  )

  const filtered = useMemo(() => {
    const localSearch =
      search.trim().toLowerCase()

    const globalSearch =
      query.trim().toLowerCase()

    return products.filter(product => {
      const matchesType =
        filter === 'all' ||
        product.kind === filter

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
    product => product.kind === 'food'
  ).length

  const drinkCount = products.filter(
    product => product.kind === 'drink'
  ).length

  const availableCount = products.filter(
    product => product.available
  ).length

  /* ==========================================
     START EDIT
  ========================================== */

  function startEdit(product: MenuItem) {
    if (busyId || saving) return

    setEditing(product)
    setDraft(getInitialDraft(product))
    setEditError('')
    setError('')
  }

  /* ==========================================
     EDIT DRAFT
  ========================================== */

  function updateDraft<K extends keyof EditDraft>(
    key: K,
    value: EditDraft[K]
  ) {
    setDraft(previous => ({
      ...previous,
      [key]: value,
    }))

    setEditError('')
  }

  /* ==========================================
     CLOSE EDIT WITH CONFIRMATION
  ========================================== */

  async function closeEdit() {
    if (saving || !editing) return

    const initialDraft =
      getInitialDraft(editing)

    const hasUnsavedChanges =
      JSON.stringify(draft) !==
      JSON.stringify(initialDraft)

    if (hasUnsavedChanges) {
      const confirmed =
        await AdminAlert.confirm(
          'Discard Changes?',
          'Your unsaved product changes will be lost.',
          'Yes, Discard'
        )

      if (!confirmed) return
    }

    setEditing(null)
    setEditError('')
  }

  /* ==========================================
     SAVE PRODUCT EDIT
  ========================================== */

  async function saveEdit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (!editing || saving) return

    const name = draft.name.trim()
    const category = draft.category.trim()
    const priceText = draft.price.trim()

    if (!name) {
      const message =
        'Product name is required.'

      setEditError(message)

      await AdminAlert.warning(
        'Product Name Required',
        message
      )

      return
    }

    if (!category) {
      const message =
        'Product category is required.'

      setEditError(message)

      await AdminAlert.warning(
        'Category Required',
        message
      )

      return
    }

    const price =
      priceText === ''
        ? undefined
        : Number(priceText)

    if (
      priceText !== '' &&
      (
        price === undefined ||
        !Number.isFinite(price) ||
        price < 0
      )
    ) {
      const message =
        'Enter a valid price in LKR.'

      setEditError(message)

      await AdminAlert.warning(
        'Invalid Product Price',
        message
      )

      return
    }

    setSaving(true)
    setEditError('')

    try {
      await updateMenuProduct(editing.id, {
        name,
        category,
        description:
          draft.description.trim(),
        ingredients:
          draft.ingredients.trim(),
        serving:
          draft.serving.trim(),
        price,
        available: draft.available,
        featured: draft.featured,
        isNew: draft.isNew,
      })

      setEditing(null)
      setError('')

      await AdminAlert.productUpdated()
    } catch (caughtError) {
      const message = getErrorMessage(
        caughtError,
        'Unable to save product changes.'
      )

      setEditError(message)

      await AdminAlert.error(
        'Update Failed',
        message
      )
    } finally {
      setSaving(false)
    }
  }

  /* ==========================================
     TOGGLE PRODUCT AVAILABILITY
  ========================================== */

  async function toggleAvailability(
    product: MenuItem
  ) {
    if (busyId || saving) return

    const nextAvailable =
      !product.available

    const confirmed =
      await AdminAlert.confirm(
        nextAvailable
          ? 'Make Product Available?'
          : 'Hide This Product?',
        nextAvailable
          ? `"${product.name}" will become available on the menu.`
          : `"${product.name}" will be hidden from the menu.`,
        nextAvailable
          ? 'Yes, Make Available'
          : 'Yes, Hide Product'
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
          : `"${product.name}" has been hidden from your menu.`
      )
    } catch (caughtError) {
      const message = getErrorMessage(
        caughtError,
        'Unable to update product availability.'
      )

      setError(message)

      await AdminAlert.error(
        'Availability Update Failed',
        message
      )
    } finally {
      setBusyId(null)
    }
  }

  /* ==========================================
     DELETE PRODUCT
  ========================================== */

  async function requestDelete(
    product: MenuItem
  ) {
    if (busyId || saving) return

    const confirmed =
      await AdminAlert.confirmDelete(
        `"${product.name}"`
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
        'Unable to delete the product.'
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
    <div className="za-products-page">

      {/* BREADCRUMB */}

      <div className="za-products-breadcrumb">
        <button
          type="button"
          onClick={() =>
            onNavigate('dashboard')
          }
        >
          Dashboard
        </button>

        <span>/</span>

        <strong>
          Menu / Products
        </strong>
      </div>

      {/* PAGE HEADER */}

      <div className="za-products-page-head">

        <div>
          <p className="za-kicker">
            MENU MANAGEMENT
          </p>

          <h1>
            Menu / Products
          </h1>

          <p>
            Manage the food and drinks
            displayed on your café menu.
          </p>
        </div>

        <button
          type="button"
          className="za-primary"
          onClick={() =>
            onNavigate('add-product')
          }
        >
          <Plus size={18} />
          Add New Product
        </button>

      </div>

      {/* SUMMARY CARDS */}

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

      {/* PAGE ERROR */}

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

        {/* FILTERS AND SEARCH */}

        <div className="za-product-management-filters">

          <div className="za-filter-pills">

            {([
              ['all', 'All Products'],
              ['food', 'Food'],
              ['drink', 'Drinks'],
            ] as const).map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={
                    filter === value
                      ? 'active'
                      : ''
                  }
                  aria-pressed={
                    filter === value
                  }
                  onClick={() =>
                    setFilter(value)
                  }
                >
                  {label}
                </button>
              )
            )}

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

                  {/* PRODUCT */}

                  <td>
                    <div className="za-management-product">

                      <ProductImage
                        product={product}
                      />

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
                                background: 'rgba(163,39,34,0.12)',
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

                  {/* TYPE */}

                  <td>
                    <span className="za-type-pill">
                      {product.kind === 'drink'
                        ? 'Drink'
                        : 'Food'}
                    </span>
                  </td>

                  {/* CATEGORY */}

                  <td>
                    {product.category}
                  </td>

                  {/* PRICE */}

                  <td className="za-management-price">
                    {formatPrice(product.price)}
                  </td>

                  {/* AVAILABILITY */}

                  <td>
                    <button
                      type="button"
                      className={`za-availability-toggle ${
                        product.available
                          ? 'is-active'
                          : ''
                      }`}
                      disabled={
                        busyId !== null ||
                        saving
                      }
                      onClick={() =>
                        toggleAvailability(
                          product
                        )
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

                  {/* ACTIONS */}

                  <td>
                    <div className="za-table-actions">

                      <button
                        type="button"
                        className="za-row-action"
                        title={`Edit ${product.name}`}
                        aria-label={`Edit ${product.name}`}
                        disabled={
                          busyId !== null ||
                          saving
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
                          busyId !== null ||
                          saving
                        }
                        onClick={() =>
                          requestDelete(product)
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

          {/* EMPTY OR LOADING STATE */}

          {filtered.length === 0 && (
            <div className="za-management-empty">
              {loading ? (
                <>
                  <RefreshCw size={30} className="animate-spin" />
                  <h3>Loading products...</h3>
                  <p>Fetching latest menu items from PostgreSQL database.</p>
                </>
              ) : (
                <>
                  <Search size={30} />
                  <h3>No products found</h3>
                  <p>Try changing the filter or search term.</p>
                </>
              )}
            </div>
          )}

        </div>

      </section>

      {/* EDIT PRODUCT MODAL */}

      {editing && (
        <div
          className="za-edit-overlay"
          role="presentation"
          onMouseDown={event => {
            if (
              event.target ===
              event.currentTarget
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
                onClick={() => {
                  void closeEdit()
                }}
                disabled={saving}
                aria-label="Close editor"
              >
                <X size={22} />
              </button>

            </div>

            <form
              onSubmit={saveEdit}
              noValidate
            >

              {/* PRODUCT NAME */}

              <label>
                Product Name

                <input
                  required
                  maxLength={100}
                  value={draft.name}
                  onChange={event =>
                    updateDraft(
                      'name',
                      event.target.value
                    )
                  }
                />
              </label>

              {/* CATEGORY */}

              <label>
                Category

                <input
                  required
                  value={draft.category}
                  onChange={event =>
                    updateDraft(
                      'category',
                      event.target.value
                    )
                  }
                />
              </label>

              {/* PRICE */}

              <label>
                Price (LKR)

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Enter price"
                  value={draft.price}
                  onChange={event =>
                    updateDraft(
                      'price',
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
                  value={draft.description}
                  onChange={event =>
                    updateDraft(
                      'description',
                      event.target.value
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
                  onChange={event =>
                    updateDraft(
                      'ingredients',
                      event.target.value
                    )
                  }
                />
              </label>

              {/* SERVING SIZE */}

              <label>
                Serving Size

                <input
                  value={draft.serving}
                  onChange={event =>
                    updateDraft(
                      'serving',
                      event.target.value
                    )
                  }
                />
              </label>

              {/* AVAILABILITY */}

              <label className="za-edit-checkbox">

                <input
                  type="checkbox"
                  checked={draft.available}
                  onChange={event =>
                    updateDraft(
                      'available',
                      event.target.checked
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
                  onChange={event =>
                    updateDraft(
                      'featured',
                      event.target.checked
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
                  onChange={event =>
                    updateDraft(
                      'isNew',
                      event.target.checked
                    )
                  }
                />

                New Arrival
              </label>

              {/* EDIT ERROR */}

              {editError && (
                <p
                  className="za-add-feedback za-add-error"
                  role="alert"
                >
                  {editError}
                </p>
              )}

              {/* MODAL ACTIONS */}

              <div className="za-edit-dialog-actions">

                <button
                  type="button"
                  className="za-edit-cancel"
                  onClick={() => {
                    void closeEdit()
                  }}
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
                  <Check size={17} />

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
