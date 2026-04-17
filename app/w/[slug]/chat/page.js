import { redirect } from 'next/navigation';
import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import ChatPanel from '@/components/workspace/ChatPanel';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function ChatPage({ params }) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect('/');

  const supabase = await createClient();
  const admin    = createAdminClient();

  // ── Current user ─────────────────────────────────────────────────────────
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  // ── Fetch last PAGE_SIZE messages (newest first from DB → reversed) ──────
  const { data: rawMessages } = await supabase
    .from('chat_messages')
    .select('id, workspace_id, author_id, body, attachments, reply_to_id, edited_at, created_at')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  const messages = (rawMessages || []).reverse();   // oldest first for display

  // ── Batch-fetch author profiles ───────────────────────────────────────────
  const authorIds = [
    ...new Set([
      ...messages.map(m => m.author_id),
      currentUser?.id,
    ].filter(Boolean))
  ];

  let profileMap = {};
  let emailMap   = {};

  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', authorIds);

    profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

    const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
    emailMap = Object.fromEntries((authUsers || []).map(u => [u.id, u.email]));
  }

  // Enrich messages
  const enrichedMessages = messages.map(m => ({
    ...m,
    author: {
      ...(profileMap[m.author_id] || { id: m.author_id, full_name: null, avatar_url: null }),
      email: emailMap[m.author_id] || null,
    },
    reply_to: null,   // loaded per-message on the client if needed (lightweight)
  }));

  // ── Workspace members for @mention autocomplete ───────────────────────────
  const { data: rawMembers } = await supabase
    .from('workspace_members')
    .select('id, user_id, role')
    .eq('workspace_id', workspace.id);

  const memberUserIds = (rawMembers || []).map(m => m.user_id);
  let memberProfileMap = {};
  if (memberUserIds.length > 0) {
    const { data: mProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', memberUserIds);
    memberProfileMap = Object.fromEntries((mProfiles || []).map(p => [p.id, p]));
  }

  const members = (rawMembers || []).map(m => ({
    id:         m.user_id,
    label:      memberProfileMap[m.user_id]?.full_name || emailMap[m.user_id] || 'Usuario',
    full_name:  memberProfileMap[m.user_id]?.full_name || null,
    email:      emailMap[m.user_id] || null,
    avatar_url: memberProfileMap[m.user_id]?.avatar_url || null,
  }));

  // ── Permissions ───────────────────────────────────────────────────────────
  const role     = workspace.member_role;
  const canWrite = ['owner', 'admin', 'editor', 'commenter'].includes(role);
  const isAdmin  = ['owner', 'admin'].includes(role);

  // ── Current user enriched ─────────────────────────────────────────────────
  const currentUserEnriched = currentUser ? {
    id:         currentUser.id,
    full_name:  profileMap[currentUser.id]?.full_name || null,
    email:      emailMap[currentUser.id]   || null,
    avatar_url: profileMap[currentUser.id]?.avatar_url || null,
  } : null;

  // ── Pagination: is there an older page? ───────────────────────────────────
  const hasMore = rawMessages?.length === PAGE_SIZE;
  const oldestCreatedAt = messages.length > 0 ? messages[0].created_at : null;

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="shrink-0 px-6 py-4 border-b border-zinc-900">
        <h1 className="text-lg font-semibold text-white">Chat</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          {workspace.name} · {members.length} miembro{members.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Chat panel fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <ChatPanel
          workspace={{ id: workspace.id, slug }}
          initialMessages={enrichedMessages}
          members={members}
          currentUser={currentUserEnriched}
          canWrite={canWrite}
          isAdmin={isAdmin}
          hasMore={hasMore}
          oldestCreatedAt={oldestCreatedAt}
        />
      </div>
    </div>
  );
}
