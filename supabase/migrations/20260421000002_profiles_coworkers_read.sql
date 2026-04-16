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
-- FIX:       SECURITY DEFINER helper function shares_workspace_with(uuid) +
--            additive SELECT policy on profiles.
--
--            Using a SECURITY DEFINER function (consistent with is_workspace_member
--            and is_admin) rather than an inline EXISTS avoids any potential RLS
--            recursion on workspace_members and keeps the pattern consistent with
--            the rest of the system. The function is also reusable in future policies.
--
-- SECURITY:  SELECT-only broadening. The profiles table column-level GRANTs from
--            Phase 0 already block writes to role, credit_limit, credits_used via
--            REVOKE. This change only adds a SELECT path — no escalation.
--
-- IDEMPOTENT: Yes — CREATE OR REPLACE for function, DROP … IF EXISTS for policy.
-- DEPENDS ON: 20260417000001_workspaces_core.sql (workspace_members table)
--             20260416000001_rls_existing_tables.sql (profiles RLS baseline)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- HELPER FUNCTION: shares_workspace_with
--
-- Returns true if auth.uid() shares at least one workspace with target_user_id.
-- SECURITY DEFINER: runs as the function owner (postgres), bypassing RLS on
-- workspace_members — consistent with is_workspace_member() and is_admin().
-- STABLE: reads-only, no side effects, result can be cached within a statement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shares_workspace_with(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members wm_self
    JOIN workspace_members wm_other
      ON wm_other.workspace_id = wm_self.workspace_id
    WHERE wm_self.user_id  = auth.uid()
      AND wm_other.user_id = target_user_id
  );
$$;

COMMENT ON FUNCTION shares_workspace_with(uuid) IS
  'Returns true if auth.uid() shares at least one workspace with target_user_id. Used for coworker visibility in RLS policies.';

-- ---------------------------------------------------------------------------
-- POLICY: workspace_members_read_coworker_profiles
--
-- Additive SELECT policy on profiles. Postgres evaluates multiple SELECT
-- policies with OR semantics, so users_read_own_profile and
-- admins_read_all_profiles continue to apply unchanged.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "workspace_members_read_coworker_profiles" ON profiles;

CREATE POLICY "workspace_members_read_coworker_profiles" ON profiles
  FOR SELECT USING (
    shares_workspace_with(id)
  );

-- ---------------------------------------------------------------------------
-- ASSERTIONS
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Function exists and is SECURITY DEFINER
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname   = 'shares_workspace_with'
       AND prosecdef = true
  ), 'Function shares_workspace_with must exist with SECURITY DEFINER';

  -- Policy exists on profiles
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename  = 'profiles'
       AND policyname = 'workspace_members_read_coworker_profiles'
  ), 'Policy workspace_members_read_coworker_profiles was not created on profiles';

  RAISE NOTICE 'shares_workspace_with() and workspace_members_read_coworker_profiles applied successfully.';
END;
$$;

-- ---------------------------------------------------------------------------
-- VERIFICATION QUERIES (run in Supabase SQL Editor after applying):
--
-- 1. Function exists and is SECURITY DEFINER:
--    SELECT proname, prosecdef, provolatile
--    FROM pg_proc WHERE proname = 'shares_workspace_with';
--    Expected: prosecdef = true, provolatile = 's' (stable)
--
-- 2. Policy exists on profiles (alongside existing ones):
--    SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles';
--    Expected rows include: users_read_own_profile, admins_read_all_profiles,
--                           workspace_members_read_coworker_profiles
--
-- 3. Functional test (run as activmente / editor user):
--    SELECT shares_workspace_with('<andrés_user_id>');
--    Expected: true
--
-- 4. Confirm member list is now visible — log in as activmente, visit
--    /w/verant/members — should show 2 members with names.
-- ---------------------------------------------------------------------------
