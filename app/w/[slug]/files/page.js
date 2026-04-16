import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import FileBrowser from '@/components/workspace/FileBrowser';
import { FolderOpen } from 'lucide-react';
import { formatBytes } from '@/components/workspace/FileIcon';

export const dynamic = 'force-dynamic';

/**
 * Build the full breadcrumb chain for a given folder_id by walking up
 * the parent_id tree. Returns array ordered from root to current.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string|null} folderId
 * @param {string} workspaceId
 * @param {string} workspaceSlug
 * @returns {Promise<Array<{ id: string|null, name: string }>>}
 */
async function buildBreadcrumbs(supabase, folderId, workspaceId, workspaceSlug) {
  const crumbs = [{ id: null, name: 'Archivos' }];
  if (!folderId) return crumbs;

  // Walk up the tree collecting ancestors (max depth guard: 20 levels)
  const chain = [];
  let current = folderId;
  for (let i = 0; i < 20 && current; i++) {
    const { data: folder } = await supabase
      .from('folders')
      .select('id, name, parent_id')
      .eq('id', current)
      .eq('workspace_id', workspaceId)
      .single();

    if (!folder) break;
    chain.unshift({ id: folder.id, name: folder.name });
    current = folder.parent_id;
  }

  return [...crumbs, ...chain];
}

export default async function FilesPage({ params, searchParams }) {
  const { slug }   = await params;
  const { folder } = await searchParams;
  const folderId   = folder || null;

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect('/');

  const supabase      = await createClient();
  const workspaceId   = workspace.id;

  // Fetch folders at current level
  let folderQuery = supabase
    .from('folders')
    .select('id, name, parent_id, created_at')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });

  folderQuery = folderId
    ? folderQuery.eq('parent_id', folderId)
    : folderQuery.is('parent_id', null);

  const { data: folders } = await folderQuery;

  // Fetch files at current level
  let fileQuery = supabase
    .from('files')
    .select('id, name, mime_type, size_bytes, created_at, is_review_asset, folder_id, uploaded_by')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  fileQuery = folderId
    ? fileQuery.eq('folder_id', folderId)
    : fileQuery.is('folder_id', null);

  const { data: files } = await fileQuery;

  // Breadcrumbs
  const breadcrumbs = await buildBreadcrumbs(supabase, folderId, workspaceId, slug);

  const canEdit = ['owner', 'admin', 'editor'].includes(workspace.member_role);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FolderOpen className="w-5 h-5 text-zinc-400" />
          <div>
            <h1 className="text-lg font-bold text-white">Archivos</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {workspace.storage_used_bytes
                ? `${formatBytes(workspace.storage_used_bytes)} usados`
                : 'Sin archivos aún'}
            </p>
          </div>
        </div>
      </div>

      <FileBrowser
        workspace={{ id: workspaceId, slug }}
        folders={folders || []}
        files={files || []}
        currentFolderId={folderId}
        breadcrumbs={breadcrumbs}
        canEdit={canEdit}
      />
    </div>
  );
}
