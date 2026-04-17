# Changelog — Capa de Gestión de Clientes

Registro de cambios por fase. La fase N solo se marca como completa cuando
su checklist de verificación manual está aprobado por Andrés.

## [Unreleased]

## Fase 5 — Chat del workspace (2026-04-16) — ⏳ Pendiente aplicación de migración y verificación manual

### Creado

**Dependencias instaladas:**
- `react-markdown@^10.1.0` — renderizado de markdown en mensajes de chat

**Migración (pendiente de aplicar por Andrés):**
- `supabase/migrations/20260425000001_chat.sql` — tabla `chat_messages` (body, attachments jsonb, reply_to_id auto-thread, edited_at, author_id → auth.users FK). Tabla `chat_reads` (PK compuesto workspace_id+user_id, last_read_message_id, last_read_at). RLS: viewer+ SELECT, commenter+ INSERT, author UPDATE, author-o-admin DELETE en `chat_messages`; user-own-only en `chat_reads`. Realtime en `chat_messages`. Trigger SECURITY DEFINER `notify_on_chat_mention`: parsea `@uuid` en body con regexp, notifica a miembros mencionados si siguen en el workspace (JOIN directo, no `is_workspace_member()` en SECURITY DEFINER). COALESCE(full_name, email, 'Alguien') en label del notificador. Assertions + verification queries.

**Server Actions (`app/w/[slug]/chat/actions.js`):**
- `sendChatMessage(workspaceId, body, attachments, replyToId)` — commenter+
- `editChatMessage(messageId, newBody)` — solo autor, ventana 15 minutos desde `created_at`
- `deleteChatMessage(messageId, workspaceId)` — autor o admin
- `markChatRead(workspaceId, messageId)` — UPSERT en `chat_reads`
- `getChatSignedUploadUrl(workspaceId, filename, mimeType)` — admin client, path `{workspace_id}/chat/{timestamp}-{filename}` en bucket `workspace-files`, sin registro en tabla `files`
- `getChatAttachmentUrl(workspaceId, storagePath)` — signed download URL 1h

**Componentes nuevos:**
- `components/workspace/ChatPanel.js` — lista de mensajes con scroll invertido (nuevo al fondo). Realtime `postgres_changes` en `chat_messages` por `workspace_id` (INSERT UPSERT para deduplicar optimistas, UPDATE/DELETE en vivo). Paginación cursor-based por `created_at` via IntersectionObserver en sentinel superior. Auto-scroll al fondo cuando llega mensaje nuevo (solo si el user ya estaba ahí). `markChatRead` cuando el user llega al fondo. Upload de adjuntos via `getChatSignedUploadUrl` + PUT a Storage.
- `components/workspace/ChatMessage.js` — avatar (MemberAvatar), nombre, timestamp relativo (date-fns/es), body en react-markdown con resolución de `@uuid → @label`. Acciones hover: responder, editar (15-min window), eliminar (confirmación 2 clicks). Indicador "(editado)". Attachment preview inline para imágenes, link para otros tipos. Reply context (CornerDownRight) si es reply.
- `components/workspace/ChatComposer.js` — textarea autogrow. @mention inline: detecta `@\S*` en cursor, popup nativo (sin tippy) con resultados filtrados, navegación ↑↓, Enter para insertar `@uuid` en body. Adjuntar archivos (Paperclip → file input). Reply-to banner con cancelar. ⌘↵ para enviar. Markdown hint en el pie.

**Ruta:**
- `app/w/[slug]/chat/page.js` — SSR: últimos 50 mensajes + profiles + emails (two-step, admin.listUsers). Members para @mention (two-step PGRST200 pattern). Permisos (canWrite, isAdmin). hasMore + oldestCreatedAt para paginación.

**Badge de no leídos:**
- `app/w/[slug]/layout.js` — calcula `chatUnread` en el server: `COUNT(chat_messages WHERE created_at > last_read_at AND author_id != user.id)`. Falla silenciosamente si la tabla no existe (pre-migración). Pasa `chatUnread` prop a `WorkspaceSidebar`.
- `components/workspace/WorkspaceSidebar.js` — acepta `chatUnread` prop, muestra badge numérico en el item "Chat" cuando `chatUnread > 0` y no estás en `/chat`. Máximo "99+".

