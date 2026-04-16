# Levantamiento Técnico — Dreamware AI Studio

> Generado el 2026-04-15. Basado en lectura directa del código fuente. No se ejecutó ningún código ni se modificó ningún archivo.

---

## 1. Stack y versiones

### Runtime principal (Next.js app)

| Tecnología | Versión | Notas |
|---|---|---|
| Next.js | ^15.0.0 | App Router (`app/`), Server Components, Server Actions |
| React | ^19.0.0 | Última versión estable |
| React DOM | ^19.0.0 | |
| Node.js | No especificado en package.json | Inferido por Next.js 15 |
| TypeScript | No usado | Todo el código es `.js` / `.jsx` |

### Supabase

| Librería | Versión |
|---|---|
| `@supabase/supabase-js` | ^2.103.2 |
| `@supabase/ssr` | ^0.10.2 |

### UI / Estilos

| Tecnología | Versión | Notas |
|---|---|---|
| Tailwind CSS | ^3.4.0 | Config custom con design tokens propios |
| PostCSS | ^8.5.6 | |
| Space Grotesk | Google Fonts (via `next/font/google`) | Fuente principal del sistema |

### Package interno (`studio`)

| Tecnología | Versión | Notas |
|---|---|---|
| `studio` (workspace local) | 1.0.0 | `packages/studio/` — compilado con Babel |
| Babel CLI | ^7.28.3 | Transpila JSX para el paquete |
| axios | ^1.7.0 | HTTP client (presente en root y en studio) |
| react-icons | ^5.0.1 | Iconos (solo en studio package) |
| react-hot-toast | ^2.4.1 | Notificaciones toast |

### Empaquetadores alternativos

| Herramienta | Uso |
|---|---|
| Vite | Build alternativo para Electron (entrypoint `index.html`) |
| Electron | ^33.4.11 — build de desktop (`.dmg` / `.exe`) con electron-builder |
| electron-builder | ^25.1.8 |

### Nota sobre el dual-target
El proyecto tiene **dos targets de build**:
1. **Next.js** (web app en producción, con Supabase auth): `npm run dev / build / start`
2. **Electron** (desktop app legado, sin Supabase): `npm run electron:build`

El código Electron original vive en `/src/` y `/electron/`. El código Next.js activo vive en `/app/`, `/components/`, `/hooks/`, `/lib/`.

---

## 2. Estructura de carpetas

```
/Users/andreabustamante/Dreamware-AI-Studio/
├── app/                          # Next.js App Router
│   ├── layout.js                 # Root layout (Space Grotesk, metadata)
│   ├── page.js                   # Redirige a /studio
│   ├── globals.css               # Reset global + CSS variables + utilidades
│   ├── login/
│   │   └── page.js               # Login / Register (email+password)
│   ├── admin/
│   │   ├── layout.js             # Guard: solo role='admin'
│   │   ├── page.js               # Server Component — carga usuarios y settings
│   │   ├── AdminClient.js        # Client Component — UI de administración
│   │   └── actions.js            # Server Actions: setUserRole, banUser, etc.
│   ├── studio/
│   │   └── page.js               # Monta <StandaloneShell />
│   └── api/
│       └── muapi/
│           └── [...path]/
│               └── route.js      # Proxy reverso a https://api.muapi.ai
├── components/
│   ├── StandaloneShell.js        # Shell principal del studio (layout + tabs)
│   └── ApiKeyModal.js            # Modal legacy de key (no usado en Next.js activo)
├── hooks/
│   ├── useSupabaseHistory.js     # CRUD tabla `generations`
│   └── useSupabaseCharacters.js  # CRUD tabla `characters`
├── lib/
│   └── supabase/
│       ├── client.js             # createBrowserClient (client-side)
│       ├── server.js             # createServerClient (RSC / Server Actions)
│       └── admin.js              # createClient con service_role (solo server)
├── packages/
│   └── studio/                   # Workspace npm interno ("studio": "*")
│       ├── package.json
│       ├── src/
│       │   ├── index.js          # Re-exports de todos los componentes + muapi
│       │   ├── muapi.js          # Lógica de API: generate*, uploadFile, poll
│       │   ├── models.js         # Catálogo de modelos (auto-gen desde models_dump.json)
│       │   └── components/
│       │       ├── ImageStudio.jsx
│       │       ├── VideoStudio.jsx
│       │       ├── LipSyncStudio.jsx
│       │       ├── CinemaStudio.jsx
│       │       ├── CharacterStudio.jsx
│       │       └── StoryStudio.jsx
│       └── dist/                 # Build Babel (no rastreado en git)
├── src/                          # Código Electron legacy (NO usado en Next.js)
│   ├── components/               # Versiones antiguas de los studios
│   └── lib/                      # muapi.js, models.js, uploadHistory.js legacy
├── electron/
│   └── main.js                   # Proceso principal Electron
├── public/                       # Archivos estáticos Next.js
│   └── assets/cinema/            # Imágenes .webp de cámaras y lentes para CinemaStudio
├── tailwind.config.js            # Design tokens globales
├── next.config.mjs               # transpilePackages: ['studio']
├── middleware.js                 # Auth guard (Supabase SSR)
├── package.json                  # Root: workspace + deps Next.js
├── models_dump.json              # Fuente de verdad del catálogo de modelos
├── jsconfig.json                 # Alias @/ → ./
├── vite.config.js                # Config para Electron build
└── .env.local                    # Variables de entorno (ver sección 6)
```

