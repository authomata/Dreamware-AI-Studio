-- =============================================================================
-- MIGRATION: 20260417000001_workspaces_core.sql
-- PURPOSE:   Create workspaces, workspace_members, workspace_invitations tables.
--            Add is_workspace_member() helper, RLS policies, and trigger that
--            auto-inserts the creator as owner when a workspace is created.
-- IDEMPOTENT: Yes — uses IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY IF EXISTS.
-- REF:       SPEC_CAPA_CLIENTES.md sections 2.1, 3.2, 3.3
-- DEPENDS ON: 20260416000001_rls_existing_tables.sql (is_admin() must exist)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: workspaces
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  slug         text        NOT NULL UNIQUE
                           CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  type         text        NOT NULL CHECK (type IN ('client', 'internal')),
  logo_url     text,
  brand_color  text,
  plan         text        NOT NULL DEFAULT 'collaboration'
                           CHECK (plan IN ('collaboration', 'generative')),
  created_by   uuid        NOT NULL REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz,
  settings     jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces (slug);
CREATE INDEX IF NOT EXISTS idx_workspaces_type ON workspaces (type);

COMMENT ON TABLE workspaces IS 'Client or internal project workspaces';
COMMENT ON COLUMN workspaces.slug IS 'URL-safe identifier. Pattern: ^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$';
COMMENT ON COLUMN workspaces.type IS 'client = external client, internal = DreamWare team project';
COMMENT ON COLUMN workspaces.plan IS 'collaboration = workspace only; generative = workspace + AI studios';
COMMENT ON COLUMN workspaces.archived_at IS 'Soft delete — archived workspaces are hidden but data is preserved';

-- ---------------------------------------------------------------------------
-- TABLE: workspace_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text        NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'commenter', 'viewer')),
  invited_by   uuid        REFERENCES auth.users(id),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user     ON workspace_members (user_id);

COMMENT ON TABLE workspace_members IS 'Users and their roles within a workspace';
COMMENT ON COLUMN workspace_members.role IS 'owner > admin > editor > commenter > viewer';

-- ---------------------------------------------------------------------------
-- TABLE: workspace_invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_invitations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        text        NOT NULL,
  role         text        NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'commenter', 'viewer')),
  token        text        NOT NULL UNIQUE,
  invited_by   uuid        NOT NULL REFERENCES auth.users(id),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token ON workspace_invitations (token);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email ON workspace_invitations (email);

COMMENT ON TABLE workspace_invitations IS 'Pending invitations. Token is a secure random value, single-use, 7-day expiry.';

-- ---------------------------------------------------------------------------
-- HELPER FUNCTION: is_workspace_member(wid, min_role)
-- Checks whether the currently authenticated user is a member of workspace wid
-- with at least min_role level in the hierarchy:
--   owner > admin > editor > commenter > viewer
--
-- Used in RLS policies to avoid recursion (same pattern as is_admin()).
-- SECURITY DEFINER: runs as the function owner (postgres), bypasses RLS on
-- workspace_members so the check itself is not gated by the policy it is used in.
-- SET search_path = public: prevents search_path injection attacks.
--
-- Platform admins (is_admin() = true) are treated as implicit owners of every
-- workspace, so this function short-circuits to true for them regardless of
-- whether they have a formal workspace_members row. This keeps the RLS layer
-- consistent with assertWorkspaceRole() in the application layer and ensures the
-- WorkspaceSwitcher and direct DB queries work correctly for platform admins.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_workspace_member(
  wid      uuid,
  min_role text DEFAULT 'viewer'
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    -- Platform admins are implicit owners of all workspaces.
    -- Short-circuit before touching workspace_members for performance.
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM workspace_members
      WHERE workspace_id = wid
        AND user_id      = auth.uid()
        AND CASE min_role
              WHEN 'viewer'    THEN role IN ('viewer', 'commenter', 'editor', 'admin', 'owner')
              WHEN 'commenter' THEN role IN ('commenter', 'editor', 'admin', 'owner')
              WHEN 'editor'    THEN role IN ('editor', 'admin', 'owner')
              WHEN 'admin'     THEN role IN ('admin', 'owner')
              WHEN 'owner'     THEN role = 'owner'
              ELSE false
            END
    );
$$;

