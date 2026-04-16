-- =============================================================================
-- MIGRATION: 00000000000000_initial_schema.sql
-- PURPOSE:   Baseline snapshot of schema that existed before migrations were
--            versioned. All tables were created manually via Supabase Dashboard.
-- IDEMPOTENT: Yes — all statements use IF NOT EXISTS.
-- STATUS:    Already applied in production. Safe to re-run.
-- SOURCE:    Inferred from codebase (see docs/LEVANTAMIENTO_TECNICO.md).
--            NOT generated from pg_dump — may have minor type differences.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: profiles
-- Extends auth.users. One row per authenticated user.
-- Created by trigger handle_new_user on auth.users INSERT.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text,
  muapi_key   text,
  role        text        NOT NULL DEFAULT 'free'
                          CHECK (role IN ('admin', 'team', 'free')),
  credit_limit integer,                      -- null = unlimited
  credits_used integer    NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- TABLE: generations
-- History of AI generations per user per type.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS generations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text        NOT NULL CHECK (type IN ('image','video','lipsync','cinema','story')),
  url        text        NOT NULL,
  prompt     text        NOT NULL DEFAULT '',
  model      text        NOT NULL DEFAULT '',
  metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- TABLE: characters
-- Character library per user. id is client-generated (TEXT, not UUID).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS characters (
  id               text        PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  description      text        NOT NULL DEFAULT '',
  trigger_prompt   text        NOT NULL DEFAULT '',
  reference_images text[]      NOT NULL DEFAULT '{}',
  thumbnail        text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- TABLE: platform_settings
-- Key-value store for platform-level configuration (e.g. central muapi key).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_settings (
  key        text        PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- FUNCTION: handle_new_user
-- Auto-creates a profile row when a new auth user is created.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger (idempotent: drop and recreate)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS: Enable on all tables (idempotent — safe to run if already enabled)
-- ---------------------------------------------------------------------------
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- POLICIES: Baseline policies created in earlier manual sessions.
-- Using DO blocks for idempotency since CREATE POLICY has no IF NOT EXISTS.
-- ---------------------------------------------------------------------------

-- profiles: broad own-access policy (applied manually before Phase 0)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'own profile'
  ) THEN
    CREATE POLICY "own profile" ON profiles FOR ALL USING (auth.uid() = id);
  END IF;
END $$;

-- generations: own-access policy
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'generations' AND policyname = 'own generations'
  ) THEN
    CREATE POLICY "own generations" ON generations FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- characters: own-access policy
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'characters' AND policyname = 'own characters'
  ) THEN
    CREATE POLICY "own characters" ON characters FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- platform_settings: admin-only policy
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'platform_settings' AND policyname = 'admin only'
  ) THEN
    CREATE POLICY "admin only" ON platform_settings FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
END $$;
