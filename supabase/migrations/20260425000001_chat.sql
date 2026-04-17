-- =============================================================================
-- FASE 5 — Chat del workspace
-- =============================================================================
-- Tables:   chat_messages, chat_reads
-- RLS:      viewer+ SELECT, commenter+ INSERT, author UPDATE (15-min window),
--           author-or-admin DELETE, user-own-only for chat_reads
-- Realtime: chat_messages
-- Trigger:  notify_on_chat_mention — notifica a miembros @mencionados en body
-- =============================================================================

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES workspaces(id)     ON DELETE CASCADE,
  author_id     uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  body          text        NOT NULL,
  attachments   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  reply_to_id   uuid        REFERENCES chat_messages(id)           ON DELETE SET NULL,
  edited_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_workspace_created
  ON chat_messages (workspace_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- chat_reads — tracks each member's last-read position per workspace
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_reads (
  workspace_id          uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_message_id  uuid        REFERENCES chat_messages(id)       ON DELETE SET NULL,
  last_read_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- ---------------------------------------------------------------------------
-- RLS — chat_messages
-- ---------------------------------------------------------------------------
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Any workspace member (viewer+) can read messages
CREATE POLICY "members_select_chat_messages"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id, 'viewer'));

-- commenter+ can send; author_id must equal the caller
CREATE POLICY "commenters_insert_chat_messages"
  ON chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND is_workspace_member(workspace_id, 'commenter')
  );

-- Only the author can edit, enforced by server action (15-min window).
-- The RLS is loose on time to let the server action own that logic.
CREATE POLICY "authors_update_chat_messages"
  ON chat_messages FOR UPDATE
  TO authenticated
  USING  (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Author or admin can delete
CREATE POLICY "authors_admins_delete_chat_messages"
  ON chat_messages FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR is_workspace_member(workspace_id, 'admin')
  );

-- ---------------------------------------------------------------------------
-- RLS — chat_reads
-- ---------------------------------------------------------------------------
ALTER TABLE chat_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_chat_reads"
  ON chat_reads FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_chat_reads"
  ON chat_reads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_chat_reads"
  ON chat_reads FOR UPDATE
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime — chat_messages only (chat_reads are private, no need to broadcast)
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- ---------------------------------------------------------------------------
-- Trigger: notify_on_chat_mention
-- Fires AFTER INSERT on chat_messages.
-- Parses body for @uuid patterns and notifies each mentioned workspace member.
-- Uses SECURITY DEFINER pattern: auth.uid() is NOT used for recipient lookups;
-- instead, JOIN workspace_members directly (SECURITY DEFINER context issue).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_on_chat_mention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_name   text;
  v_author_email  text;
  v_author_label  text;
  v_mentioned_id  uuid;
  v_workspace_slug text;
  v_mention_pattern text := '@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
  v_match         text;
  v_matches       text[];
BEGIN
  -- Get author label (COALESCE: full_name → email → 'Alguien')
  SELECT p.full_name, u.email
    INTO v_author_name, v_author_email
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
   WHERE u.id = NEW.author_id;

  v_author_label := COALESCE(v_author_name, v_author_email, 'Alguien');

  -- Get workspace slug for notification link
  SELECT slug INTO v_workspace_slug
    FROM workspaces WHERE id = NEW.workspace_id;

  -- Extract all @uuid mentions from body using regexp_matches
  FOR v_match IN
    SELECT (regexp_matches(NEW.body, v_mention_pattern, 'g'))[1]
  LOOP
    BEGIN
      v_mentioned_id := v_match::uuid;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;

    -- Skip self-mentions
    IF v_mentioned_id = NEW.author_id THEN
      CONTINUE;
    END IF;

    -- Only notify if the mentioned user is still a workspace member
    IF NOT EXISTS (
      SELECT 1 FROM workspace_members
       WHERE workspace_id = NEW.workspace_id
         AND user_id      = v_mentioned_id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO notifications (
      workspace_id, user_id, type, title, body, link, read_at, created_at
    ) VALUES (
      NEW.workspace_id,
      v_mentioned_id,
      'chat_message',
      v_author_label || ' te mencionó en el chat',
      LEFT(NEW.body, 120),
      '/w/' || v_workspace_slug || '/chat',
      NULL,
      now()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_chat_message_insert
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION notify_on_chat_mention();

-- ---------------------------------------------------------------------------
-- Assertions — verify schema is correct
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_col_count     int;
  v_rls_enabled   boolean;
  v_trigger_exists boolean;
  v_realtime_pub  boolean;
BEGIN
  -- chat_messages column count
  SELECT COUNT(*) INTO v_col_count
    FROM information_schema.columns
   WHERE table_name = 'chat_messages' AND table_schema = 'public';
  ASSERT v_col_count = 8,
    'chat_messages should have 8 columns, got ' || v_col_count;

  -- chat_reads column count
  SELECT COUNT(*) INTO v_col_count
    FROM information_schema.columns
   WHERE table_name = 'chat_reads' AND table_schema = 'public';
  ASSERT v_col_count = 4,
    'chat_reads should have 4 columns, got ' || v_col_count;

  -- RLS enabled on chat_messages
  SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class WHERE relname = 'chat_messages' AND relnamespace = 'public'::regnamespace;
  ASSERT v_rls_enabled, 'RLS should be enabled on chat_messages';

  -- RLS enabled on chat_reads
  SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class WHERE relname = 'chat_reads' AND relnamespace = 'public'::regnamespace;
  ASSERT v_rls_enabled, 'RLS should be enabled on chat_reads';

  -- Trigger exists
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'chat_messages' AND t.tgname = 'on_chat_message_insert'
  ) INTO v_trigger_exists;
  ASSERT v_trigger_exists, 'Trigger on_chat_message_insert must exist on chat_messages';

  -- Realtime publication includes chat_messages
  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) INTO v_realtime_pub;
  ASSERT v_realtime_pub, 'chat_messages must be in supabase_realtime publication';

  RAISE NOTICE 'All assertions passed for Fase 5 chat migration.';
END;
$$;

-- Verification queries
SELECT 'chat_messages columns' AS check, COUNT(*) AS count
  FROM information_schema.columns
 WHERE table_name = 'chat_messages' AND table_schema = 'public';

SELECT 'chat_reads columns' AS check, COUNT(*) AS count
  FROM information_schema.columns
 WHERE table_name = 'chat_reads' AND table_schema = 'public';

SELECT 'chat_messages RLS policies' AS check, COUNT(*) AS count
  FROM pg_policies WHERE tablename = 'chat_messages';

SELECT 'chat_reads RLS policies' AS check, COUNT(*) AS count
  FROM pg_policies WHERE tablename = 'chat_reads';
