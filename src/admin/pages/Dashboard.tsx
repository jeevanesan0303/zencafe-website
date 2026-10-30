
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react'

import {
  CalendarDays,
  Eye,
  Plus,
  Tags,
  UtensilsCrossed,
  Pencil,
  Trash2,
  Search,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react'

import {
  readMenuCatalog,
  refreshMenuCatalog,
  subscribeMenuCatalog,
} from '../../data/menuStore'

import {
  readOffers,
  refreshOffers,
  subscribeOffers,
  isOfferCurrentlyActive,
} from '../../data/offerStore'

import type { MenuItem } from '../../data/menu'
import type { ZenOffer } from '../../data/offerStore'
import type { AdminPage } from '../AdminApp'

import StatCard from '../components/StatCard'

/* =========================================================
   TYPES
========================================================= */

type Booking = {
  id: string
  name: string
  phone: string
  date: string
  time: string
  guests: number
  status: string
}

type Props = {
  onNavigate: (page: AdminPage) => void
  query: string
}

type ProductKind = 'all' | 'food' | 'drink'

type ApiRecord = Record<string, unknown>

/* =========================================================
   CONFIGURATION
========================================================= */

const FALLBACK_IMAGE = '/assets/menu-panda-main.png'

const REFRESH_INTERVAL_MS = 30_000

const BOOKING_ENDPOINT = '/api/admin/bookings'

/* =========================================================
   HELPERS
========================================================= */

function fallbackImage(
  event: SyntheticEvent<HTMLImageElement>,
) {
  const image = event.currentTarget

  if (!image.src.endsWith(FALLBACK_IMAGE)) {
    image.src = FALLBACK_IMAGE
  }
}

function productImage(image?: string) {
  if (!image || image.startsWith('zen-menu-media:')) {
    return FALLBACK_IMAGE
  }

  return image
}

function bookingStatusClass(status: string) {
  const normalized = status.toLowerCase()

  if (
    normalized === 'confirmed' ||
    normalized === 'accepted'
  ) {
    return 'za-pill-green'
  }

  if (
    normalized === 'rejected' ||
    normalized === 'cancelled'
  ) {
    return 'za-pill-gray'
  }

  return 'za-pill-amber'
}

function toRecord(value: unknown): ApiRecord | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null
  }

  return value as ApiRecord
}

function toStringValue(value: unknown): string {
  if (typeof value === 'string') return value

  if (typeof value === 'number') {
    return String(value)
  }

  return ''
}

function toNumberValue(value: unknown): number {
  const number = Number(value)

  return Number.isFinite(number) ? number : 0
}

function firstString(
  record: ApiRecord,
  keys: string[],
): string {
  for (const key of keys) {
    const value = toStringValue(record[key])

    if (value) return value
  }

  return ''
}

function normalizeBooking(value: unknown): Booking | null {
  const booking = toRecord(value)

  if (!booking) return null

  const id = firstString(booking, [
    'id',
    'bookingId',
    'booking_id',
  ])

  if (!id) return null

  const name = firstString(booking, [
    'customerName',
    'customer_name',
    'name',
  ])

  const phone = firstString(booking, [
    'customerPhone',
    'customer_phone',
    'phone',
  ])

  const date = firstString(booking, [
    'date',
    'bookingDate',
    'booking_date',
  ])

  const time = firstString(booking, [
    'time',
    'startTime',
    'start_time',
  ])

  const status = firstString(booking, ['status'])

  const guests = toNumberValue(
    booking.guests ??
      booking.guestCount ??
      booking.guest_count,
  )

  return {
    id,
    name: name || 'Customer',
    phone,
    date,
    time,
    guests,
    status: status || 'pending',
  }
}

function extractBookings(payload: unknown): Booking[] {
  if (Array.isArray(payload)) {
    return payload
      .map(normalizeBooking)
      .filter(
        (item): item is Booking => item !== null,
      )
  }

  const response = toRecord(payload)

  if (!response) {
    throw new Error('Invalid bookings API response.')
  }

  if (response.success === false) {
    throw new Error(
      toStringValue(response.error) ||
        'Unable to load bookings.',
    )
  }

  const data = toRecord(response.data)

  const candidates = [
    response.bookings,
    response.items,
    response.results,
    data?.bookings,
    data?.items,
    data?.results,
    response.data,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map(normalizeBooking)
        .filter(
          (item): item is Booking => item !== null,
        )
    }
  }

  throw new Error(
    'Bookings response does not contain a booking list.',
  )
}

/* =========================================================
   DASHBOARD
========================================================= */

