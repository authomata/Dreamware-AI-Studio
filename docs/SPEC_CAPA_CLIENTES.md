# DreamWare AI Studio — Capa de Gestión de Clientes

> Specification document. Living reference. Pair with `PROMPT_CLAUDE_CODE.md` for implementation.
> Versión: 1.0 · 2026-04-16

---

## 0. Decisiones arquitectónicas clave

| Decisión | Elección | Razón |
|---|---|---|
| Stack | Next.js 15 + Supabase + Vercel (unchanged) | Ya funciona, se extiende |
| Lenguaje código | JavaScript puro + JSDoc en capas críticas | Consistencia con codebase |
| Lenguaje UI | Castellano chileno con tuteo | Cliente final es hispanohablante |
| Lenguaje código/logs | Inglés | Convención técnica |
| Workspaces | Opcionales para team, obligatorios para clientes externos | Equipo DreamWare conserva su flujo actual |
| Multi-workspace | Sí, un usuario puede estar en N workspaces con roles distintos por cada uno | Flexibilidad para freelancers |
| Storage | Supabase Storage (nuevo) | Assets de cliente no pueden depender de muapi.ai |
| Realtime | Activado en chat, comentarios, documentos | UX colaborativa |
| Editor WYSIWYG | Tiptap (ProseMirror) | Estándar abierto, extensible, colaborativo |
| Migraciones | `/supabase/migrations/` desde ahora | Fin del schema no versionado |

---

## 1. Modelo de roles (dos dimensiones)

El sistema ahora tiene **dos dimensiones de permisos** que conviven:

### Dimensión A — Rol de plataforma (`profiles.role`)

Ya existe. No se modifica. Define qué puede hacer el usuario en DreamWare globalmente.

| Rol | Significado | API Key usada |
|---|---|---|
| `admin` | Superadmin (Andrés) | Central |
| `team` | Equipo DreamWare (Hanna, Leonor) | Central |
| `free` | Cliente externo o usuario gratuito | Personal |

### Dimensión B — Rol de workspace (`workspace_members.role`)

Nuevo. Define qué puede hacer el usuario dentro de un workspace específico.

| Rol | Permisos dentro del workspace |
|---|---|
| `owner` | Todo + eliminar workspace + facturación |
| `admin` | Gestionar miembros, archivos, docs, chat. No puede eliminar workspace |
| `editor` | Crear/editar archivos, docs, comentar, chatear |
| `commenter` | Solo ver y comentar (no editar) |
| `viewer` | Solo lectura, no puede comentar |

### Matriz de casos típicos

| Persona | Rol plataforma | Workspace | Rol workspace |
|---|---|---|---|
| Andrés | `admin` | (ninguno por default) | — |
| Andrés en proyecto interno DreamWare | `admin` | DreamWare Internal | `owner` |
| Hanna | `team` | DreamWare Internal | `admin` |
| Leonor | `team` | Cliente Verant | `editor` |
| Contraparte Verant | `free` | Cliente Verant | `owner` |
| Diseñador de Verant | `free` | Cliente Verant | `editor` |
| Cliente solo-revisión | `free` | Cliente Revisor | `commenter` |

---

## 2. Modelo de datos

### 2.1 Tablas nuevas

#### `workspaces`

Representa un espacio de trabajo. Puede ser cliente externo o proyecto interno.

| Columna | Tipo | Constraints | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `name` | `text` | not null | Nombre visible ("Verant", "DreamWare Internal") |
| `slug` | `text` | unique, not null | Slug para URL (`/w/verant`) |
| `type` | `text` | not null, check in (`'client'`, `'internal'`) | Cliente externo o proyecto interno |
| `logo_url` | `text` | nullable | Logo del cliente (Supabase Storage) |
| `brand_color` | `text` | nullable | Color hex del cliente (para theming suave) |
| `plan` | `text` | not null, default `'collaboration'`, check in (`'collaboration'`, `'generative'`) | Collaboration = solo workspace. Generative = también puede usar studios con su API |
| `created_by` | `uuid` | FK `auth.users(id)`, not null | Quién creó el workspace |
| `created_at` | `timestamptz` | default `now()` | |
| `archived_at` | `timestamptz` | nullable | Soft delete |
| `settings` | `jsonb` | default `'{}'::jsonb` | Config extensible |

