-- ============================================================
-- MIGRATION: Social Platform Integration (Instagram + TikTok)
-- Run this in Supabase SQL Editor to add columns needed for
-- OAuth connections and content sync.
-- ============================================================

-- Add new columns to platform_connections for OAuth tokens
ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS page_access_token TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_token TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Index for claim token lookups during OAuth callback
CREATE INDEX IF NOT EXISTS idx_platform_connections_claim
  ON platform_connections(claim_token)
  WHERE claim_token IS NOT NULL;

-- Unique constraint for platform + platform_user_id (prevents duplicate connections)
-- Drop first if exists to avoid conflicts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_platform_user'
  ) THEN
    ALTER TABLE platform_connections
      ADD CONSTRAINT unique_platform_user UNIQUE (platform, platform_user_id);
  END IF;
END $$;

-- Add new columns to content_items for synced posts
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS platform_post_id TEXT,
  ADD COLUMN IF NOT EXISTS link TEXT,
  ADD COLUMN IF NOT EXISTS caption TEXT,
  ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

-- Index for deduplication on platform_post_id
CREATE INDEX IF NOT EXISTS idx_content_items_platform_post
  ON content_items(user_id, platform_post_id)
  WHERE platform_post_id IS NOT NULL;

-- Update RLS policy for platform_connections to allow the service role
-- to insert during OAuth callback (when user_id might not be set yet)
-- The service role bypasses RLS by default, so no changes needed there.
-- But we do need to allow users to read/update their own connections:
DROP POLICY IF EXISTS "Users can view their connections" ON platform_connections;
CREATE POLICY "Users can view their connections"
  ON platform_connections FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their connections" ON platform_connections;
CREATE POLICY "Users can update their connections"
  ON platform_connections FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow claim token lookups (user claims connection after OAuth)
DROP POLICY IF EXISTS "Users can claim connections" ON platform_connections;
CREATE POLICY "Users can claim connections"
  ON platform_connections FOR UPDATE
  USING (claim_token IS NOT NULL AND user_id IS NULL);