### Modificado
- `components/workspace/phase-status.js` — `LIVE_PHASE = 5`, `chat.href = (slug) => /w/${slug}/chat`. El sidebar y dashboard habilitan "Chat" automáticamente.
- `app/w/[slug]/layout.js` — añade cálculo de `chatUnread` + prop a sidebar.
- `components/workspace/WorkspaceSidebar.js` — acepta y muestra badge de no leídos.

### ⚠️ Acciones pendientes antes de verificar

1. **Aplicar migración en Supabase Dashboard (SQL Editor):**
   - `supabase/migrations/20260425000001_chat.sql`
   - Revisar assertions en el DO block — deben pasar sin ERROR

2. **Verificar Realtime en Supabase Dashboard:**
   - Settings → Realtime → Publicaciones → `supabase_realtime`
   - Confirmar que `chat_messages` aparece

3. **Verificación E2E:**
   - Navegar a `/w/[slug]/chat` — lista vacía, compositor visible
   - Escribir mensaje → enter → aparece inmediatamente (optimista)
   - Segundo usuario abre chat → ve el mensaje en tiempo real (Realtime)
   - @ para mencionar → popup aparece con miembros → seleccionar → `@uuid` insertado en body → mensaje enviado → trigger notifica al mencionado
   - Responder a mensaje → banner reply visible → enviar → queda anidado bajo el original
   - Editar mensaje (dentro de 15 min) → (editado) visible
   - Editar después de 15 min → error esperado
   - Eliminar mensaje → desaparece en tiempo real para todos
   - Adjuntar imagen → preview inline
   - Adjuntar PDF → link de descarga
   - Scroll up → carga página anterior (IntersectionObserver)
   - Badge en sidebar: segundo usuario no leído → badge numérico
   - Badge desaparece al hacer scroll to bottom (markChatRead)
   - Viewer: ve mensajes, no ve compositor (solo texto informativo)

---

## Fase 4 — Documentos WYSIWYG con Tiptap (2026-04-16) — ✅ Verificada con deuda técnica conocida — Documentos WYSIWYG con Tiptap (2026-04-16) — ✅ Verificada con deuda técnica conocida

### ⚠️ DEUDA TÉCNICA — Menciones @mention

Las menciones con @ se insertan visualmente bien en el cliente que las escribe, pero los attrs (`id`, `label`) no se persisten al JSON de Tiptap v3 al serializar. Otros clientes ven solo `@` vacío o `@null`.

Causa raíz no resuelta después de 3 iteraciones. Requiere investigación más profunda de cómo Tiptap v3 maneja `addAttributes()` en extensiones extendidas vs configuradas. No bloquea el uso del editor — el resto del WYSIWYG (formato, comentarios, autosave, threading) funciona correctamente.

---

### Creado

**Dependencias instaladas:**
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-mention`, `@tiptap/extension-link`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/suggestion`

**Migración (pendiente de aplicar por Andrés):**
- `supabase/migrations/20260423000001_documents.sql` — tabla `documents` (content jsonb Tiptap, created_by/updated_by, updated_at auto-bump trigger) + tabla `document_comments` (selection_from/to/text ProseMirror positions, resolved_by Frame.io, parent_id threading). RLS 4 policies en cada tabla (viewer+ SELECT, editor+ INSERT/UPDATE, author-o-admin DELETE). Triggers SECURITY DEFINER: `notify_on_document_comment` + `notify_on_document_comment_resolved` con email fallback COALESCE(full_name, email, 'Alguien'). Realtime en document_comments. Assertions + verification queries al final.

**Server Actions:**
- `app/w/[slug]/docs/actions.js` — `createDocument`, `updateDocument` (llamado por autosave 2s debounce), `deleteDocument` (autor o admin), `createDocumentComment` (commenter+, con selection_from/to/text), `resolveDocumentComment` (editor+, Frame.io), `unresolveDocumentComment`, `deleteDocumentComment` (autor o admin).

