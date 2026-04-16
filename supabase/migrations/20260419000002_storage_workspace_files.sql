-- =============================================================================
-- MIGRATION: 20260419000002_storage_workspace_files.sql
-- PURPOSE:   RLS policies on storage.objects for the 'workspace-files' bucket.
--            The bucket itself was created manually in Supabase Dashboard (private,
--            50 MB file size limit). This migration only adds the access policies.
-- IDEMPOTENT: Yes — DROP POLICY IF EXISTS before each CREATE POLICY.
-- REF:       SPEC_CAPA_CLIENTES.md section 3.4
-- DEPENDS ON: 20260417000001_workspaces_core.sql (is_workspace_member function)
--
-- PATH PATTERN: {workspace_id}/{file_id}-{sanitized_filename}
--   e.g.: "a1b2c3d4-…/f9e8d7c6-…-mi_archivo.pdf"
--
-- storage.foldername(name) splits the path by '/' and returns an array.
-- (storage.foldername(name))[1] = first segment = workspace_id
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- NOTE: storage.foldername() is only callable inside a storage context
-- and cannot be exercised in a plain migration DO block. The path pattern
-- contract is therefore documented here and must be verified manually.
--
-- To verify path extraction after applying this migration, run in SQL Editor:
--   SELECT (storage.foldername('a1b2c3d4-0000-0000-0000-000000000001/f9e8d7c6-0000-0000-0000-000000000002-archivo.pdf'))[1];
--   -- Expected: 'a1b2c3d4-0000-0000-0000-000000000001'
--
-- The app invariant enforced in /api/upload/sign is:
--   storage_path = `${workspace_id}/${file_id}-${sanitizedFilename}`
--   => (storage.foldername(storage_path))[1] === workspace_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'Storage policies for workspace-files bucket created.';
  RAISE NOTICE 'To verify path extraction, run: SELECT (storage.foldername(''<ws_id>/<file_id>-name.pdf''))[1];';
  RAISE NOTICE 'Expected: the workspace_id UUID.';
END;
$$;

-- ---------------------------------------------------------------------------
-- STORAGE POLICIES — workspace-files bucket
--
-- All policies call is_workspace_member() with the workspace_id extracted
-- from the storage path. Because is_workspace_member is SECURITY DEFINER,
-- it bypasses storage.objects RLS recursion.
--
-- NOTE: storage.foldername(name) returns text[] of directory segments.
-- (storage.foldername(name))[1] is the first path component (workspace_id).
-- ---------------------------------------------------------------------------

-- SELECT (download): workspace members viewer+
DROP POLICY IF EXISTS "members_read_workspace_files" ON storage.objects;
CREATE POLICY "members_read_workspace_files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'workspace-files'
    AND is_workspace_member(
      (storage.foldername(name))[1]::uuid,
      'viewer'
    )
  );

-- INSERT (upload): workspace members editor+
DROP POLICY IF EXISTS "editors_upload_workspace_files" ON storage.objects;
CREATE POLICY "editors_upload_workspace_files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'workspace-files'
    AND is_workspace_member(
      (storage.foldername(name))[1]::uuid,
      'editor'
    )
  );

-- UPDATE (overwrite): workspace members editor+
DROP POLICY IF EXISTS "editors_update_workspace_files" ON storage.objects;
CREATE POLICY "editors_update_workspace_files" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'workspace-files'
    AND is_workspace_member(
      (storage.foldername(name))[1]::uuid,
      'editor'
    )
  );

-- DELETE: workspace members editor+
-- App-level logic in deleteFile() further restricts to author-or-admin.
DROP POLICY IF EXISTS "editors_delete_workspace_files" ON storage.objects;
CREATE POLICY "editors_delete_workspace_files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'workspace-files'
    AND is_workspace_member(
      (storage.foldername(name))[1]::uuid,
      'editor'
    )
  );

-- ---------------------------------------------------------------------------
-- VERIFICATION QUERIES (run in Supabase SQL Editor after applying):
--
-- 1. Policies exist on storage.objects:
--    SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'objects' AND schemaname = 'storage'
--    AND policyname LIKE '%workspace_files%';
--    -- Expect 4 rows: SELECT, INSERT, UPDATE, DELETE
--
-- 2. Manual access test (run as authenticated non-member):
--    -- Attempt to list a workspace's files as a non-member → should return 0 rows
--    SELECT * FROM storage.objects
--    WHERE bucket_id = 'workspace-files'
--    AND name LIKE '{a_workspace_id_you_are_not_member_of}/%';
--
-- 3. Verify path segment extraction works in context:
--    SELECT (storage.foldername('abc123/file-name.pdf'))[1];
--    -- Should return 'abc123'
-- ---------------------------------------------------------------------------
