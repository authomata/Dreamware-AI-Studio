# Prompt Operativo para Claude Code — Capa de Gestión de Clientes

> Pair with `SPEC_CAPA_CLIENTES.md`.
> Ejecutar **una fase a la vez**. No avanzar hasta que la fase actual esté deployada en Vercel y testeada manualmente.

---

## Instrucciones generales (aplican a todas las fases)

Antes de empezar cualquier fase, lee estas reglas:

1. **Lee `SPEC_CAPA_CLIENTES.md`** al inicio de cada fase. Es la fuente de verdad del modelo de datos y decisiones.
2. **No inventes nombres de tablas, columnas o rutas** distintos a los del spec. Si necesitas algo que no está, pregunta antes.
3. **Lenguaje**: código y comentarios en inglés. Strings visibles al usuario en castellano chileno con tuteo (tú/te/ti, nunca vos).
4. **Stack**: Next.js 15 App Router, JavaScript puro (no TypeScript), Supabase SSR, Tailwind con los tokens existentes.
5. **Patrón de código**: copia los patrones de `app/admin/` (Server Component para fetch + Client Component para interacción + Server Actions para mutaciones con `assertAdmin`/`assertWorkspaceRole` guards).
6. **Migraciones**: todas en `/supabase/migrations/` con nombre `YYYYMMDDHHMMSS_descripcion.sql`. Una migración por cambio lógico, no mezcles.
7. **No toques código Electron** en `/src/` ni el `ApiKeyModal` legacy. Todo lo nuevo vive en `/app/`, `/components/workspace/`, `/lib/`, `/supabase/`.
8. **No uses TypeScript**. Si necesitas tipos, usa JSDoc en funciones críticas.
9. **Revalidación de cache**: llama `revalidatePath` después de cada Server Action, igual que en `app/admin/actions.js`.
10. **Al final de cada fase**, entrega: (a) lista de archivos creados/modificados, (b) pasos de verificación manual, (c) siguiente fase sugerida.

Tres archivos de contexto que debes mantener actualizados en el repo:

- `/supabase/migrations/` — migraciones SQL versionadas
- `/docs/WORKSPACE_ROLES.md` — matriz actualizada de permisos
- `/docs/CHANGELOG_CAPA_CLIENTES.md` — log de qué se hizo en cada fase

---

## FASE 0 — Housekeeping (1 día)

**Objetivo**: Dejar la base del proyecto lista antes de tocar nada nuevo. Si esta fase no se hace, todo lo que venga después hereda deuda.

### Tareas

1. **Crear estructura de migraciones**:
   - Crea `/supabase/migrations/` si no existe
   - Crea `/supabase/config.toml` con la config mínima del proyecto
   - Documenta en `/supabase/README.md` cómo aplicar migraciones localmente con Supabase CLI

2. **Capturar schema actual como migración base**:
   - Genera migración `00000000000000_initial_schema.sql` con el schema existente de `profiles`, `generations`, `characters`, `platform_settings` (basado en el `LEVANTAMIENTO_TECNICO.md`).
   - Esta migración debe ser **idempotente** (usar `IF NOT EXISTS`) porque las tablas ya existen en producción.

