# Supabase Migrations

All schema changes are versioned here from Phase 0 onward.
Previous changes (before Phase 0) were applied manually via the Supabase Dashboard SQL Editor.

## Naming convention

```
YYYYMMDDHHMMSS_description.sql
```

- One migration per logical change.
- Use `IF NOT EXISTS` / `DO $$ BEGIN ... END $$` blocks for idempotency.
- Never modify a migration that has already been applied to production. Create a new one.

## Applying migrations

### Via Supabase CLI (recommended for staging)

```bash
# Install CLI
brew install supabase/tap/supabase

# Link to remote project
supabase link --project-ref grobeygfdmsydtfnirne

# Push all pending migrations
supabase db push
```

### Via Dashboard (production)

1. Open Supabase Dashboard → SQL Editor
2. Paste the migration file content
3. Execute
4. Mark the migration as applied in this README

## Migration log

| File | Applied | Notes |
|------|---------|-------|
| `00000000000000_initial_schema.sql` | ✅ Already in production (manual) | Baseline — tables existed before migrations were versioned |
| `20260416000001_rls_existing_tables.sql` | ⏳ Pending | RLS audit + policy updates for existing tables |
| `20260416000002_profiles_name_avatar.sql` | ⏳ Pending | Adds full_name, avatar_url to profiles |