Índices:
- `idx_workspaces_slug` unique en `slug`
- `idx_workspaces_type` en `type`

#### `workspace_members`

Relación usuario ↔ workspace con rol.

| Columna | Tipo | Constraints | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `workspace_id` | `uuid` | FK `workspaces(id)` on delete cascade, not null | |
| `user_id` | `uuid` | FK `auth.users(id)` on delete cascade, not null | |
| `role` | `text` | not null, check in (`'owner'`, `'admin'`, `'editor'`, `'commenter'`, `'viewer'`) | |
| `invited_by` | `uuid` | FK `auth.users(id)`, nullable | |
| `joined_at` | `timestamptz` | default `now()` | |
| `last_seen_at` | `timestamptz` | nullable | Para mostrar "visto por última vez" |

Unique: `(workspace_id, user_id)` — un usuario solo puede tener un rol por workspace.

#### `workspace_invitations`

Invitaciones pendientes (no requieren cuenta previa del invitado).

| Columna | Tipo | Constraints | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `workspace_id` | `uuid` | FK `workspaces(id)` on delete cascade, not null | |
| `email` | `text` | not null | Email del invitado |
| `role` | `text` | not null, check as arriba | |
| `token` | `text` | unique, not null | Token único para el link de invitación |
| `invited_by` | `uuid` | FK `auth.users(id)`, not null | |
| `expires_at` | `timestamptz` | not null | Default: now() + 7 días |
| `accepted_at` | `timestamptz` | nullable | |
| `created_at` | `timestamptz` | default `now()` | |

Unique: `(workspace_id, email)` — no puedes invitar dos veces al mismo email al mismo workspace.

#### `folders`

Carpetas jerárquicas para organizar archivos dentro de un workspace.

| Columna | Tipo | Constraints | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `workspace_id` | `uuid` | FK `workspaces(id)` on delete cascade, not null | |
| `parent_id` | `uuid` | FK `folders(id)` on delete cascade, nullable | NULL = raíz del workspace |
| `name` | `text` | not null | |
| `created_by` | `uuid` | FK `auth.users(id)`, not null | |
| `created_at` | `timestamptz` | default `now()` | |

Folders default creadas al crear workspace: `Brand Assets`, `Entregables`, `Reuniones`, `Documentos`.

#### `files`

Archivos subidos al workspace.

| Columna | Tipo | Constraints | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `workspace_id` | `uuid` | FK `workspaces(id)` on delete cascade, not null | |
| `folder_id` | `uuid` | FK `folders(id)` on delete set null, nullable | NULL = raíz |
| `name` | `text` | not null | Nombre visible del archivo |
| `storage_path` | `text` | not null | Path en Supabase Storage |
| `mime_type` | `text` | not null | |
| `size_bytes` | `bigint` | not null | |
| `uploaded_by` | `uuid` | FK `auth.users(id)`, not null | |
| `created_at` | `timestamptz` | default `now()` | |
| `metadata` | `jsonb` | default `'{}'::jsonb` | Dimensions (width, height, duration), etc. |
| `is_review_asset` | `boolean` | default `false` | Si es true, se muestra en el tab "Media Review" para comentarios |

Índices:
- `idx_files_workspace` en `workspace_id`
- `idx_files_folder` en `folder_id`
- `idx_files_review` en `workspace_id WHERE is_review_asset = true`

#### `media_comments`

Comentarios sobre archivos de media (videos, imágenes) con timestamp opcional.

| Columna | Tipo | Constraints | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `file_id` | `uuid` | FK `files(id)` on delete cascade, not null | |
| `workspace_id` | `uuid` | FK `workspaces(id)` on delete cascade, not null | Denormalizado para RLS |
| `author_id` | `uuid` | FK `auth.users(id)`, not null | |
| `body` | `text` | not null | Texto del comentario |
| `timestamp_ms` | `integer` | nullable | Para videos: segundo exacto |
| `x_percent` | `numeric(5,2)` | nullable | Para imágenes: coord X 0-100 |
| `y_percent` | `numeric(5,2)` | nullable | Para imágenes: coord Y 0-100 |
| `resolved_at` | `timestamptz` | nullable | |
| `resolved_by` | `uuid` | FK `auth.users(id)`, nullable | |
| `parent_id` | `uuid` | FK `media_comments(id)` on delete cascade, nullable | Para threading |
| `created_at` | `timestamptz` | default `now()` | |