3. **Activar y auditar RLS en tablas existentes**:
   - Nueva migración `20260416000001_rls_existing_tables.sql`:
     - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` para `profiles`, `generations`, `characters`, `platform_settings`.
     - Crea las políticas del spec sección 3.1.
     - **Antes de aplicar a producción**: verifica en Supabase Dashboard si RLS ya estaba activa. Si estaba, solo agrega las políticas faltantes.

4. **Agregar columnas a `profiles`**:
   - Nueva migración `20260416000002_profiles_name_avatar.sql`:
     - `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name text;`
     - `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;`

5. **Limpieza de `console.log` en producción**:
   - Quitar `console.log('PROXY:', ...)` en `app/api/muapi/[...path]/route.js` o envolverlo en `if (process.env.NODE_ENV !== 'production')`.

6. **Instalar dependencias nuevas** (no todas aún, solo las de este sprint):
   - `lucide-react`, `date-fns`

### Entregable

- PR/commit "Fase 0: Housekeeping y migraciones base" con:
  - `/supabase/migrations/` con 3 archivos
  - `/supabase/config.toml`
  - `/supabase/README.md`
  - `/docs/CHANGELOG_CAPA_CLIENTES.md` con entrada de fase 0
  - `package.json` actualizado

### Verificación manual

- Aplicar migraciones a un entorno de staging (o al proyecto Supabase existente con cuidado).
- Confirmar en Dashboard que RLS está `ON` en las 4 tablas.
- Intentar leer `profiles` de otro usuario desde un cliente no-admin → debe fallar.

---

## FASE 1 — Modelo de workspaces + navegación base (2 días)

**Objetivo**: Crear las entidades `workspaces`, `workspace_members`, `workspace_invitations` con RLS, más el switcher y las rutas `/w/[slug]` vacías pero protegidas.

### Tareas

1. **Migración `20260417000001_workspaces_core.sql`**:
   - Crear tablas `workspaces`, `workspace_members`, `workspace_invitations` según spec sección 2.1.
   - Crear función `is_workspace_member(wid uuid, min_role text)` según spec sección 3.2.
   - Crear policies RLS del spec sección 3.3 (solo para estas 3 tablas).
   - Crear trigger en `workspaces` que al insertar inserta automáticamente al `created_by` como `owner` en `workspace_members` y crea los folders default (vendrán en fase 2, por ahora skip folders).

2. **Server helpers** en `/lib/workspace/`:
   - `getUserWorkspaces.js` — lista workspaces del usuario autenticado
   - `getWorkspaceBySlug.js` — obtiene workspace + membership del user
   - `assertWorkspaceRole.js` — guard equivalente a `assertAdmin` pero para workspace
   - Todos con JSDoc de tipos.

3. **Rutas nuevas**:
   - `app/w/[slug]/layout.js` — Server Component que verifica membresía, redirige a `/` si no lo es
   - `app/w/[slug]/page.js` — Dashboard del workspace, por ahora muestra nombre, miembros, contadores placeholder
   - `app/w/[slug]/members/page.js` — Lista miembros, con dropdown para cambiar rol si el user es admin+
   - `app/w/[slug]/settings/page.js` — Editar nombre, slug, logo, color del workspace (solo admin+)
   - `app/invitations/[token]/page.js` — Ver invitación, aceptar/rechazar

4. **Componentes nuevos** en `/components/workspace/`:
   - `WorkspaceSwitcher.jsx` — dropdown para cambiar workspace (y opción "Sin workspace" para volver al studio directo)
   - `WorkspaceSidebar.jsx` — nav lateral con Dashboard, Archivos, Docs, Chat, Miembros, Config (los 4 primeros por ahora deshabilitados)
   - `MemberAvatar.jsx`, `MemberList.jsx`, `RoleBadge.jsx`
   - `InviteMemberDialog.jsx`

5. **Server Actions** en `app/w/[slug]/actions.js` y `app/admin/clients/actions.js`:
   - `inviteMember`, `acceptInvitation`, `updateMemberRole`, `removeMember`
   - `updateWorkspace`, `archiveWorkspace`
   - `createClientAndOwner` (en admin/clients/actions.js, usa Resend para email, requiere dep en fase 6 pero dejar preparado)

6. **Integración con el shell existente**:
   - Modificar `components/StandaloneShell.js` para que, cuando el user pertenezca a ≥1 workspace, muestre el `WorkspaceSwitcher` en el header.
   - El switcher no cambia la funcionalidad del studio aún — solo navega entre `/studio` y `/w/[slug]`.

### Entregable

- PR "Fase 1: Workspaces core + navegación"
- Migración SQL aplicada
- Rutas funcionales (dashboards vacíos pero navegables)
- `CHANGELOG` actualizado

### Verificación manual

- Como admin, crear un workspace de prueba via SQL directo o form temporal
- Invitar a un segundo user test
- Login con el segundo user → debe ver el workspace en el switcher y poder entrar
- Intentar acceder a `/w/slug-inexistente` → 404 o redirect
- Intentar acceder a un workspace del que no eres miembro → redirect
- Como admin del workspace, cambiar rol de otro miembro → funciona
- Como viewer, intentar cambiar rol → falla (UI oculta, Server Action también falla)

---

## FASE 2 — Archivos y folders (2 días)

**Objetivo**: Que los clientes puedan subir archivos y verlos organizados en carpetas.

### Tareas

1. **Migración `20260419000001_files_folders.sql`**:
   - Tablas `folders`, `files` según spec
   - Políticas RLS
   - Trigger en `workspaces` AFTER INSERT para crear folders default (`Brand Assets`, `Entregables`, `Reuniones`, `Documentos`)

2. **Supabase Storage**:
   - Crear bucket `workspace-files` (private)
   - Aplicar policies del spec sección 3.4
   - Configurar file size limit: 100 MB por archivo

3. **Route handler** `app/api/upload/sign/route.js`:
   - POST con `{ workspace_id, folder_id, filename, mime_type, size }`
   - Valida membresía (editor+), valida mime, valida quota
   - Genera signed upload URL y path
   - Retorna `{ upload_url, storage_path, file_id }`

4. **Server Actions** en `app/w/[slug]/files/actions.js`:
   - `createFolder`, `renameFolder`, `deleteFolder`
   - `registerUploadedFile` — llamada después del upload directo a Storage para crear el registro en `files`
   - `renameFile`, `moveFile`, `deleteFile`, `toggleReviewAsset`

5. **Rutas y componentes**:
   - `app/w/[slug]/files/page.js` — FileBrowser
   - `app/w/[slug]/files/[fileId]/page.js` — File detail (preview + metadata), sin comentarios aún
   - `components/workspace/FileBrowser.jsx` — breadcrumbs, drag-drop, grid/list view, acciones contextuales
   - `components/workspace/FileUploader.jsx` — multi-file con progress, usa signed URLs
   - `components/workspace/FilePreview.jsx` — preview según MIME: imagen, video, PDF, otros
   - `components/workspace/FileIcon.jsx` — ícono por mime type

6. **Integración con módulos existentes** (opcional fase 2, puede ir a fase 3):
   - Botón "Guardar en workspace" en VideoStudio y ImageStudio para enviar la generación actual a la carpeta `Entregables` del workspace activo.

### Entregable

- PR "Fase 2: Archivos y folders con Supabase Storage"
- Bucket configurado
- FileBrowser funcional con upload y download

### Verificación manual

- Subir archivo de 20 MB → funciona con progress
- Subir archivo de 200 MB → falla limpio con mensaje
- Crear folder anidado 3 niveles → funciona
- Como viewer, intentar subir → botón deshabilitado, API rechaza
- Bajar archivo grande → URL firmada, expira
- Eliminar archivo siendo editor → funciona
- Eliminar archivo de otro autor siendo viewer → no aparece la opción

---

## FASE 3 — Media review con comentarios (2 días)

**Objetivo**: Los clientes pueden comentar sobre videos e imágenes con timestamp/coordenadas.

### Tareas

1. **Migración `20260421000001_media_comments.sql`**:
   - Tabla `media_comments` según spec
   - RLS policies
   - Tabla `notifications` con RLS
   - Trigger que al insertar `media_comments` inserta `notifications` para: autor del file + todos los que ya comentaron en ese file (excepto el autor del nuevo comentario)

2. **Realtime**: `alter publication supabase_realtime add table media_comments, notifications;`

3. **Componentes nuevos**:
   - `MediaReviewer.jsx` — wrapper que decide si mostrar VideoReviewer o ImageReviewer
   - `VideoReviewer.jsx` — player custom con timeline que muestra pins de comentarios
   - `ImageReviewer.jsx` — imagen con overlay de pins absolute-positioned (x_percent, y_percent)
   - `CommentThread.jsx` — thread con replies, resolve, author, timestamp
   - `CommentComposer.jsx` — input con auto-link al momento/coord actual
   - `NotificationBell.jsx` — campana en header con dropdown de últimas 20 notifs, realtime

4. **Server Actions** en `app/w/[slug]/files/[fileId]/actions.js`:
   - `createComment(fileId, body, timestamp, coords, parentId)`
   - `editComment`, `deleteComment`, `resolveComment`, `unresolveComment`
   - `markNotificationRead`, `markAllNotificationsRead`

5. **Actualizar `app/w/[slug]/files/[fileId]/page.js`**:
   - Layout de dos columnas: preview a la izquierda, thread de comentarios a la derecha
   - En mobile, tabs entre preview y comentarios

6. **Integración con el header global**:
   - `NotificationBell` visible en todos los workspaces
   - Click en notificación lleva al file + comentario específico (via URL param `?c={comment_id}`)

### Entregable

- PR "Fase 3: Media review con comentarios y notificaciones"

### Verificación manual

- Subir video, marcar como review asset, comentar en 0:15 → pin aparece en timeline
- Click en pin → player salta a 0:15 y comentario se highlightea
- Subir imagen, comentar click en coordenada → pin aparece exactamente ahí
- User B recibe notificación en tiempo real al comentar user A
- Mark as resolved → comentario se tacha, pin gris
- Responder a un comentario crea thread

---

## FASE 4 — Documentos WYSIWYG con Tiptap (2 días)

**Objetivo**: Editor tipo Notion para guiones, minutas, briefs, con comentarios sobre selecciones.

### Tareas

1. **Dependencias nuevas**: instalar el stack de Tiptap del spec sección 5.4.

2. **Migración `20260423000001_documents.sql`**:
   - Tablas `documents`, `document_comments`
   - RLS
   - Agregar a publication realtime

3. **Componentes**:
   - `DocumentEditor.jsx` — Tiptap con StarterKit + Placeholder + Link + TaskList + Mention + CommentMark (custom)
   - `DocumentToolbar.jsx` — bold, italic, headings, lists, link, code, blockquote
   - `DocumentCommentSidebar.jsx` — panel derecho con comentarios del doc
   - `MentionList.jsx` — autocomplete de miembros del workspace al escribir `@`

4. **Custom extension CommentMark**:
   - Mark que envuelve el texto comentado con ID del comentario
   - Click en texto marcado → abre sidebar en ese comentario
   - Nuevo comentario desde selección → crea registro en `document_comments` con `selection_from/to/text`

5. **Server Actions** en `app/w/[slug]/docs/actions.js`:
   - `createDocument`, `updateDocument` (con debounce client-side de 2s), `deleteDocument`
   - `createDocumentComment`, `resolveDocumentComment`, `deleteDocumentComment`

6. **Rutas**:
   - `app/w/[slug]/docs/page.js` — lista de documentos con filtros y búsqueda
   - `app/w/[slug]/docs/new/page.js` — shortcut: crea doc vacío y redirige
   - `app/w/[slug]/docs/[docId]/page.js` — editor + sidebar

7. **Autosave**: useEffect con debounce de 2s en el editor, indicador visual "Guardando..." / "Guardado hace 3s".

### Entregable

- PR "Fase 4: Documentos WYSIWYG con Tiptap"

### Verificación manual

- Crear documento, escribir texto con formato → persiste
- Pegar contenido desde Claude/LLM → formato razonable
- Seleccionar párrafo, botón "Comentar" → crea comentario y lo resalta
- Click en comentario de sidebar → scroll al texto marcado
- `@` en el editor → autocompletea miembros
- Dos users editando: last write wins, sin corrupción de contenido

---

## FASE 5 — Chat del workspace (2 días)

**Objetivo**: Canal de comunicación que reemplaza el correo.

### Tareas

1. **Migración `20260425000001_chat.sql`**:
   - Tablas `chat_messages`, `chat_reads`
   - RLS
   - Realtime para `chat_messages`
   - Trigger que al insertar mensaje con menciones (`@user_id`) crea `notifications` para los mencionados

2. **Componentes**:
   - `ChatPanel.jsx` — lista de mensajes con scroll infinito invertido (virtualize con `react-window` si >500 msgs, evaluar más adelante)
   - `ChatMessage.jsx` — avatar, nombre, timestamp, body con markdown, attachments inline
   - `ChatComposer.jsx` — input markdown con preview, attach files, mentions
   - Usar librería simple de markdown: `react-markdown` con plugin seguro

3. **Server Actions** en `app/w/[slug]/chat/actions.js`:
   - `sendChatMessage(workspaceId, body, attachments, replyToId)`
   - `editChatMessage(id, body)` — ventana de 15 min
   - `deleteChatMessage(id)` — autor o admin
   - `markChatRead(workspaceId, messageId)`

4. **Route**:
   - `app/w/[slug]/chat/page.js`

5. **Badge de no leídos**:
   - En `WorkspaceSidebar.jsx`, item "Chat" muestra badge con `unread_count`
   - Cálculo: `SELECT count(*) FROM chat_messages WHERE workspace_id = X AND created_at > (SELECT last_read_at FROM chat_reads WHERE ...)`
   - Crear vista `unread_counts` o función SQL para eficiencia.

6. **Attachments**:
   - Reusar `FileUploader` en ChatComposer pero sin persistir en `files` table. En su lugar, upload directo a Storage bajo `{workspace_id}/chat/{timestamp}-{filename}` y guardar path en `chat_messages.attachments` jsonb.

### Entregable

- PR "Fase 5: Chat del workspace con realtime"

### Verificación manual

- Dos tabs abiertas con users distintos → mensajes aparecen en vivo
- Adjuntar imagen en mensaje → preview inline
- Mencionar `@user` → user recibe notificación
- Editar mensaje antes de 15 min → permitido
- Editar después de 15 min → bloqueado
- Eliminar mensaje propio → se marca como eliminado (no hard delete, o sí hard delete con `"[mensaje eliminado]"`)
- Badge de unread se actualiza correctamente

---

## FASE 6 — Panel admin de clientes + invitaciones por email (1 día)

**Objetivo**: Onboarding completo de cliente desde UI, sin SQL manual.

### Tareas

1. **Dependencia**: `resend`

2. **Variable de entorno**: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (por defecto `notificaciones@dreamware.cl`)

3. **Route handler** `app/api/invitations/send/route.js`:
   - Llamado por server action `inviteMember` y `createClientAndOwner`
   - Envía email HTML con branding DreamWare y link `https://dreamware.app/invitations/{token}`

