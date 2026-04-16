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

-- UPDATE: own profile only, with CHECK that prevents self-escalating role
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'users_update_own_profile'
  ) THEN
    CREATE POLICY "users_update_own_profile" ON profiles
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (
        auth.uid() = id
        AND role = (SELECT role FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- INSERT: handled only by trigger (handle_new_user runs as SECURITY DEFINER)
-- No explicit INSERT policy needed for normal users.

-- DELETE: not allowed for users (only service_role/admin panel)
-- No DELETE policy = blocked by default when RLS is ON.

-- ---------------------------------------------------------------------------
-- TABLE: generations
-- Replace broad "own generations" with explicit WITH CHECK.
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
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('profiles','generations','characters','platform_settings')
-- ORDER BY tablename, policyname;
--
-- -- Should return 5 policies total:
-- -- profiles: users_read_own_profile, admins_read_all_profiles, users_update_own_profile
-- -- generations: users_crud_own_generations
-- -- characters: users_crud_own_characters
-- -- platform_settings: only_admin_platform_settings
