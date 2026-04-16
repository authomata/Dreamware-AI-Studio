'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertWorkspaceRole } from '@/lib/workspace/assertWorkspaceRole';

// ---------------------------------------------------------------------------
// Folder actions
// ---------------------------------------------------------------------------

/**
 * Create a new folder inside a workspace.
 *
 * @param {string} workspaceId
 * @param {string|null} parentId - null = root level
 * @param {string} name
 * @param {string} workspaceSlug
 */
export async function createFolder(workspaceId, parentId, name, workspaceSlug) {
  const { user } = await assertWorkspaceRole(workspaceId, 'editor');
  const admin    = createAdminClient();

  // If parentId is given, verify it belongs to this workspace
  if (parentId) {
    const { data: parent } = await admin
      .from('folders')
      .select('id')
      .eq('id', parentId)
      .eq('workspace_id', workspaceId)
      .single();
    if (!parent) throw new Error('Carpeta padre no encontrada.');
  }

  const { error } = await admin
    .from('folders')
    .insert({ workspace_id: workspaceId, parent_id: parentId, name: name.trim(), created_by: user.id });

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceSlug}/files`);
  return { success: true };
}

/**
 * Rename a folder.
 *
 * @param {string} folderId
 * @param {string} newName
 * @param {string} workspaceId   - for authorization check
 * @param {string} workspaceSlug
 */
export async function renameFolder(folderId, newName, workspaceId, workspaceSlug) {
  await assertWorkspaceRole(workspaceId, 'editor');
  const admin = createAdminClient();

  const { error } = await admin
    .from('folders')
    .update({ name: newName.trim() })
    .eq('id', folderId)
    .eq('workspace_id', workspaceId); // safety: scope to workspace

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceSlug}/files`);
  return { success: true };
}

/**
 * Delete a folder. Files inside are NOT deleted — their folder_id goes to null
 * (ON DELETE SET NULL on folders FK in files table). This is a known debt:
 * orphaned files remain in Storage and the files table.
 * TODO: scheduled cleanup job for folder_id=null files older than N days.
 *
 * @param {string} folderId
 * @param {string} workspaceId
 * @param {string} workspaceSlug
 */
export async function deleteFolder(folderId, workspaceId, workspaceSlug) {
  await assertWorkspaceRole(workspaceId, 'editor');
  const admin = createAdminClient();

  const { error } = await admin
    .from('folders')
    .delete()
    .eq('id', folderId)
    .eq('workspace_id', workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceSlug}/files`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// File registration (called after successful upload to Storage)
// ---------------------------------------------------------------------------

/**
 * Register a file in the files table after it has been uploaded to Storage.
 * Verifies the object exists in Storage before creating the DB record to
 * prevent ghost rows from failed uploads.
 *
 * @param {string} workspaceId
 * @param {string|null} folderId
 * @param {{ file_id: string, name: string, storage_path: string, mime_type: string, size_bytes: number, metadata?: object }} fileData
 * @param {string} workspaceSlug
 */
export async function registerUploadedFile(workspaceId, folderId, fileData, workspaceSlug) {
  const { user } = await assertWorkspaceRole(workspaceId, 'editor');
  const admin    = createAdminClient();

  const { file_id, name, storage_path, mime_type, size_bytes, metadata = {} } = fileData;

  if (!file_id || !name || !storage_path || !mime_type || !size_bytes) {
    throw new Error('Datos de archivo incompletos.');
  }

  // Verify the file actually exists in Storage (guard against ghost rows)
  const pathDir      = storage_path.split('/').slice(0, -1).join('/');
  const pathFilename = storage_path.split('/').pop();

  const { data: listed } = await admin.storage
    .from('workspace-files')
    .list(pathDir, { search: pathFilename });

  const exists = listed?.some(obj => obj.name === pathFilename);
  if (!exists) {
    throw new Error('El archivo no se encontró en Storage. El upload puede haber fallado.');
  }

  // Create the DB record (use admin client — validation above is the authorization)
  const { error } = await admin
    .from('files')
    .insert({
      id:           file_id,
      workspace_id: workspaceId,
      folder_id:    folderId || null,
      name:         name.trim(),
      storage_path,
      mime_type,
      size_bytes,
      uploaded_by:  user.id,
      metadata,
    });

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceSlug}/files`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// File mutation actions
// ---------------------------------------------------------------------------

/**
 * Rename a file (display name only — storage_path is immutable).
 *
 * @param {string} fileId
 * @param {string} newName
 * @param {string} workspaceId
 * @param {string} workspaceSlug
 */
export async function renameFile(fileId, newName, workspaceId, workspaceSlug) {
  await assertWorkspaceRole(workspaceId, 'editor');
  const admin = createAdminClient();

  const { error } = await admin
    .from('files')
    .update({ name: newName.trim() })
    .eq('id', fileId)
    .eq('workspace_id', workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceSlug}/files`);
  return { success: true };
}

/**
 * Move a file to a different folder (or to root if newFolderId is null).
 *
 * @param {string} fileId
 * @param {string|null} newFolderId
 * @param {string} workspaceId
 * @param {string} workspaceSlug
 */
export async function moveFile(fileId, newFolderId, workspaceId, workspaceSlug) {
  await assertWorkspaceRole(workspaceId, 'editor');
  const admin = createAdminClient();

  // If moving to a folder, verify it belongs to this workspace
  if (newFolderId) {
    const { data: folder } = await admin
      .from('folders')
      .select('id')
      .eq('id', newFolderId)
      .eq('workspace_id', workspaceId)
      .single();
    if (!folder) throw new Error('Carpeta de destino no encontrada.');
  }

  const { error } = await admin
    .from('files')
    .update({ folder_id: newFolderId })
    .eq('id', fileId)
    .eq('workspace_id', workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceSlug}/files`);
  return { success: true };
}