---

## 3. Base de datos (Supabase)

No existe directorio `/supabase/` con migraciones. Las tablas se infieren exclusivamente del código. Todas las tablas están en el schema `public`.

### Tabla: `profiles`

**Estado: Confirmado por código** — referenciada en `app/admin/page.js`, `app/admin/layout.js`, `app/admin/actions.js`, `components/StandaloneShell.js`, `hooks/useSupabaseHistory.js`, `hooks/useSupabaseCharacters.js`.

| Columna | Tipo inferido | Observaciones |
|---|---|---|
| `id` | `uuid` (PK) | FK a `auth.users.id` |
| `role` | `text` | Valores observados: `'admin'`, `'team'`, `'free'` |
| `muapi_key` | `text` (nullable) | API key personal del usuario para muapi.ai |
| `credit_limit` | `integer` (nullable) | Límite de créditos. `null` = ilimitado |
| `credits_used` | `integer` | Default inferido: `0` |
| `updated_at` | `timestamptz` | Actualizada en `handleKeySave` y `handleKeyChange` |

**Operaciones observadas:**
- `SELECT 'role' WHERE id = user.id` — en layout admin y StandaloneShell
- `SELECT '*'` — en admin page (listing completo)
- `UPDATE { role }` — `setUserRole()`
- `UPDATE { credit_limit }` — `setUserCreditLimit()`
- `UPDATE { muapi_key, updated_at }` — en `handleKeySave` / `handleKeyChange`

**RLS:** No confirmado en código. El admin accede vía `service_role` (sin RLS). Los usuarios acceden con `anon key` filtrando por `user.id` — requiere política RLS activa para funcionar correctamente.

---

### Tabla: `generations`

**Estado: Confirmado por código** — referenciada en `hooks/useSupabaseHistory.js`.

| Columna | Tipo inferido | Observaciones |
|---|---|---|
| `id` | `uuid` (PK) | Auto-generado por Supabase |
| `user_id` | `uuid` | FK a `auth.users.id` |
| `type` | `text` | Valores: `'image'`, `'video'`, `'lipsync'`, `'cinema'` (y potencialmente `'story'`) |
| `url` | `text` | URL del output generado |
| `prompt` | `text` | Prompt usado. Default `''` |
| `model` | `text` | ID del modelo (ej: `'flux-dev'`, `'kling-v2.1-i2v'`) |
| `metadata` | `jsonb` | Objeto con `aspect_ratio`, `duration`, y campos adicionales |
| `created_at` | `timestamptz` | Auto-generado por Supabase |

**Operaciones observadas:**
- `SELECT * WHERE user_id = X AND type = Y ORDER BY created_at DESC LIMIT 50`
- `INSERT { user_id, type, url, prompt, model, metadata }`
- `DELETE WHERE id = X AND user_id = Y`

