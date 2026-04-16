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

### Security hardening (post-reporte, pre-aplicación en prod)

**Corrección: escalación de privilegios en `profiles`**
- El `WITH CHECK` original en `users_update_own_profile` hacía un self-join recursivo en `profiles` (`SELECT role FROM profiles WHERE id = auth.uid()`) que es propenso a errores silenciosos en Postgres RLS.
- Reemplazado por control a nivel de columna (más robusto, no-recursivo):
  - `REVOKE UPDATE ON profiles FROM authenticated` — bloquea todas las columnas
  - `GRANT UPDATE (muapi_key, updated_at)` en migración 001
  - `GRANT UPDATE (full_name, avatar_url)` en migración 002 (después del ALTER TABLE)
  - `REVOKE INSERT, DELETE ON profiles FROM authenticated` — defensa en profundidad contra regresiones futuras (ya estaban bloqueados por RLS, pero REVOKE explícito previene que una policy permisiva accidental los habilite)
- `WITH CHECK (auth.uid() = id)` simplificado: el bloqueo de `role`, `credit_limit`, `credits_used` lo hace el REVOKE/GRANT, no el CHECK.

**Análisis: otras tablas no necesitan REVOKE columnar**
- `generations`: no tiene columnas sensibles de privilegio; `user_id` ya protegido por `WITH CHECK`
- `characters`: todas las columnas son contenido del usuario; mismo patrón
- `platform_settings`: bloqueada completamente para no-admins por `is_admin()` en la policy

**Nota: lucide-react v1 (breaking change respecto a v0)**
- Instalado `lucide-react@1.8.0` (versión actual). El SPEC mencionaba `^0.400.x` que estaba desactualizado.
- La API de importación cambió entre v0 y v1 (tree-shaking mejorado). Futuras fases deben importar como: `import { FolderOpen, MessageSquare } from 'lucide-react'` — esta API funciona igual en v1.

### Migraciones para aplicar en producción
1. `20260416000001_rls_existing_tables.sql` — RLS audit + column-level GRANT/REVOKE en profiles
2. `20260416000002_profiles_name_avatar.sql` — agrega columnas + extiende GRANT
(La migración 00000000000000 es solo documentación — las tablas ya existen)