4. **Rutas admin**:
   - `app/admin/clients/page.js` — lista de workspaces tipo `client` con filtros (activos / archivados / plan)
   - `app/admin/clients/new/page.js` — form de onboarding:
     - Empresa, slug, plan, logo (upload), color
     - Email contacto principal, nombre contacto principal
     - Acción `createClientAndOwner`:
       1. Crea workspace
       2. Busca user por email en `auth.users`
       3. Si existe, lo agrega como `owner` y envía email "te agregaron al workspace X"
       4. Si no existe, crea invitación y envía email "creaste acceso a DreamWare, haz clic para configurar tu contraseña"
   - `app/admin/clients/[workspaceId]/page.js` — vista superadmin del workspace: métricas, miembros, actividad

5. **Templates de email** en `/lib/emails/`:
   - `InvitationEmail.jsx` — componente React server-side que retorna HTML
   - `WelcomeClientEmail.jsx`
   - `CommentNotificationEmail.jsx` (para digest diario, fase 7)

6. **Flujo de aceptación de invitación** (ya existía ruta en fase 1, ahora conectar):
   - `app/invitations/[token]/page.js`:
     - Si el token expiró o no existe → mensaje claro
     - Si el usuario ya está autenticado y su email coincide → aceptar automáticamente y redirigir a `/w/[slug]`
     - Si no está autenticado → mostrar signup/login con email pre-rellenado, al completar acepta invitación