**Nota:** `StoryStudio` no tiene hook de history explícito — el componente no recibe `onAddHistory` en `StandaloneShell.js`. El tipo `'story'` no está siendo usado actualmente para persistencia.

---

### Tabla: `characters`

**Estado: Confirmado por código** — referenciada en `hooks/useSupabaseCharacters.js`.

| Columna | Tipo inferido | Observaciones |
|---|---|---|
| `id` | `uuid` (PK) | Se pasa desde el cliente (upsert por `id`) |
| `user_id` | `uuid` | FK a `auth.users.id` |
| `name` | `text` | Nombre del personaje |
| `description` | `text` | Default `''` |
| `trigger_prompt` | `text` | Prompt de trigger para generación. Default `''` |
| `reference_images` | `text[]` (jsonb/array) | URLs de imágenes de referencia. Default `[]` |
| `thumbnail` | `text` (nullable) | URL de imagen de preview |
| `created_at` | `timestamptz` | Auto-generado por Supabase |

**Operaciones observadas:**
- `SELECT * WHERE user_id = X ORDER BY created_at DESC`
- `UPSERT { id, user_id, name, description, trigger_prompt, reference_images, thumbnail } ON CONFLICT id`
- `DELETE WHERE id = X AND user_id = Y`

---

### Tabla: `platform_settings`

**Estado: Confirmado por código** — referenciada en `app/admin/page.js` y `app/admin/actions.js`.

| Columna | Tipo inferido | Observaciones |
|---|---|---|
| `key` | `text` (PK/UNIQUE) | Clave de configuración |
| `value` | `text` | Valor de configuración |
| `updated_at` | `timestamptz` | Actualizada en `savePlatformSetting` |

**Claves observadas:**
- `'central_muapi_key'` — API key central de muapi.ai usada por usuarios `team` y `admin`

**Operaciones observadas:**
- `SELECT * FROM platform_settings`
- `SELECT value WHERE key = X`
- `UPSERT { key, value, updated_at } ON CONFLICT key`

**Advertencia en código:** El comentario en `AdminClient.js` dice: *"Asegúrate de que RLS esté activo en platform_settings"*. El estado de RLS en esta tabla **no está confirmado**.

---

## 4. Autenticación y autorización

### Mecanismo de autenticación

- **Proveedor:** Supabase Auth
- **Método:** Email + password (`signInWithPassword`, `signUp`)
- **Sin OAuth social** (Google, GitHub, etc.) — no hay botones de social login en el código
- **Sesión:** Cookie-based via `@supabase/ssr`. El middleware refresca la sesión en cada request.

### Flujo de autenticación

1. Usuario va a `/login` — formulario email + password.
2. `signInWithPassword` → Supabase establece cookie de sesión.
3. Middleware (`middleware.js`) intercepta rutas `/studio/*` y `/admin/*`:
   - Sin sesión → redirect a `/login`
   - Con sesión en `/login` → redirect a `/studio`
4. Al entrar al studio, `StandaloneShell` verifica sesión client-side y busca `profiles.muapi_key`.
   - Si no tiene key → muestra modal para ingresar key personal.
   - Si tiene key → carga el studio completo.

### Sistema de roles

Definido en tabla `profiles.role`. Tres valores confirmados:

| Rol | Acceso | API Key usada |
|---|---|---|
| `admin` | Admin panel + studio completo | Key central (`central_muapi_key` de `platform_settings`) |
| `team` | Solo studio | Key central de Dreamware |
| `free` | Solo studio | Key personal propia (guardada en `profiles.muapi_key`) |

**Nota importante:** El código actual en `StandaloneShell` solo lee `profiles.muapi_key` sin distinción de rol. La lógica de "usar key central para usuarios team/admin" **está diseñada** (documentada en el panel admin) pero **no está implementada** en el cliente. Todos los usuarios actualmente usan su `muapi_key` personal independientemente del rol.

### Guards implementados

