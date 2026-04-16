import { createClient } from '@/lib/supabase/server';

/**
 * @typedef {Object} WorkspaceWithMembership
 * @property {string} id
 * @property {string} name
 * @property {string} slug
 * @property {'client' | 'internal'} type
 * @property {string | null} logo_url
 * @property {string | null} brand_color
 * @property {'collaboration' | 'generative'} plan
 * @property {string} created_by
 * @property {string} created_at
 * @property {string | null} archived_at
 * @property {Object} settings
 * @property {'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'} member_role
 * @property {string} member_id   - workspace_members.id for this user
 */

/**
 * Fetches a workspace by slug and enriches it with the calling user's role.
 * Returns null if the workspace does not exist or the user is not a member
 * (RLS on workspaces will filter it out).
 *
 * @param {string} slug
 * @returns {Promise<WorkspaceWithMembership | null>}
 */
export async function getWorkspaceBySlug(slug) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch workspace (RLS: is_workspace_member(id, 'viewer') OR is_admin())
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('*')
    .eq('slug', slug)
    .single();

  if (wsError || !workspace) {
    return null;
  }

  // Fetch the calling user's membership record
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('id, role')
    .eq('workspace_id', workspace.id)
    .eq('user_id', user.id)
    .single();

  return {
    ...workspace,
    member_role: membership?.role ?? null,
    member_id: membership?.id ?? null,
  };
}