/**
 * Delete a file — removes the DB record AND the Storage object.
 * App-level restriction: only the uploader or a workspace admin+ can delete.
 *
 * @param {string} fileId
 * @param {string} workspaceId
 * @param {string} workspaceSlug
 */
export async function deleteFile(fileId, workspaceId, workspaceSlug) {
  const { user, membership } = await assertWorkspaceRole(workspaceId, 'editor');
  const admin = createAdminClient();

  // Fetch the file to get storage_path and uploader
  const { data: file } = await admin
    .from('files')
    .select('storage_path, uploaded_by')
    .eq('id', fileId)
    .eq('workspace_id', workspaceId)
    .single();

  if (!file) throw new Error('Archivo no encontrado.');

  // Only uploader or workspace admin+ can delete
  const isAuthor   = file.uploaded_by === user.id;
  const isWsAdmin  = ['admin', 'owner'].includes(membership.role);

  if (!isAuthor && !isWsAdmin) {
    throw new Error('Solo el autor o un administrador puede eliminar este archivo.');
  }

  // Delete from Storage first
  const { error: storageError } = await admin.storage
    .from('workspace-files')
    .remove([file.storage_path]);

  if (storageError) {
    console.error('[deleteFile] Storage remove error:', storageError.message);
    // Non-fatal: continue to remove DB record even if Storage delete fails
    // (avoids broken references; Storage object becomes orphaned but that's recoverable)
  }

  // Delete DB record (triggers storage_used_bytes decrement)
  const { error: dbError } = await admin
    .from('files')
    .delete()
    .eq('id', fileId)
    .eq('workspace_id', workspaceId);

  if (dbError) throw new Error(dbError.message);

  revalidatePath(`/w/${workspaceSlug}/files`);
  return { success: true };
}

/**
 * Toggle the is_review_asset flag on a file.
 * When true, the file appears in the Media Review tab (Phase 3).
 * Requires editor+ role.
 *
 * @param {string} fileId
 * @param {string} workspaceId
 * @param {string} workspaceSlug
 */
export async function toggleReviewAsset(fileId, workspaceId, workspaceSlug) {
  await assertWorkspaceRole(workspaceId, 'editor');
  const admin = createAdminClient();

  // Fetch current state
  const { data: file } = await admin
    .from('files')
    .select('is_review_asset')
    .eq('id', fileId)
    .eq('workspace_id', workspaceId)
    .single();

  if (!file) throw new Error('Archivo no encontrado.');

  const { error } = await admin
    .from('files')
    .update({ is_review_asset: !file.is_review_asset })
    .eq('id', fileId)
    .eq('workspace_id', workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceSlug}/files`);
  return { success: true, is_review_asset: !file.is_review_asset };
}

// ---------------------------------------------------------------------------
// Download URL helper
// ---------------------------------------------------------------------------

/**
 * Generate a signed download URL for a file (server-side, 1-hour expiry).
 * Called from Server Components when loading file detail pages.
 *
 * @param {string} storagePath
 * @returns {Promise<string|null>} signed URL or null on error
 */
export async function getSignedDownloadUrl(storagePath) {
  const admin = createAdminClient();

  const { data, error } = await admin.storage
    .from('workspace-files')
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (error || !data) {
    console.error('[getSignedDownloadUrl] error:', error?.message);
    return null;
  }

  return data.signedUrl;
}
