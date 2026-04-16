-- =============================================================================
-- MIGRATION: 20260423000001_documents.sql
-- PURPOSE:   Phase 4 — WYSIWYG documents (Notion-like) with Tiptap JSON content
--            and inline selection comments.
--
-- TABLES:    documents, document_comments
-- RLS:       viewer+ read, editor insert/update, author/admin delete
-- TRIGGERS:  updated_at auto-bump, notify_on_document_comment (SECURITY DEFINER)
-- REALTIME:  document_comments added to supabase_realtime publication
-- IDEMPOTENT: Yes — IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS
-- DEPENDS ON: 20260417000001_workspaces_core.sql (workspaces, workspace_members,
--               is_workspace_member, is_admin)
--             20260419000001_files_folders.sql (folders table)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid        NOT NULL REFERENCES workspaces(id)   ON DELETE CASCADE,
  folder_id    uuid                 REFERENCES folders(id)      ON DELETE SET NULL,
  title        text        NOT NULL,
  content      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by   uuid        NOT NULL REFERENCES auth.users(id),
  updated_by   uuid        NOT NULL REFERENCES auth.users(id),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_workspace
  ON documents(workspace_id);

CREATE INDEX IF NOT EXISTS idx_documents_folder
  ON documents(folder_id)
  WHERE folder_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- TABLE: document_comments
