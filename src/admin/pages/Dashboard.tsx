
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
  ChevronRight,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'

import {
  readMenuCatalog,
  refreshMenuCatalog,
  subscribeMenuCatalog,
} from '../../data/menuStore'

import {
  isOfferCurrentlyActive,
  readOffers,
  refreshOffers,
  subscribeOffers,
} from '../../data/offerStore'

import {
  loadAdminBookings,
  readRoomBookings,
  subscribeRoomBookings,
  type RoomBooking,
  type BookingStatus,
} from '../../data/bookingStore'

import type { MenuItem } from '../../data/menu'
import type { ZenOffer } from '../../data/offerStore'
import type { AdminPage } from '../AdminApp'

import StatCard from '../components/StatCard'

/* ==========================================
   ZEN CAFÉ — ADMIN DASHBOARD
========================================== */

type Props = {
  onNavigate: (page: AdminPage) => void
  query: string
}

type ProductKind = 'all' | 'food' | 'drink'

/* ==========================================
   CONFIGURATION
========================================== */

const FALLBACK_IMAGE =
  '/assets/menu-panda-main.png'

const REFRESH_INTERVAL_MS = 30_000

/* ==========================================
   IMAGE HELPERS
========================================== */

function fallbackImage(
  event: SyntheticEvent<HTMLImageElement>,
): void {
  const image = event.currentTarget

  if (!image.src.endsWith(FALLBACK_IMAGE)) {
    image.src = FALLBACK_IMAGE
  }
}

function productImage(
  image?: string,
): string {
  if (
    !image ||
    image.startsWith('zen-menu-media:')
  ) {
    return FALLBACK_IMAGE
  }

  return image
}

/* ==========================================
   BOOKING DISPLAY HELPERS
========================================== */

function bookingStatusClass(
  status: BookingStatus,
): string {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return 'za-pill-green'

    case 'rejected':
    case 'cancelled':
      return 'za-pill-gray'

    case 'pending':
    case 'modification_proposed':
    default:
      return 'za-pill-amber'
  }
}

function bookingStatusLabel(
  status: BookingStatus,
): string {
  switch (status) {
    case 'pending':
      return 'Pending'

    case 'confirmed':
      return 'Confirmed'

    case 'rejected':
      return 'Rejected'

    case 'modification_proposed':
      return 'Modification Proposed'

    case 'cancelled':
      return 'Cancelled'

    case 'completed':
      return 'Completed'

    default:
      return status
  }
}

function formatBookingDate(
  value: string,
): string {
  if (!value) {
    return '—'
  }

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  )

  if (!match) {
    return value
  }

  const [, year, month, day] = match

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
  )

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatBookingTime(
  value: string,
): string {
  if (!value) {
    return '—'
  }

  const match = value.match(
    /^(\d{1,2}):(\d{2})/,
  )

  if (!match) {
    return value
  }

  const hours = Number(match[1])
  const minutes = match[2]

  if (
    !Number.isInteger(hours) ||
    hours < 0 ||
    hours > 23
  ) {
    return value
  }

  const period =
    hours >= 12 ? 'PM' : 'AM'

  const displayHours =
    hours % 12 || 12

  return `${displayHours}:${minutes} ${period}`
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message
  }

  return fallback
}

/* ==========================================
   MAIN DASHBOARD COMPONENT
========================================== */

