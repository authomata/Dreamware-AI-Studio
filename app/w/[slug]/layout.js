import { redirect } from 'next/navigation';
import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import WorkspaceSidebar from '@/components/workspace/WorkspaceSidebar';
import NotificationBell from '@/components/workspace/NotificationBell';

export const dynamic = 'force-dynamic';

/**
 * Workspace layout — guards access by verifying membership.
 * If the workspace does not exist or the user is not a member, redirects to /.
 * Wraps all /w/[slug]/* pages with the sidebar + a top-bar that holds the
 * NotificationBell (workspace-scoped, Phase 3+).
 */
export default async function WorkspaceLayout({ children, params }) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);

  // Redirect if workspace not found or user has no membership
  if (!workspace || !workspace.member_role) {
    redirect('/');
  }

  return (
    <div className="flex min-h-screen bg-black text-white">
      <WorkspaceSidebar workspace={workspace} />

      {/* Right-side content column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Workspace top bar — notification bell lives here */}
        <header className="h-11 flex items-center justify-end px-4 border-b border-zinc-900 shrink-0">
          <NotificationBell workspaceId={workspace.id} />
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
