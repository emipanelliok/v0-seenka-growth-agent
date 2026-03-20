-- Add social_profiles JSONB column to champions table
-- Stores discovered social media profiles from enrichment
-- Format: { "instagram": { "url": "...", "handle": "@...", "confidence": "high", "source": "brave_search" }, ... }

ALTER TABLE champions ADD COLUMN IF NOT EXISTS social_profiles JSONB DEFAULT '{}';

-- Add phone column if not exists (for direct phone storage from enrichment)
ALTER TABLE champions ADD COLUMN IF NOT EXISTS phone TEXT;
