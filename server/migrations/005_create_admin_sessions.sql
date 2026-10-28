-- server/migrations/005_create_admin_sessions.sql
-- Zen Café — Phase 7: Persistent Administrator Sessions Migration
-- Enables durable, cryptographically secure admin session storage across distributed Cloudflare Workers and Node instances.

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON public.admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON public.admin_sessions(expires_at);
