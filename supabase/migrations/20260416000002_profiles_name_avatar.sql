-- =============================================================================
-- MIGRATION: 20260416000002_profiles_name_avatar.sql
-- PURPOSE:   Add full_name and avatar_url columns to profiles table.
--            Required for the workspace layer to show user display names.
-- IDEMPOTENT: Yes — uses IF NOT EXISTS.
-- REF:       SPEC_CAPA_CLIENTES.md section 2.2
-- =============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Comment for documentation
COMMENT ON COLUMN profiles.full_name  IS 'Display name shown in workspace UI';
COMMENT ON COLUMN profiles.avatar_url IS 'URL of user avatar (Supabase Storage or external)';
