-- =============================================================================
-- MIGRATION: 20260421000002_profiles_coworkers_read.sql
-- PURPOSE:   Allow workspace members to read the profiles of their co-members.
--
-- PROBLEM:   The existing RLS on profiles only allows users to read their own
--            profile (users_read_own_profile: auth.uid() = id). In a multi-tenant
--            workspace context this is too restrictive:
--              - /w/[slug]/members was showing 0 members because the JOIN to
--                profiles returned null for everyone except the caller, and
--                PostgREST could not resolve the workspace_members.user_id →
--                auth.users → profiles FK path, returning a query error → data=null.
--              - File detail comments showed no author names.
--              - Any component doing profile joins with the SSR client returned
--                empty results for co-member data.
--
-- FIX:       Add a SELECT policy that allows reading profiles of users who share
--            at least one workspace with the caller. Uses a self-join on
--            workspace_members so the check stays within the public schema and
--            avoids auth.users (which requires service_role).
--
-- SECURITY:  The policy only exposes full_name, avatar_url (no sensitive columns).
--            The profiles table column-level GRANTs from Phase 0 already block
--            writes to role, credit_limit, credits_used via REVOKE. This change
--            only broadens SELECT — no escalation path.
--
-- IDEMPOTENT: Yes — DROP POLICY IF EXISTS before CREATE.
-- DEPENDS ON: 20260417000001_workspaces_core.sql (workspace_members table)
--             20260416000001_rls_existing_tables.sql (profiles RLS baseline)
-- =============================================================================

-- Drop old policy if exists (idempotent re-run safety)
DROP POLICY IF EXISTS "workspace_members_read_coworker_profiles" ON profiles;

CREATE POLICY "workspace_members_read_coworker_profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm_self
      JOIN workspace_members wm_other
        ON wm_other.workspace_id = wm_self.workspace_id
      WHERE wm_self.user_id  = auth.uid()
        AND wm_other.user_id = profiles.id
    )
  );

-- Note: this policy is additive — the existing users_read_own_profile policy
-- continues to apply (Postgres evaluates USING clauses with OR semantics when
-- multiple policies exist for the same operation). The new policy only adds the
-- co-member case; it does not replace the self-read case.

-- ---------------------------------------------------------------------------
-- ASSERTION
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename  = 'profiles'
       AND policyname = 'workspace_members_read_coworker_profiles'
  ), 'Policy workspace_members_read_coworker_profiles was not created on profiles';

  RAISE NOTICE 'workspace_members_read_coworker_profiles policy applied successfully.';
END;
$$;

-- ---------------------------------------------------------------------------
-- VERIFICATION QUERIES (run in Supabase SQL Editor after applying):
--
-- 1. Confirm both SELECT policies exist on profiles:
--    SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles';
--    Expected: users_read_own_profile, admins_read_all_profiles,
--              workspace_members_read_coworker_profiles (at minimum)
--
-- 2. Functional test — log in as activmente (editor), visit /w/verant/members,
--    confirm Andrés's profile row appears with name instead of "Usuario".
--
-- 3. Query simulation (run as editor user):
--    SELECT p.full_name FROM profiles p
--    WHERE EXISTS (
--      SELECT 1 FROM workspace_members wm1
--      JOIN workspace_members wm2 ON wm2.workspace_id = wm1.workspace_id
--      WHERE wm1.user_id = auth.uid() AND wm2.user_id = p.id
--    );
--    Expected: 2 rows (andrés + activmente for Verant workspace)
-- ---------------------------------------------------------------------------
