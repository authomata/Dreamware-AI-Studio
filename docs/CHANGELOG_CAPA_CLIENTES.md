# Changelog — Capa de Gestión de Clientes

Registro de cambios por fase. La fase N solo se marca como completa cuando
su checklist de verificación manual está aprobado por Andrés.

## [Unreleased]

## Fase 2 — Archivos y folders con Supabase Storage (2026-04-16) — ⏳ Pendiente aplicación de migraciones y verificación manual

### Creado

**Migraciones (pendientes de aplicar por Andrés):**
- `supabase/migrations/20260419000001_files_folders.sql` — tablas folders + files, columna storage_used_bytes en workspaces, trigger storage tracking, trigger default folders, backfill de folders para workspaces existentes, RLS para ambas tablas.
- `supabase/migrations/20260419000002_storage_workspace_files.sql` — 4 policies en storage.objects para bucket workspace-files (SELECT viewer+, INSERT/UPDATE/DELETE editor+). DO block valida el pattern de path `{workspace_id}/{file_id}-{name}`.

**Endpoint:**
- `app/api/upload/sign/route.js` — POST con `{workspace_id, folder_id, filename, mime_type, size}`. Validaciones en orden: auth → membership editor+ → MIME whitelist/blocklist → size ≤ MAX_BYTES → folder_id scope. Genera signed upload URL via admin client.

**Server Actions:**
- `app/w/[slug]/files/actions.js` — createFolder, renameFolder, deleteFolder, registerUploadedFile (con verificación Storage.list), renameFile, moveFile, deleteFile (borra Storage + DB), toggleReviewAsset, getSignedDownloadUrl.

**Componentes:**
- `components/workspace/FileIcon.js` — ícono lucide-react por MIME + helpers `mimeLabel()` y `formatBytes()`.
- `components/workspace/FilePreview.js` — preview inline: imagen, video, audio, PDF iframe, fallback descarga.
- `components/workspace/FileUploader.js` — multi-file con progress bar por archivo via XHR. Flujo: sign → PUT → registerUploadedFile.
- `components/workspace/FileBrowser.js` — grid/list, breadcrumbs, drag-drop zone, context menus (renombrar, eliminar, toggle review), new folder inline.

**Rutas:**
- `app/w/[slug]/files/page.js` — lista folders + files con breadcrumbs dinámicos, pasa a FileBrowser.
- `app/w/[slug]/files/[fileId]/page.js` — detalle de archivo: preview + metadata sidebar + descarga. Signed URL generado server-side (1h). Placeholder de comentarios para Fase 3.

**Docs:**
- `.env.example` — documentación de variables de entorno incluyendo `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB`.

### Modificado
- `components/workspace/WorkspaceSidebar.js` — `LIVE_PHASE = 2` activa el link "Archivos".
- `.env.local` — agregado `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB=50`.

### ⚠️ Acciones pendientes antes de verificar

1. **Aplicar migraciones en Supabase Dashboard (SQL Editor):**
   - `20260419000001_files_folders.sql` primero
   - `20260419000002_storage_workspace_files.sql` segundo
   - Revisar ambas ANTES de aplicar (especialmente storage policies)

2. **Agregar variable en Vercel:**
   - `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB = 50`
   - Settings → Environment Variables → Production

3. **Push a producción** (código ya commiteado, falta push)

### Notas de diseño / deuda conocida
- `deleteFolder()`: archivos dentro quedan con folder_id=null (no se borran de Storage). Deuda anotada, requiere job de limpieza futuro.
- `deleteFile()`: si falla la eliminación en Storage, el registro DB se elimina igual (para evitar referencias rotas). El objeto Storage queda huérfano — recuperable manualmente.
- Límite 50 MB: determinado por plan Free de Supabase (bucket limit). Controlado por `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB` — ajustar al hacer upgrade a Pro.
- Ghost files: si `registerUploadedFile` falla después del PUT a Storage, el objeto queda huérfano. Deuda conocida — mitigada por la validación Storage.list en registerUploadedFile.

## Fase 1 — Workspaces core + navegación base (2026-04-15) — ✅ Verificada end-to-end en producción (2026-04-16)

Verificación manual aprobada por Andrés:
- Workspace "Verant" creado, trigger auto-owner funcionó correctamente
- WorkspaceSwitcher visible en /studio para usuarios con workspace asignado
- Invitación generada, aceptada, segundo usuario aterriza con rol Editor
- RoleBadge "Editor" visible, link Config oculto (permisos respetados en UI y server)
- Deuda UX post-MVP anotada: preservar token tras signup para auto-ejecutar acceptInvitation