#### `documents`

Documentos WYSIWYG (tipo Notion). Contenido como JSON Tiptap/ProseMirror.

| Columna | Tipo | Constraints | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `workspace_id` | `uuid` | FK `workspaces(id)` on delete cascade, not null | |
| `folder_id` | `uuid` | FK `folders(id)` on delete set null, nullable | |
| `title` | `text` | not null | |
| `content` | `jsonb` | default `'{}'::jsonb` | Tiptap JSON |
| `created_by` | `uuid` | FK `auth.users(id)`, not null | |
| `updated_by` | `uuid` | FK `auth.users(id)`, not null | |
| `created_at` | `timestamptz` | default `now()` | |
| `updated_at` | `timestamptz` | default `now()` | |

#### `document_comments`

Comentarios sobre selecciones en documentos.

| Columna | Tipo | Constraints | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `document_id` | `uuid` | FK `documents(id)` on delete cascade, not null | |
| `workspace_id` | `uuid` | FK `workspaces(id)` on delete cascade, not null | Denormalizado para RLS |
| `author_id` | `uuid` | FK `auth.users(id)`, not null | |
| `body` | `text` | not null | |
| `selection_from` | `integer` | nullable | Posición inicio en el doc (ProseMirror position) |
| `selection_to` | `integer` | nullable | Posición fin |
| `selection_text` | `text` | nullable | Snapshot del texto seleccionado |
| `resolved_at` | `timestamptz` | nullable | |
| `parent_id` | `uuid` | FK `document_comments(id)` on delete cascade, nullable | |
| `created_at` | `timestamptz` | default `now()` | |

#### `chat_messages`

Mensajes del canal principal del workspace. MVP: un solo hilo por workspace.

| Columna | Tipo | Constraints | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `workspace_id` | `uuid` | FK `workspaces(id)` on delete cascade, not null | |
| `author_id` | `uuid` | FK `auth.users(id)`, not null | |
| `body` | `text` | not null | Texto (soporta markdown simple) |
| `attachments` | `jsonb` | default `'[]'::jsonb` | Array de `{file_id, name, mime_type}` |
| `reply_to_id` | `uuid` | FK `chat_messages(id)` on delete set null, nullable | Hilo/respuesta |
| `edited_at` | `timestamptz` | nullable | |
| `created_at` | `timestamptz` | default `now()` | |

Índice: `idx_chat_workspace_created` en `(workspace_id, created_at DESC)`.

#### `chat_reads`

Tracking de mensaje leído por usuario (para badge de no leídos).

| Columna | Tipo | Constraints |
|---|---|---|
| `workspace_id` | `uuid` | FK, PK parte |
| `user_id` | `uuid` | FK, PK parte |
| `last_read_message_id` | `uuid` | FK nullable |
| `last_read_at` | `timestamptz` | default `now()` |

PK: `(workspace_id, user_id)`.

#### `activity_log`

Log de actividad por workspace (quién hizo qué).

| Columna | Tipo | Constraints | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `workspace_id` | `uuid` | FK `workspaces(id)` on delete cascade, not null | |
| `actor_id` | `uuid` | FK `auth.users(id)`, not null | |
| `action` | `text` | not null | ej: `'file.uploaded'`, `'document.updated'`, `'member.invited'` |
| `entity_type` | `text` | not null | `'file'`, `'document'`, `'member'`, etc. |
| `entity_id` | `uuid` | nullable | |
| `metadata` | `jsonb` | default `'{}'::jsonb` | |
| `created_at` | `timestamptz` | default `now()` | |

Índice: `idx_activity_workspace_created` en `(workspace_id, created_at DESC)`.

#### `notifications`

Notificaciones in-app por usuario.