export default function Dashboard({
  onNavigate,
  query,
}: Props) {
  /* ========================================
     STATE
  ======================================== */

  const [products, setProducts] =
    useState<MenuItem[]>(
      () => readMenuCatalog(),
    )

  const [offers, setOffers] =
    useState<ZenOffer[]>(
      () => readOffers(),
    )

  const [bookings, setBookings] =
    useState<RoomBooking[]>([])

  const [bookingsLoaded, setBookingsLoaded] =
    useState(false)

  const [kind, setKind] =
    useState<ProductKind>('all')

  const [productSearch, setProductSearch] =
    useState('')

  const [refreshing, setRefreshing] =
    useState(false)

  const [bookingError, setBookingError] =
    useState('')

  const [offerError, setOfferError] =
    useState('')

  const [productError, setProductError] =
    useState('')

  /* ========================================
     REFRESH CONTROL

     Prevent overlapping dashboard refreshes.
  ======================================== */

  const mountedRef = useRef(false)

  const refreshInProgressRef =
    useRef(false)

  const refreshQueuedRef =
    useRef(false)

  const refreshGenerationRef =
    useRef(0)

  /* ========================================
     SYNCHRONIZE MENU AND OFFERS
  ======================================== */

  const syncCatalog = useCallback(() => {
    if (!mountedRef.current) {
      return
    }

    setProducts(readMenuCatalog())
    setOffers(readOffers())
  }, [])

  /* ========================================
     SYNCHRONIZE BOOKING CACHE

     The booking store is the single source
     of truth for the frontend booking cache.
  ======================================== */

  const syncBookings = useCallback(() => {
    if (!mountedRef.current) {
      return
    }

    if (bookingsLoaded) {
      setBookings(readRoomBookings())
    }
  }, [bookingsLoaded])

  /* ========================================
     REFRESH DASHBOARD DATA

     IMPORTANT:

     Room bookings must be loaded using
     loadAdminBookings() from bookingStore.ts.

     Do not request /api/admin/bookings.

     bookingStore.ts already handles:
     - GET /api/bookings
     - Admin authentication headers
     - PostgreSQL response normalization
     - Sorting
     - Booking cache synchronization
  ======================================== */

  const refreshDashboard =
    useCallback(async (): Promise<void> => {
      if (refreshInProgressRef.current) {
        refreshQueuedRef.current = true
        return
      }

      refreshInProgressRef.current = true

      const generation =
        refreshGenerationRef.current

      if (mountedRef.current) {
        setRefreshing(true)
      }

      try {
        syncCatalog()

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

          // Correct shared booking service.
          loadAdminBookings(),
        ])

        if (
          !mountedRef.current ||
          generation !==
            refreshGenerationRef.current
        ) {
          return
        }

        /* ==================================
           PRODUCTS
        ================================== */

        if (
          productsResult.status ===
          'fulfilled'
        ) {
          setProducts(productsResult.value)
          setProductError('')
        } else {
          const message = getErrorMessage(
            productsResult.reason,
            'Unable to synchronize products.',
          )

          setProductError(message)

          console.error(
            '[Zen Café Dashboard] Products:',
            productsResult.reason,
          )
        }

        /* ==================================
           OFFERS
        ================================== */

        if (
          offersResult.status ===
          'fulfilled'
        ) {
          setOffers(offersResult.value)
          setOfferError('')
        } else {
          const message = getErrorMessage(
            offersResult.reason,
            'Unable to synchronize offers.',
          )

          setOfferError(message)

          console.error(
            '[Zen Café Dashboard] Offers:',
            offersResult.reason,
          )
        }

        /* ==================================
           ROOM BOOKINGS
        ================================== */

        if (
          bookingsResult.status ===
          'fulfilled'
        ) {
          setBookings(bookingsResult.value)

          setBookingsLoaded(true)
          setBookingError('')
        } else {
          const message = getErrorMessage(
            bookingsResult.reason,
            'Unable to load room bookings.',
          )

          setBookingError(message)

          console.error(
            '[Zen Café Dashboard] Bookings:',
            bookingsResult.reason,
          )
        }
      } finally {
        refreshInProgressRef.current = false

        if (
          mountedRef.current &&
          generation ===
            refreshGenerationRef.current
        ) {
          setRefreshing(false)

          if (refreshQueuedRef.current) {
            refreshQueuedRef.current = false

            void refreshDashboard()
          }
        }
      }
    }, [syncCatalog])

  /* ========================================
     LIVE STORE SUBSCRIPTIONS
  ======================================== */

  useEffect(() => {
    mountedRef.current = true

    refreshGenerationRef.current += 1

    /* MENU UPDATES */

    const stopMenu =
      subscribeMenuCatalog(() => {
        if (!mountedRef.current) {
          return
        }

        setProducts(readMenuCatalog())
      })

    /* OFFER UPDATES */

    const stopOffers =
      subscribeOffers(() => {
        if (!mountedRef.current) {
          return
        }

        setOffers(readOffers())
      })

    /* BOOKING UPDATES */

    const stopBookings =
      subscribeRoomBookings(() => {
        if (!mountedRef.current) {
          return
        }

        setBookings(readRoomBookings())
        setBookingsLoaded(true)
      })

    /* WINDOW FOCUS */

    const handleFocus = () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        void refreshDashboard()
      }
    }

    /* TAB VISIBILITY */

    const handleVisibilityChange = () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        void refreshDashboard()
      }
    }

    /* BROWSER STORAGE */

    const handleStorage = () => {
      syncCatalog()
    }

    window.addEventListener(
      'focus',
      handleFocus,
    )

    window.addEventListener(
      'storage',
      handleStorage,
    )

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    /* PERIODIC REFRESH */

    const interval = window.setInterval(
      () => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          void refreshDashboard()
        }
      },
      REFRESH_INTERVAL_MS,
    )

    /* INITIAL LOAD */

    void refreshDashboard()

    /* CLEANUP */

    return () => {
      mountedRef.current = false

      refreshGenerationRef.current += 1

      refreshQueuedRef.current = false

      stopMenu()
      stopOffers()
      stopBookings()

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

  /* ========================================
     SEARCH FILTERS
  ======================================== */

  const globalTerm =
    query.trim().toLowerCase()

  const localTerm =
    productSearch.trim().toLowerCase()

  /* ========================================
     FILTER PRODUCTS
  ======================================== */

  const filteredProducts = useMemo(() => {
    return products
      .filter(product => {
        const matchesKind =
          kind === 'all' ||
          product.kind === kind

        const searchableText = [
          product.name,
          product.category,
          product.description || '',
        ]
          .join(' ')
          .toLowerCase()

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

  /* ========================================
     FILTER OFFERS
  ======================================== */

  const filteredOffers = useMemo(() => {
    return offers
      .filter(offer => {
        const searchableText = [
          offer.title,
          offer.subtitle || '',
          offer.description || '',
        ]
          .join(' ')
          .toLowerCase()

        return (
          !globalTerm ||
          searchableText.includes(globalTerm)
        )
      })
      .slice(0, 5)
  }, [offers, globalTerm])

  /* ========================================
     FILTER BOOKINGS
  ======================================== */

  const filteredBookings = useMemo(() => {
    return bookings
      .filter(booking => {
        const searchableText = [
          booking.customerName,
          booking.email,
          booking.phone,
          booking.roomName,
          booking.bookingDate,
          booking.bookingTime,
          booking.status,
        ]
          .join(' ')
          .toLowerCase()

        return (
          !globalTerm ||
          searchableText.includes(globalTerm)
        )
      })
      .slice(0, 5)
  }, [bookings, globalTerm])

  /* ========================================
     DASHBOARD STATISTICS
  ======================================== */

  const totalProducts = products.length

  const activeOffers = useMemo(() => {
    return offers.filter(
      offer =>
        isOfferCurrentlyActive(offer),
    ).length
  }, [offers])

  const totalBookings = bookings.length

  /* ========================================
     RENDER DASHBOARD
  ======================================== */

  return (
    <div className="za-dashboard">

      {/* ====================================
          HERO BANNER
      ==================================== */}

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
            Manage your menu, offers and room
            bookings with ease.
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

      {/* ====================================
          SUMMARY CARDS
      ==================================== */}

      <section
        className="za-stats"
        aria-label="Dashboard overview"
      >
        <StatCard
          title="MENU ITEMS"
          value={totalProducts}
          subtitle={
            productError
              ? 'Last loaded products'
              : 'Total products'
          }
          icon={UtensilsCrossed}
          tone="rose"
          onClick={() =>
            onNavigate('products')
          }
        />

        <StatCard
          title="ACTIVE OFFERS"
          value={activeOffers}
          subtitle={
            offerError
              ? 'Last loaded offers'
              : 'Live promotions'
          }
          icon={Tags}
          tone="amber"
          onClick={() =>
            onNavigate('offers')
          }
        />

        <StatCard
          title="ROOM BOOKINGS"
          value={totalBookings}
          subtitle={
            bookingError
              ? bookingsLoaded
                ? 'Last loaded requests'
                : 'Bookings unavailable'
              : bookingsLoaded
                ? 'Total requests'
                : 'Loading requests'
          }
          icon={CalendarDays}
          tone="green"
          onClick={() =>
            onNavigate('bookings')
          }
        />
      </section>

      {/* ====================================
          MANAGEMENT PANELS
      ==================================== */}

      <section className="za-panels">

        {/* ==================================
            MENU / PRODUCTS
        ================================== */}

        <article className="za-panel za-products-panel">
          <div className="za-panel-head">
            <div className="za-panel-heading">
              <h2>
                <UtensilsCrossed />

                <span>
                  Menu / Products
                </span>
              </h2>

              <p>
                Add, edit and manage your food
                and drink items.
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
              ).map(value => (
                <button
                  key={value}
                  type="button"
                  className={
                    kind === value
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setKind(value)
                  }
                  aria-pressed={
                    kind === value
                  }
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
                onChange={event =>
                  setProductSearch(
                    event.target.value,
                  )
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
                {filteredProducts.map(
                  product => (
                    <tr key={product.id}>
                      <td>
                        <img
                          className="za-thumb"
                          src={productImage(
                            product.image,
                          )}
                          alt={product.name}
                          onError={
                            fallbackImage
                          }
                        />
                      </td>

                      <td className="za-product-name">
                        <strong>
                          {product.name}
                        </strong>

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
                              onNavigate(
                                'products',
                              )
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
                              onNavigate(
                                'products',
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>

            {filteredProducts.length === 0 && (
              <p className="za-empty">
                No matching products found.
              </p>
            )}
          </div>

          {productError && (
            <p
              className="za-empty"
              role="alert"
            >
              Products synchronization error:{' '}
              {productError}
            </p>
          )}
        </article>

        {/* ==================================
            OFFERS & PROMOTIONS
        ================================== */}

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
            {filteredOffers.map(offer => {
              const isActive =
                isOfferCurrentlyActive(
                  offer,
                )

              return (
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
                    onError={
                      fallbackImage
                    }
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
                      isActive
                        ? 'za-pill-green'
                        : 'za-pill-gray'
                    }`}
                  >
                    {isActive
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
                    <MoreHorizontal
                      size={19}
                    />
                  </button>
                </div>
              )
            })}

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
              Offers synchronization error:{' '}
              {offerError}
            </p>
          )}
        </article>

        {/* ==================================
            ROOM BOOKINGS
        ================================== */}

        <article className="za-panel za-bookings-panel">
          <div className="za-panel-head">
            <div className="za-panel-heading">
              <h2>
                <CalendarDays />

                <span>
                  Room Bookings
                </span>
              </h2>

              <p>
                View and manage room booking
                requests.
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

          {/* ==================================
              BOOKING ERROR MESSAGE
          ================================== */}

          {bookingError && (
            <div
              className="za-empty"
              role="alert"
            >
              <p>
                {bookingError}
              </p>

              <button
                type="button"
                className="za-view-all"
                disabled={refreshing}
                onClick={() => {
                  void refreshDashboard()
                }}
              >
                <span>
                  {refreshing
                    ? 'Retrying...'
                    : 'Retry Loading Bookings'}
                </span>

                <RefreshCw
                  size={16}
                  className={
                    refreshing
                      ? 'animate-spin'
                      : ''
                  }
                />
              </button>
            </div>
          )}

          {/* ==================================
              BOOKING TABLE
          ================================== */}

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
                {filteredBookings.map(
                  booking => (
                    <tr key={booking.id}>
                      <td>
                        <strong>
                          {booking.customerName ||
                            'Customer'}
                        </strong>

                        <small>
                          {booking.phone ||
                            '—'}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {formatBookingDate(
                            booking.bookingDate,
                          )}
                        </strong>

                        <small>
                          {formatBookingTime(
                            booking.bookingTime ||
                              booking.startTime ||
                              '',
                          )}
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
                          {bookingStatusLabel(
                            booking.status,
                          )}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="za-row-action za-view-booking"
                          title="View booking"
                          aria-label={`View booking for ${booking.customerName}`}
                          onClick={() =>
                            onNavigate(
                              'bookings',
                            )
                          }
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>

            {filteredBookings.length === 0 &&
              !bookingError &&
              !refreshing &&
              bookingsLoaded && (
                <p className="za-empty">
                  No booking requests found.
                </p>
              )}

            {filteredBookings.length === 0 &&
              !bookingError &&
              !bookingsLoaded && (
                <p className="za-empty">
                  Loading room bookings...
                </p>
              )}
          </div>

          {/* ==================================
              VIEW ALL BOOKINGS
          ================================== */}

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

            <ChevronRight
              size={18}
            />
          </button>
        </article>
      </section>
    </div>
  )
}
