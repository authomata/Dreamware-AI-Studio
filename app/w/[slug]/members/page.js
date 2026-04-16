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

  // Fetch all members with their profile data.
  // user_id is selected explicitly so we can look up emails even when
  // profile join returns null (FK path workspace_members.user_id → profiles
  // is indirect through auth.users; PostgREST may fail to resolve it without
  // the coworker-profiles policy applied, making data=null → 0 members).
  const { data: members, error: membersError } = await supabase
    .from('workspace_members')
    .select(`
      id, role, joined_at, last_seen_at, invited_by, user_id,
      profile:profiles (id, full_name, avatar_url)
    `)
    .eq('workspace_id', workspace.id)
    .order('joined_at', { ascending: true });

  // Fetch auth emails (service role needed to read auth.users)
  const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = Object.fromEntries((authUsers || []).map(u => [u.id, u.email]));

  // Use user_id (always present on the row) — not profile?.id — so email lookup
  // is resilient to the profile join returning null.
  const enrichedMembers = (members || []).map(m => ({
    ...m,
    email: emailMap[m.user_id] || null,
  }));

  console.log('[MembersPage] enriched members:', enrichedMembers.map(m => ({
    id:          m.id,
    role:        m.role,
    user_id:     m.user_id,
    email:       m.email,
    hasProfile:  !!m.profile,
    hasFullName: !!m.profile?.full_name,
  })));
  if (membersError) console.error('[MembersPage] members query error:', membersError);

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
