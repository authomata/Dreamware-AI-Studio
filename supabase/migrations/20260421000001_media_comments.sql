-- =============================================================================
-- MIGRATION: 20260421000001_media_comments.sql
-- PURPOSE:   Phase 3 — Media review with comments and notifications.
--            Creates media_comments and notifications tables, RLS policies,
--            the notification trigger, and enables Supabase Realtime.
-- IDEMPOTENT: Yes — IF NOT EXISTS / DROP ... IF EXISTS on every object.
-- REF:       SPEC_CAPA_CLIENTES.md sections 2.1 (media_comments, notifications)
--                                            3.3 (RLS policies)
-- DEPENDS ON: 20260417000001_workspaces_core.sql (is_workspace_member, workspaces)
--             20260419000001_files_folders.sql (files table)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: media_comments
-- Anchor: files(id). workspace_id denormalized for efficient RLS.
-- parent_id enables threading (replies to existing comments).
-- timestamp_ms: video position in milliseconds (null for images or non-media).
-- x_percent / y_percent: image pin coordinates 0–100 (null for video or non-media).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_comments (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id      uuid        NOT NULL REFERENCES files(id)        ON DELETE CASCADE,
  workspace_id uuid        NOT NULL REFERENCES workspaces(id)   ON DELETE CASCADE,
  author_id    uuid        NOT NULL REFERENCES auth.users(id),
  body         text        NOT NULL,
  timestamp_ms integer,                              -- video: exact millisecond
  x_percent    numeric(5,2),                         -- image pin: 0–100
  y_percent    numeric(5,2),                         -- image pin: 0–100
  resolved_at  timestamptz,
  resolved_by  uuid        REFERENCES auth.users(id),
  parent_id    uuid        REFERENCES media_comments(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_comments_file
  ON media_comments(file_id);

CREATE INDEX IF NOT EXISTS idx_media_comments_workspace
  ON media_comments(workspace_id);

CREATE INDEX IF NOT EXISTS idx_media_comments_parent
  ON media_comments(parent_id);

CREATE INDEX IF NOT EXISTS idx_media_comments_author
  ON media_comments(author_id);

-- ---------------------------------------------------------------------------
-- TABLE: notifications
-- One row per in-app notification. Sent by SECURITY DEFINER triggers only
-- (authenticated users have no INSERT policy — prevents self-notification spam).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  workspace_id uuid        NOT NULL REFERENCES workspaces(id)   ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('mention','comment','chat_message','invitation')),
  title        text        NOT NULL,
  body         text,
  link         text,                -- relative URL, e.g. /w/verant/files/abc123
  read_at      timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- Fast lookup of unread notifications per user (NotificationBell query)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — media_comments
-- SELECT  : any workspace member (viewer+)
-- INSERT  : workspace members commenter+ (author_id must be caller)
-- UPDATE  : the comment author OR workspace admin+ (for resolve/unresolve)
-- DELETE  : the comment author OR workspace admin+
-- ---------------------------------------------------------------------------
ALTER TABLE media_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_media_comments"     ON media_comments;
DROP POLICY IF EXISTS "commenters_insert_media_comments" ON media_comments;
DROP POLICY IF EXISTS "authors_update_media_comments"   ON media_comments;
DROP POLICY IF EXISTS "authors_delete_media_comments"   ON media_comments;

CREATE POLICY "members_read_media_comments" ON media_comments
  FOR SELECT USING (is_workspace_member(workspace_id, 'viewer'));

CREATE POLICY "commenters_insert_media_comments" ON media_comments
  FOR INSERT WITH CHECK (
    is_workspace_member(workspace_id, 'commenter')
    AND author_id = auth.uid()
  );

-- UPDATE: author can edit body; admin+ can resolve/unresolve (changes resolved_at/resolved_by).
-- Server action guards enforce fine-grained rules above the RLS floor.
CREATE POLICY "authors_update_media_comments" ON media_comments
  FOR UPDATE USING (
    author_id = auth.uid()
    OR is_workspace_member(workspace_id, 'admin')
  );

CREATE POLICY "authors_delete_media_comments" ON media_comments
  FOR DELETE USING (
    author_id = auth.uid()
    OR is_workspace_member(workspace_id, 'admin')
  );

-- ---------------------------------------------------------------------------
-- RLS — notifications
-- SELECT  : own user only
-- UPDATE  : own user only (mark as read)
-- INSERT  : NONE for authenticated role — only the trigger (SECURITY DEFINER) inserts
-- DELETE  : NONE — notifications are kept for audit; app marks read instead
-- ---------------------------------------------------------------------------
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_notifications_select" ON notifications;
DROP POLICY IF EXISTS "own_notifications_update"  ON notifications;

CREATE POLICY "own_notifications_select" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "own_notifications_update" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- TRIGGER: notify_on_media_comment
--
-- Fires AFTER INSERT on media_comments. Creates a notification row for:
--   1. The file's uploader (if different from the new comment's author).
--   2. Every unique author who commented on the same file previously
--      (excluding the new commenter and the file uploader, who was already notified).
--
-- Runs as SECURITY DEFINER so it can INSERT into notifications without an
-- authenticated INSERT policy, preventing clients from self-inserting notifications.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_on_media_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_file_name     text;
  v_file_uploader uuid;
  v_workspace_slug text;
  v_link          text;
  v_notif_title   text;
  -- Accumulates user_ids that already received a notification for this insert
  v_notified      uuid[] := ARRAY[NEW.author_id];
