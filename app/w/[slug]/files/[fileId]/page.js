import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import { FileIcon as FileIconComponent, formatBytes, mimeLabel } from '@/components/workspace/FileIcon';
import FileIcon from '@/components/workspace/FileIcon';
import { ArrowLeft, Star, Download } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import FileDetailClient from './FileDetailClient';

export const dynamic = 'force-dynamic';

export default async function FileDetailPage({ params, searchParams }) {
  const { slug, fileId }   = await params;
  const { c: focusCommentId } = (await searchParams) || {};

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect('/');

  const supabase = await createClient();
  const admin    = createAdminClient();

  // ── Fetch file record ──────────────────────────────────────────────────────
  const { data: file } = await supabase
    .from('files')
    .select('id, name, mime_type, size_bytes, created_at, is_review_asset, storage_path, folder_id, uploaded_by, metadata')
    .eq('id', fileId)
    .eq('workspace_id', workspace.id)
    .single();

  if (!file) notFound();

  // ── Uploader info ──────────────────────────────────────────────────────────
  const { data: uploaderProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', file.uploaded_by)
    .single();

  let uploaderEmail = null;
  try {
    const { data: { user: uploaderUser } } = await admin.auth.admin.getUserById(file.uploaded_by);
    uploaderEmail = uploaderUser?.email;
  } catch { /* non-fatal */ }

  const uploaderName = uploaderProfile?.full_name || uploaderEmail || 'Usuario';

  // ── Folder breadcrumb ──────────────────────────────────────────────────────
  let folderName = null;
  if (file.folder_id) {
    const { data: folder } = await supabase
      .from('folders')
      .select('name')
      .eq('id', file.folder_id)
      .single();
    folderName = folder?.name;
  }

  // ── Signed URL (1-hour expiry) ─────────────────────────────────────────────
  const { data: signedData } = await admin.storage
    .from('workspace-files')
    .createSignedUrl(file.storage_path, 3600);

  const signedUrl = signedData?.signedUrl || null;

  // ── Current user ──────────────────────────────────────────────────────────
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  // ── Phase 3: fetch initial comments ───────────────────────────────────────
  const { data: rawComments } = await supabase
    .from('media_comments')
    .select('id, body, timestamp_ms, x_percent, y_percent, resolved_at, resolved_by, parent_id, created_at, author_id')
    .eq('file_id', fileId)
    .order('created_at', { ascending: true });

  const comments = rawComments || [];

  // Fetch profiles for all unique authors + resolvers in one batch.
  // Admin client used here for the batch fetch — SSR client works too now that
  // shares_workspace_with() policy is applied, but admin avoids any RLS edge case.
  const authorIds   = comments.map((c) => c.author_id);
  const resolverIds = comments.filter((c) => c.resolved_by).map((c) => c.resolved_by);
  const allProfileIds = [...new Set([...authorIds, ...resolverIds])];
  let profileMap = {};

  if (allProfileIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', allProfileIds);

    profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  }

  // Build email map for all comment participants so we can fall back to email
  // when full_name is null (common before users fill in their profile).
  const commentUserIds = [...new Set([...authorIds, ...resolverIds])];
  let commentEmailMap = {};
  if (commentUserIds.length > 0) {
    const { data: { users: commentAuthUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
    commentEmailMap = Object.fromEntries(
      (commentAuthUsers || [])
        .filter((u) => commentUserIds.includes(u.id))
        .map((u) => [u.id, u.email])
    );
  }

  // Enrich comments with author + resolver data (profile + email fallback)
  const initialComments = comments.map((c) => ({
    ...c,
    author: {
      ...(profileMap[c.author_id] || { id: c.author_id, full_name: null, avatar_url: null }),
      email: commentEmailMap[c.author_id] || null,
    },
    resolver: c.resolved_by
      ? {
          ...(profileMap[c.resolved_by] || { id: c.resolved_by, full_name: null, avatar_url: null }),
          email: commentEmailMap[c.resolved_by] || null,
        }
      : null,
  }));

  // ── Derived state ──────────────────────────────────────────────────────────
  const canEdit = ['owner', 'admin', 'editor'].includes(workspace.member_role);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-900 shrink-0">
        <a
          href={file.folder_id
            ? `/w/${slug}/files?folder=${file.folder_id}`
            : `/w/${slug}/files`}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </a>

        <FileIcon mimeType={file.mime_type} className="w-5 h-5" />

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-white truncate">{file.name}</h1>
          {folderName && (
            <p className="text-xs text-zinc-500">{folderName}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {file.is_review_asset && (
            <span className="flex items-center gap-1 text-xs text-[#d9ff00] border border-[#d9ff00]/30 px-2 py-0.5 rounded">
              <Star className="w-3 h-3" />
              Review
            </span>
          )}
          {signedUrl && (
            <a
              href={signedUrl}
              download={file.name}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar
            </a>
          )}
        </div>
      </div>

      {/* ── File metadata strip (always visible) ────────────────────────────── */}
      <div className="flex items-center gap-6 px-6 py-2.5 border-b border-zinc-900/50 text-xs text-zinc-500 shrink-0 flex-wrap">
        <MetaChip label="Tipo"     value={mimeLabel(file.mime_type)} />
        <MetaChip label="Tamaño"   value={formatBytes(file.size_bytes)} />
        <MetaChip label="Subido por" value={uploaderName} />
        <MetaChip
          label="Fecha"
          value={formatDistanceToNow(new Date(file.created_at), { addSuffix: true, locale: es })}
        />
        {file.metadata?.width && file.metadata?.height && (
          <MetaChip label="Dimensiones" value={`${file.metadata.width} × ${file.metadata.height}`} />
        )}
      </div>

      {/* ── Interactive split panel (client component) ──────────────────────── */}
      <FileDetailClient
        file={file}
        workspace={{ id: workspace.id, slug, member_role: workspace.member_role }}
        signedUrl={signedUrl}
        initialComments={initialComments}
        profileMap={profileMap}
        currentUserId={currentUser?.id}
        initialFocusedCommentId={focusCommentId || null}
      />
    </div>
  );
}

function MetaChip({ label, value }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-zinc-700">{label}:</span>
      <span className="text-zinc-400">{value}</span>
    </span>
  );
}
