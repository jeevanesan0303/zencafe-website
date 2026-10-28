import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Check,
  Clock3,
  ExternalLink,
  Eye,
  Filter,
  Image as ImageIcon,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react'

import type { AdminPage } from '../AdminApp'
import { getAdminAuthHeaders } from '../../admin-auth'
import AdminAlert from '../utils/sweetAlert'

/* ==========================================
   TYPES
========================================== */

export type GalleryPhoto = {
  id: string
  title: string | null
  description: string | null
  imageUrl: string
  image_url?: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  customerName: string
  customerEmail: string
  customerPhone?: string
}

type Props = {
  onNavigate: (page: AdminPage) => void
  query?: string
}

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected'

/* ==========================================
   HELPERS
========================================== */

function formatDate(iso: string) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return iso
  }
}

/* ==========================================
   GALLERY MODERATION COMPONENT
========================================== */

export default function Gallery({ onNavigate, query = '' }: Props) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<FilterTab>('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [previewPhoto, setPreviewPhoto] = useState<GalleryPhoto | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  // Load photos from PostgreSQL via /api/gallery/admin/photos
  async function loadPhotos() {
    setLoading(true)
    setError('')
    try {
      const headers = getAdminAuthHeaders()
      const res = await fetch('/api/gallery/admin/photos?status=all', {
        headers,
      })
      if (!res.ok) {
        throw new Error(`Failed to load photos: ${res.statusText}`)
      }
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to load gallery photos.')
      }
      setPhotos(data.photos || [])
    } catch (err) {
      console.error('Error fetching admin gallery photos:', err)
      setError(err instanceof Error ? err.message : 'Failed to load photos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPhotos()
  }, [])

  // Listen for Escape key on preview modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && previewPhoto) {
        setPreviewPhoto(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewPhoto])

  // Statistics counts
  const stats = useMemo(() => {
    const total = photos.length
    const pending = photos.filter(p => p.status === 'pending').length
    const approved = photos.filter(p => p.status === 'approved').length
    const rejected = photos.filter(p => p.status === 'rejected').length
    return { total, pending, approved, rejected }
  }, [photos])

  // Filtered photos
  const effectiveSearch = (query || searchTerm).trim().toLowerCase()
  const filteredPhotos = useMemo(() => {
    return photos.filter(p => {
      // Tab filter
      if (activeTab !== 'all' && p.status !== activeTab) {
        return false
      }
      // Search filter
      if (effectiveSearch) {
        const name = (p.customerName || '').toLowerCase()
        const email = (p.customerEmail || '').toLowerCase()
        const caption = (p.description || p.title || '').toLowerCase()
        if (
          !name.includes(effectiveSearch) &&
          !email.includes(effectiveSearch) &&
          !caption.includes(effectiveSearch)
        ) {
          return false
        }
      }
      return true
    })
  }, [photos, activeTab, effectiveSearch])

  /* ==========================================
     ACTIONS
  ========================================== */

  // Approve Photo
  async function handleApprove(photo: GalleryPhoto) {
    const confirmed = await AdminAlert.confirm(
      'Approve Photo',
      `Publish this photo by ${photo.customerName || 'customer'} to the public Community Gallery?`,
      'Yes, Approve'
    )
    if (!confirmed) return

    setActionInProgress(photo.id)
    try {
      const headers = getAdminAuthHeaders()
      const res = await fetch(`/api/gallery/admin/photos/${photo.id}/approve`, {
        method: 'POST',
        headers,
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to approve photo.')
      }

      setPhotos(prev =>
        prev.map(p => (p.id === photo.id ? { ...p, status: 'approved' } : p))
      )
      if (previewPhoto?.id === photo.id) {
        setPreviewPhoto(prev => (prev ? { ...prev, status: 'approved' } : null))
      }

      await AdminAlert.success(
        'Photo Approved',
        'Photo is now live in the public community gallery.'
      )
    } catch (err) {
      console.error('Approve error:', err)
      await AdminAlert.error(
        'Approval Failed',
        err instanceof Error ? err.message : 'Unable to approve photo.'
      )
    } finally {
      setActionInProgress(null)
    }
  }

  // Reject Photo
  async function handleReject(photo: GalleryPhoto) {
    const confirmed = await AdminAlert.confirm(
      'Reject Photo',
      `Reject this photo from public display? The photo will not appear in the public gallery.`,
      'Yes, Reject'
    )
    if (!confirmed) return

    setActionInProgress(photo.id)
    try {
      const headers = getAdminAuthHeaders()
      const res = await fetch(`/api/gallery/admin/photos/${photo.id}/reject`, {
        method: 'POST',
        headers,
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reject photo.')
      }

      setPhotos(prev =>
        prev.map(p => (p.id === photo.id ? { ...p, status: 'rejected' } : p))
      )
      if (previewPhoto?.id === photo.id) {
        setPreviewPhoto(prev => (prev ? { ...prev, status: 'rejected' } : null))
      }

      await AdminAlert.warning(
        'Photo Rejected',
        'Photo marked as rejected and hidden from public display.'
      )
    } catch (err) {
      console.error('Reject error:', err)
      await AdminAlert.error(
        'Rejection Failed',
        err instanceof Error ? err.message : 'Unable to reject photo.'
      )
    } finally {
      setActionInProgress(null)
    }
  }

  // Delete Photo
  async function handleDelete(photo: GalleryPhoto) {
    const confirmed = await AdminAlert.confirmDelete(
      `photo #${photo.id} by ${photo.customerName || 'customer'}`
    )
    if (!confirmed) return

    setActionInProgress(photo.id)
    try {
      const headers = getAdminAuthHeaders()
      const res = await fetch(`/api/gallery/admin/photos/${photo.id}`, {
        method: 'DELETE',
        headers,
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete photo.')
      }

      setPhotos(prev => prev.filter(p => p.id !== photo.id))
      if (previewPhoto?.id === photo.id) {
        setPreviewPhoto(null)
      }

      await AdminAlert.success(
        'Photo Deleted',
        'Photo record and storage file have been permanently removed.'
      )
    } catch (err) {
      console.error('Delete error:', err)
      await AdminAlert.error(
        'Deletion Failed',
        err instanceof Error ? err.message : 'Unable to delete photo.'
      )
    } finally {
      setActionInProgress(null)
    }
  }

  /* ==========================================
     RENDER
  ========================================== */

  return (
    <div className="za-bookings-page">
      {/* BREADCRUMB */}
      <div className="za-products-breadcrumb">
        <button type="button" onClick={() => onNavigate('dashboard')}>
          Dashboard
        </button>
        <span>/</span>
        <strong>Community Gallery Moderation</strong>
      </div>

      {/* PAGE HEADER */}
      <div className="za-products-page-head">
        <div>
          <p className="za-kicker">PHOTO MODERATION</p>
          <h1>Community Gallery & Moderation</h1>
          <p>
            Review customer photo submissions from PostgreSQL, preview high-res images,
            approve for the public carousel, or reject/delete.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="za-row-action !h-10 !w-auto !px-4 !rounded-full !border !border-[#513226]/15 bg-white font-bold"
            onClick={loadPhotos}
            title="Refresh from PostgreSQL"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span className="ml-1.5 text-xs">Refresh</span>
          </button>
        </div>
      </div>

      {/* STATISTICS */}
      <div className="za-product-summary">
        <div className="za-product-summary-card">
          <span>Total Photos</span>
          <strong>{stats.total}</strong>
          <small>All uploads in PostgreSQL</small>
        </div>

        <div className="za-product-summary-card">
          <span>Pending Review</span>
          <strong style={{ color: '#d97706' }}>{stats.pending}</strong>
          <small>Awaiting admin decision</small>
        </div>

        <div className="za-product-summary-card">
          <span>Approved (Public)</span>
          <strong style={{ color: '#16a34a' }}>{stats.approved}</strong>
          <small>Live on public website</small>
        </div>

        <div className="za-product-summary-card">
          <span>Rejected</span>
          <strong style={{ color: '#dc2626' }}>{stats.rejected}</strong>
          <small>Hidden from public view</small>
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            className="text-xs underline font-semibold"
            onClick={loadPhotos}
          >
            Retry
          </button>
        </div>
      )}

      {/* FILTER TABS & SEARCH */}
      <div className="za-filter-bar flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`za-filter-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            <Clock3 size={14} className="mr-1" />
            Pending
            <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {stats.pending}
            </span>
          </button>

          <button
            type="button"
            className={`za-filter-btn ${activeTab === 'approved' ? 'active' : ''}`}
            onClick={() => setActiveTab('approved')}
          >
            <ShieldCheck size={14} className="mr-1" />
            Approved
            <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              {stats.approved}
            </span>
          </button>

          <button
            type="button"
            className={`za-filter-btn ${activeTab === 'rejected' ? 'active' : ''}`}
            onClick={() => setActiveTab('rejected')}
          >
            <XCircle size={14} className="mr-1" />
            Rejected
            <span className="ml-1.5 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
              {stats.rejected}
            </span>
          </button>

          <button
            type="button"
            className={`za-filter-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Photos ({stats.total})
          </button>
        </div>

        {/* SEARCH INPUT */}
        <div className="relative min-w-[260px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            size={16}
          />
          <input
            type="text"
            className="field-input !pl-9 !py-2 !text-xs w-full"
            placeholder="Search customer, email, caption..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              onClick={() => setSearchTerm('')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* PHOTO GRID */}
      {loading ? (
        <div className="rounded-3xl border border-[#513226]/10 bg-white/70 p-12 text-center text-stone-500">
          <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-stone-400" />
          <p className="text-sm font-medium">Loading photos from PostgreSQL...</p>
        </div>
      ) : filteredPhotos.length === 0 ? (
        <div className="rounded-3xl border border-[#513226]/10 bg-white/70 p-12 text-center text-stone-500">
          <ImageIcon size={36} className="mx-auto mb-3 text-stone-300" />
          <p className="font-serif text-lg text-stone-700">No photos found</p>
          <p className="text-xs text-stone-400 mt-1">
            {activeTab === 'pending'
              ? 'There are no pending photos awaiting moderation.'
              : 'No photos match your current filter and search criteria.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredPhotos.map(photo => {
            const isPending = photo.status === 'pending'
            const isApproved = photo.status === 'approved'
            const isRejected = photo.status === 'rejected'
            const isBusy = actionInProgress === photo.id

            return (
              <div
                key={photo.id}
                className="group relative flex flex-col overflow-hidden rounded-3xl border border-[#513226]/10 bg-white shadow-sm transition hover:shadow-md"
              >
                {/* IMAGE PREVIEW CONTAINER */}
                <div
                  className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100 cursor-pointer"
                  onClick={() => setPreviewPhoto(photo)}
                >
                  <img
                    src={photo.imageUrl || photo.image_url}
                    alt={photo.description || 'Customer upload'}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    loading="lazy"
                  />

                  {/* STATUS BADGE */}
                  <div className="absolute top-3 left-3">
                    {isPending && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-bold text-white shadow backdrop-blur-sm">
                        <Clock3 size={12} /> Pending
                      </span>
                    )}
                    {isApproved && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2.5 py-1 text-[11px] font-bold text-white shadow backdrop-blur-sm">
                        <Check size={12} /> Approved
                      </span>
                    )}
                    {isRejected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-600/90 px-2.5 py-1 text-[11px] font-bold text-white shadow backdrop-blur-sm">
                        <X size={12} /> Rejected
                      </span>
                    )}
                  </div>

                  {/* HOVER OVERLAY BUTTON */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-stone-800 shadow">
                      <Eye size={14} /> Preview
                    </span>
                  </div>
                </div>

                {/* DETAILS CONTAINER */}
                <div className="flex flex-1 flex-col p-4">
                  {/* CUSTOMER INFO */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-stone-800 truncate flex items-center gap-1">
                        <User size={13} className="text-stone-400" />
                        {photo.customerName || 'Customer'}
                      </span>
                      <span className="text-[10px] text-stone-400">
                        #{photo.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-stone-500 mt-0.5 truncate">
                      <Mail size={11} className="text-stone-400 shrink-0" />
                      <span className="truncate">{photo.customerEmail || '—'}</span>
                    </div>
                  </div>

                  {/* CAPTION */}
                  <p className="text-xs text-stone-600 line-clamp-2 italic mb-3 flex-1 bg-stone-50 rounded-xl p-2 border border-stone-100">
                    "{photo.description || photo.title || 'No caption provided.'}"
                  </p>

                  {/* UPLOAD TIMESTAMP */}
                  <div className="text-[10px] text-stone-400 mb-3 flex items-center gap-1">
                    <Clock3 size={11} />
                    <span>Uploaded: {formatDate(photo.createdAt)}</span>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-stone-100">
                    {/* APPROVE BUTTON */}
                    {!isApproved && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleApprove(photo)}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-600 px-2 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
                        title="Approve for public community gallery"
                      >
                        <Check size={14} />
                        <span>Approve</span>
                      </button>
                    )}

                    {/* REJECT BUTTON */}
                    {!isRejected && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleReject(photo)}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-amber-600 px-2 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 active:scale-95 disabled:opacity-50"
                        title="Reject photo"
                      >
                        <X size={14} />
                        <span>Reject</span>
                      </button>
                    )}

                    {/* DELETE BUTTON */}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDelete(photo)}
                      className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-2 text-red-600 transition hover:bg-red-100 active:scale-95 disabled:opacity-50"
                      title="Permanently delete photo"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* FULL IMAGE PREVIEW MODAL */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="relative max-h-[92vh] max-w-3xl w-full overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* MODAL HEADER */}
            <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-800">
                  Photo #{previewPhoto.id} Preview
                </h3>
                <p className="text-xs text-stone-500">
                  Uploaded by {previewPhoto.customerName} on {formatDate(previewPhoto.createdAt)}
                </p>
              </div>

              <button
                type="button"
                className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                onClick={() => setPreviewPhoto(null)}
              >
                <X size={20} />
              </button>
            </div>

            {/* MODAL IMAGE DISPLAY */}
            <div className="relative flex-1 overflow-auto bg-stone-900 flex items-center justify-center min-h-[300px] max-h-[60vh] p-2">
              <img
                src={previewPhoto.imageUrl || previewPhoto.image_url}
                alt={previewPhoto.description || 'Full Preview'}
                className="max-h-[58vh] max-w-full object-contain rounded-lg"
              />
            </div>

            {/* MODAL FOOTER & ACTIONS */}
            <div className="border-t border-stone-100 p-6 flex flex-wrap items-center justify-between gap-4 bg-stone-50">
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
                  Caption
                </p>
                <p className="text-sm text-stone-800 italic">
                  "{previewPhoto.description || previewPhoto.title || 'No caption provided.'}"
                </p>
                <p className="text-xs text-stone-400 mt-1">
                  Email: {previewPhoto.customerEmail}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {previewPhoto.status !== 'approved' && (
                  <button
                    type="button"
                    onClick={() => handleApprove(previewPhoto)}
                    className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-sm"
                  >
                    <Check size={16} />
                    Approve Photo
                  </button>
                )}

                {previewPhoto.status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => handleReject(previewPhoto)}
                    className="inline-flex items-center gap-1.5 rounded-2xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-amber-700 shadow-sm"
                  >
                    <X size={16} />
                    Reject Photo
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDelete(previewPhoto)}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 transition hover:bg-red-100"
                >
                  <Trash2 size={16} />
                  Delete Permanently
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
