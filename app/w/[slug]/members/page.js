import { redirect } from 'next/navigation';
import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import MemberList from '@/components/workspace/MemberList';
import InviteMemberDialog from '@/components/workspace/InviteMemberDialog';

export const dynamic = 'force-dynamic';

export default async function MembersPage({ params }) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);

  if (!workspace) redirect('/');

  const supabase      = await createClient();
  const adminClient   = createAdminClient();

  // Fetch all members with their profile data
  const { data: members } = await supabase
    .from('workspace_members')
    .select(`
      id, role, joined_at, last_seen_at, invited_by,
      profile:profiles (id, full_name, avatar_url)
    `)
    .eq('workspace_id', workspace.id)
    .order('joined_at', { ascending: true });

  // Fetch auth emails (service role needed to read auth.users)
  const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = Object.fromEntries((authUsers || []).map(u => [u.id, u.email]));

  const enrichedMembers = (members || []).map(m => ({
    ...m,
    email: emailMap[m.profile?.id] || null,
  }));

  // Pending invitations (visible to admin+)
  const canManage = ['owner', 'admin'].includes(workspace.member_role);
  let pendingInvitations = [];

  if (canManage) {
    const { data: invites } = await supabase
      .from('workspace_invitations')
      .select('id, email, role, expires_at, created_at')
      .eq('workspace_id', workspace.id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    pendingInvitations = invites || [];
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Miembros</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {enrichedMembers.length} {enrichedMembers.length === 1 ? 'persona' : 'personas'} en {workspace.name}
          </p>
        </div>
        {canManage && (
          <InviteMemberDialog
            workspaceId={workspace.id}
            workspaceSlug={slug}
          />
        )}
      </div>

      <MemberList
        members={enrichedMembers}
        pendingInvitations={pendingInvitations}
        currentUserRole={workspace.member_role}
        workspaceId={workspace.id}
        workspaceSlug={slug}
      />
    </div>
  );
}
