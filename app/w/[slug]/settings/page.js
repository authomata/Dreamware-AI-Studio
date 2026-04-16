import { redirect } from 'next/navigation';
import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import WorkspaceSettingsForm from '@/components/workspace/WorkspaceSettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);

  if (!workspace) redirect('/');

  // Only admins and owners can access settings
  if (!['owner', 'admin'].includes(workspace.member_role)) {
    redirect(`/w/${slug}`);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Configuración</h1>
        <p className="text-sm text-zinc-500 mt-1">{workspace.name}</p>
      </div>

      <WorkspaceSettingsForm workspace={workspace} />
    </div>
  );
}