| Ubicación | Tipo | Lógica |
|---|---|---|
| `middleware.js` | Edge (Next.js Middleware) | Bloquea `/studio/*` y `/admin/*` sin sesión |
| `app/admin/layout.js` | Server Component | Verifica `profiles.role === 'admin'`, redirect si no |
| `app/admin/actions.js` `assertAdmin()` | Server Action | Re-verifica role admin antes de cualquier mutación |

### Clientes Supabase

| Archivo | Función exportada | Tipo de client | Contexto de uso |
|---|---|---|---|
| `lib/supabase/client.js` | `createClient()` | `createBrowserClient` | Componentes cliente, hooks |
| `lib/supabase/server.js` | `createClient()` | `createServerClient` (cookies) | RSC, Server Actions, layouts |
| `lib/supabase/admin.js` | `createAdminClient()` | `createClient` con `service_role` | Solo admin page y actions |

---

## 5. Storage

**No hay configuración de Supabase Storage en el código.**

Los archivos (imágenes, audio, video) se suben directamente a **muapi.ai** usando el endpoint `POST /api/v1/upload_file` (a través del proxy `/api/muapi/`). muapi.ai devuelve una URL pública que se almacena en las tablas de Supabase (`generations.url`, `characters.reference_images`, `characters.thumbnail`).

**Implicaciones:**
- Los assets generados no están bajo control del proyecto — dependen de la CDN de muapi.ai.
- No hay bucket de Supabase Storage configurado.
- No hay lógica de expiración, permisos o gestión de archivos propios.
- Si muapi.ai elimina o expira las URLs, los registros en `generations` y `characters` quedan con URLs rotas.

---

## 6. APIs externas y secretos

### Variables de entorno (`.env.local`)

| Variable | Exposición | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Pública (browser) | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública (browser) | Anon key de Supabase (con RLS activo) |
| `SUPABASE_SERVICE_ROLE_KEY` | Privada (server only) | Service role key — bypass RLS, solo usar en server |

### API externa principal: muapi.ai

- **URL base:** `https://api.muapi.ai`
- **Autenticación:** Header `x-api-key`
- **Proxy Next.js:** `app/api/muapi/[...path]/route.js` — reenvía todas las requests a `api.muapi.ai` con la key del header. Evita exponer la key al browser directamente en producción, aunque la key igual viaja en el header de la request del cliente al proxy.
- **Endpoints usados:**

| Endpoint | Método | Función en código |
|---|---|---|
| `/api/v1/{model-endpoint}` | POST | Generación imagen (t2i, i2i) |
| `/api/v1/{model-endpoint}` | POST | Generación video (t2v, i2v, v2v) |
| `/api/v1/{model-endpoint}` | POST | Lip sync |
| `/api/v1/predictions/{requestId}/result` | GET | Polling de resultado |
| `/api/v1/upload_file` | POST (multipart) | Upload de archivos (imagen/audio/video) |
| `/api/v1/account/balance` | GET | Balance de créditos |
| `/api/v1/gpt-5-mini` | POST | LLM para generar story plans (StoryStudio) |

### Modelos disponibles

Definidos en `packages/studio/src/models.js` (auto-generado desde `models_dump.json`). Categorías:

- `t2iModels` — Text-to-Image (ej: `nano-banana`, `flux-dev`, `flux-dev-lora`)
- `i2iModels` — Image-to-Image
- `t2vModels` — Text-to-Video (ej: `seedance-v2.0-t2v`, modelos Kling, Veo)
- `i2vModels` — Image-to-Video (ej: `seedance-v2.0-i2v`, Kling i2v)
- `v2vModels` — Video-to-Video (watermark removal)
- `lipsyncModels`, `imageLipSyncModels`, `videoLipSyncModels`

---

## 7. Módulos funcionales existentes

### 7.1 Image Studio (`ImageStudio.jsx`)

- **Modos:** Text-to-Image (t2i) y Image-to-Image (i2i)
- **Funciones:** Generación con prompt, selección de modelo, aspect ratio, calidad/resolución
- **Upload de referencia:** Soporta hasta N imágenes (según modelo). Upload vía muapi.ai.
- **Characters:**
  - Picker de personajes guardados en sidebar/botón
  - `@mention` en prompt: escribir `@nombre` autocompleta con `triggerPrompt` del personaje y carga sus `referenceImages`
  - Botón "Animate" en cada imagen del historial → lleva la URL a VideoStudio
