-- =========================================================================
-- Migration 002: Extend Zen Café Products Attributes
-- Target Database: zencafe_db
-- Target Table: public.products
-- =========================================================================

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS kind VARCHAR(20) DEFAULT 'food',
  ADD COLUMN IF NOT EXISTS ingredients TEXT,
  ADD COLUMN IF NOT EXISTS serving VARCHAR(100),
  ADD COLUMN IF NOT EXISTS accent VARCHAR(20) DEFAULT '#a32722',
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS spice_level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS dietary_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS dairy_type VARCHAR(20);

COMMIT;
