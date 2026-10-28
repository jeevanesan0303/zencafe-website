-- migrations/003_add_code_to_offers.sql
-- ZEN CAFÉ — PHASE 2: OFFERS & PROMOTIONS
-- Purely additive migration: adds optional promo code column to public.offers

ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS code VARCHAR(50);

COMMENT ON COLUMN public.offers.code IS 'Optional customer promo/voucher code (e.g. ZEN20)';
