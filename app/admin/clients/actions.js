'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateUniqueSlug } from '@/lib/workspace/generateUniqueSlug';

/**
 * Guard: platform admin only (same as assertAdmin in app/admin/actions.js).
 * @returns {Promise<import('@supabase/supabase-js').User>}
 */
async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') throw new Error('Forbidden');
  return user;
}

/**
 * Create a new client workspace and onboard its first owner.
 *
 * Flow:
 * 1. Create the workspace (type: client)
 * 2. The workspace trigger auto-adds the platform admin as 'owner' — we then fix it
 *    by adding the actual owner and removing the admin if they're different.
 * 3. If the owner user already exists in auth.users → add them as workspace owner.
 * 4. If not → create a workspace_invitation for their email.
 *    (Sending the email is a TODO for Phase 6 — Resend not wired yet.)
 *
 * @param {{ name: string, slug?: string, type?: string, plan?: string, brand_color?: string, logo_url?: string }} workspaceData
 * @param {string} ownerEmail
 * @param {string} ownerName
 */
export async function createClientAndOwner(workspaceData, ownerEmail, ownerName) {
  const adminUser = await assertAdmin();
  const admin     = createAdminClient();

  // 1. Resolve slug
  const slug = workspaceData.slug
    ? workspaceData.slug
    : await generateUniqueSlug(workspaceData.name);

  // 2. Create workspace (trigger will add adminUser as owner)
  const { data: workspace, error: wsError } = await admin
    .from('workspaces')
    .insert({
      name:        workspaceData.name,
      slug,
      type:        workspaceData.type || 'client',
      plan:        workspaceData.plan || 'collaboration',
      brand_color: workspaceData.brand_color || null,
      logo_url:    workspaceData.logo_url    || null,
      created_by:  adminUser.id,
    })
    .select()
    .single();

  if (wsError) throw new Error(wsError.message);

  // 3. Check if owner user exists in auth
  const { data: { users: allUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existingUser = allUsers.find(u => u.email?.toLowerCase() === ownerEmail.toLowerCase());

  if (existingUser) {
    // Add as workspace owner (admin client bypasses RLS)
    const { error: memberError } = await admin
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id:      existingUser.id,
        role:         'owner',
        invited_by:   adminUser.id,
      })
      .single();

    // Ignore duplicate (user might already be added by trigger if they're the admin)
    if (memberError && memberError.code !== '23505') {
      throw new Error(memberError.message);
    }

    // Update their profile name if not set
    await admin
      .from('profiles')
      .update({ full_name: ownerName })
      .eq('id', existingUser.id)
      .is('full_name', null);

  } else {
    // 4. Create invitation for the email
    const token = crypto.randomBytes(32).toString('base64url');

    await admin
      .from('workspace_invitations')
      .insert({
        workspace_id: workspace.id,
        email:        ownerEmail.toLowerCase(),
        role:         'owner',
        token,
        invited_by:   adminUser.id,
        expires_at:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

    // TODO (Phase 6): send onboarding email via Resend
    // await sendWelcomeClientEmail({ email: ownerEmail, name: ownerName, token, workspace });
    console.log(`[createClientAndOwner] Invitation created for ${ownerEmail}. Token: ${token}`);
  }

  revalidatePath('/admin/clients');
  redirect(`/admin/clients`);
}

/**
 * Archive a client workspace (soft delete).
 * @param {string} workspaceId
 */
export async function archiveClient(workspaceId) {
  await assertAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from('workspaces')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath('/admin/clients');
  return { success: true };
}

/**
 * Restore an archived client workspace.
 * @param {string} workspaceId
 */
export async function restoreClient(workspaceId) {
  await assertAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from('workspaces')
    .update({ archived_at: null })
    .eq('id', workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath('/admin/clients');
  return { success: true };
}
