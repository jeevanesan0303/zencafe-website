
import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'

import {
  readMenuCatalog,
  subscribeMenuCatalog,
} from '../../data/menuStore'

import {
  readOffers,
  subscribeOffers,
} from '../../data/offerStore'

import type { MenuItem } from '../../data/menu'
import type { ZenOffer } from '../../data/offerStore'
import type { AdminPage } from '../AdminApp'
import StatCard from '../components/StatCard'

type Booking = {
  id: string
  name: string
  phone?: string
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

const BOOKING_KEY = 'zen-room-bookings-v18'
const FALLBACK_IMAGE = '/assets/menu-panda-main.png'

function readBookings(): Booking[] {
  try {
    const data: unknown = JSON.parse(
      localStorage.getItem(BOOKING_KEY) || '[]'
    )

    return Array.isArray(data) ? (data as Booking[]) : []
  } catch {
    return []
  }
}

function fallbackImage(
  event: React.SyntheticEvent<HTMLImageElement>
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

  if (normalized === 'confirmed' || normalized === 'accepted') {
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

export default function Dashboard({
  onNavigate,
  query,
}: Props) {
  const [products, setProducts] = useState<MenuItem[]>(
    () => readMenuCatalog()
  )

  const [offers, setOffers] = useState<ZenOffer[]>(
    () => readOffers()
  )

  const [bookings, setBookings] = useState<Booking[]>(
    () => readBookings()
  )

  const [kind, setKind] = useState<ProductKind>('all')
  const [productSearch, setProductSearch] = useState('')

  useEffect(() => {
    const stopMenu = subscribeMenuCatalog(() => {
      setProducts(readMenuCatalog())
    })

    const stopOffers = subscribeOffers(() => {
      setOffers(readOffers())
    })

    const syncBookings = () => {
      setBookings(readBookings())
    }

    window.addEventListener('storage', syncBookings)
    window.addEventListener('focus', syncBookings)

    return () => {
      stopMenu()
      stopOffers()
      window.removeEventListener('storage', syncBookings)
      window.removeEventListener('focus', syncBookings)
    }
  }, [])

  const globalTerm = query.trim().toLowerCase()
  const localTerm = productSearch.trim().toLowerCase()

  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => {
        const matchesKind =
          kind === 'all' || product.kind === kind

        const searchableText =
          `${product.name} ${product.category} ${product.description || ''}`
            .toLowerCase()

        const matchesGlobal =
          !globalTerm || searchableText.includes(globalTerm)

        const matchesLocal =
          !localTerm || searchableText.includes(localTerm)

        return matchesKind && matchesGlobal && matchesLocal
      })
      .slice(0, 5)
  }, [products, kind, globalTerm, localTerm])

  const filteredOffers = useMemo(() => {
    return offers
      .filter((offer) =>
        `${offer.title} ${offer.subtitle || ''}`
          .toLowerCase()
          .includes(globalTerm)
      )
      .slice(0, 5)
  }, [offers, globalTerm])

  const filteredBookings = useMemo(() => {
    return bookings
      .filter((booking) =>
        `${booking.name} ${booking.phone || ''} ${booking.date}`
          .toLowerCase()
          .includes(globalTerm)
      )
      .slice(0, 5)
  }, [bookings, globalTerm])

  const activeOffers = offers.filter(
    (offer) => offer.active
  ).length

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
          value={products.length}
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
          value={bookings.length}
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
                Add, edit and manage your food and drink items.
              </p>
            </div>

            <button
              type="button"
              className="za-primary"
              onClick={() => onNavigate('add-product')}
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
              {(['all', 'food', 'drink'] as const).map(
                (value) => (
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
                )
              )}
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
                        src={productImage(product.image)}
                        alt={product.name}
                        onError={fallbackImage}
                      />
                    </td>

                    <td className="za-product-name">
                      <strong>{product.name}</strong>
                      <small>
                        {product.description || 'Menu item'}
                      </small>
                    </td>

                    <td>{product.category}</td>

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
                <span>Offers &amp; Promotions</span>
              </h2>
              <p>
                Create and manage special offers.
              </p>
            </div>

            <button
              type="button"
              className="za-primary"
              onClick={() => onNavigate('offers')}
            >
              <Plus size={17} />
              Add Offer
            </button>
          </div>

          <div className="za-offer-list">
            {filteredOffers.map((offer) => (
              <div className="za-offer" key={offer.id}>
                <img
                  src={offer.image || FALLBACK_IMAGE}
                  alt={offer.title}
                  onError={fallbackImage}
                />

                <div className="za-offer-details">
                  <strong>{offer.title}</strong>

                  <small>
                    {offer.subtitle || 'Special café offer'}
                  </small>

                  <small className="za-offer-date">
                    Offer scheduling coming in Phase 3
                  </small>
                </div>

                <span
                  className={`za-pill ${
                    offer.active
                      ? 'za-pill-green'
                      : 'za-pill-gray'
                  }`}
                >
                  {offer.active ? 'Active' : 'Inactive'}
                </span>

                <button
                  type="button"
                  className="za-offer-more"
                  aria-label={`Manage ${offer.title}`}
                  onClick={() => onNavigate('offers')}
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
          </div>

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
                      <strong>{booking.name}</strong>
                      <small>{booking.phone || '—'}</small>
                    </td>

                    <td>
                      <strong>{booking.date}</strong>
                      <small>{booking.time}</small>
                    </td>

                    <td>{booking.guests}</td>

                    <td>
                      <span
                        className={`za-pill ${bookingStatusClass(
                          booking.status
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

            {filteredBookings.length === 0 && (
              <p className="za-empty">
                No booking requests found.
              </p>
            )}
          </div>

          <button
            type="button"
            className="za-view-all"
            onClick={() => onNavigate('bookings')}
          >
            <span>View All Bookings</span>
            <ChevronRight size={18} />
          </button>
        </article>

      </section>
    </div>
  )
}
