import { redirect } from 'next/navigation';
import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import { createClient } from '@/lib/supabase/server';
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

  // ── Chat unread count ─────────────────────────────────────────────────────
  // Count messages newer than the user's last-read timestamp.
  // Falls back to 0 silently if the table doesn't exist yet (pre-migration).
  let chatUnread = 0;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Get last-read position
      const { data: readRow } = await supabase
        .from('chat_reads')
        .select('last_read_at')
        .eq('workspace_id', workspace.id)
        .eq('user_id', user.id)
        .single();

      const lastReadAt = readRow?.last_read_at ?? '1970-01-01T00:00:00Z';

      // Count messages after that timestamp, authored by others
      const { count } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspace.id)
        .neq('author_id', user.id)
        .gt('created_at', lastReadAt);

      chatUnread = count ?? 0;
    }
  } catch {
    // Table not yet created or any other error — silently ignore
    chatUnread = 0;
  }

  return (
    <div className="flex min-h-screen bg-black text-white">
      <WorkspaceSidebar workspace={workspace} chatUnread={chatUnread} />

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
