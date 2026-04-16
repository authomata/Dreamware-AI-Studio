import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RoleBadge from '@/components/workspace/RoleBadge';
import MemberAvatar from '@/components/workspace/MemberAvatar';
import { FolderOpen, MessageSquare, FileText, Activity } from 'lucide-react';

export const dynamic = 'force-dynamic';

/** Dashboard placeholder cards — feature modules to be activated in later phases */
const PHASE_CARDS = [
  {
    icon: FolderOpen,
    title: 'Archivos',
    description: 'Sube y organiza tus archivos en carpetas.',
    href: 'files',
    phase: 2,
    color: 'text-yellow-400',
  },
  {
    icon: FileText,
    title: 'Docs',
    description: 'Crea y edita documentos colaborativos.',
    href: 'docs',
    phase: 4,
    color: 'text-blue-400',
  },
  {
    icon: MessageSquare,
    title: 'Chat',
    description: 'Conversa con el equipo en tiempo real.',
    href: 'chat',
    phase: 5,
    color: 'text-purple-400',
  },
  {
    icon: Activity,
    title: 'Actividad',
    description: 'Historial de cambios del workspace.',
    href: '#',
    phase: 6,
    color: 'text-green-400',
  },
];

export default async function WorkspaceDashboard({ params }) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);

  if (!workspace) redirect('/');

  // Fetch members for the header display
  const supabase = await createClient();
  const { data: members } = await supabase
    .from('workspace_members')
    .select(`
      id, role, joined_at,
      profile:profiles (id, full_name, avatar_url, email:id)
    `)
    .eq('workspace_id', workspace.id)
    .order('joined_at', { ascending: true })
    .limit(10);

  // Get emails from auth (profiles table has id but not email directly via anon key)
  // We'll just show what we have from profiles
  const memberList = members || [];

  const brandInitial = workspace.name.charAt(0).toUpperCase();
  const brandBg      = workspace.brand_color || '#d9ff00';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Workspace header */}
      <div className="flex items-center gap-4 mb-8">
        {workspace.logo_url ? (
          <img
            src={workspace.logo_url}
            alt={workspace.name}
            className="w-12 h-12 rounded-lg object-cover"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-black font-bold text-xl"
            style={{ backgroundColor: brandBg }}
          >
            {brandInitial}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">{workspace.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">
              {workspace.type === 'client' ? 'Cliente' : 'Interno'}
            </span>
            <span className="text-zinc-700">·</span>
            <RoleBadge role={workspace.member_role} />
          </div>
        </div>
      </div>

      {/* Member avatars */}
      {memberList.length > 0 && (
        <div className="mb-8">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            {memberList.length} {memberList.length === 1 ? 'miembro' : 'miembros'}
          </p>
          <div className="flex -space-x-2">
            {memberList.slice(0, 8).map((m) => (
              <MemberAvatar
                key={m.id}
                member={m}
                size="sm"
              />
            ))}
            {memberList.length > 8 && (
              <div className="w-8 h-8 rounded-full bg-zinc-800 border-2 border-black flex items-center justify-center text-xs text-zinc-400">
                +{memberList.length - 8}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feature phase cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PHASE_CARDS.map((card) => {
          const Icon = card.icon;
          const isReady = card.phase <= 1; // only phase 1 features are live
          return (
            <div
              key={card.title}
              className={`
                glass-panel rounded-xl p-5 border border-zinc-800
                ${isReady
                  ? 'cursor-pointer hover:border-zinc-600 transition-colors'
                  : 'opacity-50 cursor-default'}
              `}
            >
              <div className="flex items-start gap-3">
                <Icon className={`w-5 h-5 mt-0.5 ${card.color}`} />
                <div>
                  <h3 className="font-semibold text-white">{card.title}</h3>
                  <p className="text-sm text-zinc-400 mt-1">{card.description}</p>
                  {!isReady && (
                    <span className="inline-block mt-2 text-xs text-zinc-600 border border-zinc-700 rounded px-2 py-0.5">
                      Próximamente — Fase {card.phase}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick actions for admin+ */}
      {['owner', 'admin'].includes(workspace.member_role) && (
        <div className="mt-8 p-4 border border-zinc-800 rounded-xl">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Acciones rápidas</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/w/${slug}/members`}
              className="text-sm px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Gestionar miembros
            </a>
            <a
              href={`/w/${slug}/settings`}
              className="text-sm px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Configuración
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
