# Changelog — Capa de Gestión de Clientes

Registro de cambios por fase. La fase N solo se marca como completa cuando
su checklist de verificación manual está aprobado por Andrés.

## [Unreleased]

## Fase 0 — Housekeeping (2026-04-16) — ⏳ Pendiente verificación manual

### Creado
- `supabase/` — directorio raíz con config.toml y README.md
- `supabase/migrations/00000000000000_initial_schema.sql` — baseline idempotente del schema existente (profiles, generations, characters, platform_settings + trigger handle_new_user)
- `supabase/migrations/20260416000001_rls_existing_tables.sql` — auditoría y reemplazo de políticas RLS en las 4 tablas existentes; agrega función helper `is_admin()` SECURITY DEFINER
- `supabase/migrations/20260416000002_profiles_name_avatar.sql` — columnas full_name y avatar_url en profiles

### Modificado
- `app/api/muapi/[...path]/route.js` — console.log del proxy envuelto en NODE_ENV !== 'production'
- `package.json` — lucide-react@1.8.0 y date-fns@4.1.0 instalados

### Migraciones para aplicar en producción
1. `20260416000001_rls_existing_tables.sql` — reemplaza políticas RLS existentes
2. `20260416000002_profiles_name_avatar.sql` — agrega columnas (idempotente)
(La migración 00000000000000 es solo documentación — las tablas ya existen)
