-- =============================================================================
-- MIGRATION: 20260416000001_rls_existing_tables.sql
-- PURPOSE:   Upgrade RLS policies on existing tables to match SPEC section 3.1.
--            The baseline migration already has RLS enabled and broad policies.
--            This migration refines them for the workspace layer.
-- IDEMPOTENT: Yes — uses DO blocks + pg_policies checks + DROP IF EXISTS.
-- BEFORE APPLYING: Verify RLS is ON in Supabase Dashboard for all 4 tables.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- HELPER FUNCTION: is_admin()
-- Security Definer to avoid RLS recursion when checking admin role inside
-- a policy on the profiles table itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- TABLE: profiles
-- Replace the broad "own profile" FOR ALL policy with specific per-operation
-- policies that allow admins to read all profiles (needed for workspace layer).
-- ---------------------------------------------------------------------------

-- Drop the old broad policy if it exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'own profile'
  ) THEN
    DROP POLICY "own profile" ON profiles;
  END IF;
END $$;

-- SELECT: own profile OR admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'users_read_own_profile'
  ) THEN
    CREATE POLICY "users_read_own_profile" ON profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'admins_read_all_profiles'
  ) THEN
    CREATE POLICY "admins_read_all_profiles" ON profiles
      FOR SELECT USING (is_admin());
  END IF;
END $$;

-- UPDATE: own row only. Role escalation is prevented by column-level GRANT below,
-- not by WITH CHECK (which would require a recursive self-join on profiles).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'users_update_own_profile'
  ) THEN
    CREATE POLICY "users_update_own_profile" ON profiles
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- INSERT: no policy needed — handled exclusively by handle_new_user() trigger
-- which runs as SECURITY DEFINER (service_role level). Direct client inserts
-- are already blocked by the absence of an INSERT policy when RLS is ON.

-- DELETE: no policy needed — admin-only via service_role / assertAdmin guard.
-- Direct client deletes are already blocked by RLS.

-- ---------------------------------------------------------------------------
-- COLUMN-LEVEL PRIVILEGES: profiles
-- Prevents privilege escalation via direct anon-key requests.
-- The UPDATE policy above allows updating own row, but we restrict WHICH
-- columns the authenticated role can touch.
--
-- Sensitive columns (role, credit_limit, credits_used) are admin-only via
-- service_role. Regular users can never update them from the client.
--
-- full_name and avatar_url are granted in migration 002, after the
-- ALTER TABLE that creates those columns.
--
-- INSERT/DELETE are also explicitly revoked as defense-in-depth:
-- - INSERT is handled by the handle_new_user trigger (service_role);
--   direct client inserts are already blocked by RLS, but REVOKE prevents
--   regressions if a permissive INSERT policy is ever accidentally added.
-- - DELETE is admin-only; same defense-in-depth rationale.
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON profiles FROM authenticated;
GRANT  UPDATE (muapi_key, updated_at) ON profiles TO authenticated;

REVOKE INSERT, DELETE ON profiles FROM authenticated;

-- ---------------------------------------------------------------------------
-- TABLE: generations
-- Replace broad "own generations" with explicit WITH CHECK.
-- No column-level REVOKE needed: no sensitive privilege columns; user_id
-- reassignment is already blocked by WITH CHECK (auth.uid() = user_id).
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'generations' AND policyname = 'own generations'
  ) THEN
    DROP POLICY "own generations" ON generations;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'generations' AND policyname = 'users_crud_own_generations'
  ) THEN
    CREATE POLICY "users_crud_own_generations" ON generations
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- TABLE: characters
-- Replace broad "own characters" with explicit WITH CHECK.
-- No column-level REVOKE needed: all columns are user-controlled content
-- (name, description, trigger_prompt, reference_images, thumbnail).
-- user_id reassignment blocked by WITH CHECK.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'characters' AND policyname = 'own characters'
  ) THEN
    DROP POLICY "own characters" ON characters;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'characters' AND policyname = 'users_crud_own_characters'
  ) THEN
    CREATE POLICY "users_crud_own_characters" ON characters
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- TABLE: platform_settings
-- Replace old "admin only" with explicit name from SPEC.
-- No column-level REVOKE needed: is_admin() blocks all non-admin access
-- entirely at the RLS level — no authenticated user can touch any column.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'platform_settings' AND policyname = 'admin only'
  ) THEN
    DROP POLICY "admin only" ON platform_settings;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'platform_settings' AND policyname = 'only_admin_platform_settings'
  ) THEN
    CREATE POLICY "only_admin_platform_settings" ON platform_settings
      FOR ALL USING (is_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- VERIFICATION QUERIES (run manually after applying to confirm):
-- ---------------------------------------------------------------------------
-- 1. Check policies exist (should return 6 rows):
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN ('profiles','generations','characters','platform_settings')
-- ORDER BY tablename, policyname;
--
-- Expected:
--   characters       | users_crud_own_characters    | ALL
--   generations      | users_crud_own_generations   | ALL
--   platform_settings| only_admin_platform_settings | ALL
--   profiles         | admins_read_all_profiles     | SELECT
--   profiles         | users_read_own_profile       | SELECT
--   profiles         | users_update_own_profile     | UPDATE
--
-- 2. As authenticated (non-admin) user via anon key — MUST FAIL:
--    UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
--    --> ERROR: permission denied for column role
--
-- 3. As authenticated user — MUST SUCCEED:
--    UPDATE profiles SET muapi_key = 'test-key' WHERE id = auth.uid();