- **Historial:** Grid de imágenes generadas. Con Supabase: 50 items max, ordenado por `created_at DESC`. Fallback a `localStorage` si no hay hook.
- **Persistencia UI:** `localStorage` key `hg_image_studio_persistent` guarda estado del formulario (modelo, aspect ratio, prompt, URLs).
- **Multi-image:** Modelos que retornan múltiples imágenes (ej: `flux-dev` con `num_images > 1`) — cada output se agrega al historial por separado.

### 7.2 Video Studio (`VideoStudio.jsx`)

- **Modos:** Text-to-Video (t2v), Image-to-Video (i2v), Video-to-Video (v2v / watermark removal)
- **Funciones:** Generación, upload de imagen inicial, upload de video, selección de modelo, aspect ratio, duración, resolución, calidad, mode
- **Seedance 2.0 Extend:** Lógica especial para extender generaciones previas pasando `request_id`.
- **Canvas:** El video generado se muestra en un visor inline antes de pasar al historial.
- **Historial:** Grid de videos (30 items max localmente, 50 en Supabase). Autoplay on hover.
- **Persistencia UI:** `localStorage` key `hg_video_studio_persistent`.

### 7.3 LipSync Studio (`LipSyncStudio.jsx`)

- **Función:** Sincronización de labios en imagen o video con audio
- **Inputs:** Audio (upload), Imagen (upload) o Video (upload), según modelo
- **Modelos:** `lipsyncModels`, `imageLipSyncModels`, `videoLipSyncModels`
- **Parámetros opcionales:** `resolution`, `seed`

### 7.4 Cinema Studio (`CinemaStudio.jsx`)

- **Función:** Generación de imágenes cinematográficas con parámetros de cámara estilo "director"
- **Builder de prompt:** Combina `camera`, `lens`, `focal_length`, `aperture`, `prompt` → llama `generateImage` con modelo `nano-banana`
- **Assets visuales:** Imágenes `.webp` en `/public/assets/cinema/` para cada cámara/lente/apertura
- **Parámetros:** Aspect ratio (16:9, 21:9, 9:16, 1:1, 4:5), resolución (1K, 2K, 4K)

### 7.5 Character Studio (`CharacterStudio.jsx`)

- **Función:** CRUD de personajes con imágenes de referencia y trigger prompt
- **Campos de personaje:** `name`, `description`, `triggerPrompt`, `referenceImages` (hasta 5 URLs), `thumbnail`
- **Storage local fallback:** `localStorage` key `dw_characters` (para Electron / sin Supabase)
- **Con Supabase:** Hook `useSupabaseCharacters` hace upsert en tabla `characters`
- **Upload:** Hasta 5 imágenes por personaje, vía muapi.ai

### 7.6 Story Studio (`StoryStudio.jsx`)

- **Función:** Generador de storyboard AI con N escenas
- **Flujo:**
  1. Usuario ingresa `storyPrompt`, selecciona `sceneCount` (3-12) y `style` (Cinematic, Anime, Noir, Sci-Fi, Fantasy, Horror)
  2. Llama `generateStoryPlan()` → muapi.ai endpoint `gpt-5-mini` → retorna array JSON de escenas
  3. Para cada escena, genera imagen con `generateImage` o `generateI2I` (si hay personaje activo)
- **Personajes:** Acepta `characters` prop — puede usar `referenceImages` de personajes para consistencia visual
- **Persistencia:** `localStorage` key `dw_story_studio`
- **Sin historial Supabase:** No recibe `onAddHistory` en `StandaloneShell.js` actualmente

### 7.7 Shell (`StandaloneShell.js`)

- **Función:** Layout principal — header, sidebar de íconos, routing de tabs
- **Tabs:** image, video, lipsync, cinema, character, story
- **Balance:** Polling de `getUserBalance()` cada 30 segundos con la API key activa
- **Settings modal:** Muestra email, key parcial, botones "Change API Key" y "Sign Out"
- **Cross-studio:** Botón "Animate" en ImageStudio pasa URL a VideoStudio vía `pendingAnimateUrl` + `setActiveTab('video')`