| Columna | Tipo | Constraints | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | FK `auth.users(id)` on delete cascade, not null | |
| `workspace_id` | `uuid` | FK `workspaces(id)` on delete cascade, not null | |
| `type` | `text` | not null | `'mention'`, `'comment'`, `'chat_message'`, `'invitation'` |
| `title` | `text` | not null | |
| `body` | `text` | nullable | |
| `link` | `text` | nullable | URL relativa a donde lleva la notif |
| `read_at` | `timestamptz` | nullable | |
| `created_at` | `timestamptz` | default `now()` | |

Índice: `idx_notifications_user_unread` en `user_id WHERE read_at IS NULL`.

### 2.2 Modificaciones a tablas existentes

#### `profiles` — agregar columna

```sql
ALTER TABLE profiles ADD COLUMN full_name text;
ALTER TABLE profiles ADD COLUMN avatar_url text;
```

Hoy el admin panel solo muestra email. Para workspace necesitamos mostrar nombres reales.

#### `generations` y `characters` — agregar workspace_id opcional

```sql
ALTER TABLE generations ADD COLUMN workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE characters ADD COLUMN workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;
```

Opcional porque el equipo sigue trabajando sin workspace por default. Cuando trabaja *dentro* de un workspace, las generaciones se asocian a él.

---

## 3. Row Level Security (RLS)

### 3.1 Fase preliminar obligatoria (antes de la capa nueva)

Verificar y activar RLS en tablas existentes. Políticas mínimas:

```sql
-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM profiles WHERE id = auth.uid()));
  -- no permite auto-escalar rol

CREATE POLICY "admins_read_all_profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- generations, characters: solo el owner
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_crud_own_generations" ON generations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_crud_own_characters" ON characters
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- platform_settings: solo admin lee/escribe
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "only_admin_platform_settings" ON platform_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

### 3.2 Función helper de membresía

Para evitar recursión en políticas, creamos una función Security Definer:

```sql
CREATE OR REPLACE FUNCTION is_workspace_member(wid uuid, min_role text DEFAULT 'viewer')
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = wid
      AND user_id = auth.uid()
      AND CASE min_role
        WHEN 'viewer'    THEN role IN ('viewer','commenter','editor','admin','owner')
        WHEN 'commenter' THEN role IN ('commenter','editor','admin','owner')
        WHEN 'editor'    THEN role IN ('editor','admin','owner')
        WHEN 'admin'     THEN role IN ('admin','owner')
        WHEN 'owner'     THEN role = 'owner'
      END
  );
$$;
```

### 3.3 Políticas por tabla nueva (resumen)

Patrón general: SELECT requiere `is_workspace_member(workspace_id, 'viewer')`. INSERT/UPDATE de contenido requiere `'editor'`. Gestión de miembros requiere `'admin'`.

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `workspaces` | miembro | platform admin O team | admin del workspace | owner del workspace |
| `workspace_members` | miembro | admin del workspace | admin del workspace | admin (no puede eliminar owners, owner no puede auto-eliminarse si es el único) |
| `workspace_invitations` | admin | admin | admin | admin |
| `folders` | miembro | editor | editor | editor |
| `files` | miembro | editor | editor (solo nombre/folder) | editor (autor) o admin |
| `media_comments` | miembro | commenter+ | autor | autor o admin |
| `documents` | miembro | editor | editor | editor (autor) o admin |
| `document_comments` | miembro | commenter+ | autor | autor o admin |
| `chat_messages` | miembro | commenter+ | autor (editar body, 15 min) | autor o admin |
| `chat_reads` | propio | propio | propio | — |
| `activity_log` | miembro | (solo via función trigger) | — | — |
| `notifications` | propio | (solo via trigger) | propio (mark as read) | propio |

El SQL completo va en la migración. Aquí solo el mapa.

### 3.4 Storage policies

Bucket `workspace-files`. Path pattern: `{workspace_id}/{file_id}-{filename}`.

```sql
-- Lectura: miembros del workspace
CREATE POLICY "members_read_workspace_files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'workspace-files'
    AND is_workspace_member(
      (storage.foldername(name))[1]::uuid,
      'viewer'
    )
  );

-- Upload: editors+
CREATE POLICY "editors_upload_workspace_files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'workspace-files'
    AND is_workspace_member(
      (storage.foldername(name))[1]::uuid,
      'editor'
    )
  );