BEGIN
  -- Gather file and workspace context
  SELECT f.name, f.uploaded_by, w.slug
    INTO v_file_name, v_file_uploader, v_workspace_slug
    FROM files f
    JOIN workspaces w ON w.id = f.workspace_id
   WHERE f.id = NEW.file_id;

  v_link        := '/w/' || v_workspace_slug || '/files/' || NEW.file_id;
  v_notif_title := 'Nuevo comentario en "' || v_file_name || '"';

  -- 1. Notify the file uploader (unless they wrote the comment)
  IF v_file_uploader IS NOT NULL AND v_file_uploader <> NEW.author_id THEN
    INSERT INTO notifications (user_id, workspace_id, type, title, body, link)
    VALUES (
      v_file_uploader,
      NEW.workspace_id,
      'comment',
      v_notif_title,
      LEFT(NEW.body, 120),
      v_link
    );
    v_notified := v_notified || ARRAY[v_file_uploader];
  END IF;

  -- 2. Notify all other previous commenters on the same file
  INSERT INTO notifications (user_id, workspace_id, type, title, body, link)
  SELECT DISTINCT
    mc.author_id,
    NEW.workspace_id,
    'comment',
    v_notif_title,
    LEFT(NEW.body, 120),
    v_link
  FROM media_comments mc
  WHERE mc.file_id    = NEW.file_id
    AND mc.id         <> NEW.id                   -- exclude the new row itself
    AND NOT (mc.author_id = ANY(v_notified));     -- exclude already-notified users

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_media_comment_insert ON media_comments;
CREATE TRIGGER on_media_comment_insert
  AFTER INSERT ON media_comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_media_comment();

-- ---------------------------------------------------------------------------
-- REALTIME
-- Add both tables to the supabase_realtime publication so clients can
-- subscribe to postgres_changes events.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Add media_comments if not already in the publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'media_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE media_comments;
  END IF;

  -- Add notifications if not already in the publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;

  RAISE NOTICE 'media_comments and notifications added to supabase_realtime publication.';
END;
$$;

-- ---------------------------------------------------------------------------
-- ASSERTIONS (run in DO block — validates structural invariants)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count int;
BEGIN
  -- media_comments has all required columns
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'media_comments'
    AND column_name IN (
      'id','file_id','workspace_id','author_id','body',
      'timestamp_ms','x_percent','y_percent',
      'resolved_at','resolved_by','parent_id','created_at'
    );
  IF v_count <> 12 THEN
    RAISE EXCEPTION 'media_comments: expected 12 columns, found %', v_count;
  END IF;

  -- notifications has all required columns
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'notifications'
    AND column_name IN (
      'id','user_id','workspace_id','type','title','body','link','read_at','created_at'
    );
  IF v_count <> 9 THEN
    RAISE EXCEPTION 'notifications: expected 9 columns, found %', v_count;
  END IF;

  -- RLS is enabled on both tables
  SELECT COUNT(*) INTO v_count
  FROM pg_class
  WHERE relname IN ('media_comments','notifications') AND relrowsecurity = true;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'RLS not enabled on both tables (found % with RLS)', v_count;
  END IF;

  -- Trigger exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.triggers
  WHERE trigger_name = 'on_media_comment_insert'
    AND event_object_table = 'media_comments';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Trigger on_media_comment_insert not found on media_comments';
  END IF;

  RAISE NOTICE 'All assertions passed for 20260421000001_media_comments.sql';
END;
$$;

-- ---------------------------------------------------------------------------
-- VERIFICATION QUERIES (run in Supabase SQL Editor after applying):
--
-- 1. Tables exist and have expected row counts (empty after migration):
--    SELECT relname, reltuples::bigint FROM pg_class
--    WHERE relname IN ('media_comments','notifications');
--
-- 2. RLS policies on media_comments (expect 4):
--    SELECT policyname, cmd FROM pg_policies WHERE tablename = 'media_comments';
--
-- 3. RLS policies on notifications (expect 2):
--    SELECT policyname, cmd FROM pg_policies WHERE tablename = 'notifications';
--
-- 4. Trigger is attached:
--    SELECT trigger_name, event_manipulation, action_timing
--    FROM information_schema.triggers
--    WHERE event_object_table = 'media_comments';
--
-- 5. Both tables in realtime publication:
--    SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
--    AND tablename IN ('media_comments','notifications');
-- ---------------------------------------------------------------------------