---

## 8. Rutas existentes

### Rutas Next.js (App Router)

| Ruta | Tipo | Auth | Descripción |
|---|---|---|---|
| `/` | RSC | No | Redirect a `/studio` |
| `/login` | Client | No (redirect si autenticado) | Login + registro email/password |
| `/studio` | RSC (monta Client) | Sí | Studio principal — monta `StandaloneShell` |
| `/admin` | RSC + Client | Sí (role=admin) | Panel de administración de usuarios y settings |

### Rutas API (Route Handlers)

| Ruta | Métodos | Auth | Descripción |
|---|---|---|---|
| `/api/muapi/[...path]` | GET, POST | No (key en header) | Proxy reverso a `https://api.muapi.ai`. Transparente — reenvía `x-api-key` del request del cliente. |

### Middleware — Matcher

```js
matcher: ['/studio/:path*', '/admin/:path*', '/admin', '/login']
```

El middleware corre en Edge Runtime y refresca la sesión Supabase en cada request que coincida.

---

## 9. Componentes UI reutilizables

### Componentes en `/components/`

| Componente | Archivo | Descripción |
|---|---|---|
| `StandaloneShell` | `components/StandaloneShell.js` | Layout del studio — header, sidebar rail, tab routing, settings modal, API key modal |
| `ApiKeyModal` | `components/ApiKeyModal.js` | Modal de ingreso de key (versión legacy/Electron — no usado activamente en Next.js) |

### Componentes internos del paquete `studio`

Todos los componentes del paquete tienen sub-componentes inline (no exportados separadamente):

| Componente | Archivo | Sub-componentes notables |
|---|---|---|
| `ImageStudio` | `ImageStudio.jsx` | `UploadButton`, `ModelDropdown`, `SimpleDropdown` |
| `VideoStudio` | `VideoStudio.jsx` | `ModelDropdown`, `DropdownItem`, `ControlBtn` |
| `LipSyncStudio` | `LipSyncStudio.jsx` | `MediaPickerButton` |
| `CinemaStudio` | `CinemaStudio.jsx` | Builder de prompt cinematográfico inline |
| `CharacterStudio` | `CharacterStudio.jsx` | `ImageUploadZone` |
| `StoryStudio` | `StoryStudio.jsx` | `SprocketRow`, `FrameSkeleton` |

### Design tokens (Tailwind + CSS vars)

Definidos en `tailwind.config.js` y `app/globals.css`:

| Token | Valor |
|---|---|
| `primary` / `--color-primary` | `#d9ff00` (amarillo neón) |
| `app-bg` / `--bg-app` | `#0e0e0e` |
| `panel-bg` / `--bg-panel` | `#111111` |
| `card-bg` / `--bg-card` | `#161616` |
| `secondary` | `#a1a1aa` |
| `muted` | `#52525b` |
| `shadow-glow` | `0 0 20px rgba(217,255,0,0.4)` |
| `shadow-glow-soft` | `0 0 24px rgba(217,255,0,0.12)` |
| `shadow-glow-accent` | `0 0 20px rgba(168,85,247,0.4)` |
| `--border-color` | `rgba(255,255,255,0.06)` |
| `--glass-bg` | `rgba(255,255,255,0.03)` |
| Font | `Space Grotesk` (variable `--font-space-grotesk`) |

### Clase utilitaria reutilizable

- `.glass-panel` — backdrop-filter blur(12px) con border y fondo translúcido
- `.custom-scrollbar` — scrollbar de 4px con track transparente
- `.animate-fade-in-up` — animación de entrada (keyframe definido en globals.css)

---

## 10. Realtime

**No hay uso de Supabase Realtime en el código.**

No se encontró ninguna llamada a:
- `supabase.channel()`
- `supabase.from(...).on('INSERT' | 'UPDATE' | 'DELETE', ...)`
- `supabase.removeChannel()`