-- Delete: editors+ (luego se restringe por lógica aplicación)
CREATE POLICY "editors_delete_workspace_files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'workspace-files'
    AND is_workspace_member(
      (storage.foldername(name))[1]::uuid,
      'editor'
    )
  );
```

---

## 4. Rutas Next.js

### 4.1 Rutas nuevas (App Router)

```
app/
├── w/
│   ├── [slug]/
│   │   ├── layout.js            # Guard: is_workspace_member(slug)
│   │   ├── page.js              # Dashboard del workspace
│   │   ├── files/
│   │   │   ├── page.js          # Browser de archivos
│   │   │   └── [fileId]/
│   │   │       └── page.js      # Review de archivo (video/imagen con comentarios)
│   │   ├── docs/
│   │   │   ├── page.js          # Lista de documentos
│   │   │   └── [docId]/
│   │   │       └── page.js      # Editor Tiptap
│   │   ├── chat/
│   │   │   └── page.js          # Chat del workspace
│   │   ├── members/
│   │   │   └── page.js          # Gestión de miembros (admin+)
│   │   └── settings/
│   │       └── page.js          # Settings del workspace (admin+)
├── invitations/
│   └── [token]/
│       └── page.js              # Accept invitation flow
├── admin/
│   └── clients/
│       ├── page.js              # Lista de todos los clientes/workspaces
│       ├── new/
│       │   └── page.js          # Crear cliente + owner user
│       └── [workspaceId]/
│           └── page.js          # Detalle/edición desde superadmin
```

### 4.2 Server Actions nuevas

Archivos en `app/w/[slug]/actions.js`, `app/admin/clients/actions.js`, `app/invitations/actions.js`:

- `createWorkspace(data)` — solo platform admin/team
- `updateWorkspace(id, data)` — workspace admin+
- `archiveWorkspace(id)` — workspace owner
- `inviteMember(workspaceId, email, role)` — workspace admin+
- `acceptInvitation(token)` — cualquier usuario autenticado con email matching
- `updateMemberRole(workspaceId, userId, role)` — workspace admin+
- `removeMember(workspaceId, userId)` — workspace admin+
- `createFolder(workspaceId, parentId, name)` — editor+
- `uploadFile(workspaceId, folderId, file)` — editor+ (usa signed upload URL)
- `deleteFile(fileId)` — autor o admin
- `createComment(fileId, body, timestamp?, coords?)` — commenter+
- `resolveComment(commentId)` — commenter+
- `createDocument(workspaceId, folderId?, title)` — editor+
- `updateDocument(docId, title, content)` — editor+
- `sendChatMessage(workspaceId, body, attachments)` — commenter+
- `markChatRead(workspaceId, messageId)` — miembro
- `createClientAndOwner(workspaceData, ownerEmail, ownerName)` — platform admin only

### 4.3 Route handlers nuevos

```
app/api/
├── upload/
│   └── sign/
│       └── route.js        # Genera signed URL para upload directo a Storage
├── invitations/
│   └── send/
│       └── route.js        # Envía email de invitación (Resend)
└── notifications/
    └── digest/
        └── route.js        # Cron diario para email digest
