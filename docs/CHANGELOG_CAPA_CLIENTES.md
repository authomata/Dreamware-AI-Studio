# Changelog — Capa de Gestión de Clientes

Registro de cambios por fase. La fase N solo se marca como completa cuando
su checklist de verificación manual está aprobado por Andrés.

## [Unreleased]

## Fase 3 — Media review con comentarios (2026-04-16) — ⏳ Pendiente aplicación de migración y verificación manual

### Creado

**Migración (pendiente de aplicar por Andrés):**
- `supabase/migrations/20260421000001_media_comments.sql` — tabla `media_comments` + tabla `notifications`, RLS en ambas (SELECT viewer+, INSERT commenter+ con author guard, UPDATE/DELETE autor-o-admin), trigger SECURITY DEFINER `notify_on_media_comment` (notifica uploader del archivo + todos los comentadores previos al insertar nuevo comentario), ALTER PUBLICATION supabase_realtime para ambas tablas, 4 assertions + queries de verificación.

**Server Actions:**
- `app/w/[slug]/files/[fileId]/actions.js` — `createComment` (commenter+, valida con assertWorkspaceRole), `editComment` (solo autor), `deleteComment` (autor o admin), `resolveComment` (editor+, usa admin client para bypass RLS UPDATE), `unresolveComment` (editor+), `markNotificationRead`, `markAllNotificationsRead`.

**Componentes nuevos:**
- `components/workspace/VideoReviewer.js` — player HTML5 nativo con timeline de pins de comentarios. `onMountSeekFn` expone imperativo `seekTo(ms)` al padre. Pins en timeline clickeables → `onFocusComment`. Controles: play/pause, mute, timecode, fullscreen.
- `components/workspace/ImageReviewer.js` — imagen con pins absolute-positioned por `x_percent/y_percent`. Click en imagen → `onCoordSelect`. Pins numerados, pin pendiente con animación pulse.
- `components/workspace/MediaReviewer.js` — wrapper que decide VideoReviewer vs ImageReviewer vs FilePreview según MIME y `is_review_asset`. Dynamic import (no SSR).
- `components/workspace/CommentThread.js` — lista de comentarios top-level + replies anidadas 1 nivel. Actions inline: editar, eliminar, resolver/reabrir, responder. Scroll-into-view cuando `focusedCommentId` cambia. Filter "ocultar/mostrar resueltos".
- `components/workspace/CommentComposer.js` — textarea con badges de timestamp (video) o coordenada (imagen) adjuntos al comentario. ⌘Enter para publicar. Banner de reply-to con cancelar.
- `components/workspace/NotificationBell.js` — campana con badge de no leídos, realtime via `postgres_changes` con filter `user_id=eq.{userId}`, dropdown últimas 20 notificaciones por workspace, "Marcar todo como leído" bulk action. Mounted in workspace layout.

**Client component:**
- `app/w/[slug]/files/[fileId]/FileDetailClient.js` — maneja estado compartido entre MediaReviewer y CommentPanel (activeTimestamp, activeCoord, focusedCommentId, replyToId). Suscripción realtime a `media_comments` por file_id. Tab mobile: Preview / Comentarios. `seekFnRef` para controlar el video desde el panel de comentarios (`onSeekRequest`).

**Ruta:**
- `app/w/[slug]/files/[fileId]/page.js` — reescrito: fetches file + uploader + comments (con enriquecimiento de perfiles via admin client) → renderiza top bar estático + strip de metadata + `FileDetailClient`. Soporte `?c={comment_id}` para deep link a comentario específico.

### Modificado
- `app/w/[slug]/layout.js` — añade `<header>` con `NotificationBell workspaceId={workspace.id}` (h-11, border-b, justify-end). Ahora el layout envuelve con sidebar + top-bar + main.
- `components/workspace/phase-status.js` — sin cambio de LIVE_PHASE (sigue en 2 hasta verificación). Actividad de Fase 3 (`activity`) anotada en el mapa.

### ⚠️ Acciones pendientes antes de verificar

1. **Aplicar migración en Supabase Dashboard (SQL Editor):**
   - `supabase/migrations/20260421000001_media_comments.sql`
   - Revisar assertions en el DO block — deben pasar sin ERROR

2. **Verificar realtime en Supabase Dashboard:**
   - Settings → Realtime → Publicaciones → `supabase_realtime`
   - Confirmar que `media_comments` y `notifications` aparecen

3. **Push a producción** (código commiteado a continuación)

### Notas de diseño

