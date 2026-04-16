import { redirect } from 'next/navigation';
import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import WorkspaceSidebar from '@/components/workspace/WorkspaceSidebar';

export const dynamic = 'force-dynamic';

/**
 * Workspace layout — guards access by verifying membership.
 * If the workspace does not exist or the user is not a member, redirects to /.
 * Wraps all /w/[slug]/* pages with the sidebar navigation.
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
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