```

---

## 5. UI y componentes

### 5.1 Design system — extensión

Mantener tokens existentes. Agregar:

```js
// tailwind.config.js — colores semánticos nuevos
colors: {
  // ... existentes
  'role-owner': '#d9ff00',       // amarillo neón (el primary)
  'role-admin': '#a3e635',       // lime-400
  'role-editor': '#60a5fa',      // blue-400
  'role-commenter': '#c084fc',   // purple-400
  'role-viewer': '#71717a',      // zinc-500
  'status-online': '#10b981',    // emerald
  'status-away': '#f59e0b',      // amber
}
```

### 5.2 Componentes nuevos a crear

Ubicación: `components/workspace/`

- `WorkspaceSwitcher.jsx` — dropdown en el header para cambiar entre workspaces y "sin workspace"
- `WorkspaceSidebar.jsx` — rail lateral con tabs: Dashboard, Archivos, Docs, Chat, Miembros, Config
- `MemberAvatar.jsx` — avatar con dot de estado y tooltip con rol
- `MemberList.jsx` — lista de miembros con popover para cambiar rol (solo admin+)
- `InviteMemberDialog.jsx` — modal para invitar por email + rol
- `FileBrowser.jsx` — grid/lista con breadcrumbs de folders, drag-drop upload
- `FileUploader.jsx` — usa signed URLs, progress bar, multi-file
- `MediaReviewer.jsx` — player de video con timeline de comentarios, o imagen con pins
- `CommentThread.jsx` — thread de comentarios con replies, resolve, mentions
- `DocumentEditor.jsx` — wrapper de Tiptap con toolbar (headings, listas, code, mention, comment marks)
- `DocumentCommentSidebar.jsx` — panel lateral derecho con comentarios del documento
- `ChatPanel.jsx` — chat con mensajes, input con attachments, typing indicator (fase 2), markdown simple
- `NotificationBell.jsx` — campanita en header con dropdown y badge de no leídos
- `ActivityFeed.jsx` — feed de actividad reciente del workspace
- `RoleBadge.jsx` — badge de color según rol de workspace

### 5.3 Consideraciones de estética

- **Mantener minimalismo actual**: mucho negro, acentos amarillo neón solo para CTAs primarias y elementos seleccionados.
- **Glass panels** (clase `.glass-panel` ya existente) para las tarjetas de workspace.
- **Logos de clientes**: mostrar en el sidebar, 32px, fallback a inicial con fondo de `brand_color`.
- **Space Grotesk** en todo (ya es la fuente global).
- **Iconografía**: `react-icons` ya está disponible. Usar `lucide-react` adicionalmente (tiene mejor catálogo para colaboración: `MessageSquare`, `FileText`, `Folder`, `Users`, `Bell`). Agregar como dependencia.

### 5.4 Librerías nuevas a agregar

```json
{
  "@tiptap/react": "^2.10.x",
  "@tiptap/starter-kit": "^2.10.x",
  "@tiptap/extension-placeholder": "^2.10.x",
  "@tiptap/extension-mention": "^2.10.x",
  "@tiptap/extension-link": "^2.10.x",
  "@tiptap/extension-task-list": "^2.10.x",
  "@tiptap/extension-task-item": "^2.10.x",
  "lucide-react": "^0.400.x",
  "date-fns": "^3.6.x",
  "resend": "^4.0.x"
}
```

Colaboración en tiempo real en documentos (Y.js + Hocuspocus) queda para fase 2 — el MVP es last-write-wins con optimistic UI.

---

## 6. Realtime

Tablas con Realtime habilitado (via `alter publication supabase_realtime add table ...`):

- `chat_messages` — insertar/editar en vivo
- `media_comments` — comentarios aparecen sin recargar
- `document_comments` — idem
- `notifications` — badge en vivo
- `workspace_members.last_seen_at` — presencia suave (actualizada cada 30s por heartbeat)

Suscripciones por canal:

```js
supabase
  .channel(`workspace:${workspaceId}:chat`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'chat_messages',
        filter: `workspace_id=eq.${workspaceId}` },
      handler)
  .subscribe()