**Componentes nuevos:**
- `components/workspace/DocumentEditor.js` — editor Tiptap con StarterKit, Placeholder, Link, TaskList/TaskItem, Mention (@autocomplete con MentionList popup via tippy.js), CommentMark extension custom (mark `span[data-comment-id]` que persiste en JSON del doc). Autosave debounce 2s, indicador "Guardando… / Guardado / Error". Título editable como input separado (encima del editor). Detección de selección de texto → habilita botón "Comentar" en toolbar. ProseMirror CSS inyectado inline (prose dark theme).
- `components/workspace/DocumentToolbar.js` — 14 botones de formato (negrita, itálica, tachado, H1/H2/H3, listas, task list, enlace, código inline/bloque, cita, separador) + botón "Comentar" que se activa solo cuando hay selección de texto.
- `components/workspace/DocumentCommentSidebar.js` — panel derecho de comentarios para documentos. Muestra `selection_text` como bloque de cita sobre cada comentario. Mismo patrón Frame.io que CommentThread (resolve/reabrir, auditoría "Resuelto por X", threading 1 nivel). Compositor de comentarios integrado al pie del panel (se activa al tener pending comment o reply to).
- `components/workspace/MentionList.js` — popup de autocomplete de miembros al escribir @ en el editor. Navegación con teclado (↑↓ Enter Escape). Renderizado via `ReactRenderer` + tippy.

**Client component:**
- `app/w/[slug]/docs/[docId]/DocumentEditorPage.js` — maneja estado compartido entre DocumentEditor y DocumentCommentSidebar. Realtime subscription en document_comments por document_id. Aplicación de CommentMark al editor tras crear comentario (setTextSelection + setMark + updateDocument para persistir). Caché local de perfiles para enriquecer eventos realtime.

**Rutas:**
- `app/w/[slug]/docs/page.js` — lista de documentos del workspace (grid, ordenado por updated_at desc). Botón "Nuevo documento" para editor+.
- `app/w/[slug]/docs/new/page.js` — server redirect: crea doc vacío y redirige a `/w/[slug]/docs/[docId]`.
- `app/w/[slug]/docs/[docId]/page.js` — SSR: fetch doc + comentarios enriquecidos (profiles + emails) + miembros del workspace (two-step, mismo fix PGRST200) → `DocumentEditorPage`.

### Modificado
- `components/workspace/phase-status.js` — `LIVE_PHASE = 4`, `docs.href = (slug) => /w/${slug}/docs`. El sidebar y dashboard habilitan "Docs" automáticamente.

### ⚠️ Acciones pendientes antes de verificar

1. **Aplicar migración en Supabase Dashboard (SQL Editor):**
   - `supabase/migrations/20260423000001_documents.sql`
   - Revisar assertions en el DO block — deben pasar sin ERROR

2. **Verificar Realtime en Supabase Dashboard:**
   - Settings → Realtime → `supabase_realtime` → confirmar que `document_comments` aparece

3. **Verificación E2E:**
   - Crear documento desde "Nuevo documento" → redirige al editor
   - Escribir título + contenido → autosave "Guardando… → Guardado"
   - Formato: bold, H1, bullet list, task list, código, cita
   - @ para mencionar miembro → popup aparece → seleccionar → mention insertada
   - Seleccionar texto → "Comentar" se activa → comentar → pin aparece en el texto
   - Segundo usuario crea comentario → notificación realtime al creador del doc
   - Resolver comentario → auditoría "Resuelto por X" visible → notificación al autor
   - Reabrir comentario funciona
   - Viewer: puede leer, no puede editar ni comentar (toolbar deshabilitado)
   - Eliminar documento (autor o admin) → confirmación → redirige a lista

---

## Fase 3 — Media review con comentarios (2026-04-16) — ✅ Verificada end-to-end en producción (2026-04-16)

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

### Bug fix: perfiles de co-miembros no visibles (pre-aplicación de migración)

**Bug:** `/w/verant/members` mostraba "0 personas en Verant" aunque la tabla `workspace_members` tenía 2 filas correctas (andres=owner, activmente=editor).

