import { notFound, redirect } from 'next/navigation';
import { getWorkspaceBySlug } from '@/lib/workspace/getWorkspaceBySlug';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import DocumentEditorPage from './DocumentEditorPage';

export const dynamic = 'force-dynamic';

export default async function DocDetailPage({ params }) {
  const { slug, docId } = await params;

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect('/');

  const supabase = await createClient();
  const admin    = createAdminClient();

  // ── Fetch document ────────────────────────────────────────────────────────
  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, content, created_by, updated_by, created_at, updated_at, folder_id')
    .eq('id', docId)
    .eq('workspace_id', workspace.id)
    .single();

  if (!doc) notFound();

  // ── Fetch initial comments ────────────────────────────────────────────────
  const { data: rawComments } = await supabase
    .from('document_comments')
    .select('id, body, selection_from, selection_to, selection_text, resolved_at, resolved_by, parent_id, created_at, author_id')
    .eq('document_id', docId)
    .order('created_at', { ascending: true });

  const comments = rawComments || [];

  // ── Batch fetch profiles for authors + resolvers ──────────────────────────
  const authorIds   = comments.map(c => c.author_id);
  const resolverIds = comments.filter(c => c.resolved_by).map(c => c.resolved_by);
  const allIds      = [...new Set([...authorIds, ...resolverIds, doc.created_by, doc.updated_by])];

  let profileMap = {};
  let emailMap   = {};

  if (allIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', allIds);

    profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

    const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
    emailMap = Object.fromEntries((authUsers || []).map(u => [u.id, u.email]));
  }

  // ── Enrich comments with author + resolver ────────────────────────────────
  const initialComments = comments.map(c => ({
    ...c,
    author: {
      ...(profileMap[c.author_id] || { id: c.author_id, full_name: null, avatar_url: null }),
      email: emailMap[c.author_id] || null,
    },
    resolver: c.resolved_by
      ? {
          ...(profileMap[c.resolved_by] || { id: c.resolved_by, full_name: null, avatar_url: null }),
          email: emailMap[c.resolved_by] || null,
        }
      : null,
  }));

  // ── Workspace members for @ mention autocomplete ──────────────────────────
  // Two-step fetch (same PostgREST FK issue as members/page.js)
  const { data: rawMembers } = await supabase
    .from('workspace_members')
    .select('id, user_id, role')
    .eq('workspace_id', workspace.id);

  const memberUserIds = (rawMembers || []).map(m => m.user_id);
  let memberProfiles = {};
  if (memberUserIds.length > 0) {
    const { data: mProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', memberUserIds);
    memberProfiles = Object.fromEntries((mProfiles || []).map(p => [p.id, p]));
  }

  const members = (rawMembers || []).map(m => ({
    id:    m.user_id,
    label: memberProfiles[m.user_id]?.full_name || emailMap[m.user_id] || 'Usuario',
  }));

  // ── Current user ──────────────────────────────────────────────────────────
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  const canEdit    = ['owner', 'admin', 'editor'].includes(workspace.member_role);
  const canComment = ['owner', 'admin', 'editor', 'commenter'].includes(workspace.member_role);
  const isAdmin    = ['owner', 'admin'].includes(workspace.member_role);

  return (
    <DocumentEditorPage
      doc={doc}
      workspace={{ id: workspace.id, slug, member_role: workspace.member_role }}
      initialComments={initialComments}
      members={members}
      currentUserId={currentUser?.id}
      canEdit={canEdit}
      canComment={canComment}
      isAdmin={isAdmin}
    />
  );
}
