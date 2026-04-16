-- =============================================================================
-- MIGRATION: 20260416000002_profiles_name_avatar.sql
-- PURPOSE:   Add full_name and avatar_url columns to profiles table.
--            Required for the workspace layer to show user display names.
--            Also extends the column-level GRANT from migration 001.
-- IDEMPOTENT: Yes — uses IF NOT EXISTS / idempotent GRANT.
-- REF:       SPEC_CAPA_CLIENTES.md section 2.2
-- DEPENDS ON: 20260416000001_rls_existing_tables.sql (REVOKE UPDATE must run first)
-- =============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN profiles.full_name  IS 'Display name shown in workspace UI';
COMMENT ON COLUMN profiles.avatar_url IS 'URL of user avatar (Supabase Storage or external)';

-- ---------------------------------------------------------------------------
-- COLUMN-LEVEL PRIVILEGES: extend the allowlist started in migration 001.
-- Migration 001 ran REVOKE UPDATE ON profiles FROM authenticated, then
-- granted (muapi_key, updated_at). Now that full_name and avatar_url exist,
-- we extend the grant so users can update their own display info.
-- ---------------------------------------------------------------------------
GRANT UPDATE (full_name, avatar_url) ON profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICATION:
-- As authenticated (non-admin) user — MUST SUCCEED:
--   UPDATE profiles SET full_name = 'Test Name' WHERE id = auth.uid();
--   UPDATE profiles SET avatar_url = 'https://...' WHERE id = auth.uid();
--
-- MUST still FAIL (column-level restriction from migration 001):
--   UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
-- ---------------------------------------------------------------------------
