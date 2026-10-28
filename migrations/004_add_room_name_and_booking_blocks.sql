-- ============================================================
-- Zen Café — Phase 3: Migration 004
-- Room Bookings & Availability Management
-- Strictly Additive Migration
-- Target: zencafe_db (public schema)
-- ============================================================

-- 1. Add room_name to public.bookings if not already present
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS room_name VARCHAR(100) NOT NULL DEFAULT 'Private Dining Room';

-- 2. Create index on (booking_date, room_name, status) for atomic availability lookups
CREATE INDEX IF NOT EXISTS idx_bookings_date_room_status
  ON public.bookings (booking_date, room_name, status);

-- 3. Create public.booking_blocks for manual admin date/time slot blocking
CREATE TABLE IF NOT EXISTS public.booking_blocks (
  id BIGSERIAL PRIMARY KEY,
  room_name VARCHAR(100) NOT NULL DEFAULT 'Private Dining Room',
  block_date DATE NOT NULL,
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  end_time TIME WITHOUT TIME ZONE NOT NULL,
  reason TEXT NULL,
  created_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_blocks_time_check CHECK (end_time > start_time)
);

-- 4. Create index on booking_blocks for fast date and room availability filtering
CREATE INDEX IF NOT EXISTS idx_booking_blocks_date_room
  ON public.booking_blocks (block_date, room_name);
