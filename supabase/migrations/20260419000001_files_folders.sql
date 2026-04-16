-- =============================================================================
-- MIGRATION: 20260419000001_files_folders.sql
-- PURPOSE:   Create folders and files tables, add storage tracking to
--            workspaces, create default-folders trigger, backfill existing
--            workspaces, and apply RLS policies.
-- IDEMPOTENT: Yes — uses IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY IF EXISTS.
-- REF:       SPEC_CAPA_CLIENTES.md section 2.1, 3.3
-- DEPENDS ON: 20260417000001_workspaces_core.sql (workspaces table + is_workspace_member)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTEND workspaces: storage usage tracking column
-- No enforcement here — just a denormalized counter updated by trigger.
-- Enforcement (quota checks) is in the upload signing endpoint.
-- ---------------------------------------------------------------------------
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS storage_used_bytes bigint NOT NULL DEFAULT 0;
COMMENT ON COLUMN workspaces.storage_used_bytes IS
  'Denormalized sum of files.size_bytes for this workspace. Updated by trigger on files INSERT/DELETE. Not enforced here — quota enforced in app/api/upload/sign.';

-- ---------------------------------------------------------------------------
-- TABLE: folders
-- Hierarchical folders within a workspace. NULL parent_id = workspace root.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS folders (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id    uuid        REFERENCES folders(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  created_by   uuid        NOT NULL REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folders_workspace ON folders (workspace_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent    ON folders (parent_id);

COMMENT ON TABLE folders IS 'Hierarchical folders within a workspace. parent_id NULL = workspace root.';
COMMENT ON COLUMN folders.parent_id IS 'NULL means root-level folder. Supports arbitrary nesting.';

-- ---------------------------------------------------------------------------
-- TABLE: files
-- Files uploaded to Storage. storage_path is the key in the workspace-files bucket.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  folder_id       uuid        REFERENCES folders(id) ON DELETE SET NULL,
  name            text        NOT NULL,
  storage_path    text        NOT NULL,
  mime_type       text        NOT NULL,
  size_bytes      bigint      NOT NULL,
  uploaded_by     uuid        NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_review_asset boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_files_workspace ON files (workspace_id);
CREATE INDEX IF NOT EXISTS idx_files_folder    ON files (folder_id);
-- Partial index for media review tab (Phase 3)
CREATE INDEX IF NOT EXISTS idx_files_review    ON files (workspace_id) WHERE is_review_asset = true;

COMMENT ON TABLE files IS 'Files uploaded to Supabase Storage (bucket: workspace-files).';
COMMENT ON COLUMN files.storage_path IS 'Key in workspace-files bucket. Pattern: {workspace_id}/{file_id}-{sanitized_name}';
COMMENT ON COLUMN files.is_review_asset IS 'If true, shown in Media Review tab (Phase 3) for timestamped/coordinate comments.';

-- ---------------------------------------------------------------------------
-- TRIGGER: update workspaces.storage_used_bytes on files INSERT/DELETE.
-- Tracks usage for display — quota enforcement is in the upload endpoint.
-- SECURITY DEFINER so it can UPDATE workspaces bypassing RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _trigger_files_update_storage_bytes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE workspaces
    SET storage_used_bytes = storage_used_bytes + NEW.size_bytes
    WHERE id = NEW.workspace_id;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE workspaces
    SET storage_used_bytes = GREATEST(0, storage_used_bytes - OLD.size_bytes)
    WHERE id = OLD.workspace_id;
  END IF;
  RETURN NULL; -- AFTER trigger, return value ignored for row-level
END;
$$;

DROP TRIGGER IF EXISTS on_file_change_update_storage ON files;
CREATE TRIGGER on_file_change_update_storage
  AFTER INSERT OR DELETE ON files
  FOR EACH ROW
  EXECUTE FUNCTION _trigger_files_update_storage_bytes();

-- ---------------------------------------------------------------------------
-- TRIGGER: create default folders when a workspace is created.
-- Runs AFTER INSERT on workspaces, SECURITY DEFINER to bypass folders RLS.
-- Default folders: Brand Assets, Entregables, Reuniones, Documentos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _trigger_workspace_create_default_folders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  folder_name text;
  default_folders text[] := ARRAY['Brand Assets', 'Entregables', 'Reuniones', 'Documentos'];
BEGIN
  FOREACH folder_name IN ARRAY default_folders LOOP
    INSERT INTO folders (workspace_id, parent_id, name, created_by)
    VALUES (NEW.id, NULL, folder_name, NEW.created_by)
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_created_make_default_folders ON workspaces;
CREATE TRIGGER on_workspace_created_make_default_folders
  AFTER INSERT ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION _trigger_workspace_create_default_folders();

-- ---------------------------------------------------------------------------
-- BACKFILL: create default folders for workspaces that already exist
-- (created before this migration ran). ON CONFLICT DO NOTHING is safe
-- if a workspace somehow already has a folder with the same name.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  ws           RECORD;
  folder_name  text;
  default_folders text[] := ARRAY['Brand Assets', 'Entregables', 'Reuniones', 'Documentos'];
BEGIN
  FOR ws IN SELECT id, created_by FROM workspaces WHERE archived_at IS NULL LOOP
    FOREACH folder_name IN ARRAY default_folders LOOP
      -- Only create if this exact folder name doesn't exist at root for this workspace
      INSERT INTO folders (workspace_id, parent_id, name, created_by)
      VALUES (ws.id, NULL, folder_name, ws.created_by)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Default folders backfill complete.';
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS — folders
-- SELECT: any workspace member (viewer+)
-- INSERT: editor+ (with check that workspace_id is correct)
-- UPDATE: editor+ (rename, reparent)
-- DELETE: editor+ (files inside go to folder_id=null — known debt)
-- ---------------------------------------------------------------------------
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "folders_select_members"  ON folders;
CREATE POLICY "folders_select_members" ON folders
  FOR SELECT USING ( is_workspace_member(workspace_id, 'viewer') );

DROP POLICY IF EXISTS "folders_insert_editors"  ON folders;
CREATE POLICY "folders_insert_editors" ON folders
  FOR INSERT WITH CHECK ( is_workspace_member(workspace_id, 'editor') );

DROP POLICY IF EXISTS "folders_update_editors"  ON folders;
CREATE POLICY "folders_update_editors" ON folders
  FOR UPDATE USING ( is_workspace_member(workspace_id, 'editor') );

DROP POLICY IF EXISTS "folders_delete_editors"  ON folders;
CREATE POLICY "folders_delete_editors" ON folders
  FOR DELETE USING ( is_workspace_member(workspace_id, 'editor') );

-- ---------------------------------------------------------------------------
-- RLS — files
-- SELECT: any workspace member (viewer+)
-- INSERT: editor+ (registerUploadedFile uses admin client for the actual insert,
--         but this policy covers any direct authenticated insert)
-- UPDATE: editor+ (rename, move, toggle review)
-- DELETE: editor+ (app-level further restricts to author-or-admin)
-- ---------------------------------------------------------------------------
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "files_select_members"  ON files;
CREATE POLICY "files_select_members" ON files
  FOR SELECT USING ( is_workspace_member(workspace_id, 'viewer') );

DROP POLICY IF EXISTS "files_insert_editors"  ON files;
CREATE POLICY "files_insert_editors" ON files
  FOR INSERT WITH CHECK ( is_workspace_member(workspace_id, 'editor') );

DROP POLICY IF EXISTS "files_update_editors"  ON files;
CREATE POLICY "files_update_editors" ON files
  FOR UPDATE USING ( is_workspace_member(workspace_id, 'editor') );

DROP POLICY IF EXISTS "files_delete_editors"  ON files;
CREATE POLICY "files_delete_editors" ON files
  FOR DELETE USING ( is_workspace_member(workspace_id, 'editor') );

-- ---------------------------------------------------------------------------
-- VERIFICATION QUERIES (run in Supabase SQL Editor after applying):
--
-- 1. Tables exist:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name IN ('folders','files');
--
-- 2. RLS enabled:
--    SELECT tablename, rowsecurity FROM pg_tables
--    WHERE tablename IN ('folders','files');
--
-- 3. Triggers exist:
--    SELECT trigger_name FROM information_schema.triggers
--    WHERE trigger_name IN (
--      'on_file_change_update_storage',
--      'on_workspace_created_make_default_folders'
--    );
--
-- 4. Default folders were created for existing workspaces:
--    SELECT w.name AS workspace, f.name AS folder
--    FROM folders f JOIN workspaces w ON w.id = f.workspace_id
--    ORDER BY w.name, f.name;
--
-- 5. storage_used_bytes column exists:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'workspaces' AND column_name = 'storage_used_bytes';
-- ---------------------------------------------------------------------------
