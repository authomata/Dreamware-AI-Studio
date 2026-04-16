import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { archiveClient, restoreClient } from './actions';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/');
}

const PLAN_LABELS = {
  collaboration: 'Collaboration',
  generative:    'Generative',
};

export default async function ClientsPage() {
  await assertAdmin();
  const admin = createAdminClient();

  // Fetch all workspaces (all types, including archived)
  const { data: workspaces } = await admin
    .from('workspaces')
    .select(`
      id, name, slug, type, plan, logo_url, brand_color,
      created_at, archived_at,
      member_count:workspace_members(count)
    `)
    .order('created_at', { ascending: false });

  const activeWs   = (workspaces || []).filter(w => !w.archived_at);
  const archivedWs = (workspaces || []).filter(w =>  w.archived_at);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Clientes / Workspaces</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {activeWs.length} activos · {archivedWs.length} archivados
          </p>
        </div>
        <Link
          href="/admin/clients/new"
          className="flex items-center gap-2 px-4 py-2 bg-[#d9ff00] text-black text-sm font-semibold rounded-lg hover:bg-yellow-300 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo cliente
        </Link>
      </div>

      {/* Active workspaces */}
      <WorkspaceTable workspaces={activeWs} showRestore={false} />

      {/* Archived */}
      {archivedWs.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
            Archivados ({archivedWs.length})
          </h2>
          <WorkspaceTable workspaces={archivedWs} showRestore />
        </div>
      )}
    </div>
  );
}

function WorkspaceTable({ workspaces, showRestore }) {
  if (!workspaces.length) {
    return (
      <div className="text-center py-10 text-zinc-600 border border-zinc-900 rounded-xl">
        No hay workspaces.
      </div>
    );
  }

  return (
    <div className="border border-zinc-900 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-900 text-zinc-500 text-xs uppercase tracking-wider">
            <th className="text-left p-4">Workspace</th>
            <th className="text-left p-4">Tipo</th>
            <th className="text-left p-4">Plan</th>
            <th className="text-left p-4">Miembros</th>
            <th className="text-left p-4">Creado</th>
            <th className="p-4" />
          </tr>
        </thead>
        <tbody>
          {workspaces.map((ws) => {
            const brandBg      = ws.brand_color || '#d9ff00';
            const brandInitial = ws.name.charAt(0).toUpperCase();
            const memberCount  = ws.member_count?.[0]?.count ?? 0;

            return (
              <tr key={ws.id} className="border-b border-zinc-900 last:border-0 hover:bg-zinc-900/30 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    {ws.logo_url ? (
                      <img src={ws.logo_url} alt={ws.name} className="w-8 h-8 rounded-lg object-cover" />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-black font-bold text-xs"
                        style={{ backgroundColor: brandBg }}
                      >
                        {brandInitial}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-white">{ws.name}</p>
                      <p className="text-xs text-zinc-600">/w/{ws.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4 text-zinc-400 capitalize">{ws.type}</td>
                <td className="p-4">
                  <span className="text-xs px-2 py-0.5 rounded border border-zinc-700 text-zinc-400">
                    {PLAN_LABELS[ws.plan] || ws.plan}
                  </span>
                </td>
                <td className="p-4 text-zinc-400">{memberCount}</td>
                <td className="p-4 text-zinc-500 text-xs">
                  {formatDistanceToNow(new Date(ws.created_at), { addSuffix: true, locale: es })}
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2 justify-end">
                    {!showRestore ? (
                      <>
                        <Link
                          href={`/w/${ws.slug}`}
                          className="text-xs px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors"
                        >
                          Ver
                        </Link>
                        <form action={archiveClient.bind(null, ws.id)}>
                          <button
                            type="submit"
                            className="text-xs px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-500 transition-colors"
                          >
                            Archivar
                          </button>
                        </form>
                      </>
                    ) : (
                      <form action={restoreClient.bind(null, ws.id)}>
                        <button
                          type="submit"
                          className="text-xs px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors"
                        >
                          Restaurar
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