**Causa raíz:** La RLS de `profiles` solo tenía `users_read_own_profile` (`auth.uid() = id`). Al hacer el JOIN embebido `profile:profiles(id, full_name, avatar_url)` con el SSR client en `members/page.js`, PostgREST no podía resolver el path FK `workspace_members.user_id → auth.users → profiles` (no hay FK directo entre workspace_members y profiles). Resultado: query retorna error → `data = null` → `(members || []) = []` → count "0 personas".

**Fix:** Nueva migración `20260421000002_profiles_coworkers_read.sql` — policy `workspace_members_read_coworker_profiles` con self-join sobre `workspace_members` que permite leer perfiles de co-miembros en cualquier workspace compartido. Policy aditiva (no reemplaza `users_read_own_profile` ni `admins_read_all_profiles`).

**Impacto de seguridad:** Solo amplía SELECT. Sin escalación de privilegios: column-level GRANT/REVOKE de Fase 0 sigue bloqueando writes a `role`, `credit_limit`, `credits_used`.

**Candidatos a simplificar post-verificación** (NO cambiados en este commit — pendiente confirmación de Andrés):
- `app/w/[slug]/files/[fileId]/page.js` línea ~48: `admin.from('profiles').select(...).in('id', allProfileIds)` → puede ser `supabase.from('profiles')...` con SSR client. El `admin` sigue siendo necesario en ese archivo para `auth.admin.getUserById` (email del uploader) y `storage.createSignedUrl` (URL firmada del bucket privado).
- `app/w/[slug]/members/page.js` línea 20-26: el JOIN embebido `profile:profiles(...)` en la query SSR funcionará sin admin una vez aplicada la policy. El `adminClient` sigue siendo necesario en ese archivo para `auth.admin.listUsers()` (emails de usuarios — requiere service_role).

### Correcciones pre-aplicación (post-commit inicial)

**Fix: ex-miembros en trigger de notificaciones (8d00eb8)**
- El trigger `notify_on_media_comment` notificaba a usuarios ya removidos del workspace. Ambas ramas (uploader del archivo + comentadores previos) ahora hacen JOIN / IF EXISTS sobre `workspace_members` antes de INSERT. `is_workspace_member()` no se puede usar aquí porque en contexto SECURITY DEFINER `auth.uid()` resuelve al owner de la función (postgres), no al usuario destino.

**Decisión de producto: patrón Frame.io para resolve (encima de 8d00eb8)**
- Cambio de "autor + admin pueden resolver" → "cualquier editor+" (cómo funciona Frame.io).
- Consecuencia positiva: `resolveComment` y `unresolveComment` ya no usan `createAdminClient()` — la RLS con `editor+` es suficiente. Menos uso de service_role.

**Ajuste 1 — RLS policy de UPDATE en media_comments**
- Renombrada de `authors_update_media_comments` a `editors_update_media_comments`.
- Condición cambiada de `is_workspace_member(workspace_id, 'admin')` a `is_workspace_member(workspace_id, 'editor')`.
- Tradeoff documentado en el SQL: la RLS no puede distinguir "editar body" de "marcar resuelto" porque ambas son UPDATE sobre la misma fila. La protección de body está en el server action `editComment` (autor === user.id). Aceptable porque los server actions son el único path de escritura desde el cliente.

**Ajuste 2 — Auditoría visible al resolver (Frame.io)**
- `page.js`: los IDs de `resolved_by` se agregan al batch de perfiles cargados vía admin client. Los comentarios enriquecidos incluyen `resolver: { id, full_name, avatar_url }`.
- `CommentThread.js`: comentarios resueltos muestran `"Resuelto por {nombre} hace X"` en itálica bajo el body.

**Ajuste 3 — Trigger `notify_on_media_comment_resolved`**
- Nuevo trigger AFTER UPDATE que detecta transición `NULL → non-NULL` en `resolved_at`.
- Notifica al autor del comentario cuando otro editor lo resuelve (para auditar y reabrir si no está de acuerdo).
- No notifica si: el autor se auto-resolvió, o el autor ya no es miembro del workspace.
- Mismo patrón de guard que `notify_on_media_comment` (JOIN directo sobre `workspace_members`, no `is_workspace_member()`).
- Assertion agregada: verifica existencia del trigger + que la policy se llama `editors_update_media_comments`.

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
