import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// MIME → allowed file extensions map.
// Used to detect spoofed MIME types (e.g. "image/png" declared but file is
// actually "malware.exe"). Extension must match the declared MIME.
// ---------------------------------------------------------------------------
const MIME_TO_EXTS = {
  'image/jpeg':       ['jpg', 'jpeg'],
  'image/jpg':        ['jpg', 'jpeg'],
  'image/png':        ['png'],
  'image/gif':        ['gif'],
  'image/webp':       ['webp'],
  'image/svg+xml':    ['svg'],
  'image/heic':       ['heic'],
  'image/heif':       ['heif'],
  'video/mp4':        ['mp4', 'm4v'],
  'video/quicktime':  ['mov', 'qt'],
  'video/webm':       ['webm'],
  'video/x-matroska': ['mkv'],
  'audio/mpeg':       ['mp3'],
  'audio/wav':        ['wav'],
  'audio/ogg':        ['ogg', 'oga'],
  'audio/webm':       ['weba'],
  'audio/aac':        ['aac'],
  'audio/x-m4a':      ['m4a'],
  'audio/flac':       ['flac'],
  'audio/mp4':        ['m4a', 'mp4'],
  'application/pdf':  ['pdf'],
  'application/zip':  ['zip'],
  'text/plain':       ['txt'],
  'text/markdown':    ['md', 'markdown'],
  'text/csv':         ['csv'],
  'application/msword':       ['doc'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':   ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':         ['xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
};

/**
 * Returns true if the filename's extension is valid for the given MIME type.
 * Files without an extension are rejected (no extension = ambiguous = unsafe).
 *
 * @param {string} filename
 * @param {string} mime  - normalized (lowercase) MIME type
 * @returns {boolean}
 */
function extensionMatchesMime(filename, mime) {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!match) return false; // no extension → reject
  const ext     = match[1];
  const allowed = MIME_TO_EXTS[mime];
  return Array.isArray(allowed) && allowed.includes(ext);
}

// ---------------------------------------------------------------------------
// MIME whitelist and blacklist
// Allowlist: explicitly permitted types
// Blocklist: explicitly rejected (executable/dangerous)
// Anything not in either list is rejected by default.
// ---------------------------------------------------------------------------
const MIME_ALLOWLIST = new Set([
  // Images
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
  'image/webp', 'image/svg+xml', 'image/heic', 'image/heif',
  // Video
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
  'audio/aac', 'audio/x-m4a', 'audio/flac', 'audio/mp4',
  // Documents
  'application/pdf',
  'application/zip',
  'text/plain', 'text/markdown', 'text/csv',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const MIME_BLOCKLIST = new Set([
  'application/x-msdownload',
  'application/x-sh',
  'application/x-executable',
  'application/x-msi',
  'application/java-archive',
]);

/**
 * Sanitize a filename for use as part of a Storage object key.
 * - Replaces non [a-zA-Z0-9._-] characters with _
 * - Collapses consecutive underscores
 * - Max 200 chars total (truncates stem, preserves extension)
 * - Falls back to "file" if result is empty
 *
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
  const lastDot = filename.lastIndexOf('.');
  const hasStem = lastDot > 0;
  const stem    = hasStem ? filename.slice(0, lastDot) : filename;
  const ext     = hasStem ? filename.slice(lastDot)    : '';   // includes the dot

  const cleanStem = stem
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const cleanExt = ext
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');

  const safeStem  = cleanStem || 'file';
  const maxStem   = 200 - cleanExt.length;
  const truncated = safeStem.slice(0, Math.max(maxStem, 1));

  return truncated + cleanExt;
}

// ---------------------------------------------------------------------------
// POST /api/upload/sign
//
// Body: { workspace_id, folder_id?, filename, mime_type, size }
// Returns: { upload_url, token, storage_path, file_id }
//
// Validation order:
//   1. Auth — valid session
//   2. Membership — editor+ via is_workspace_member() RPC (single source of truth)
//   3. MIME — blocklist → allowlist → extension/MIME consistency
//   4. Size — <= MAX_BYTES (NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB * 1024 * 1024)
//   5. folder_id — belongs to workspace (if provided)
//
// The upload_url is a Supabase signed URL for a PUT directly to Storage.
// After uploading, the client calls registerUploadedFile() (Server Action)
// to create the files table row.
// ---------------------------------------------------------------------------

/** Max upload size. Controlled by env var, default 50 MB (Supabase Free plan). */
const MAX_BYTES = (parseInt(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB || '50', 10)) * 1024 * 1024;

export async function POST(request) {
  // 1. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const { workspace_id, folder_id = null, filename, mime_type, size } = body;

  if (!workspace_id || !filename || !mime_type || size == null) {
    return Response.json(
      { error: 'Faltan campos requeridos: workspace_id, filename, mime_type, size.' },
      { status: 400 }
    );
  }

  // 2. Membership — editor+ in the workspace.
  // Single source of truth: is_workspace_member() SECURITY DEFINER function in Supabase.
  // It already handles the is_admin() shortcut for platform admins internally,
  // so no separate admin fallback needed here.
  const { data: hasPermission, error: rpcError } = await supabase.rpc(
    'is_workspace_member',
    { wid: workspace_id, min_role: 'editor' }
  );

  if (rpcError) {
    console.error('[upload/sign] is_workspace_member RPC error:', rpcError.message);
    return Response.json(
      { error: 'Error verificando permisos.' },
      { status: 500 }
    );
  }

  if (!hasPermission) {
    return Response.json(
      { error: 'No tienes permiso para subir archivos a este workspace.' },
      { status: 403 }
    );
  }

  // 3. MIME validation
  const normalizedMime = mime_type.toLowerCase().trim();

  if (MIME_BLOCKLIST.has(normalizedMime)) {
    return Response.json(
      { error: 'Este tipo de archivo no está permitido por razones de seguridad.' },
      { status: 415 }
    );
  }

  if (!MIME_ALLOWLIST.has(normalizedMime)) {
    return Response.json(
      { error: 'Tipo de archivo no soportado. Contacta a tu administrador si necesitas este formato.' },
      { status: 415 }
    );
  }

  // 3b. Extension / MIME consistency check.
  // Prevents spoofing attacks where a malicious file is sent with a trusted
  // MIME type (e.g. mime_type="image/png" but filename="malware.exe").
  if (!extensionMatchesMime(filename, normalizedMime)) {
    return Response.json(
      { error: 'La extensión del archivo no coincide con su tipo declarado.' },
      { status: 400 }
    );
  }

  // 4. Size validation
  if (typeof size !== 'number' || size <= 0) {
    return Response.json({ error: 'Tamaño de archivo inválido.' }, { status: 400 });
  }

  if (size > MAX_BYTES) {
    const limitMB = MAX_BYTES / (1024 * 1024);
    return Response.json(
      { error: `El archivo supera el límite de ${limitMB} MB. Elige un archivo más pequeño.` },
      { status: 413 }
    );
  }

  // 5. Validate folder_id belongs to workspace (if provided)
  if (folder_id) {
    const { data: folder } = await supabase
      .from('folders')
      .select('id')
      .eq('id', folder_id)
      .eq('workspace_id', workspace_id)
      .single();

    if (!folder) {
      return Response.json(
        { error: 'La carpeta especificada no existe en este workspace.' },
        { status: 400 }
      );
    }
  }

  // All validations passed — generate the signed URL
  const admin        = createAdminClient();
  const file_id      = randomUUID();
  const safeName     = sanitizeFilename(filename);
  const storage_path = `${workspace_id}/${file_id}-${safeName}`;

  const { data: signedData, error: signError } = await admin.storage
    .from('workspace-files')
    .createSignedUploadUrl(storage_path);

  if (signError || !signedData) {
    console.error('[upload/sign] createSignedUploadUrl error:', signError?.message);
    return Response.json(
      { error: 'Error al generar la URL de subida. Inténtalo de nuevo.' },
      { status: 500 }
    );
  }

  return Response.json({
    upload_url:   signedData.signedUrl,
    token:        signedData.token,
    storage_path,
    file_id,
  });
}
