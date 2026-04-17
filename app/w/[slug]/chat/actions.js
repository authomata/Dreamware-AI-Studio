'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertWorkspaceRole } from '@/lib/workspace/assertWorkspaceRole';

// ---------------------------------------------------------------------------
// sendChatMessage
// ---------------------------------------------------------------------------

/**
 * Send a new chat message.
 *
 * @param {string} workspaceId
 * @param {string} body              - message text (required, trimmed)
 * @param {Array}  [attachments=[]] - [{ file_id, name, mime_type, storage_path }]
 * @param {string|null} [replyToId] - UUID of the parent message, or null
 * @returns {Promise<{ ok: true, message: object }>}
 */
export async function sendChatMessage(workspaceId, body, attachments = [], replyToId = null) {
  if (!body?.trim() && (!attachments || attachments.length === 0)) {
    throw new Error('El mensaje no puede estar vacío.');
  }

  const supabase = await createClient();
  const { user } = await assertWorkspaceRole(workspaceId, 'commenter');

  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      workspace_id: workspaceId,
      author_id:    user.id,
      body:         body?.trim() ?? '',
      attachments:  attachments || [],
      reply_to_id:  replyToId || null,
    })
    .select('id, workspace_id, author_id, body, attachments, reply_to_id, edited_at, created_at')
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(`/w/[slug]/chat`, 'page');
  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// editChatMessage
// ---------------------------------------------------------------------------

/**
 * Edit a chat message body. Only the author can edit, within 15 minutes.
 *
 * @param {string} messageId
 * @param {string} newBody
 * @returns {Promise<{ ok: true }>}
 */
export async function editChatMessage(messageId, newBody) {
  if (!newBody?.trim()) throw new Error('El mensaje editado no puede estar vacío.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Fetch message to check authorship and age
  const { data: msg, error: fetchErr } = await supabase
    .from('chat_messages')
    .select('id, author_id, workspace_id, created_at')
    .eq('id', messageId)
    .single();

  if (fetchErr || !msg) throw new Error('Mensaje no encontrado.');
  if (msg.author_id !== user.id) throw new Error('Solo el autor puede editar este mensaje.');

  const ageMs = Date.now() - new Date(msg.created_at).getTime();
  if (ageMs > 15 * 60 * 1000) {
    throw new Error('Solo puedes editar mensajes dentro de los 15 minutos posteriores al envío.');
  }

  const { error } = await supabase
    .from('chat_messages')
    .update({ body: newBody.trim(), edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('author_id', user.id);   // double guard

  if (error) throw new Error(error.message);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// deleteChatMessage
// ---------------------------------------------------------------------------

/**
 * Delete a chat message. Author or admin can delete.
 *
 * @param {string} messageId
 * @param {string} workspaceId  - needed for admin check
 * @returns {Promise<{ ok: true }>}
 */
export async function deleteChatMessage(messageId, workspaceId) {
  const supabase = await createClient();
  const { user } = await assertWorkspaceRole(workspaceId, 'viewer');

  const { data: msg } = await supabase
    .from('chat_messages')
    .select('id, author_id')
    .eq('id', messageId)
    .single();

  if (!msg) throw new Error('Mensaje no encontrado.');

  const isAdmin = (await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  ).data?.role;

  if (msg.author_id !== user.id && !['owner', 'admin'].includes(isAdmin)) {
    throw new Error('Solo el autor o un administrador pueden eliminar este mensaje.');
  }

  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('id', messageId);

  if (error) throw new Error(error.message);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// markChatRead
// ---------------------------------------------------------------------------

/**
 * Update (or insert) the caller's last-read position in the workspace chat.
 *
 * @param {string} workspaceId
 * @param {string} messageId   - the most-recently-seen message id
 * @returns {Promise<{ ok: true }>}
 */
export async function markChatRead(workspaceId, messageId) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('chat_reads')
    .upsert(
      {
        workspace_id:         workspaceId,
        user_id:              user.id,
        last_read_message_id: messageId,
        last_read_at:         new Date().toISOString(),
      },
      { onConflict: 'workspace_id,user_id' }
    );

  if (error) throw new Error(error.message);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// getChatSignedUploadUrl
// ---------------------------------------------------------------------------

/**
 * Generate a signed upload URL for a chat attachment.
 * Files live in {workspace_id}/chat/{timestamp}-{filename} in workspace-files bucket.
 * No DB record is created — attachments are stored in chat_messages.attachments jsonb.
 *
 * @param {string} workspaceId
 * @param {string} filename
 * @param {string} mimeType
 * @returns {Promise<{ ok: true, signedUrl: string, storagePath: string }>}
 */
export async function getChatSignedUploadUrl(workspaceId, filename, mimeType) {
  const { user } = await assertWorkspaceRole(workspaceId, 'commenter');

  const admin = createAdminClient();
  const timestamp  = Date.now();
  const safeName   = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${workspaceId}/chat/${timestamp}-${safeName}`;

  const { data, error } = await admin.storage
    .from('workspace-files')
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (error) throw new Error(error.message);

  return {
    ok: true,
    signedUrl:   data.signedUrl,
    storagePath,
    token:       data.token,
  };
}

// ---------------------------------------------------------------------------
// getChatAttachmentUrl
// ---------------------------------------------------------------------------

/**
 * Get a short-lived signed download URL for a chat attachment.
 *
 * @param {string} workspaceId
 * @param {string} storagePath
 * @returns {Promise<{ ok: true, url: string }>}
 */
export async function getChatAttachmentUrl(workspaceId, storagePath) {
  await assertWorkspaceRole(workspaceId, 'viewer');

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from('workspace-files')
    .createSignedUrl(storagePath, 3600);   // 1 hour

  if (error) throw new Error(error.message);

  return { ok: true, url: data.signedUrl };
}
