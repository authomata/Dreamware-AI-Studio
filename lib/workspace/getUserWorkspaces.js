import { createClient } from '@/lib/supabase/server';

/**
 * Returns all workspaces the currently authenticated user belongs to,
 * ordered by name. Excludes archived workspaces by default.
 *
 * @param {{ includeArchived?: boolean }} [options]
 * @returns {Promise<Array<{
 *   id: string,
 *   name: string,
 *   slug: string,
 *   type: 'client' | 'internal',
 *   logo_url: string | null,
 *   brand_color: string | null,
 *   plan: 'collaboration' | 'generative',
 *   archived_at: string | null,
 *   member_role: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer',
 * }>>}
 */
export async function getUserWorkspaces({ includeArchived = false } = {}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Join via workspace_members — RLS on workspaces + is_workspace_member()
  // ensures we only see workspaces we belong to.
  let query = supabase
    .from('workspace_members')
    .select(`
      role,
      workspace:workspaces (
        id, name, slug, type, logo_url, brand_color, plan, archived_at
      )
    `)
    .eq('user_id', user.id)
    .order('workspace(name)', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('[getUserWorkspaces] query error:', error.message);
    return [];
  }

  const workspaces = (data || [])
    .filter(row => {
      if (!row.workspace) return false;
      if (!includeArchived && row.workspace.archived_at) return false;
      return true;
    })
    .map(row => ({
      ...row.workspace,
      member_role: row.role,
    }));

  return workspaces;
}
