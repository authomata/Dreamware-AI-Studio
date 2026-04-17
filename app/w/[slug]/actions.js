'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertWorkspaceRole } from '@/lib/workspace/assertWorkspaceRole';
import { generateUniqueSlug } from '@/lib/workspace/generateUniqueSlug';
import { sendEmail } from '@/lib/emails/resend';
import { buildInvitationEmail } from '@/lib/emails/InvitationEmail';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://lab.dreamware.studio';

// ---------------------------------------------------------------------------
// Workspace CRUD
// ---------------------------------------------------------------------------

/**
 * Update workspace metadata (name, slug, logo_url, brand_color, settings).
 * Requires workspace admin role.
 *
 * @param {string} workspaceId
 * @param {{ name?: string, slug?: string, logo_url?: string, brand_color?: string }} data
 */
export async function updateWorkspace(workspaceId, data) {
  await assertWorkspaceRole(workspaceId, 'admin');
  const admin = createAdminClient();

  const allowedFields = ['name', 'logo_url', 'brand_color', 'settings'];
  const update = {};
  for (const key of allowedFields) {
    if (key in data) update[key] = data[key];
  }

  // If name changed and no explicit slug, auto-generate
  if (data.name && !data.slug) {
    update.slug = await generateUniqueSlug(data.name, workspaceId);
  } else if (data.slug) {
    update.slug = data.slug;
  }

  const { error } = await admin
    .from('workspaces')
    .update(update)
    .eq('id', workspaceId);

  if (error) throw new Error(error.message);

  // If slug changed, revalidate old and new paths
  const supabase = await createClient();
  const { data: ws } = await supabase
    .from('workspaces')
    .select('slug')
    .eq('id', workspaceId)
    .single();

  revalidatePath(`/w/${ws?.slug || ''}`, 'layout');
  return { success: true, slug: update.slug || ws?.slug };
}

/**
 * Soft-archive a workspace. Only the workspace owner can do this.
 *
 * @param {string} workspaceId
 */
export async function archiveWorkspace(workspaceId) {
  await assertWorkspaceRole(workspaceId, 'owner');
  const admin = createAdminClient();

  const { error } = await admin
    .from('workspaces')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath('/admin/clients');
  redirect('/');
}

// ---------------------------------------------------------------------------
// Member management
// ---------------------------------------------------------------------------

/**
 * Invite a user by email to the workspace.
 * Creates a workspace_invitations row. Sending the email is handled separately
 * (Resend integration — TODO: wire in Phase 6).
 *
 * @param {string} workspaceId
 * @param {string} email
 * @param {'owner'|'admin'|'editor'|'commenter'|'viewer'} role
 * @param {string} workspaceSlug - for revalidation
 */
export async function inviteMember(workspaceId, email, role, workspaceSlug) {
  const { user } = await assertWorkspaceRole(workspaceId, 'admin');
  const admin    = createAdminClient();

  // Delete any existing (expired or pending) invitation for this email+workspace
  await admin
    .from('workspace_invitations')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('email', email.toLowerCase());

  const token = crypto.randomBytes(32).toString('base64url');

  const { error } = await admin
    .from('workspace_invitations')
    .insert({
      workspace_id: workspaceId,
      email:        email.toLowerCase(),
      role,
      token,
      invited_by:   user.id,
      expires_at:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

  if (error) throw new Error(error.message);

  // Phase 6: Send invitation email via Resend.
  // If Resend is not configured or fails, the invitation row still exists
  // and the admin can share the link manually.
  try {
    const { data: ws } = await admin
      .from('workspaces')
      .select('name, slug')
      .eq('id', workspaceId)
      .single();

    const { data: inviterProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const inviteLink = `${BASE_URL}/invitations/${token}`;
    const emailPayload = buildInvitationEmail({
      recipientEmail: email,
      workspaceName:  ws?.name || workspaceSlug,
      role,
      inviterName:    inviterProfile?.full_name || null,
      inviteLink,
    });

    await sendEmail({ to: email, ...emailPayload });
  } catch (emailErr) {
    console.error('[inviteMember] Email send failed (non-fatal):', emailErr);
  }

  revalidatePath(`/w/${workspaceSlug}/members`);
  return { success: true, token };
}

/**
 * Update a member's role. Admin cannot promote/demote other admins or owners.
 *
 * @param {string} workspaceId
 * @param {string} targetUserId
 * @param {'admin'|'editor'|'commenter'|'viewer'} newRole
 * @param {string} workspaceSlug
 */
export async function updateMemberRole(workspaceId, targetUserId, newRole, workspaceSlug) {
  const { user, membership } = await assertWorkspaceRole(workspaceId, 'admin');
  const admin = createAdminClient();

  // Owners can change anyone's role; admins cannot touch owners or other admins
  if (membership.role === 'admin') {
    const { data: target } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUserId)
      .single();

    if (target?.role === 'owner') throw new Error('No puedes cambiar el rol de un propietario.');
    if (target?.role === 'admin' && targetUserId !== user.id) {
      throw new Error('No tienes permiso para cambiar el rol de otro administrador.');
    }
    if (newRole === 'owner') throw new Error('Solo un propietario puede asignar el rol de propietario.');
  }

  const { error } = await admin
    .from('workspace_members')
    .update({ role: newRole })
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId);

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceSlug}/members`);
  return { success: true };
}

/**
 * Remove a member from the workspace.
 * - Owners cannot be removed unless there's another owner.
 * - Members can remove themselves (regardless of role).
 *
 * @param {string} workspaceId
 * @param {string} targetUserId
 * @param {string} workspaceSlug
 */
export async function removeMember(workspaceId, targetUserId, workspaceSlug) {
  const { user, membership } = await assertWorkspaceRole(workspaceId, 'admin');
  const admin = createAdminClient();

  const isSelf = user.id === targetUserId;

  // Non-admin can only remove themselves
  if (!isSelf && !['admin', 'owner'].includes(membership.role)) {
    throw new Error('No tienes permiso para eliminar este miembro.');
  }

  // Fetch target member
  const { data: target } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId)
    .single();

  if (!target) throw new Error('El miembro no existe.');

  // Prevent removing the last owner
  if (target.role === 'owner') {
    const { count } = await admin
      .from('workspace_members')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('role', 'owner');

    if (count <= 1) {
      throw new Error('No puedes eliminar al único propietario del workspace.');
    }
  }

  const { error } = await admin
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId);

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceSlug}/members`);

  // If user removed themselves, redirect them out
  if (isSelf) redirect('/');

  return { success: true };
}

/**
 * Revoke (delete) a pending invitation.
 *
 * @param {string} invitationId
 * @param {string} workspaceId
 * @param {string} workspaceSlug
 */
export async function revokeInvitation(invitationId, workspaceId, workspaceSlug) {
  await assertWorkspaceRole(workspaceId, 'admin');
  const admin = createAdminClient();

  await admin
    .from('workspace_invitations')
    .delete()
    .eq('id', invitationId)
    .eq('workspace_id', workspaceId); // safety: ensure it belongs to this workspace

  revalidatePath(`/w/${workspaceSlug}/members`);
  return { success: true };
}