### Creado
- `supabase/migrations/20260417000001_workspaces_core.sql` — Tablas workspaces, workspace_members, workspace_invitations. Función is_workspace_member() SECURITY DEFINER. RLS policies para las 3 tablas. Trigger auto-add owner. DO block con 25 assertions del CASE hierarchy.
- `lib/workspace/getUserWorkspaces.js` — Lista workspaces del usuario autenticado (excluye archivados por default).
- `lib/workspace/getWorkspaceBySlug.js` — Workspace + membership del caller. Retorna null si no existe o no es miembro (RLS maneja).
- `lib/workspace/assertWorkspaceRole.js` — Guard para Server Actions. Platform admin es tratado como owner. Throws Unauthorized / Forbidden.
- `lib/workspace/generateUniqueSlug.js` — slugify() + generateUniqueSlug() con suffix numérico si hay colisión.
- `app/w/[slug]/layout.js` — Guard de membresía. Redirect a / si no es miembro. Renderiza WorkspaceSidebar.
- `app/w/[slug]/page.js` — Dashboard con header de workspace, avatares, cards de fases futuras, acciones rápidas para admin+.
- `app/w/[slug]/members/page.js` — Lista de miembros + invitaciones pendientes. MemberList + InviteMemberDialog.
- `app/w/[slug]/settings/page.js` — Edición de metadata del workspace (admin+). WorkspaceSettingsForm.
- `app/w/[slug]/actions.js` — Server Actions: updateWorkspace, archiveWorkspace, inviteMember, updateMemberRole, removeMember, revokeInvitation.
- `app/invitations/[token]/page.js` — Flow de aceptación de invitación. Estados: inválida, expirada, ya aceptada, acepta.
- `app/invitations/[token]/InvitationAcceptClient.js` — Client component con lógica de aceptación, mismatch de email.
- `app/invitations/[token]/actions.js` — acceptInvitation() via admin client (token como autorización).
- `app/admin/clients/page.js` — Lista de todos los workspaces (activos + archivados) con archive/restore actions.
- `app/admin/clients/new/page.js` — Server Component guard + layout.
- `app/admin/clients/new/NewClientForm.js` — Form para crear workspace + contacto principal. Genera slug automático.
- `app/admin/clients/actions.js` — createClientAndOwner, archiveClient, restoreClient.
- `components/workspace/WorkspaceSidebar.js` — Rail lateral con Dashboard, Archivos, Docs, Chat, Miembros, Config. Links deshabilitados para fases futuras.
- `components/workspace/WorkspaceSwitcher.js` — Dropdown para cambiar entre workspaces y "Sin workspace".
- `components/workspace/MemberAvatar.js` — Avatar con dot de rol, tooltip, fallback a iniciales.
- `components/workspace/MemberList.js` — Lista de miembros con dropdown de roles e invitaciones pendientes.
- `components/workspace/InviteMemberDialog.js` — Modal de invitación por email + rol.
- `components/workspace/RoleBadge.js` — Badge de color por rol (owner=amarillo, admin=lime, editor=azul, commenter=morado, viewer=gris).
- `components/workspace/WorkspaceSettingsForm.js` — Form de configuración con slug auto-update, color de marca, plan.
- `docs/WORKSPACE_ROLES.md` — Matriz de permisos, notas de implementación, jerarquía de roles.

### Modificado
- `app/admin/AdminClient.js` — Agregado link "Clientes →" en header del admin para navegar a /admin/clients.

### Correcciones de seguridad (post-commit, pre-aplicación en producción)

**Corrección 1 — Anti-spoofing en INSERT de workspaces (CRÍTICA)**
- La policy `workspace_insert_platform_admin_or_team` original no validaba que `created_by = auth.uid()`.
- Un miembro `team` podía insertar un workspace con `created_by` apuntando a otro usuario, haciendo que el trigger auto-owner convirtiera a ESE usuario en owner.
- Fix: `WITH CHECK (created_by = auth.uid() AND EXISTS (...role IN ('admin','team')))`.

**Corrección 2 — Platform admin como owner implícito en is_workspace_member() (IMPORTANTE)**
- La función original solo chequeaba `workspace_members`. Inconsistencia: `assertWorkspaceRole()` en el servidor trata a los admins como owners implícitos, pero la RLS no.
- Consecuencia: el WorkspaceSwitcher y queries directas desde el cliente no mostraban workspaces donde el admin no era miembro formal.
- Fix: `is_admin() OR EXISTS (...)` — el `is_admin()` actúa como short-circuit antes de tocar `workspace_members`.
- Documentado en `docs/WORKSPACE_ROLES.md`.

### Migraciones para aplicar en producción
1. `supabase/migrations/20260417000001_workspaces_core.sql` (incluye las dos correcciones)

### Dependencias agregadas
Ninguna nueva (lucide-react y date-fns ya instalados en Fase 0).

### StandaloneShell.js — integración completada
- Import de `WorkspaceSwitcher`
- Estado `workspaces: []`
- Query `workspace_members` JOIN `workspaces` en `initAuth`, con try/catch aislado: si falla (migración no corrida, RLS error) → `console.warn` + `setWorkspaces([])`, studio sigue funcionando
- `WorkspaceSwitcher` en header: posición `[logo] ... [switcher] [balance] [avatar]`, solo visible cuando `workspaces.length > 0`
- **Nota**: el switcher no aparecerá hasta que la migración `20260417000001_workspaces_core.sql` esté aplicada en producción

### TODO Fase 6 (marcado en código)
- `inviteMember()` y `createClientAndOwner()` tienen comentarios `// TODO (Phase 6): send email via Resend`
- `NewClientForm.js` tiene nota visible al usuario sobre el email pendiente

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
