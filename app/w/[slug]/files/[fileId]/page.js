import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import FilePreview from '@/components/workspace/FilePreview';
import { FileIcon as FileIconComponent, formatBytes, mimeLabel } from '@/components/workspace/FileIcon';
import FileIcon from '@/components/workspace/FileIcon';
import { ArrowLeft, Star, Download } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

export default async function FileDetailPage({ params }) {
  const { slug, fileId } = await params;

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect('/');

  const supabase  = await createClient();
  const admin     = createAdminClient();

  // Fetch file record
  const { data: file } = await supabase
    .from('files')
    .select('id, name, mime_type, size_bytes, created_at, is_review_asset, storage_path, folder_id, uploaded_by, metadata')
    .eq('id', fileId)
    .eq('workspace_id', workspace.id)
    .single();

  if (!file) notFound();

  // Get uploader profile
  const { data: uploaderProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', file.uploaded_by)
    .single();

  // Get uploader email (admin client)
  let uploaderEmail = null;
  try {
    const { data: { user: uploaderUser } } = await admin.auth.admin.getUserById(file.uploaded_by);
    uploaderEmail = uploaderUser?.email;
  } catch { /* non-fatal */ }

  const uploaderName = uploaderProfile?.full_name || uploaderEmail || 'Usuario';

  // Get folder name for breadcrumb
  let folderName = null;
  if (file.folder_id) {
    const { data: folder } = await supabase
      .from('folders')
      .select('name')
      .eq('id', file.folder_id)
      .single();
    folderName = folder?.name;
  }

  // Generate signed URL server-side (1-hour expiry)
  const { data: signedData } = await admin.storage
    .from('workspace-files')
    .createSignedUrl(file.storage_path, 3600);

  const signedUrl = signedData?.signedUrl || null;

  const canEdit = ['owner', 'admin', 'editor'].includes(workspace.member_role);

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-900">
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

      {/* Main layout: preview left, metadata right */}
      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-65px)]">
        {/* Preview area */}
        <div className="flex-1 flex items-center justify-center p-6 bg-zinc-950/50">
          <div className="w-full max-w-4xl">
            <FilePreview file={file} signedUrl={signedUrl} />
          </div>
        </div>

        {/* Metadata sidebar */}
        <aside className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-zinc-900 p-5 space-y-5">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Detalles</p>
            <dl className="space-y-2.5">
              <MetaRow label="Tipo"     value={mimeLabel(file.mime_type)} />
              <MetaRow label="Tamaño"   value={formatBytes(file.size_bytes)} />
              <MetaRow label="Subido por" value={uploaderName} />
              <MetaRow
                label="Fecha"
                value={formatDistanceToNow(new Date(file.created_at), { addSuffix: true, locale: es })}
              />
              {file.metadata?.width && file.metadata?.height && (
                <MetaRow label="Dimensiones" value={`${file.metadata.width} × ${file.metadata.height}`} />
              )}
            </dl>
          </div>

          {/* Phase 3 placeholder */}
          <div className="p-4 border border-zinc-800/50 rounded-xl">
            <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">Comentarios</p>
            <p className="text-xs text-zinc-700">
              Los comentarios con timestamp llegan en la Fase 3 — Media Review.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-xs text-zinc-300 text-right">{value}</dd>
    </div>
  );
}
