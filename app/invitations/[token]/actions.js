'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Accepts a workspace invitation.
 * Verifies that the calling user's email matches the invitation email,
 * then inserts them into workspace_members and marks the invitation as accepted.
 *
 * Uses admin client for the membership insert (bypasses RLS — the invite is the auth).
 *
 * @param {string} token - invitation token from the URL
 * @returns {{ error: string } | never} redirects to /w/[slug] on success
 */
export async function acceptInvitation(token) {
  const supabase    = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No estás autenticado.' };

  // Fetch invitation (admin client bypasses RLS)
  const { data: invitation } = await adminClient
    .from('workspace_invitations')
    .select('id, email, role, workspace_id, expires_at, accepted_at, workspace:workspaces(slug)')
    .eq('token', token)
    .single();

  if (!invitation)               return { error: 'La invitación no existe.' };
  if (invitation.accepted_at)    return { error: 'Esta invitación ya fue aceptada.' };
  if (new Date(invitation.expires_at) < new Date()) {
    return { error: 'La invitación expiró.' };
  }
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    return { error: 'Tu email no coincide con la invitación.' };
  }

  // Insert membership (admin client — the invitation IS the authorization)
  const { error: memberError } = await adminClient
    .from('workspace_members')
    .insert({
      workspace_id: invitation.workspace_id,
      user_id:      user.id,
      role:         invitation.role,
      invited_by:   null, // we'll store invited_by from the invitation if needed
    });

  if (memberError && memberError.code !== '23505') {
    // 23505 = unique violation (already a member) — treat as success
    console.error('[acceptInvitation] member insert error:', memberError.message);
    return { error: 'Error al unirte al workspace. Inténtalo de nuevo.' };
  }

  // Mark invitation as accepted
  await adminClient
    .from('workspace_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id);

  const slug = invitation.workspace?.slug;
  revalidatePath(`/w/${slug}`);
  redirect(`/w/${slug}`);
}