Todos los datos se cargan mediante queries directas (SELECT) al montar los hooks. No hay suscripciones en tiempo real para historial, personajes, ni ninguna otra entidad.

El polling de balance de créditos (`setInterval` cada 30 segundos en `StandaloneShell`) es polling HTTP manual, no Realtime.

---

## 11. Patrones y convenciones observadas

### Arquitectura

- **Server Components para data fetching inicial:** `app/admin/page.js` carga usuarios y settings server-side antes de pasar a `AdminClient`.
- **Server Actions para mutaciones:** Todas las operaciones de admin (`setUserRole`, `banUser`, `deleteUser`, `savePlatformSetting`) son Server Actions con `'use server'` y `assertAdmin()` guard.
- **Client hooks para data del usuario:** `useSupabaseHistory` y `useSupabaseCharacters` son hooks client-side que hacen queries directas a Supabase desde el browser con `anon key`.
- **Tres clientes Supabase distintos:** `client.js` (browser), `server.js` (RSC/cookies), `admin.js` (service_role). Bien separados y documentados.

### Convenciones de código

- **`'use client'` explícito** en todos los componentes de cliente y hooks.
- **`createClient()` dentro del handler** en login (`const supabase = createClient()` dentro de `handleSubmit`), no en el cuerpo del componente — evita ejecución en SSR.
- **Polling pattern en muapi.js:** `submitAndPoll()` — POST para submit, GET loop para resultado. `maxAttempts` configurable por tipo (60 para imagen, 900 para video).
- **Fallback dual para historial:** Los componentes del paquete `studio` aceptan `historyItems` + `onAddHistory` + `onDeleteHistory` props. Si son `null`/`undefined`, usan `localStorage` propio. Permite uso tanto en Next.js (con Supabase) como en Electron (sin Supabase).
- **Persistencia de UI en localStorage:** Cada studio persiste su estado de formulario con debounce de 500ms. Keys: `hg_image_studio_persistent`, `hg_video_studio_persistent`, `dw_story_studio`, `dw_characters`.
- **Normalización de URLs de output:** `muapi.js` `submitAndPoll()` tiene lógica explícita para normalizar 7+ formas distintas en que la API puede retornar la URL del output.
- **`revalidatePath('/admin')`** llamado después de cada Server Action para invalidar el cache de Next.js.

### Seguridad

- `SUPABASE_SERVICE_ROLE_KEY` nunca se importa en componentes cliente.
- `createAdminClient()` tiene comentario explícito: *"NEVER import this in client components"*.
- La API key del usuario viaja en el header `x-api-key` de requests al proxy `/api/muapi/` — nunca se embebe en el HTML.

---

## 12. Deuda técnica o riesgos identificados

### Críticos

1. **Rol `team`/`admin` no usa key central en el cliente:**
   `StandaloneShell` trata todos los usuarios igual — siempre busca `profiles.muapi_key` personal. La lógica de "usuarios team usan la key central" está documentada en el panel admin pero no implementada en el frontend del studio. Si un usuario tiene rol `team`, el sistema igual le pide su propia key.

2. **Proxy `/api/muapi/` sin autenticación:**
   El Route Handler en `app/api/muapi/[...path]/route.js` no verifica sesión de Supabase. Cualquier request HTTP puede usarlo como proxy a muapi.ai siempre que incluya una key válida en el header. No es un problema si la key es del usuario, pero si se implementa la key central en server-side, este endpoint debería restringirse.

3. **Estado de RLS no verificado:**
   No hay migraciones en el repo. No se puede confirmar si `profiles`, `generations`, `characters` o `platform_settings` tienen RLS activo. Si RLS está desactivado en `profiles`, cualquier usuario autenticado puede leer/modificar perfiles de otros usuarios desde el browser.

4. **`platform_settings` puede ser accedida por usuarios no-admin:**
   La tabla se lee con `service_role` en admin, pero si RLS está desactivado, la key central (`central_muapi_key`) podría ser accesible desde el browser con la `anon key`.

### Moderados

