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

  // Two-step fetch: PostgREST cannot resolve the transitive FK
  // workspace_members.user_id → auth.users.id = profiles.id, so the
  // embedded join `profile:profiles(...)` always fails with PGRST200.
  // We fetch members and profiles separately, then stitch by user_id.

  // Step 1 — raw members (no join)
  const { data: rawMembers, error: errMembers } = await supabase
    .from('workspace_members')
    .select('id, user_id, role, joined_at, last_seen_at, invited_by')
    .eq('workspace_id', workspace.id)
    .order('joined_at', { ascending: true });

  if (errMembers) {
    console.error('[MembersPage] workspace_members query error:', errMembers);
  }

  const userIds = (rawMembers || []).map(m => m.user_id);

  // Step 2 — profiles (direct FK profiles.id; policy allows coworker reads)
  let profiles = [];
  if (userIds.length > 0) {
    const { data: profilesData, error: errProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);

    if (errProfiles) {
      console.error('[MembersPage] profiles query error:', errProfiles);
    }
    profiles = profilesData || [];
  }

  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));

  // Step 3 — auth emails via service role (auth.users not readable otherwise)
  const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = Object.fromEntries((authUsers || []).map(u => [u.id, u.email]));

  // Step 4 — combine
  const enrichedMembers = (rawMembers || []).map(m => ({
    ...m,
    profile: profileMap[m.user_id] || null,
    email:   emailMap[m.user_id]   || null,
  }));

  console.log('[MembersPage] enriched members count:', enrichedMembers.length);

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
