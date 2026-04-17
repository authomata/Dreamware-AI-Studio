'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  MessageSquare,
  Users,
  Settings,
} from 'lucide-react';
import { LIVE_PHASE } from '@/components/workspace/phase-status';

const NAV_ITEMS = [
  { label: 'Dashboard',  href: '',         icon: LayoutDashboard, phase: 1 },
  { label: 'Archivos',   href: '/files',   icon: FolderOpen,      phase: 2 },
  { label: 'Docs',       href: '/docs',    icon: FileText,         phase: 4 },
  { label: 'Chat',       href: '/chat',    icon: MessageSquare,   phase: 5 },
  { label: 'Miembros',   href: '/members', icon: Users,           phase: 1 },
  { label: 'Config',     href: '/settings',icon: Settings,        phase: 1, adminOnly: true },
];

/**
 * WorkspaceSidebar — vertical navigation rail for a workspace.
 * Renders on the left of all /w/[slug]/* pages.
 *
 * @param {{ workspace: import('@/lib/workspace/getWorkspaceBySlug').WorkspaceWithMembership }} props
 */
/**
 * @param {{
 *   workspace: import('@/lib/workspace/getWorkspaceBySlug').WorkspaceWithMembership,
 *   chatUnread?: number
 * }} props
 */
export default function WorkspaceSidebar({ workspace, chatUnread = 0 }) {
  const pathname  = usePathname();
  const base      = `/w/${workspace.slug}`;
  const isAdmin   = ['owner', 'admin'].includes(workspace.member_role);

  const brandBg      = workspace.brand_color || '#d9ff00';
  const brandInitial = workspace.name.charAt(0).toUpperCase();

  return (
    <aside className="
      w-56 shrink-0 border-r border-zinc-900 flex flex-col
      bg-black min-h-screen
    ">
      {/* Workspace brand header */}
      <div className="p-4 border-b border-zinc-900">
        <Link href={base} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          {workspace.logo_url ? (
            <img
              src={workspace.logo_url}
              alt={workspace.name}
              className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-black font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: brandBg }}
            >
              {brandInitial}
            </div>
          )}
          <span className="text-sm font-semibold text-white truncate">
            {workspace.name}
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          if (item.adminOnly && !isAdmin) return null;

          const href    = `${base}${item.href}`;
          const isActive = item.href === ''
            ? pathname === base
            : pathname.startsWith(href);
          const isLive   = item.phase <= LIVE_PHASE;
          const unread   = item.label === 'Chat' && !isActive ? chatUnread : 0;

          if (!isLive) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-700 cursor-default"
                title={`Próximamente — Fase ${item.phase}`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{item.label}</span>
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={href}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                ${isActive
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'}
              `}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {unread > 0 && (
                <span className="ml-auto text-xs font-semibold bg-zinc-600 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Back to studio link */}
      <div className="p-3 border-t border-zinc-900">
        <Link
          href="/studio"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          ← Volver al Studio
        </Link>
      </div>
    </aside>
  );
}