COMMENT ON FUNCTION is_workspace_member(uuid, text) IS
  'Returns true if auth.uid() is either:
   (a) a platform admin (implicit owner of all workspaces — is_admin() short-circuit), or
   (b) a formal member of workspace wid with at least min_role privilege.
   Role hierarchy: owner > admin > editor > commenter > viewer.
   SECURITY DEFINER + SET search_path = public to avoid RLS recursion and
   search_path injection. Used in all workspace RLS policies.';

-- ---------------------------------------------------------------------------
-- ASSERTIONS: verify CASE logic correctness before deploying RLS.
-- These run at migration time and fail fast if the hierarchy is broken.
-- We test the CASE expression directly (no need to mock auth.uid()).
-- role_to_rank is inlined as a CASE to avoid needing a nested function.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  actual_role  text;
  min_r        text;
  roles        text[] := ARRAY['owner', 'admin', 'editor', 'commenter', 'viewer'];
  -- owner=5, admin=4, editor=3, commenter=2, viewer=1
  role_rank    int;
  min_rank     int;
  eval_result  bool;
BEGIN
  FOREACH actual_role IN ARRAY roles LOOP
    FOREACH min_r IN ARRAY roles LOOP

      -- Evaluate the exact CASE expression copied from is_workspace_member()
      eval_result := CASE min_r
        WHEN 'viewer'    THEN actual_role IN ('viewer', 'commenter', 'editor', 'admin', 'owner')
        WHEN 'commenter' THEN actual_role IN ('commenter', 'editor', 'admin', 'owner')
        WHEN 'editor'    THEN actual_role IN ('editor', 'admin', 'owner')
        WHEN 'admin'     THEN actual_role IN ('admin', 'owner')
        WHEN 'owner'     THEN actual_role = 'owner'
        ELSE false
      END;

      -- Inline rank calculation (no nested functions in PL/pgSQL DO blocks)
      role_rank := CASE actual_role
        WHEN 'owner'     THEN 5
        WHEN 'admin'     THEN 4
        WHEN 'editor'    THEN 3
        WHEN 'commenter' THEN 2
        WHEN 'viewer'    THEN 1
        ELSE 0
      END;

      min_rank := CASE min_r
        WHEN 'owner'     THEN 5
        WHEN 'admin'     THEN 4
        WHEN 'editor'    THEN 3
        WHEN 'commenter' THEN 2
        WHEN 'viewer'    THEN 1
        ELSE 0
      END;

      -- A role satisfies a min_role iff its rank >= min_rank
      ASSERT eval_result = (role_rank >= min_rank),
        format(
          'ROLE HIERARCHY MISMATCH: role=%s (rank=%s) vs min_role=%s (rank=%s): '
          'CASE returned %s but expected %s',
          actual_role, role_rank, min_r, min_rank, eval_result, (role_rank >= min_rank)
        );

    END LOOP;
  END LOOP;

  RAISE NOTICE 'is_workspace_member CASE assertions passed — all 25 role×min_role combinations correct.';
END;
$$;

-- ---------------------------------------------------------------------------
-- TRIGGER: auto-insert creator as 'owner' in workspace_members on workspace INSERT.
-- Uses SECURITY DEFINER semantics naturally (triggers run with definer rights
-- when the function is SECURITY DEFINER). RLS on workspace_members is bypassed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _trigger_workspace_add_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_created_add_owner ON workspaces;
CREATE TRIGGER on_workspace_created_add_owner
  AFTER INSERT ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION _trigger_workspace_add_owner();

-- ---------------------------------------------------------------------------
-- RLS — workspaces
-- SELECT: any workspace member (viewer+) OR platform admin
-- INSERT: platform admin ('admin') or team member ('team')
--         ANTI-SPOOFING: created_by must equal auth.uid() so the trigger
--         auto-inserts the real caller as owner, not an arbitrary user.
-- UPDATE: workspace admin+
-- DELETE: workspace owner only (soft-delete preferred via archived_at)
-- ---------------------------------------------------------------------------
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_select_members_or_admin" ON workspaces;
CREATE POLICY "workspace_select_members_or_admin" ON workspaces
  FOR SELECT USING (
    is_workspace_member(id, 'viewer')
    OR is_admin()
  );

DROP POLICY IF EXISTS "workspace_insert_platform_admin_or_team" ON workspaces;
CREATE POLICY "workspace_insert_platform_admin_or_team" ON workspaces
  FOR INSERT WITH CHECK (
    -- created_by must be the calling user: prevents a team member from
    -- setting created_by to a different user_id, which would cause the
    -- trigger to make that other user the workspace owner.
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'team')
    )
  );

