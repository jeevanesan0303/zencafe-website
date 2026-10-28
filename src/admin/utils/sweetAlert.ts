
import Swal from 'sweetalert2'

/* ==========================================
   ZEN CAFÉ ALERT COLORS
========================================== */

const COLORS = {
  burgundy: '#722F37',
  darkBurgundy: '#541F29',
  cream: '#FFFAF5',
  text: '#332324',
  gray: '#6B7280',
  danger: '#B42318',
}

/* ==========================================
   SWEETALERT THEME
========================================== */

const alertTheme = Swal.mixin({
  background: COLORS.cream,
  color: COLORS.text,
  confirmButtonColor: COLORS.burgundy,
  cancelButtonColor: COLORS.gray,
  reverseButtons: true,
  buttonsStyling: true,
  customClass: {
    popup: 'zen-sweet-alert',
    title: 'zen-sweet-title',
    confirmButton: 'zen-sweet-confirm',
    cancelButton: 'zen-sweet-cancel',
  },
})

/* ==========================================
   ADMIN ALERT FUNCTIONS
========================================== */

export const AdminAlert = {
  /* ========================================
     GENERAL SUCCESS NOTIFICATION
  ======================================== */

  success: async (
    title: string,
    message = ''
  ) => {
    return alertTheme.fire({
      icon: 'success',
      title,
      text: message,
      timer: 2200,
      timerProgressBar: true,
      showConfirmButton: false,
    })
  },

  /* ========================================
     GENERAL ERROR NOTIFICATION
  ======================================== */

  error: async (
    title: string,
    message = ''
  ) => {
    return alertTheme.fire({
      icon: 'error',
      title,
      text: message,
      confirmButtonText: 'OK',
    })
  },

  /* ========================================
     GENERAL WARNING NOTIFICATION
  ======================================== */

  warning: async (
    title: string,
    message = ''
  ) => {
    return alertTheme.fire({
      icon: 'warning',
      title,
      text: message,
      confirmButtonText: 'Understood',
    })
  },

  /* ========================================
     GENERAL CONFIRMATION
  ======================================== */

  confirm: async (
    title: string,
    message: string,
    confirmText = 'Yes, Continue'
  ): Promise<boolean> => {
    const result = await alertTheme.fire({
      icon: 'question',
      title,
      text: message,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: 'Cancel',
      focusCancel: true,
    })

    return result.isConfirmed
  },

  /* ========================================
     DELETE CONFIRMATION
  ======================================== */

  confirmDelete: async (
    itemName: string
  ): Promise<boolean> => {
    const result = await alertTheme.fire({
      icon: 'warning',
      title: `Delete ${itemName}?`,
      text: 'This action cannot be undone.',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: COLORS.danger,
      focusCancel: true,
    })

    return result.isConfirmed
  },

  /* ========================================
     PRODUCT ACTIONS
  ======================================== */

  productAdded: () =>
    AdminAlert.success(
      'Product Added!',
      'Your new product has been added successfully.'
    ),

  productUpdated: () =>
    AdminAlert.success(
      'Product Updated!',
      'Your product changes have been saved.'
    ),

  productDeleted: () =>
    AdminAlert.success(
      'Product Deleted!',
      'The product has been removed successfully.'
    ),

  /* ========================================
     OFFER ACTIONS
  ======================================== */

  offerAdded: () =>
    AdminAlert.success(
      'Offer Created!',
      'Your new promotion has been created.'
    ),

  offerUpdated: () =>
    AdminAlert.success(
      'Offer Updated!',
      'Your promotion changes have been saved.'
    ),

  offerDeleted: () =>
    AdminAlert.success(
      'Offer Deleted!',
      'The promotion has been removed.'
    ),

  /* ========================================
     BOOKING ACTIONS
  ======================================== */

  // New booking created successfully
  bookingAdded: () =>
    AdminAlert.success(
      'Booking Added!',
      'The new room reservation has been created successfully.'
    ),

  // Existing booking updated successfully
  bookingUpdated: () =>
    AdminAlert.success(
      'Booking Updated!',
      'The room reservation details have been updated successfully.'
    ),

  // Booking confirmed successfully
  bookingConfirmed: () =>
    AdminAlert.success(
      'Booking Confirmed!',
      'The reservation has been confirmed.'
    ),

  // Booking cancelled successfully
  bookingCancelled: () =>
    AdminAlert.success(
      'Booking Cancelled!',
      'The reservation has been cancelled.'
    ),

  // Booking completed successfully
  bookingCompleted: () =>
    AdminAlert.success(
      'Booking Completed!',
      'The reservation has been marked as completed.'
    ),

  // Booking deleted successfully
  bookingDeleted: () =>
    AdminAlert.success(
      'Booking Deleted!',
      'The reservation has been removed.'
    ),

  /* ========================================
     SETTINGS ACTIONS
  ======================================== */

  settingsSaved: () =>
    AdminAlert.success(
      'Settings Saved!',
      'Your changes have been saved successfully.'
    ),

  profileUpdated: () =>
    AdminAlert.success(
      'Profile Updated!',
      'Your administrator profile has been updated.'
    ),
}

/* ==========================================
   DEFAULT EXPORT
========================================== */

export default AdminAlert
