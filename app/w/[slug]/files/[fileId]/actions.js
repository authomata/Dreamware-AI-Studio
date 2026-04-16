'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertWorkspaceRole } from '@/lib/workspace/assertWorkspaceRole';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the workspace_id and slug for a given file.
 * Uses the RLS-scoped client so only members can query.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} fileId
 * @returns {Promise<{ workspaceId: string, slug: string }>}
 */
async function getFileWorkspace(supabase, fileId) {
  const { data: file, error } = await supabase
    .from('files')
    .select('workspace_id, workspace:workspaces(slug)')
    .eq('id', fileId)
    .single();

  if (error || !file) throw new Error('Archivo no encontrado o sin acceso.');
  return { workspaceId: file.workspace_id, slug: file.workspace.slug };
}

// ---------------------------------------------------------------------------
// Comment actions
// ---------------------------------------------------------------------------

/**
 * Create a new comment on a file. Requires commenter+ role.
 *
 * @param {string} fileId
 * @param {string} body              - comment text (required, trimmed)
 * @param {{
 *   timestamp_ms?: number,          - video: millisecond position
 *   x_percent?:   number,           - image pin: 0–100
 *   y_percent?:   number,           - image pin: 0–100
 *   parent_id?:   string,           - reply to this comment id
 * }} [opts]
 * @returns {Promise<{ ok: true, comment: object }>}
 */
export async function createComment(fileId, body, opts = {}) {
  if (!body?.trim()) throw new Error('El comentario no puede estar vacío.');

  const supabase = await createClient();
  const { workspaceId, slug } = await getFileWorkspace(supabase, fileId);
  await assertWorkspaceRole(workspaceId, 'commenter');

  const { data: { user } } = await supabase.auth.getUser();

  const { data: comment, error } = await supabase
    .from('media_comments')
    .insert({
      file_id:      fileId,
      workspace_id: workspaceId,
      author_id:    user.id,
      body:         body.trim(),
      timestamp_ms: opts.timestamp_ms ?? null,
      x_percent:    opts.x_percent    ?? null,
      y_percent:    opts.y_percent    ?? null,
      parent_id:    opts.parent_id    ?? null,
    })
    .select('id, body, timestamp_ms, x_percent, y_percent, parent_id, created_at, resolved_at, author_id')
    .single();

  if (error) throw new Error('Error al crear el comentario. Inténtalo de nuevo.');

  revalidatePath(`/w/${slug}/files/${fileId}`);
  return { ok: true, comment };
}

/**
 * Edit the body of an existing comment. Only the author can edit their comment.
 *
 * @param {string} commentId
 * @param {string} newBody
 */
export async function editComment(commentId, newBody) {
  if (!newBody?.trim()) throw new Error('El comentario no puede estar vacío.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autorizado.');

  // Verify ownership before update (RLS also enforces this)
  const { data: existing } = await supabase
    .from('media_comments')
    .select('author_id, file_id, workspace_id, workspace:workspaces(slug)')
    .eq('id', commentId)
    .single();

  if (!existing) throw new Error('Comentario no encontrado.');
  if (existing.author_id !== user.id) throw new Error('Solo puedes editar tus propios comentarios.');

  const { error } = await supabase
    .from('media_comments')
    .update({ body: newBody.trim() })
    .eq('id', commentId);

  if (error) throw new Error('Error al editar el comentario.');

  revalidatePath(`/w/${existing.workspace.slug}/files/${existing.file_id}`);
  return { ok: true };
}

/**
 * Delete a comment. Author or workspace admin+.
 *
 * @param {string} commentId
 */
export async function deleteComment(commentId) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autorizado.');

  const { data: existing } = await supabase
    .from('media_comments')
    .select('author_id, file_id, workspace_id, workspace:workspaces(slug)')
    .eq('id', commentId)
    .single();

  if (!existing) throw new Error('Comentario no encontrado.');

  // Author can always delete. Admins can delete any comment.
  const isAuthor = existing.author_id === user.id;
  if (!isAuthor) {
    // Will throw if the user is not admin+
    await assertWorkspaceRole(existing.workspace_id, 'admin');
  }

  const { error } = await supabase
    .from('media_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw new Error('Error al eliminar el comentario.');

  revalidatePath(`/w/${existing.workspace.slug}/files/${existing.file_id}`);
  return { ok: true };
}

/**
 * Mark a comment as resolved. Any editor+ can resolve.
 *
 * @param {string} commentId
 */
export async function resolveComment(commentId) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autorizado.');

  const { data: existing } = await supabase
    .from('media_comments')
    .select('workspace_id, file_id, workspace:workspaces(slug)')
    .eq('id', commentId)
    .single();

  if (!existing) throw new Error('Comentario no encontrado.');
  await assertWorkspaceRole(existing.workspace_id, 'editor');

  // Use admin client so that editors (who are not the author) can also resolve
  const admin = createAdminClient();
  const { error } = await admin
    .from('media_comments')
    .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', commentId);

  if (error) throw new Error('Error al resolver el comentario.');

  revalidatePath(`/w/${existing.workspace.slug}/files/${existing.file_id}`);
  return { ok: true };
}

/**
 * Reopen a resolved comment. Any editor+ can unresolve.
 *
 * @param {string} commentId
 */
export async function unresolveComment(commentId) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autorizado.');

  const { data: existing } = await supabase
    .from('media_comments')
    .select('workspace_id, file_id, workspace:workspaces(slug)')
    .eq('id', commentId)
    .single();

  if (!existing) throw new Error('Comentario no encontrado.');
  await assertWorkspaceRole(existing.workspace_id, 'editor');

  const admin = createAdminClient();
  const { error } = await admin
    .from('media_comments')
    .update({ resolved_at: null, resolved_by: null })
    .eq('id', commentId);

  if (error) throw new Error('Error al reabrir el comentario.');

  revalidatePath(`/w/${existing.workspace.slug}/files/${existing.file_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Notification actions
// ---------------------------------------------------------------------------

/**
 * Mark a single notification as read.
 *
 * @param {string} notificationId
 */
export async function markNotificationRead(notificationId) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autorizado.');

  // RLS ensures users can only update their own notifications
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', user.id);   // belt-and-suspenders alongside RLS

  if (error) throw new Error('Error al marcar la notificación como leída.');
  return { ok: true };
}

/**
 * Mark all unread notifications as read for the current user.
 */
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autorizado.');

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) throw new Error('Error al marcar las notificaciones como leídas.');
  return { ok: true };
}
