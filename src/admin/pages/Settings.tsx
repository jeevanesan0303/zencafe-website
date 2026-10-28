
import {
  useEffect,
  useRef,
  useState,
} from 'react'

import type {
  ChangeEvent,
  FormEvent,
} from 'react'

import {
  ArrowLeft,
  Bell,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  Info,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react'

import type { AdminPage } from '../AdminApp'

import {
  DEFAULT_CAFE_SETTINGS,
  readCafeSettings,
  fetchCafeSettings,
  saveCafeSettings,
  subscribeCafeSettings,
  type CafeSettings,
} from '../../data/settingsStore'

import { getAdminAuthHeaders } from '../../admin-auth'

import AdminAlert from '../utils/sweetAlert'

/* ==========================================
   TYPES
========================================== */

export type SettingsTab =
  | 'profile'
  | 'general'
  | 'bookings'
  | 'notifications'
  | 'security'

type Props = {
  onNavigate: (page: AdminPage) => void
  query?: string
  initialTab?: SettingsTab
}

type ToggleKey =
  | 'bookingsEnabled'
  | 'autoConfirmBookings'
  | 'emailNotifications'
  | 'bookingNotifications'
  | 'promotionNotifications'

/* ==========================================
   CONSTANTS
========================================== */

const TABS = [
  {
    id: 'profile',
    label: 'My Profile',
    icon: UserRound,
  },
  {
    id: 'general',
    label: 'Café Information',
    icon: Building2,
  },
  {
    id: 'bookings',
    label: 'Booking Settings',
    icon: CalendarDays,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
  },
  {
    id: 'security',
    label: 'Account & Security',
    icon: ShieldCheck,
  },
] as const

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* ==========================================
   HELPERS
========================================== */

function getErrorMessage(
  error: unknown,
  fallback: string
) {
  return error instanceof Error
    ? error.message
    : fallback
}

function settingsEqual(
  first: CafeSettings,
  second: CafeSettings
) {
  return (
    JSON.stringify(first) ===
    JSON.stringify(second)
  )
}

async function processProfileImage(
  file: File
): Promise<string> {
  const supportedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ]

  if (!supportedTypes.includes(file.type)) {
    throw new Error(
      'Please upload a JPG, PNG, or WebP image.'
    )
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error(
      'Please select an image smaller than 2 MB.'
    )
  }

  const objectUrl =
    URL.createObjectURL(file)

  try {
    const image =
      await new Promise<HTMLImageElement>(
        (resolve, reject) => {
          const img = new Image()

          img.onload = () =>
            resolve(img)

          img.onerror = () =>
            reject(
              new Error(
                'Unable to read the selected image.'
              )
            )

          img.src = objectUrl
        }
      )

    const canvas =
      document.createElement('canvas')

    const size = 320

    canvas.width = size
    canvas.height = size

    const context =
      canvas.getContext('2d')

    if (!context) {
      throw new Error(
        'Unable to process the image.'
      )
    }

    const cropSize = Math.min(
      image.naturalWidth,
      image.naturalHeight
    )

    const sourceX =
      (image.naturalWidth - cropSize) / 2

    const sourceY =
      (image.naturalHeight - cropSize) / 2

    context.fillStyle = '#ffffff'

    context.fillRect(
      0,
      0,
      size,
      size
    )

    context.drawImage(
      image,
      sourceX,
      sourceY,
      cropSize,
      cropSize,
      0,
      0,
      size,
      size
    )

    return canvas.toDataURL(
      'image/jpeg',
      0.78
    )
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/* ==========================================
   SETTINGS COMPONENT
========================================== */

export default function Settings({
  onNavigate,
  query = '',
  initialTab = 'general',
}: Props) {
  const [settings, setSettings] =
    useState<CafeSettings>(
      () => readCafeSettings()
    )

  const [
    savedSettings,
    setSavedSettings,
  ] = useState<CafeSettings>(
    () => readCafeSettings()
  )

  const [activeTab, setActiveTab] =
    useState<SettingsTab>(initialTab)

  const [message, setMessage] =
    useState('')

  const [error, setError] =
    useState('')

  const [saving, setSaving] =
    useState(false)

  const [
    imageProcessing,
    setImageProcessing,
  ] = useState(false)

  const fileInputRef =
    useRef<HTMLInputElement>(null)

  const imageRequestRef = useRef(0)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordUpdating, setPasswordUpdating] = useState(false)

  const actionLockRef = useRef(false)

  const hasChanges =
    !settingsEqual(
      settings,
      savedSettings
    )

  /* ==========================================
     FETCH LIVE SETTINGS FROM API
  ========================================== */

  useEffect(() => {
    fetchCafeSettings(true)
      .then(latest => {
        setSettings(latest)
        setSavedSettings(latest)
      })
      .catch(err => {
        console.warn('Unable to load settings from API:', err)
      })
  }, [])

  /* ==========================================
     INITIAL TAB NAVIGATION
  ========================================== */

  useEffect(() => {
    setActiveTab(initialTab)
    setMessage('')
    setError('')
  }, [initialTab])

  /* ==========================================
     SETTINGS SUBSCRIPTION
  ========================================== */

  useEffect(() => {
    return subscribeCafeSettings(() => {
      const latest =
        readCafeSettings()

      setSavedSettings(previous => {
        setSettings(current => {
          const hasUnsavedChanges =
            !settingsEqual(
              current,
              previous
            )

          return hasUnsavedChanges
            ? current
            : latest
        })

        return latest
      })
    })
  }, [])

  /* ==========================================
     IMAGE CLEANUP
  ========================================== */

  useEffect(() => {
    return () => {
      imageRequestRef.current += 1
    }
  }, [])

  /* ==========================================
     FIELD UPDATES
  ========================================== */

  function updateField<
    K extends keyof CafeSettings
  >(
    key: K,
    value: CafeSettings[K]
  ) {
    if (saving) return

    setSettings(previous => ({
      ...previous,
      [key]: value,
    }))

    setMessage('')
    setError('')
  }

  /* ==========================================
     TAB NAVIGATION
  ========================================== */

  function changeTab(
    tab: SettingsTab
  ) {
    setActiveTab(tab)
    setMessage('')
    setError('')
  }

  /* ==========================================
     VALIDATION ALERT
  ========================================== */

  async function showValidationError(
    tab: SettingsTab,
    title: string,
    description: string
  ) {
    setActiveTab(tab)
    setError(description)
    setMessage('')

    await AdminAlert.warning(
      title,
      description
    )
  }

  /* ==========================================
     PROFILE IMAGE UPLOAD
  ========================================== */

  async function handleImageUpload(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0]

    if (
      !file ||
      saving ||
      imageProcessing
    ) {
      return
    }

    event.target.value = ''

    const requestId =
      ++imageRequestRef.current

    setImageProcessing(true)
    setError('')
    setMessage('')

    try {
      const optimizedImage =
        await processProfileImage(file)

      if (
        requestId !==
        imageRequestRef.current
      ) {
        return
      }

      updateField(
        'adminAvatar',
        optimizedImage
      )

      await AdminAlert.success(
        'Profile Image Updated!',
        'Your new profile picture is ready. Click Save Changes to apply it.'
      )
    } catch (caughtError) {
      if (
        requestId !==
        imageRequestRef.current
      ) {
        return
      }

      const description =
        getErrorMessage(
          caughtError,
          'Unable to process the selected image.'
        )

      setError(description)

      await AdminAlert.warning(
        'Image Upload Failed',
        description
      )
    } finally {
      if (
        requestId ===
        imageRequestRef.current
      ) {
        setImageProcessing(false)
      }
    }
  }

  /* ==========================================
     REMOVE PROFILE IMAGE
  ========================================== */

  async function removeProfileImage() {
    if (
      !settings.adminAvatar ||
      saving ||
      imageProcessing ||
      actionLockRef.current
    ) {
      return
    }

    actionLockRef.current = true

    try {
      const confirmed =
        await AdminAlert.confirm(
          'Remove Profile Picture?',
          'Your profile picture will be removed when you save your changes.',
          'Yes, Remove'
        )

      if (!confirmed) return

      imageRequestRef.current += 1

      updateField('adminAvatar', '')

      await AdminAlert.success(
        'Profile Picture Removed!',
        'Click Save Changes to apply this change.'
      )
    } finally {
      actionLockRef.current = false
    }
  }

  /* ==========================================
     VALIDATION AND SAVE
  ========================================== */

  async function saveSettings(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (
      saving ||
      imageProcessing ||
      actionLockRef.current
    ) {
      return
    }

    if (!hasChanges) {
      await AdminAlert.success(
        'Already Up to Date',
        'There are no unsaved settings changes.'
      )
      return
    }

    if (!settings.adminName.trim()) {
      await showValidationError(
        'profile',
        'Administrator Name Required',
        'Please enter the administrator name.'
      )
      return
    }

    if (
      !EMAIL_REGEX.test(
        settings.adminEmail.trim()
      )
    ) {
      await showValidationError(
        'profile',
        'Invalid Administrator Email',
        'Please enter a valid administrator email address.'
      )
      return
    }

    if (!settings.cafeName.trim()) {
      await showValidationError(
        'general',
        'Café Name Required',
        'Please enter the café name.'
      )
      return
    }

    if (
      !EMAIL_REGEX.test(
        settings.email.trim()
      )
    ) {
      await showValidationError(
        'general',
        'Invalid Business Email',
        'Please enter a valid business email address.'
      )
      return
    }

    if (
      !Number.isInteger(
        settings.maxGuests
      ) ||
      settings.maxGuests < 1
    ) {
      await showValidationError(
        'bookings',
        'Invalid Maximum Guests',
        'Maximum guests per booking must be at least 1.'
      )
      return
    }

    if (
      !Number.isFinite(
        settings.defaultBookingDuration
      ) ||
      settings.defaultBookingDuration <= 0
    ) {
      await showValidationError(
        'bookings',
        'Invalid Booking Duration',
        'Default booking duration must be greater than zero.'
      )
      return
    }

    const updatedSettings:
      CafeSettings = {
      ...settings,

      adminName:
        settings.adminName.trim(),

      adminEmail:
        settings.adminEmail.trim(),

      cafeName:
        settings.cafeName.trim(),

      email:
        settings.email.trim(),
    }

    actionLockRef.current = true
    setSaving(true)
    setMessage('')
    setError('')

    try {
      await saveCafeSettings(
        updatedSettings
      )

      setSettings(updatedSettings)
      setSavedSettings(updatedSettings)

      setMessage(
        'Your settings have been saved successfully.'
      )

      await AdminAlert.success(
        'Settings Saved!',
        'Your café and administrator settings have been updated successfully.'
      )
    } catch (caughtError) {
      const description =
        getErrorMessage(
          caughtError,
          'Unable to save settings. Browser storage may be full.'
        )

      setError(description)
      setMessage('')

      await AdminAlert.error(
        'Settings Save Failed',
        description
      )
    } finally {
      setSaving(false)
      actionLockRef.current = false
    }
  }

  /* ==========================================
     DISCARD CHANGES
  ========================================== */

  async function discardChanges() {
    if (
      !hasChanges ||
      saving ||
      imageProcessing ||
      actionLockRef.current
    ) {
      return
    }

    actionLockRef.current = true

    try {
      const confirmed =
        await AdminAlert.confirm(
          'Discard Unsaved Changes?',
          'All changes made since your last save will be lost.',
          'Yes, Discard'
        )

      if (!confirmed) return

      imageRequestRef.current += 1

      setSettings({
        ...savedSettings,
      })

      setMessage('')
      setError('')

      await AdminAlert.success(
        'Changes Discarded!',
        'Your settings have been restored to the last saved version.'
      )
    } finally {
      actionLockRef.current = false
    }
  }

  /* ==========================================
     RESET DEFAULTS
  ========================================== */

  async function resetDefaults() {
    if (
      saving ||
      imageProcessing ||
      actionLockRef.current
    ) {
      return
    }

    actionLockRef.current = true

    try {
      const confirmed =
        await AdminAlert.confirm(
          'Reset All Settings?',
          'This will restore the default café information, booking preferences, notifications, and administrator profile in the form. You must save to apply these defaults.',
          'Yes, Reset Defaults'
        )

      if (!confirmed) return

      imageRequestRef.current += 1

      setSettings({
        ...DEFAULT_CAFE_SETTINGS,
      })

      setError('')

      setMessage(
        'Default settings loaded. Click Save Changes to apply them.'
      )

      await AdminAlert.success(
        'Defaults Loaded!',
        'Default settings are ready. Click Save Changes to make them permanent.'
      )
    } finally {
      actionLockRef.current = false
    }
  }

  /* ==========================================
     TOGGLE COMPONENT
  ========================================== */

  function renderSwitch(
    label: string,
    description: string,
    key: ToggleKey
  ) {
    const checked =
      settings[key]

    return (
      <div
        className="za-settings-toggle-row"
        key={key}
      >
        <div>
          <strong>{label}</strong>
          <p>{description}</p>
        </div>

        <button
          type="button"
          role="switch"
          aria-label={label}
          aria-checked={checked}
          disabled={saving}
          className={`za-settings-switch ${
            checked ? 'is-on' : ''
          }`}
          onClick={() =>
            updateField(
              key,
              !checked
            )
          }
        >
          <span />
        </button>
      </div>
    )
  }

  /* ==========================================
     MY PROFILE
  ========================================== */

  function renderProfile() {
    return (
      <div className="za-settings-section">

        <div className="za-settings-section-heading">
          <UserRound size={23} />

          <div>
            <h2>My Profile</h2>

            <p>
              Manage your administrator
              photo and personal information.
            </p>
          </div>
        </div>

        {/* PROFILE PHOTO */}

        <div className="za-profile-photo-panel">

          <div className="za-profile-photo-preview">

            {settings.adminAvatar ? (
              <img
                src={settings.adminAvatar}
                alt="Administrator profile"
              />
            ) : (
              <UserRound size={42} />
            )}

            <span className="za-profile-camera-icon">
              <Camera size={15} />
            </span>

          </div>

          <div className="za-profile-photo-details">

            <h3>
              Profile Picture
            </h3>

            <p>
              Upload a professional photo
              for your administrator account.
              Supported formats: JPG, PNG,
              and WebP.
            </p>

            <div className="za-profile-photo-buttons">

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{
                  display: 'none',
                }}
                disabled={
                  imageProcessing ||
                  saving
                }
                onChange={handleImageUpload}
                aria-label="Upload profile picture"
              />

              <button
                type="button"
                className="za-primary"
                disabled={
                  imageProcessing ||
                  saving
                }
                onClick={() =>
                  fileInputRef.current?.click()
                }
              >
                <Upload size={16} />

                {imageProcessing
                  ? 'Processing...'
                  : 'Browse Image'}
              </button>

              {settings.adminAvatar && (
                <button
                  type="button"
                  className="za-profile-remove-button"
                  disabled={
                    imageProcessing ||
                    saving
                  }
                  onClick={() => {
                    void removeProfileImage()
                  }}
                >
                  <Trash2 size={16} />
                  Remove
                </button>
              )}

            </div>

            <small>
              Maximum file size: 2 MB.
              The image is automatically
              cropped and optimized
              before saving.
            </small>

          </div>

        </div>

        {/* PERSONAL INFORMATION */}

        <div className="za-settings-subheading">
          <UserRound size={18} />
          <h3>Personal Information</h3>
        </div>

        <div className="za-settings-field-grid">

          <label>
            Administrator Name *

            <input
              type="text"
              value={settings.adminName}
              placeholder="Enter administrator name"
              disabled={saving}
              onChange={event =>
                updateField(
                  'adminName',
                  event.target.value
                )
              }
            />
          </label>

          <label>
            Administrator Email *

            <input
              type="email"
              value={settings.adminEmail}
              placeholder="admin@zencafe.com"
              disabled={saving}
              onChange={event =>
                updateField(
                  'adminEmail',
                  event.target.value
                )
              }
            />
          </label>

        </div>

        <div className="za-settings-info">
          <Info size={19} />

          <p>
            After saving, your profile
            image, name, and email will
            appear in the Admin header.
            These settings do not change
            your login credentials.
          </p>
        </div>

      </div>
    )
  }

  /* ==========================================
     CAFÉ INFORMATION
  ========================================== */

  function renderGeneral() {
    return (
      <div className="za-settings-section">

        <div className="za-settings-section-heading">
          <Building2 size={23} />

          <div>
            <h2>Café Information</h2>

            <p>
              Manage your café's business
              information and operating hours.
            </p>
          </div>
        </div>

        <div className="za-settings-fields">

          <div className="za-settings-field-grid">

            <label>
              Café Name *

              <input
                type="text"
                value={settings.cafeName}
                placeholder="Zen Café"
                disabled={saving}
                onChange={event =>
                  updateField(
                    'cafeName',
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Tagline

              <input
                type="text"
                value={settings.tagline}
                placeholder="Good Food Brings People Together"
                disabled={saving}
                onChange={event =>
                  updateField(
                    'tagline',
                    event.target.value
                  )
                }
              />
            </label>

          </div>

          <div className="za-settings-field-grid">

            <label>
              <span>
                <Mail size={14} />
                Business Email *
              </span>

              <input
                type="email"
                value={settings.email}
                placeholder="admin@zencafe.com"
                disabled={saving}
                onChange={event =>
                  updateField(
                    'email',
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              <span>
                <Phone size={14} />
                Contact Number
              </span>

              <input
                type="tel"
                value={settings.phone}
                placeholder="+94 77 123 4567"
                disabled={saving}
                onChange={event =>
                  updateField(
                    'phone',
                    event.target.value
                  )
                }
              />
            </label>

          </div>

          <label>
            <span>
              <MapPin size={14} />
              Café Address
            </span>

            <textarea
              rows={3}
              value={settings.address}
              placeholder="Enter café address"
              disabled={saving}
              onChange={event =>
                updateField(
                  'address',
                  event.target.value
                )
              }
            />
          </label>

          {/* OPERATING HOURS */}

          <div className="za-settings-subheading">
            <Clock3 size={18} />
            <h3>Operating Hours</h3>
          </div>

          <div className="za-settings-field-grid">

            <label>
              Opening Time

              <input
                type="time"
                value={settings.openingTime}
                disabled={saving}
                onChange={event =>
                  updateField(
                    'openingTime',
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Closing Time

              <input
                type="time"
                value={settings.closingTime}
                disabled={saving}
                onChange={event =>
                  updateField(
                    'closingTime',
                    event.target.value
                  )
                }
              />
            </label>

          </div>

          {/* CURRENCY */}

          <label>
            Currency

            <select
              value={settings.currency}
              disabled={saving}
              onChange={event =>
                updateField(
                  'currency',
                  event.target.value
                )
              }
            >
              <option value="LKR">
                Sri Lankan Rupee (LKR)
              </option>

              <option value="USD">
                US Dollar (USD)
              </option>

              <option value="EUR">
                Euro (EUR)
              </option>

              <option value="GBP">
                British Pound (GBP)
              </option>
            </select>
          </label>

        </div>

      </div>
    )
  }

  /* ==========================================
     BOOKING SETTINGS
  ========================================== */

  function renderBookings() {
    return (
      <div className="za-settings-section">

        <div className="za-settings-section-heading">
          <CalendarDays size={23} />

          <div>
            <h2>Booking Settings</h2>

            <p>
              Configure how room
              reservations should work.
            </p>
          </div>
        </div>

        <div className="za-settings-toggle-list">

          {renderSwitch(
            'Enable Room Bookings',
            'Allow customers to request room reservations.',
            'bookingsEnabled'
          )}

          {renderSwitch(
            'Automatic Booking Confirmation',
            'Automatically confirm new booking requests.',
            'autoConfirmBookings'
          )}

        </div>

        <div className="za-settings-subheading">
          <SettingsIcon size={18} />
          <h3>Booking Preferences</h3>
        </div>

        <div className="za-settings-field-grid">

          <label>
            Maximum Guests per Booking

            <input
              type="number"
              min="1"
              step="1"
              value={settings.maxGuests}
              disabled={saving}
              onChange={event =>
                updateField(
                  'maxGuests',
                  Number(
                    event.target.value
                  )
                )
              }
            />
          </label>

          <label>
            Default Booking Duration (Hours)

            <input
              type="number"
              min="0.5"
              step="0.5"
              value={
                settings.defaultBookingDuration
              }
              disabled={saving}
              onChange={event =>
                updateField(
                  'defaultBookingDuration',
                  Number(
                    event.target.value
                  )
                )
              }
            />
          </label>

        </div>

        <div className="za-settings-info">
          <Info size={19} />

          <p>
            Booking preferences are
            saved in your settings.
            Your customer-facing booking
            form must also read these
            settings to enforce them.
          </p>
        </div>

      </div>
    )
  }

  /* ==========================================
     NOTIFICATION SETTINGS
  ========================================== */

  function renderNotifications() {
    return (
      <div className="za-settings-section">

        <div className="za-settings-section-heading">
          <Bell size={23} />

          <div>
            <h2>
              Notification Settings
            </h2>

            <p>
              Choose which administrator
              notifications you want
              to receive.
            </p>
          </div>
        </div>

        <div className="za-settings-toggle-list">

          {renderSwitch(
            'Email Notifications',
            'Enable email notifications for administrator updates.',
            'emailNotifications'
          )}

          {renderSwitch(
            'New Booking Alerts',
            'Receive alerts for new room reservations.',
            'bookingNotifications'
          )}

          {renderSwitch(
            'Promotional Updates',
            'Receive alerts about offers and promotions.',
            'promotionNotifications'
          )}

        </div>

        <div className="za-settings-info">
          <Info size={19} />

          <p>
            These notification preferences
            are saved, but actual email
            delivery requires a connected
            email service or backend
            integration.
          </p>
        </div>

      </div>
    )
  }

  /* ==========================================
     ACCOUNT AND SECURITY
  ========================================== */

  /* ==========================================
     ADMIN PASSWORD CHANGE
  ========================================== */

  async function handlePasswordChange() {
    if (passwordUpdating) return

    if (!currentPassword) {
      await AdminAlert.warning(
        'Missing Current Password',
        'Please enter your current administrator password.'
      )
      return
    }

    if (!newPassword || newPassword.length < 8) {
      await AdminAlert.warning(
        'Password Too Short',
        'New password must be at least 8 characters long.'
      )
      return
    }

    if (newPassword !== confirmPassword) {
      await AdminAlert.warning(
        'Passwords Do Not Match',
        'New password and confirm password do not match.'
      )
      return
    }

    const confirmed = await AdminAlert.confirm(
      'Update Password?',
      'Are you sure you want to change your administrator password?',
      'Yes, Update Password'
    )

    if (!confirmed) return

    setPasswordUpdating(true)

    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to update password.')
      }

      await AdminAlert.success(
        'Password Changed!',
        'Your administrator password has been updated successfully.'
      )

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      await AdminAlert.error(
        'Password Update Failed',
        err.message || 'Failed to change administrator password.'
      )
    } finally {
      setPasswordUpdating(false)
    }
  }

  /* ==========================================
     ACCOUNT & SECURITY
  ========================================== */

  function renderSecurity() {
    return (
      <div className="za-settings-section">

        <div className="za-settings-section-heading">
          <ShieldCheck size={23} />

          <div>
            <h2>
              Account & Security
            </h2>

            <p>
              View your administrator account information and manage security credentials.
            </p>
          </div>
        </div>

        {/* ADMIN PROFILE */}
        <div className="za-settings-admin-profile">
          <div className="za-settings-admin-avatar">
            {settings.adminAvatar ? (
              <img
                src={settings.adminAvatar}
                alt="Administrator"
                className="za-profile-avatar-image"
              />
            ) : (
              <UserRound size={28} />
            )}
          </div>

          <div>
            <strong>
              {settings.adminName || 'Admin'}
            </strong>

            <span>
              {settings.adminEmail}
            </span>
          </div>
        </div>

        {/* PASSWORD CHANGE SECTION */}
        <div className="za-settings-subheading">
          <LockKeyhole size={18} />
          <h3>Change Administrator Password</h3>
        </div>

        <div className="za-settings-field-grid" style={{ gridTemplateColumns: '1fr' }}>
          <label>
            Current Password *
            <input
              type="password"
              value={currentPassword}
              placeholder="Enter current password"
              disabled={passwordUpdating}
              onChange={event => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>

          <label>
            New Password (minimum 8 characters) *
            <input
              type="password"
              value={newPassword}
              placeholder="Enter new secure password (min. 8 characters)"
              disabled={passwordUpdating}
              onChange={event => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>

          <label>
            Confirm New Password *
            <input
              type="password"
              value={confirmPassword}
              placeholder="Re-enter new secure password"
              disabled={passwordUpdating}
              onChange={event => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
          <button
            type="button"
            className="za-primary"
            disabled={passwordUpdating || !currentPassword || !newPassword || !confirmPassword}
            onClick={() => void handlePasswordChange()}
          >
            <LockKeyhole size={17} />
            {passwordUpdating ? 'Updating Password...' : 'Update Password'}
          </button>
        </div>

        <div className="za-settings-info" style={{ marginTop: '24px' }}>
          <Info size={19} />
          <p>
            Passwords are encrypted using secure cryptographic hashing (scrypt) and are never stored in plaintext. Password changes take effect immediately on the server.
          </p>
        </div>

      </div>
    )
  }

  /* ==========================================
     SEARCH FILTER
  ========================================== */

  const searchText =
    query.trim().toLowerCase()

  const visibleTabs =
    TABS.filter(tab =>
      !searchText ||
      tab.label
        .toLowerCase()
        .includes(searchText)
    )

  /* ==========================================
     PAGE RENDER
  ========================================== */

  return (
    <div className="za-settings-page">

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

        <strong>Settings</strong>

      </div>

      {/* PAGE HEADER */}

      <div className="za-products-page-head">

        <div>
          <p className="za-kicker">
            ADMINISTRATION
          </p>

          <h1>Settings</h1>

          <p>
            Manage your café preferences
            and administrator account.
          </p>
        </div>

        <button
          type="button"
          className="za-settings-reset"
          disabled={
            saving ||
            imageProcessing
          }
          onClick={() => {
            void resetDefaults()
          }}
        >
          <RotateCcw size={17} />
          Reset Defaults
        </button>

      </div>

      {/* SETTINGS LAYOUT */}

      <div className="za-settings-layout">

        {/* LEFT NAVIGATION */}

        <aside className="za-settings-tabs">

          <div className="za-settings-tabs-heading">
            <SettingsIcon size={18} />
            Settings Menu
          </div>

          {visibleTabs.map(tab => {
            const Icon = tab.icon

            return (
              <button
                key={tab.id}
                type="button"
                aria-current={
                  activeTab === tab.id
                    ? 'page'
                    : undefined
                }
                className={`za-settings-tab ${
                  activeTab === tab.id
                    ? 'active'
                    : ''
                }`}
                onClick={() =>
                  changeTab(tab.id)
                }
              >
                <Icon size={18} />
                {tab.label}
              </button>
            )
          })}

          {visibleTabs.length === 0 && (
            <p className="za-settings-no-results">
              No matching settings
              sections.
            </p>
          )}

          <div className="za-settings-tabs-footer">
            <ShieldCheck size={18} />

            <span>
              Zen Café

              <small>
                Admin Configuration
              </small>
            </span>
          </div>

        </aside>

        {/* SETTINGS CONTENT */}

        <section className="za-settings-content">

          <form
            onSubmit={saveSettings}
            noValidate
          >

            {activeTab === 'profile' &&
              renderProfile()}

            {activeTab === 'general' &&
              renderGeneral()}

            {activeTab === 'bookings' &&
              renderBookings()}

            {activeTab === 'notifications' &&
              renderNotifications()}

            {activeTab === 'security' &&
              renderSecurity()}

            {/* ERROR MESSAGE */}

            {error && (
              <div
                className="za-settings-alert is-error"
                role="alert"
              >
                <Info size={18} />
                {error}
              </div>
            )}

            {/* SUCCESS MESSAGE */}

            {message && (
              <div
                className="za-settings-alert is-success"
                role="status"
              >
                <CheckCircle2 size={18} />
                {message}
              </div>
            )}

            {/* SAVE ACTIONS */}

            <div className="za-settings-actions">

              <div className="za-settings-unsaved">

                {hasChanges ? (
                  <>
                    <span className="za-settings-unsaved-dot" />
                    Unsaved changes
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    All changes saved
                  </>
                )}

              </div>

              <div className="za-settings-action-buttons">

                <button
                  type="button"
                  className="za-edit-cancel"
                  disabled={
                    !hasChanges ||
                    saving ||
                    imageProcessing
                  }
                  onClick={() => {
                    void discardChanges()
                  }}
                >
                  <ArrowLeft size={16} />
                  Discard
                </button>

                <button
                  type="submit"
                  className="za-primary"
                  disabled={
                    !hasChanges ||
                    saving ||
                    imageProcessing
                  }
                >
                  <Save size={17} />

                  {saving
                    ? 'Saving...'
                    : 'Save Changes'}
                </button>

              </div>

            </div>

          </form>

        </section>

      </div>

    </div>
  )
}
