import { createClient } from '@/lib/supabase/server';

/**
 * Role hierarchy ranks. Higher = more privileged.
 * @type {Record<string, number>}
 */
const ROLE_RANK = {
  viewer:    1,
  commenter: 2,
  editor:    3,
  admin:     4,
  owner:     5,
};

/**
 * Guard for Server Actions that require a minimum workspace role.
 * Pattern mirrors assertAdmin() in app/admin/actions.js.
 *
 * Throws 'Unauthorized' if the user is not logged in.
 * Throws 'Forbidden' if the user's workspace role is below minRole.
 *
 * Usage:
 *   const { user, membership } = await assertWorkspaceRole(workspaceId, 'editor');
 *
 * @param {string} workspaceId  - UUID of the workspace
 * @param {'viewer'|'commenter'|'editor'|'admin'|'owner'} [minRole='viewer']
 * @returns {Promise<{ user: import('@supabase/supabase-js').User, membership: { id: string, role: string } }>}
 * @throws {Error} Unauthorized | Forbidden
 */
export async function assertWorkspaceRole(workspaceId, minRole = 'viewer') {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Platform admins can always act — they can manage all workspaces
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'admin') {
    // Return a synthetic membership for platform admins
    return { user, membership: { id: null, role: 'owner' } };
  }

  // Fetch actual membership
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('id, role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!membership) throw new Error('Forbidden');

  const userRank = ROLE_RANK[membership.role] ?? 0;
  const minRank  = ROLE_RANK[minRole] ?? 0;

  if (userRank < minRank) throw new Error('Forbidden');

  return { user, membership };
}
