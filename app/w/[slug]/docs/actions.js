'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertWorkspaceRole } from '@/lib/workspace/assertWorkspaceRole';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves workspace_id and workspace slug from a document id.
 * Uses the RLS-scoped client so only members can query.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} docId
 * @returns {Promise<{ workspaceId: string, slug: string }>}
 */
async function getDocWorkspace(supabase, docId) {
  const { data: doc, error } = await supabase
    .from('documents')
    .select('workspace_id, workspace:workspaces(slug)')
    .eq('id', docId)
    .single();

  if (error || !doc) throw new Error('Documento no encontrado o sin acceso.');
  return { workspaceId: doc.workspace_id, slug: doc.workspace.slug };
}

// ---------------------------------------------------------------------------
// Document CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new document in a workspace. Redirects to the editor after creation.
 *
 * @param {string} workspaceId
 * @param {string|null} folderId
 * @param {string} title
 * @returns {Promise<{ ok: true, docId: string, slug: string }>}
 */
export async function createDocument(workspaceId, folderId, title) {
  const { user } = await assertWorkspaceRole(workspaceId, 'editor');
  const supabase  = await createClient();

  const { data: doc, error } = await supabase
    .from('documents')
    .insert({
      workspace_id: workspaceId,
      folder_id:    folderId || null,
      title:        (title || '').trim() || 'Sin título',
      content:      {},
      created_by:   user.id,
      updated_by:   user.id,
    })
    .select('id, workspace:workspaces(slug)')
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${doc.workspace.slug}/docs`);
  return { ok: true, docId: doc.id, slug: doc.workspace.slug };
}

/**
 * Update a document's title and/or content.
 * Called by the autosave debounce (2s) in DocumentEditor.
 *
 * @param {string} docId
 * @param {{ title?: string, content?: object }} updates
 * @returns {Promise<{ ok: true }>}
 */
export async function updateDocument(docId, updates) {
  const supabase = await createClient();
  const { workspaceId, slug } = await getDocWorkspace(supabase, docId);
  const { user } = await assertWorkspaceRole(workspaceId, 'editor');

  const patch = { updated_by: user.id };
  if (updates.title   !== undefined) patch.title   = (updates.title || '').trim() || 'Sin título';
  if (updates.content !== undefined) patch.content = updates.content;

  const { error } = await supabase
    .from('documents')
    .update(patch)
    .eq('id', docId);

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${slug}/docs`);
  revalidatePath(`/w/${slug}/docs/${docId}`);
  return { ok: true };
}

/**
 * Delete a document. Only the creator or a workspace admin+ can delete.
 *
 * @param {string} docId
 * @param {string} workspaceId  - pre-fetched for authorization check
 * @param {string} workspaceSlug
 * @returns {Promise<{ ok: true }>}
 */
export async function deleteDocument(docId, workspaceId, workspaceSlug) {
  const { user, membership } = await assertWorkspaceRole(workspaceId, 'editor');
  const admin = createAdminClient();

  const { data: doc } = await admin
    .from('documents')
    .select('created_by')
    .eq('id', docId)
    .eq('workspace_id', workspaceId)
    .single();

  if (!doc) throw new Error('Documento no encontrado.');

  const isAuthor  = doc.created_by === user.id;
  const isWsAdmin = ['admin', 'owner'].includes(membership.role);

  if (!isAuthor && !isWsAdmin) {
    throw new Error('Solo el autor o un administrador puede eliminar este documento.');
  }

  const { error } = await admin
    .from('documents')
    .delete()
    .eq('id', docId);

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceSlug}/docs`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Document comments
// ---------------------------------------------------------------------------

/**
 * Create a new comment on a document. Requires commenter+ role.
 *
 * @param {string} docId
 * @param {string} body
 * @param {{
 *   selection_from?: number,
 *   selection_to?:   number,
 *   selection_text?: string,
 *   parent_id?:      string,
 * }} [opts]
 * @returns {Promise<{ ok: true, comment: object }>}
 */
export async function createDocumentComment(docId, body, opts = {}) {
  if (!body?.trim()) throw new Error('El comentario no puede estar vacío.');

  const supabase = await createClient();
  const { workspaceId, slug } = await getDocWorkspace(supabase, docId);
  await assertWorkspaceRole(workspaceId, 'commenter');

  const { data: { user } } = await supabase.auth.getUser();

  const { data: comment, error } = await supabase
    .from('document_comments')
    .insert({
      document_id:    docId,
      workspace_id:   workspaceId,
      author_id:      user.id,
      body:           body.trim(),
      selection_from: opts.selection_from ?? null,
      selection_to:   opts.selection_to   ?? null,
      selection_text: opts.selection_text ?? null,
      parent_id:      opts.parent_id      ?? null,
    })
    .select('id, body, selection_from, selection_to, selection_text, parent_id, created_at, resolved_at, resolved_by, author_id')
    .single();

  if (error) throw new Error('Error al crear el comentario. Inténtalo de nuevo.');

  revalidatePath(`/w/${slug}/docs/${docId}`);
  return { ok: true, comment };
}

/**
 * Resolve a document comment (Frame.io pattern — editor+).
 *
 * @param {string} commentId
 * @returns {Promise<{ ok: true }>}
 */
export async function resolveDocumentComment(commentId) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: comment } = await supabase
    .from('document_comments')
    .select('workspace_id, document_id, workspace:workspaces(slug)')
    .eq('id', commentId)
    .single();

  if (!comment) throw new Error('Comentario no encontrado.');
  await assertWorkspaceRole(comment.workspace_id, 'editor');

  const { error } = await supabase
    .from('document_comments')
    .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', commentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${comment.workspace.slug}/docs/${comment.document_id}`);
  return { ok: true };
}

/**
 * Unresolve (reopen) a document comment.
 *
 * @param {string} commentId
 * @returns {Promise<{ ok: true }>}
 */
export async function unresolveDocumentComment(commentId) {
  const supabase = await createClient();

  const { data: comment } = await supabase
    .from('document_comments')
    .select('workspace_id, document_id, workspace:workspaces(slug)')
    .eq('id', commentId)
    .single();

  if (!comment) throw new Error('Comentario no encontrado.');
  await assertWorkspaceRole(comment.workspace_id, 'editor');

  const { error } = await supabase
    .from('document_comments')
    .update({ resolved_at: null, resolved_by: null })
    .eq('id', commentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${comment.workspace.slug}/docs/${comment.document_id}`);
  return { ok: true };
}

/**
 * Delete a document comment. Author or admin+ only.
 *
 * @param {string} commentId
 * @returns {Promise<{ ok: true }>}
 */
export async function deleteDocumentComment(commentId) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: comment } = await supabase
    .from('document_comments')
    .select('author_id, workspace_id, document_id, workspace:workspaces(slug)')
    .eq('id', commentId)
    .single();

  if (!comment) throw new Error('Comentario no encontrado.');

  const { membership } = await assertWorkspaceRole(comment.workspace_id, 'commenter');

  const isAuthor  = comment.author_id === user.id;
  const isWsAdmin = ['admin', 'owner'].includes(membership.role);

  if (!isAuthor && !isWsAdmin) {
    throw new Error('Solo el autor o un administrador puede eliminar este comentario.');
  }

  const { error } = await supabase
    .from('document_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${comment.workspace.slug}/docs/${comment.document_id}`);
  return { ok: true };
}