- `resolveComment` usa admin client para el UPDATE, porque el committer puede no ser el autor del comentario y la RLS UPDATE solo permite autor-o-admin. La guarda `assertWorkspaceRole(..., 'editor')` hace la validación server-side.
- Los perfiles de autores de comentarios se obtienen via admin client (profiles RLS actualmente solo permite ver el propio perfil). Esto evita necesitar una migration extra a profiles en Fase 3. Deuda: agregar policy `workspace_members_read_coworker_profiles` en Fase 4 para que el cliente pueda hacer el join directamente.
- NotificationBell importa las actions desde el path dinámico `app/w/[slug]/files/[fileId]/actions`. Next.js trata los segmentos `[slug]` y `[fileId]` como nombres de directorio literales en imports estáticos — funciona correctamente en build.
- Pins de imagen numerados (1, 2, 3…) para que el panel de comentarios pueda correlacionarlos visualmente.
- Deep link `?c={comment_id}` soportado via `initialFocusedCommentId` prop — permite que las notificaciones lleven al archivo y hagan scroll al comentario específico.

---

## Fase 2 — Archivos y folders con Supabase Storage (2026-04-16) — ✅ Verificada end-to-end en producción (2026-04-16)

### Creado

**Migraciones (pendientes de aplicar por Andrés):**
- `supabase/migrations/20260419000001_files_folders.sql` — tablas folders + files, columna storage_used_bytes en workspaces, trigger storage tracking, trigger default folders, backfill de folders para workspaces existentes, RLS para ambas tablas.
- `supabase/migrations/20260419000002_storage_workspace_files.sql` — 4 policies en storage.objects para bucket workspace-files (SELECT viewer+, INSERT/UPDATE/DELETE editor+). DO block NOTICE-only documenta cómo verificar el path pattern manualmente.

**Endpoint:**
- `app/api/upload/sign/route.js` — POST con `{workspace_id, folder_id, filename, mime_type, size}`. Validaciones en orden: auth → `is_workspace_member()` RPC editor+ → MIME blocklist → MIME allowlist → extensión/MIME consistency → size ≤ MAX_BYTES → folder_id scope. Genera signed upload URL via admin client.

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

### Verificación manual (aprobada por Andrés — 2026-04-16)

- 6 queries de verificación OK en Supabase Dashboard
- Default folders creados para Verant (Brand Assets, Documentos, Entregables, Reuniones)
- Upload funciona: PNG, JPEG, MP4, PDF, ZIP — progress bar visible en uploads grandes
- Previews correctos: imagen inline, video con player, PDF en iframe, ZIP con ícono
- Archivo 60 MB rechazado ANTES de subir con mensaje claro
- `storage_used_bytes` tracking funciona (17.8 MB reportados correctamente)
- Permisos de Editor: sube archivos, ve todo, no ve Config
- Deploy en Vercel con env var `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB=50` confirmada

### Correcciones de seguridad (post-commit inicial, pre-aplicación en producción)

**Ajuste 1 — DO block falso en storage migration (CORRECTNESS)**
- El bloque DO original usaba `string_to_array()` para "simular" `storage.foldername()` en contexto de migración. La función `string_to_array` divide por separador simple; `foldername` tiene semántica diferente (segmento 1 de path). Resultado: assertion falsa que daba false confidence.
- Fix: reemplazado por bloque NOTICE-only que documenta cómo verificar manualmente en SQL Editor tras aplicar la migración.

**Ajuste 2 — Verificación de membresía duplicada en route.js (SECURITY)**
- El endpoint `POST /api/upload/sign` reimplementaba manualmente la lógica de `is_workspace_member()` (~15 líneas: query directa a `workspace_members` + fallback de platform admin). Esta duplicación violaba el principio de "single source of truth" y podía desincronizarse con la SQL function.
- Fix: reemplazado por `supabase.rpc('is_workspace_member', { wid: workspace_id, min_role: 'editor' })`. Una línea, una fuente de verdad.

**Ajuste 3 — Anti-spoofing de extensión/MIME (SECURITY)**
- Un cliente malicioso podía declarar `mime_type="image/png"` pero subir un archivo `malware.exe`. La validación de MIME allowlist no detectaba esto porque opera sobre el campo declarado, no sobre el binario.
- Fix: agregado `MIME_TO_EXTS` map (26 tipos) y `extensionMatchesMime(filename, mime)` que valida que la extensión del filename sea consistente con el MIME declarado. Archivos sin extensión son rechazados. Error 400 con mensaje claro.

**Ajuste 4 — `.maybeSingle()` en query de membresía (N/A — resuelto por Ajuste 2)**
- Identificado un posible `.single()` → `.maybeSingle()` en la query manual de membresía. Quedó obsoleto al eliminar esa query por completo en Ajuste 2.

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