### Entregable

- PR "Fase 6: Panel admin de clientes + invitaciones por email"

### Verificación manual

- Desde `/admin/clients/new`, crear cliente ficticio con email test
- Verificar que llega el email (dev: Resend sandbox)
- Click en link → signup con email pre-rellenado
- Completar signup → aterrizar en `/w/[slug]` como owner
- Archivar cliente → desaparece de lista activa pero data conservada

---

## Checklist final antes de lanzar con clientes reales

Revisar todos estos ítems antes de invitar al primer cliente real:

- [ ] Todas las tablas nuevas tienen RLS activa y probada con usuarios no-miembros
- [ ] Storage bucket `workspace-files` tiene policies probadas
- [ ] Signed URLs de upload expiran correctamente
- [ ] Rate limiting activo en `/api/upload/sign` y `/api/invitations/send`
- [ ] Email de invitación llega sin caer en spam (SPF/DKIM configurados)
- [ ] Resend enviando desde dominio propio (`dreamware.cl` o similar)
- [ ] Service role key jamás importada en Client Components (grep del repo)
- [ ] Cuotas de Storage por workspace implementadas (trigger o check en upload)
- [ ] Página de aceptación de invitación funciona con user nuevo y user existente
- [ ] Archive workspace: data conservada, acceso bloqueado a todos los no-admin
- [ ] Onboarding email en castellano chileno con tuteo
- [ ] Logo y color del workspace visibles en sidebar
- [ ] Responsive funciona en iPad (lo más cercano al uso cliente real)
- [ ] README del proyecto actualizado con sección "Capa de gestión de clientes"

---

## Cómo reportar avance a Andrés

Al terminar cada fase, manda mensaje con:

1. **PR link** (o commit hash)
2. **Migraciones aplicadas** (nombres de archivos)
3. **URL de staging** para probar
4. **Checklist de verificación manual** completado
5. **Problemas encontrados** o decisiones que requieren input humano
6. **Siguiente fase sugerida** (normalmente la siguiente en orden, pero podría cambiar)

---

*Fin del prompt operativo. La fase 0 es no-negociable. Empezar por ahí.*