export default function Dashboard({
  onNavigate,
  query,
}: Props) {
  const [products, setProducts] = useState<MenuItem[]>(
    () => readMenuCatalog(),
  )

  const [offers, setOffers] = useState<ZenOffer[]>(
    () => readOffers(),
  )

  const [bookings, setBookings] = useState<Booking[]>([])

  const [kind, setKind] = useState<ProductKind>('all')

  const [productSearch, setProductSearch] = useState('')

  const [refreshing, setRefreshing] = useState(false)

  const [bookingError, setBookingError] = useState('')

  const [offerError, setOfferError] = useState('')

  const mountedRef = useRef(false)

  const refreshInProgressRef = useRef(false)

  /* =======================================================
     SYNCHRONIZE SHARED STORES
  ======================================================= */

  const syncCatalog = useCallback(() => {
    setProducts(readMenuCatalog())
    setOffers(readOffers())
  }, [])

  /* =======================================================
     FETCH BOOKINGS FROM LIVE API
  ======================================================= */

  const loadBookings = useCallback(async () => {
    const response = await fetch(BOOKING_ENDPOINT, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          'Admin session expired. Please sign in again.',
        )
      }

      if (response.status === 403) {
        throw new Error(
          'You do not have permission to view bookings.',
        )
      }

      throw new Error(
        `Unable to load bookings (HTTP ${response.status}).`,
      )
    }

    const payload: unknown = await response.json()

    return extractBookings(payload)
  }, [])

  /* =======================================================
     REFRESH DASHBOARD

     Offers and bookings refresh independently.
     A failure in one does not block the other.
  ======================================================= */

 const refreshDashboard = useCallback(async () => {
  if (refreshInProgressRef.current) return

  refreshInProgressRef.current = true

  if (mountedRef.current) {
    setRefreshing(true)
  }

  try {
    syncCatalog()

    // Fetch products, offers and bookings independently.
    const [
      productsResult,
      offersResult,
      bookingsResult,
    ] = await Promise.allSettled([
      refreshMenuCatalog({
        all: true,
        force: true,
      }),
      refreshOffers(true),
      loadBookings(),
    ])

    if (!mountedRef.current) return

    // PRODUCTS
    if (productsResult.status === 'fulfilled') {
      setProducts(productsResult.value)
    } else {
      console.error(
        '[Zen Dashboard] Products refresh failed:',
        productsResult.reason,
      )
    }

    // OFFERS
    if (offersResult.status === 'fulfilled') {
      setOffers(offersResult.value)
      setOfferError('')
    } else {
      const message =
        offersResult.reason instanceof Error
          ? offersResult.reason.message
          : 'Unable to synchronize offers.'

      setOfferError(message)

      console.error(
        '[Zen Dashboard] Offers refresh failed:',
        offersResult.reason,
      )
    }

    // BOOKINGS
    if (bookingsResult.status === 'fulfilled') {
      setBookings(bookingsResult.value)
      setBookingError('')
    } else {
      const message =
        bookingsResult.reason instanceof Error
          ? bookingsResult.reason.message
          : 'Unable to synchronize bookings.'

      setBookingError(message)

      console.error(
        '[Zen Dashboard] Bookings refresh failed:',
        bookingsResult.reason,
      )
    }
  } finally {
    refreshInProgressRef.current = false

    if (mountedRef.current) {
      setRefreshing(false)
    }
  }
}, [loadBookings, syncCatalog])
  /* =======================================================
     LIVE SYNCHRONIZATION

     Refresh when:
     - Dashboard opens
     - Browser regains focus
     - Tab becomes visible
     - Another tab changes storage
     - 30-second refresh interval runs
  ======================================================= */

  useEffect(() => {
    mountedRef.current = true

    const stopMenu = subscribeMenuCatalog(() => {
      if (mountedRef.current) {
        setProducts(readMenuCatalog())
      }
    })

    const stopOffers = subscribeOffers(() => {
      if (mountedRef.current) {
        setOffers(readOffers())
      }
    })

    const handleFocus = () => {
      void refreshDashboard()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshDashboard()
      }
    }

    const handleStorage = () => {
      syncCatalog()
      void refreshDashboard()
    }

    window.addEventListener('focus', handleFocus)

    window.addEventListener(
      'storage',
      handleStorage,
    )

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshDashboard()
      }
    }, REFRESH_INTERVAL_MS)

    void refreshDashboard()

    return () => {
      mountedRef.current = false

      stopMenu()
      stopOffers()

      window.removeEventListener(
        'focus',
        handleFocus,
      )

      window.removeEventListener(
        'storage',
        handleStorage,
      )

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )

      window.clearInterval(interval)
    }
  }, [refreshDashboard, syncCatalog])

  /* =======================================================
     FILTERS
  ======================================================= */

  const globalTerm = query.trim().toLowerCase()

  const localTerm = productSearch.trim().toLowerCase()

  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => {
        const matchesKind =
          kind === 'all' || product.kind === kind

        const searchableText =
          `${product.name} ${product.category} ${
            product.description || ''
          }`.toLowerCase()

        const matchesGlobal =
          !globalTerm ||
          searchableText.includes(globalTerm)

        const matchesLocal =
          !localTerm ||
          searchableText.includes(localTerm)

        return (
          matchesKind &&
          matchesGlobal &&
          matchesLocal
        )
      })
      .slice(0, 5)
  }, [
    products,
    kind,
    globalTerm,
    localTerm,
  ])

  const filteredOffers = useMemo(() => {
    return offers
      .filter((offer) =>
        `${offer.title} ${offer.subtitle || ''}`
          .toLowerCase()
          .includes(globalTerm),
      )
      .slice(0, 5)
  }, [offers, globalTerm])

  const filteredBookings = useMemo(() => {
    return bookings
      .filter((booking) =>
        `${booking.name} ${booking.phone} ${
          booking.date
        }`
          .toLowerCase()
          .includes(globalTerm),
      )
      .slice(0, 5)
  }, [bookings, globalTerm])

  /* =======================================================
     DASHBOARD STATISTICS
  ======================================================= */

  const totalProducts = products.length

  const activeOffers = useMemo(() => {
    return offers.filter(
      (offer) => isOfferCurrentlyActive(offer),
    ).length
  }, [offers])

  const totalBookings = bookings.length

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="za-dashboard">

      {/* HERO BANNER */}

      <section className="za-hero">
        <div className="za-hero-copy">
          <p className="za-kicker">
            WELCOME BACK
          </p>

          <h1 className="za-hero-title">
            Zen Café Admin

            <span
              className="za-hero-sparkles"
              aria-hidden="true"
            >
              <span>✦</span>
              <span>✦</span>
            </span>
          </h1>

          <p className="za-hero-description">
            Manage your menu, offers and room bookings
            with ease.
          </p>
        </div>

        <div
          className="za-hero-art"
          aria-label="Great Food, Happier Moments"
        >
          <div className="za-hero-handwriting">
            <span>Great Food</span>
            <span>Happier</span>
            <span>
              Moments <b>♥</b>
            </span>
          </div>
        </div>
      </section>

      {/* SUMMARY CARDS */}

      <section
        className="za-stats"
        aria-label="Dashboard overview"
      >
        <StatCard
          title="MENU ITEMS"
          value={totalProducts}
          subtitle="Total products"
          icon={UtensilsCrossed}
          tone="rose"
          onClick={() => onNavigate('products')}
        />

        <StatCard
          title="ACTIVE OFFERS"
          value={activeOffers}
          subtitle="Live promotions"
          icon={Tags}
          tone="amber"
          onClick={() => onNavigate('offers')}
        />

        <StatCard
          title="ROOM BOOKINGS"
          value={totalBookings}
          subtitle="Total requests"
          icon={CalendarDays}
          tone="green"
          onClick={() => onNavigate('bookings')}
        />
      </section>

      {/* MANAGEMENT OVERVIEW */}

      <section className="za-panels">

        {/* MENU PRODUCTS */}

        <article className="za-panel za-products-panel">
          <div className="za-panel-head">
            <div className="za-panel-heading">
              <h2>
                <UtensilsCrossed />
                <span>Menu / Products</span>
              </h2>

              <p>
                Add, edit and manage your food and drink
                items.
              </p>
            </div>

            <button
              type="button"
              className="za-primary"
              onClick={() =>
                onNavigate('add-product')
              }
            >
              <Plus size={17} />
              Add Product
            </button>
          </div>

          <div className="za-product-controls">
            <div
              className="za-filter-pills"
              aria-label="Filter products"
            >
              {(
                [
                  'all',
                  'food',
                  'drink',
                ] as const
              ).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={
                    kind === value ? 'active' : ''
                  }
                  onClick={() => setKind(value)}
                  aria-pressed={kind === value}
                >
                  {value === 'all'
                    ? 'All'
                    : value === 'food'
                      ? 'Food'
                      : 'Drinks'}
                </button>
              ))}
            </div>

            <label className="za-product-search">
              <Search size={16} />

              <input
                type="search"
                value={productSearch}
                onChange={(event) =>
                  setProductSearch(event.target.value)
                }
                placeholder="Search products..."
                aria-label="Search products"
              />
            </label>
          </div>

          <div className="za-table-wrap">
            <table className="za-table za-products-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <img
                        className="za-thumb"
                        src={productImage(
                          product.image,
                        )}
                        alt={product.name}
                        onError={fallbackImage}
                      />
                    </td>

                    <td className="za-product-name">
                      <strong>{product.name}</strong>

                      <small>
                        {product.description ||
                          'Menu item'}
                      </small>
                    </td>

                    <td>
                      {product.category}
                    </td>

                    <td className="za-price">
                      —
                    </td>

                    <td>
                      <span
                        className={`za-pill ${
                          product.available
                            ? 'za-pill-green'
                            : 'za-pill-gray'
                        }`}
                      >
                        {product.available
                          ? 'Active'
                          : 'Hidden'}
                      </span>
                    </td>

                    <td>
                      <div className="za-table-actions">
                        <button
                          type="button"
                          className="za-row-action"
                          title="Manage product"
                          aria-label={`Manage ${product.name}`}
                          onClick={() =>
                            onNavigate('products')
                          }
                        >
                          <Pencil size={15} />
                        </button>

                        <button
                          type="button"
                          className="za-row-action za-delete"
                          title="Manage product deletion"
                          aria-label={`Manage deletion of ${product.name}`}
                          onClick={() =>
                            onNavigate('products')
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredProducts.length === 0 && (
              <p className="za-empty">
                No matching products found.
              </p>
            )}
          </div>
        </article>

        {/* OFFERS */}

        <article className="za-panel za-offers-panel">
          <div className="za-panel-head">
            <div className="za-panel-heading">
              <h2>
                <Tags />
                <span>
                  Offers &amp; Promotions
                </span>
              </h2>

              <p>
                Create and manage special offers.
              </p>
            </div>

            <button
              type="button"
              className="za-primary"
              onClick={() =>
                onNavigate('offers')
              }
            >
              <Plus size={17} />
              Add Offer
            </button>
          </div>

          <div className="za-offer-list">
            {filteredOffers.map((offer) => (
              <div
                className="za-offer"
                key={offer.id}
              >
                <img
                  src={
                    offer.image ||
                    FALLBACK_IMAGE
                  }
                  alt={offer.title}
                  onError={fallbackImage}
                />

                <div className="za-offer-details">
                  <strong>
                    {offer.title}
                  </strong>

                  <small>
                    {offer.subtitle ||
                      'Special café offer'}
                  </small>
                </div>

                <span
                  className={`za-pill ${
                    isOfferCurrentlyActive(offer)
                      ? 'za-pill-green'
                      : 'za-pill-gray'
                  }`}
                >
                  {isOfferCurrentlyActive(offer)
                    ? 'Active'
                    : 'Inactive'}
                </span>

                <button
                  type="button"
                  className="za-offer-more"
                  aria-label={`Manage ${offer.title}`}
                  onClick={() =>
                    onNavigate('offers')
                  }
                >
                  <MoreHorizontal size={19} />
                </button>
              </div>
            ))}

            {filteredOffers.length === 0 && (
              <p className="za-empty">
                No matching offers found.
              </p>
            )}
          </div>

          {offerError && (
            <p
              className="za-empty"
              role="alert"
            >
              Offers synchronization error: {offerError}
            </p>
          )}
        </article>

        {/* ROOM BOOKINGS */}

        <article className="za-panel za-bookings-panel">
          <div className="za-panel-head">
            <div className="za-panel-heading">
              <h2>
                <CalendarDays />
                <span>Room Bookings</span>
              </h2>

              <p>
                View and manage room booking requests.
              </p>
            </div>

            <button
              type="button"
              className="za-row-action"
              title="Refresh dashboard"
              aria-label="Refresh dashboard data"
              disabled={refreshing}
              onClick={() => {
                void refreshDashboard()
              }}
            >
              <RefreshCw
                size={17}
                className={
                  refreshing
                    ? 'animate-spin'
                    : ''
                }
              />
            </button>
          </div>

          {bookingError && (
            <p
              className="za-empty"
              role="alert"
            >
              {bookingError}
            </p>
          )}

          <div className="za-table-wrap">
            <table className="za-table za-bookings-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Date &amp; Time</th>
                  <th>Guests</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <strong>
                        {booking.name}
                      </strong>

                      <small>
                        {booking.phone || '—'}
                      </small>
                    </td>

                    <td>
                      <strong>
                        {booking.date || '—'}
                      </strong>

                      <small>
                        {booking.time || '—'}
                      </small>
                    </td>

                    <td>
                      {booking.guests}
                    </td>

                    <td>
                      <span
                        className={`za-pill ${bookingStatusClass(
                          booking.status,
                        )}`}
                      >
                        {booking.status}
                      </span>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="za-row-action za-view-booking"
                        title="View booking"
                        aria-label={`View booking for ${booking.name}`}
                        onClick={() =>
                          onNavigate('bookings')
                        }
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredBookings.length === 0 &&
              !bookingError && (
                <p className="za-empty">
                  No booking requests found.
                </p>
              )}
          </div>

          <button
            type="button"
            className="za-view-all"
            onClick={() =>
              onNavigate('bookings')
            }
          >
            <span>
              View All Bookings
            </span>

            <ChevronRight size={18} />
          </button>
        </article>
      </section>
    </div>
  )
}