```

RLS aplica también en Realtime: el usuario solo recibe eventos de tablas que puede leer.

---

## 7. Flujos clave

### 7.1 Onboarding de cliente nuevo (el que pediste)

1. Andrés entra a `/admin/clients/new`
2. Llena: nombre empresa, slug sugerido, plan, email del contacto principal, nombre del contacto
3. Submit ejecuta Server Action `createClientAndOwner`:
   - Crea `workspaces` (type=`client`)
   - Crea folders default (`Brand`, `Entregables`, `Reuniones`, `Documentos`)
   - Busca `auth.users` por email:
     - Si existe → lo agrega como `owner` en `workspace_members`
     - Si no → envía magic link de Supabase para crear cuenta + invitación pendiente en `workspace_invitations` linkeada al email
4. Mail de bienvenida vía Resend con instrucciones y link a `/w/{slug}`
5. Primer login del cliente → llega a `/w/{slug}` y ve un onboarding card: "Bienvenido. Te sugerimos subir tu logo y brand guidelines en la carpeta Brand"

### 7.2 Feedback sobre video

1. Miembro del equipo sube video a carpeta `Entregables` con flag `is_review_asset = true`
2. Cliente recibe notificación in-app + email
3. Cliente abre `/w/{slug}/files/{fileId}`
4. Reproductor con timeline: al pausar en segundo 0:23, ve botón "Comentar aquí"
5. Escribe comentario → se crea `media_comments` con `timestamp_ms = 23000`
6. Equipo recibe notificación, responde en thread
7. Cuando el issue está resuelto, alguien marca como resuelto → `resolved_at = now()`

### 7.3 Documento WYSIWYG colaborativo (MVP)

1. Cualquier editor crea documento: `/w/{slug}/docs/new`
2. Editor Tiptap con autosave cada 2s (debounced)
3. Contenido se guarda como JSON en `documents.content`
4. Otros miembros pueden abrirlo — si alguien más está editando, warning pasivo "Leonor editó hace 5s" (sin locks, last-write-wins)
5. Seleccionar texto → botón "Comentar" → crea `document_comments` con `selection_from/to`
6. Sidebar derecha muestra todos los comentarios del doc, con preview del texto seleccionado

### 7.4 Chat

1. Cada workspace tiene un único canal por ahora
2. Lista de mensajes con scroll infinito hacia arriba
3. Input markdown simple (negritas, listas, links)
4. `@mención` autocompleta miembros → crea `notifications` para el mencionado
5. Adjuntar archivo → sube a Storage con `folder_id=null`, adjunta a `chat_messages.attachments`
6. Mark-as-read implícito al abrir la pestaña (actualiza `chat_reads`)

---

## 8. Seguridad y privacidad — checklist

- [ ] RLS activo en todas las tablas (incluidas las viejas)
- [ ] Service role nunca tocado desde componentes cliente
- [ ] Signed URLs para upload a Storage (expiración 5 min)
- [ ] Signed URLs para download de archivos privados (expiración 1 hora, regeneradas on-demand)
- [ ] Rate limiting en Route Handlers de upload e invitaciones (Vercel middleware)
- [ ] Tokens de invitación: random 32 bytes, expiran 7 días, single-use
- [ ] Emails enviados desde dominio propio (Resend con DKIM) — preferir `notificaciones@dreamware.cl`
- [ ] Logs de actividad sin info sensible (sin contraseñas, sin tokens)
- [ ] Archivos subidos: validación MIME server-side, no solo client-side
- [ ] Cuota por workspace (inicial 5 GB por plan collaboration, 20 GB por generative) — implementar con trigger que suma `size_bytes` y compara

---

## 9. Plan de fases (ver PROMPT_CLAUDE_CODE.md para detalle ejecutable)

| Fase | Objetivo | Días estimados |
|---|---|---|
| **0** | Housekeeping: migraciones versionadas, RLS en tablas viejas, setup de `/supabase/` | 1 |
| **1** | Modelo de workspaces: tablas, RLS, helpers, switcher, rutas `/w/[slug]` vacías | 2 |
| **2** | Archivos: Storage bucket, folders, upload, browser, preview | 2 |
| **3** | Media review: comentarios con timestamp/coords, notificaciones | 2 |
| **4** | Documentos Tiptap: editor, save, comentarios por selección | 2 |
| **5** | Chat: mensajes, attachments, realtime, chat reads | 2 |
| **6** | Panel admin de clientes: onboarding automatizado, invitaciones Resend | 1 |

Total estimado: ~12 días de desarrollo bien aprovechados. En la práctica con Claude Code y Hanna pueden ser menos.

---

## 10. Fuera del alcance del MVP (fase 2+)

Para tener claro el scope y no meter todo:

- Collaborative editing en vivo en documentos (Y.js + Hocuspocus)
- Video calls dentro del workspace
- Múltiples canales/hilos en chat
- Reactions a mensajes
- Versioning de archivos (v1, v2, v3)
- Whiteboard tipo Figma
- Timeline/Gantt de proyectos
- Billing y Stripe integration
- API pública del sistema
- Webhooks para clientes
- SSO / SAML
- Tracking granular de uso de API por workspace
- Analytics y dashboards de actividad
- Mobile app nativa (la web funciona en mobile, pero sin app)

Estos se pueden ir agregando como fases 7+ cuando el MVP esté rodando con clientes reales.

---

*Fin del spec. Ver PROMPT_CLAUDE_CODE.md para la ejecución por fases.*
