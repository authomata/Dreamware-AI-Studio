import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FileText, Plus, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

export default async function DocsPage({ params }) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect('/');

  const supabase    = await createClient();
  const adminClient = createAdminClient();

  // Fetch all documents for this workspace
  const { data: docs } = await supabase
    .from('documents')
    .select('id, title, created_by, updated_by, created_at, updated_at, folder_id')
    .eq('workspace_id', workspace.id)
    .order('updated_at', { ascending: false });

  // Batch fetch profiles for creators
  const allUserIds = [...new Set([
    ...(docs || []).map(d => d.created_by),
    ...(docs || []).map(d => d.updated_by),
  ].filter(Boolean))];

  let profileMap = {};
  let emailMap   = {};

  if (allUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', allUserIds);

    profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

    const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    emailMap = Object.fromEntries((authUsers || []).map(u => [u.id, u.email]));
  }

  const canCreate = ['owner', 'admin', 'editor'].includes(workspace.member_role);

  function displayName(userId) {
    const p = profileMap[userId];
    return p?.full_name || emailMap[userId] || 'Usuario';
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Documentos</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {(docs || []).length} {(docs || []).length === 1 ? 'documento' : 'documentos'} en {workspace.name}
          </p>
        </div>

        {canCreate && (
          <Link
            href={`/w/${slug}/docs/new`}
            className="flex items-center gap-2 px-4 py-2 bg-[#d9ff00] text-black text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Nuevo documento
          </Link>
        )}
      </div>

      {/* Document list */}
      {(docs || []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="w-12 h-12 text-zinc-700 mb-4" />
          <p className="text-zinc-500 text-sm">Aún no hay documentos.</p>
          {canCreate && (
            <p className="text-zinc-700 text-xs mt-1">
              Crea el primero con el botón de arriba.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {(docs || []).map((doc) => (
            <Link
              key={doc.id}
              href={`/w/${slug}/docs/${doc.id}`}
              className="
                flex items-center gap-4 p-4 rounded-xl
                border border-zinc-800 bg-zinc-950/50
                hover:bg-zinc-900/50 hover:border-zinc-700
                transition-colors group
              "
            >
              <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {doc.title || 'Sin título'}
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  Creado por {displayName(doc.created_by)}
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-zinc-600 shrink-0">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(doc.updated_at), { addSuffix: true, locale: es })}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