5. **URLs de assets en muapi.ai sin gestión de expiración:**
   Las URLs generadas (imágenes, videos) se guardan en `generations.url` y `characters.reference_images`, pero son URLs externas de muapi.ai. Si expiran o son eliminadas, no hay forma de recuperarlas. No hay mecanismo de re-sincronización.

6. **`StoryStudio` sin persistencia en Supabase:**
   Las generaciones de StoryStudio no se guardan en la tabla `generations`. Si el usuario recarga la página, pierde el storyboard (solo `localStorage`).

7. **`ApiKeyModal.js` en `/components/` es código muerto:**
   El modal legacy existe pero no se importa en ninguna ruta Next.js activa. Solo era relevante para Electron.

8. **Código Electron en `/src/` mezclado con el proyecto Next.js:**
   El directorio `/src/` contiene versiones antiguas de todos los studios. Tailwind los incluye en su `content` array, lo que puede generar CSS innecesario. Confunde la estructura del proyecto.

9. **`console.log` en producción:**
   `app/api/muapi/[...path]/route.js` tiene `console.log('PROXY:', ...)` que imprime URL y body de cada request en los logs de servidor.

10. **`models.js` es auto-generado pero el generador no está en el repo:**
    El comentario dice `// Auto-generated from models_dump.json` pero no hay script de generación. Actualizar modelos requiere proceso manual no documentado.

### Menores

11. **`jsconfig.json` no verificado** — el alias `@/` se asume configurado pero no se leyó el archivo.
12. **No hay tests** — no hay archivos `.test.js`, `.spec.js` ni config de testing (Jest, Vitest, Playwright).
13. **No hay CI/CD configurado** — no hay `.github/workflows/` ni configuración de Vercel detectada en el repo.

---

## 13. Lo que NO existe todavía (relevante para la nueva capa)

Esta sección documenta funcionalidades explícitamente ausentes que serían necesarias para una capa de **gestión de clientes**.

### Modelo de datos

- **No existe tabla `clients` / `organizations` / `workspaces`:** No hay ninguna entidad que agrupe usuarios bajo un cliente o empresa.
- **No existe tabla `invitations`:** No hay mecanismo para invitar usuarios a un workspace.
- **No existe tabla `usage_logs`:** Los créditos usados (`credits_used` en `profiles`) son un counter simple. No hay log granular de qué generaciones consumieron qué cantidad.
- **No existe tabla `billing` / `subscriptions`:** No hay integración con Stripe, Paddle ni ningún sistema de pagos.
- **No existe tabla `api_usage` por cliente:** No hay tracking de uso por cliente/organización.

### Autenticación y autorización

- **No hay roles de cliente:** El sistema actual tiene `admin`, `team`, `free` a nivel de plataforma. No hay concepto de "admin de un cliente específico" vs "miembro de un cliente".
- **No hay multi-tenancy:** Todos los usuarios comparten el mismo espacio. No hay aislamiento de datos por organización.
- **No hay SSO / SAML / OAuth empresarial:** Solo email + password.
- **No hay magic links / invitaciones por email.**

### Funcionalidad de gestión

- **No hay panel para que clientes gestionen sus propios usuarios:** Solo el admin de la plataforma puede gestionar usuarios.
- **No hay límites por cliente** (solo por usuario individual via `credit_limit`).
- **No hay reportes de uso:** El panel admin muestra `credits_used` pero no hay gráficos, exports ni filtros por período.
- **No hay webhooks o notificaciones** cuando un usuario alcanza su límite.

### APIs y extensibilidad

- **No hay API pública del sistema** (solo el proxy de muapi.ai).
- **No hay tokens de API propios** para acceso programático.
- **No hay SDK ni documentación de integración.**

### Infraestructura

- **No hay directorio `/supabase/`** con migraciones versionadas — todas las tablas fueron creadas manualmente (inferido por ausencia de migraciones).
- **No hay seed data** ni scripts de setup de base de datos.
- **No hay entorno de staging** documentado.
- **No hay Supabase Edge Functions.**

---

*Fin del levantamiento técnico. Para verificar el estado exacto de RLS, policies y esquema completo de tablas, consultar directamente el **Supabase Dashboard** del proyecto.*
