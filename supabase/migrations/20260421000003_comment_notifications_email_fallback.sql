-- =============================================================================
-- MIGRATION: 20260421000003_comment_notifications_email_fallback.sql
-- PURPOSE:   Fix "Alguien resolvió tu comentario" when resolver has no full_name.
--
-- PROBLEM:   notify_on_media_comment_resolved fetches the resolver's name from
--            profiles.full_name. If the user has never filled in their profile
--            (full_name IS NULL), the notification title says "Alguien resolvió
--            tu comentario" even though auth.users.email is available.
--
-- FIX:       JOIN auth.users in the trigger to get the resolver's email, then
--            use COALESCE(full_name, email, 'Alguien') as the display label.
--            Same email-fallback pattern used everywhere in the app since
--            commit 32cb91f.
--
-- IDEMPOTENT: Yes — CREATE OR REPLACE FUNCTION replaces the existing trigger
--             function; DROP/CREATE TRIGGER ensures clean attachment.
-- DEPENDS ON: 20260421000001_media_comments.sql (trigger, notifications table)
-- =============================================================================

CREATE OR REPLACE FUNCTION notify_on_media_comment_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_file_name       text;
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

  -- Gather file + workspace context
  SELECT f.name, w.slug
    INTO v_file_name, v_workspace_slug
    FROM files f
    JOIN workspaces w ON w.id = f.workspace_id
   WHERE f.id = NEW.file_id;

  -- Resolver display name: full_name → email → 'Alguien'
  -- JOIN auth.users to get the email even when full_name is null.
  SELECT p.full_name, u.email
    INTO v_resolver_name, v_resolver_email
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
   WHERE u.id = NEW.resolved_by;

  v_resolver_label := COALESCE(v_resolver_name, v_resolver_email, 'Alguien');

  v_link := '/w/' || v_workspace_slug || '/files/' || NEW.file_id;

  INSERT INTO notifications (user_id, workspace_id, type, title, body, link)
  VALUES (
    NEW.author_id,
    NEW.workspace_id,
    'comment',
    v_resolver_label || ' resolvió tu comentario',
    'En "' || v_file_name || '"',
    v_link
  );

  RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent: DROP IF EXISTS + CREATE)
DROP TRIGGER IF EXISTS on_media_comment_resolved ON media_comments;
CREATE TRIGGER on_media_comment_resolved
  AFTER UPDATE ON media_comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_media_comment_resolved();

-- ---------------------------------------------------------------------------
-- ASSERTIONS
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Trigger exists
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.triggers
     WHERE trigger_name        = 'on_media_comment_resolved'
       AND event_object_table  = 'media_comments'
  ), 'Trigger on_media_comment_resolved not found on media_comments';

  -- Function is SECURITY DEFINER
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname   = 'notify_on_media_comment_resolved'
       AND prosecdef = true
  ), 'Function notify_on_media_comment_resolved must have SECURITY DEFINER';

  RAISE NOTICE '20260421000003: notify_on_media_comment_resolved updated with email fallback.';
END;
$$;

-- ---------------------------------------------------------------------------
-- VERIFICATION (run in Supabase SQL Editor after applying):
--
-- 1. Function source has the JOIN auth.users:
--    SELECT prosrc FROM pg_proc WHERE proname = 'notify_on_media_comment_resolved';
--    Look for "FROM auth.users u LEFT JOIN profiles p ON p.id = u.id"
--
-- 2. Resolve a comment as a user without full_name → notification title should
--    show their email instead of "Alguien".
-- ---------------------------------------------------------------------------