-- Anchor: documents(id). workspace_id denormalized for efficient RLS.
-- selection_from/to: ProseMirror character positions (integer, nullable).
-- selection_text: snapshot of the selected text when comment was created.
-- resolved_by: who resolved the comment (Frame.io pattern, nullable).
-- parent_id: one-level threading (replies).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_comments (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id    uuid        NOT NULL REFERENCES documents(id)          ON DELETE CASCADE,
  workspace_id   uuid        NOT NULL REFERENCES workspaces(id)         ON DELETE CASCADE,
  author_id      uuid        NOT NULL REFERENCES auth.users(id),
  body           text        NOT NULL,
  selection_from integer,
  selection_to   integer,
  selection_text text,
  resolved_at    timestamptz,
  resolved_by    uuid                 REFERENCES auth.users(id),
  parent_id      uuid                 REFERENCES document_comments(id)  ON DELETE CASCADE,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_comments_document
  ON document_comments(document_id);

CREATE INDEX IF NOT EXISTS idx_document_comments_workspace
  ON document_comments(workspace_id);

CREATE INDEX IF NOT EXISTS idx_document_comments_author
  ON document_comments(author_id);

CREATE INDEX IF NOT EXISTS idx_document_comments_parent
  ON document_comments(parent_id);

-- ---------------------------------------------------------------------------
-- TRIGGER: set_updated_at — bumps documents.updated_at on every UPDATE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION documents_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION documents_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — documents
--
-- SELECT  : any workspace member (viewer+)
-- INSERT  : workspace editor+ (created_by must be caller)
-- UPDATE  : workspace editor+ (any editor can update any doc — last-write-wins)
-- DELETE  : document creator OR workspace admin+
-- ---------------------------------------------------------------------------
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_documents"    ON documents;
DROP POLICY IF EXISTS "editors_insert_documents"  ON documents;
DROP POLICY IF EXISTS "editors_update_documents"  ON documents;
DROP POLICY IF EXISTS "authors_delete_documents"  ON documents;

CREATE POLICY "members_read_documents" ON documents
  FOR SELECT USING (is_workspace_member(workspace_id, 'viewer'));

CREATE POLICY "editors_insert_documents" ON documents
  FOR INSERT WITH CHECK (
    is_workspace_member(workspace_id, 'editor')
    AND created_by = auth.uid()
  );

CREATE POLICY "editors_update_documents" ON documents
  FOR UPDATE USING (
    is_workspace_member(workspace_id, 'editor')
  );

-- DELETE: creator or admin+. App-layer check in server action.
-- RLS floor here is editor so the server action can guard author/admin.
CREATE POLICY "authors_delete_documents" ON documents
  FOR DELETE USING (
    created_by = auth.uid()
    OR is_workspace_member(workspace_id, 'admin')
  );

-- ---------------------------------------------------------------------------
-- RLS — document_comments
--
-- SELECT  : any workspace member (viewer+)
-- INSERT  : workspace commenter+ (author_id must be caller)
-- UPDATE  : comment author OR workspace editor+ (Frame.io resolve pattern)
--           Body edits are author-only — enforced by server action, not RLS.
-- DELETE  : comment author OR workspace admin+
-- ---------------------------------------------------------------------------
ALTER TABLE document_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_document_comments"      ON document_comments;
DROP POLICY IF EXISTS "commenters_insert_document_comments" ON document_comments;
DROP POLICY IF EXISTS "editors_update_document_comments"    ON document_comments;
DROP POLICY IF EXISTS "authors_delete_document_comments"    ON document_comments;

CREATE POLICY "members_read_document_comments" ON document_comments
  FOR SELECT USING (is_workspace_member(workspace_id, 'viewer'));

CREATE POLICY "commenters_insert_document_comments" ON document_comments
  FOR INSERT WITH CHECK (
    is_workspace_member(workspace_id, 'commenter')
    AND author_id = auth.uid()
  );

-- UPDATE: Frame.io pattern — any editor+ can resolve/unresolve any comment.
-- Body edits remain author-only, enforced by the editDocumentComment server action.
CREATE POLICY "editors_update_document_comments" ON document_comments
  FOR UPDATE USING (
    author_id = auth.uid()
    OR is_workspace_member(workspace_id, 'editor')
  );

CREATE POLICY "authors_delete_document_comments" ON document_comments
  FOR DELETE USING (
    author_id = auth.uid()
    OR is_workspace_member(workspace_id, 'admin')
  );

-- ---------------------------------------------------------------------------
-- TRIGGER: notify_on_document_comment
--
-- Fires AFTER INSERT on document_comments. Creates a notification for:
--   1. The document creator (if different from commenter AND still a member).
--   2. All other previous commenters on the same document (still members,
--      excluding the current commenter and the creator already notified).
--
-- Uses direct JOIN on workspace_members — NOT is_workspace_member() — because
-- in SECURITY DEFINER context auth.uid() resolves to the function owner (postgres),
-- not the JWT user. Same pattern as notify_on_media_comment.
--
-- Resolver display: COALESCE(full_name, email, 'Alguien') via JOIN auth.users.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_on_document_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_title       text;
  v_workspace_slug  text;
  v_doc_creator     uuid;
  v_link            text;
  v_notif_title     text;
  v_notified        uuid[] := ARRAY[NEW.author_id];
BEGIN
  -- Gather document + workspace context
  SELECT d.title, d.created_by, w.slug
    INTO v_doc_title, v_doc_creator, v_workspace_slug
    FROM documents d
    JOIN workspaces w ON w.id = d.workspace_id
   WHERE d.id = NEW.document_id;

  v_link        := '/w/' || v_workspace_slug || '/docs/' || NEW.document_id;
  v_notif_title := 'Nuevo comentario en "' || v_doc_title || '"';

  -- 1. Notify the document creator if not the commenter and still a member
  IF v_doc_creator IS NOT NULL AND v_doc_creator <> NEW.author_id THEN
    IF EXISTS (
      SELECT 1 FROM workspace_members
       WHERE workspace_id = NEW.workspace_id
         AND user_id      = v_doc_creator
    ) THEN
      INSERT INTO notifications (user_id, workspace_id, type, title, body, link)
      VALUES (
        v_doc_creator,
        NEW.workspace_id,
        'comment',
        v_notif_title,
        LEFT(NEW.body, 120),
        v_link
      );
      v_notified := v_notified || ARRAY[v_doc_creator];
    END IF;
  END IF;

  -- 2. Notify all other previous commenters still in the workspace
  INSERT INTO notifications (user_id, workspace_id, type, title, body, link)
  SELECT DISTINCT
    dc.author_id,
    NEW.workspace_id,
    'comment',
    v_notif_title,
    LEFT(NEW.body, 120),
    v_link
  FROM document_comments dc
  JOIN workspace_members wm
    ON wm.workspace_id = NEW.workspace_id
   AND wm.user_id      = dc.author_id
  WHERE dc.document_id = NEW.document_id
    AND dc.id          <> NEW.id
    AND NOT (dc.author_id = ANY(v_notified));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_document_comment_insert ON document_comments;
CREATE TRIGGER on_document_comment_insert
  AFTER INSERT ON document_comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_document_comment();

-- ---------------------------------------------------------------------------
-- TRIGGER: notify_on_document_comment_resolved
--
-- Fires AFTER UPDATE when resolved_at transitions NULL → non-NULL.
-- Notifies the comment author so they can audit the resolution and reopen.
-- Skips: self-resolve, author no longer in workspace.
-- Uses COALESCE(full_name, email, 'Alguien') for resolver display name.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_on_document_comment_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_title       text;
  v_workspace_slug  text;
  v_resolver_name   text;
  v_resolver_email  text;
  v_resolver_label  text;
  v_link            text;
  v_is_member       boolean;
BEGIN
  -- Only fire on NULL → non-NULL transition of resolved_at
  IF OLD.resolved_at IS NOT NULL OR NEW.resolved_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if author resolved their own comment
  IF NEW.resolved_by = NEW.author_id THEN
    RETURN NEW;
  END IF;

  -- Skip if author is no longer a workspace member
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
     WHERE workspace_id = NEW.workspace_id
       AND user_id      = NEW.author_id
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RETURN NEW;
  END IF;

  -- Gather document + workspace context
  SELECT d.title, w.slug
    INTO v_doc_title, v_workspace_slug
    FROM documents d
    JOIN workspaces w ON w.id = d.workspace_id
   WHERE d.id = NEW.document_id;

  -- Resolver display: full_name → email → 'Alguien'
  SELECT p.full_name, u.email
    INTO v_resolver_name, v_resolver_email
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
   WHERE u.id = NEW.resolved_by;

  v_resolver_label := COALESCE(v_resolver_name, v_resolver_email, 'Alguien');
  v_link           := '/w/' || v_workspace_slug || '/docs/' || NEW.document_id;

  INSERT INTO notifications (user_id, workspace_id, type, title, body, link)
  VALUES (
    NEW.author_id,
    NEW.workspace_id,
    'comment',
    v_resolver_label || ' resolvió tu comentario',
    'En "' || v_doc_title || '"',
    v_link
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_document_comment_resolved ON document_comments;
CREATE TRIGGER on_document_comment_resolved
  AFTER UPDATE ON document_comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_document_comment_resolved();

-- ---------------------------------------------------------------------------
-- REALTIME: add document_comments to supabase_realtime publication
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'document_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE document_comments;
  END IF;

  RAISE NOTICE 'document_comments added to supabase_realtime publication.';
END;
$$;

-- ---------------------------------------------------------------------------
-- ASSERTIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_count int;
BEGIN
  -- documents has all required columns
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'documents'
    AND column_name IN (
      'id','workspace_id','folder_id','title','content',
      'created_by','updated_by','created_at','updated_at'
    );
  IF v_count <> 9 THEN
    RAISE EXCEPTION 'documents: expected 9 columns, found %', v_count;
  END IF;

  -- document_comments has all required columns
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'document_comments'
    AND column_name IN (
      'id','document_id','workspace_id','author_id','body',
      'selection_from','selection_to','selection_text',
      'resolved_at','resolved_by','parent_id','created_at'
    );
  IF v_count <> 12 THEN
    RAISE EXCEPTION 'document_comments: expected 12 columns, found %', v_count;
  END IF;

  -- RLS is enabled on both tables
  SELECT COUNT(*) INTO v_count
  FROM pg_class
  WHERE relname IN ('documents','document_comments') AND relrowsecurity = true;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'RLS not enabled on both tables (found % with RLS)', v_count;
  END IF;

  -- updated_at trigger exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.triggers
  WHERE trigger_name        = 'trg_documents_updated_at'
    AND event_object_table  = 'documents';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Trigger trg_documents_updated_at not found on documents';
  END IF;

  -- insert notification trigger exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.triggers
  WHERE trigger_name        = 'on_document_comment_insert'
    AND event_object_table  = 'document_comments';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Trigger on_document_comment_insert not found on document_comments';
  END IF;

  -- resolve notification trigger exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.triggers
  WHERE trigger_name        = 'on_document_comment_resolved'
    AND event_object_table  = 'document_comments';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Trigger on_document_comment_resolved not found on document_comments';
  END IF;

  RAISE NOTICE 'All assertions passed for 20260423000001_documents.sql';
END;
$$;

-- ---------------------------------------------------------------------------
-- VERIFICATION QUERIES (run in Supabase SQL Editor after applying):
--
-- 1. Tables exist:
--    SELECT relname FROM pg_class WHERE relname IN ('documents','document_comments');
--
-- 2. RLS policies on documents (expect 4):
--    SELECT policyname, cmd FROM pg_policies WHERE tablename = 'documents';
--
-- 3. RLS policies on document_comments (expect 4):
--    SELECT policyname, cmd FROM pg_policies WHERE tablename = 'document_comments';
--
-- 4. Triggers:
--    SELECT trigger_name, event_object_table, action_timing, event_manipulation
--    FROM information_schema.triggers
--    WHERE event_object_table IN ('documents','document_comments');
--
-- 5. Realtime:
--    SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime' AND tablename = 'document_comments';
-- ---------------------------------------------------------------------------