DROP POLICY IF EXISTS "workspace_update_workspace_admin" ON workspaces;
CREATE POLICY "workspace_update_workspace_admin" ON workspaces
  FOR UPDATE USING (
    is_workspace_member(id, 'admin')
  );

DROP POLICY IF EXISTS "workspace_delete_workspace_owner" ON workspaces;
CREATE POLICY "workspace_delete_workspace_owner" ON workspaces
  FOR DELETE USING (
    is_workspace_member(id, 'owner')
  );

-- ---------------------------------------------------------------------------
-- RLS — workspace_members
-- SELECT: any member of the workspace (viewer+)
-- INSERT: workspace admin+ (owner acceptance flow uses service role)
-- UPDATE: workspace admin+ (to change roles)
-- DELETE: workspace admin+ (app-level prevents removing last owner)
-- ---------------------------------------------------------------------------
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wm_select_members" ON workspace_members;
CREATE POLICY "wm_select_members" ON workspace_members
  FOR SELECT USING (
    is_workspace_member(workspace_id, 'viewer')
  );

DROP POLICY IF EXISTS "wm_insert_workspace_admin" ON workspace_members;
CREATE POLICY "wm_insert_workspace_admin" ON workspace_members
  FOR INSERT WITH CHECK (
    is_workspace_member(workspace_id, 'admin')
  );

DROP POLICY IF EXISTS "wm_update_workspace_admin" ON workspace_members;
CREATE POLICY "wm_update_workspace_admin" ON workspace_members
  FOR UPDATE USING (
    is_workspace_member(workspace_id, 'admin')
  );

DROP POLICY IF EXISTS "wm_delete_workspace_admin" ON workspace_members;
CREATE POLICY "wm_delete_workspace_admin" ON workspace_members
  FOR DELETE USING (
    is_workspace_member(workspace_id, 'admin')
  );

-- ---------------------------------------------------------------------------
-- RLS — workspace_invitations
-- Only workspace admins can see/manage invitations.
-- Acceptance is done via service role (createAdminClient) in Server Actions,
-- so accepting users do NOT need direct INSERT/UPDATE access here.
-- ---------------------------------------------------------------------------
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wi_select_workspace_admin" ON workspace_invitations;
CREATE POLICY "wi_select_workspace_admin" ON workspace_invitations
  FOR SELECT USING (
    is_workspace_member(workspace_id, 'admin')
  );

DROP POLICY IF EXISTS "wi_insert_workspace_admin" ON workspace_invitations;
CREATE POLICY "wi_insert_workspace_admin" ON workspace_invitations
  FOR INSERT WITH CHECK (
    is_workspace_member(workspace_id, 'admin')
  );

DROP POLICY IF EXISTS "wi_update_workspace_admin" ON workspace_invitations;
CREATE POLICY "wi_update_workspace_admin" ON workspace_invitations
  FOR UPDATE USING (
    is_workspace_member(workspace_id, 'admin')
  );

DROP POLICY IF EXISTS "wi_delete_workspace_admin" ON workspace_invitations;
CREATE POLICY "wi_delete_workspace_admin" ON workspace_invitations
  FOR DELETE USING (
    is_workspace_member(workspace_id, 'admin')
  );

-- ---------------------------------------------------------------------------
-- VERIFICATION QUERIES (run manually in Supabase SQL Editor after applying):
--
-- 1. Check tables exist:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public'
--      AND table_name IN ('workspaces','workspace_members','workspace_invitations');
--
-- 2. Check function exists:
--    SELECT proname, prosecdef FROM pg_proc WHERE proname = 'is_workspace_member';
--    -- prosecdef should be true (SECURITY DEFINER)
--
-- 3. Check RLS enabled on all 3 tables:
--    SELECT tablename, rowsecurity FROM pg_tables
--    WHERE tablename IN ('workspaces','workspace_members','workspace_invitations');
--    -- rowsecurity should be true for all
--
-- 4. Check trigger exists:
--    SELECT trigger_name FROM information_schema.triggers
--    WHERE trigger_name = 'on_workspace_created_add_owner';
--
-- 5. Quick sanity test (as superuser):
--    INSERT INTO workspaces (name, slug, type, created_by)
--    VALUES ('Test', 'test-ws', 'internal', '<any_user_uuid>');
--    SELECT * FROM workspace_members WHERE workspace_id = (SELECT id FROM workspaces WHERE slug = 'test-ws');
--    -- Should show the user as owner
--    DELETE FROM workspaces WHERE slug = 'test-ws';
-- ---------------------------------------------------------------------------
