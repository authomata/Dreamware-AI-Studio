'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  FolderOpen, Folder, MoreHorizontal, Plus, Pencil,
  Trash2, Move, Star, Download, ChevronRight, Grid, List,
} from 'lucide-react';
import FileIcon, { formatBytes, mimeLabel } from './FileIcon';
import FileUploader from './FileUploader';
import {
  createFolder, renameFolder, deleteFolder,
  renameFile, deleteFile, toggleReviewAsset,
} from '@/app/w/[slug]/files/actions';

/**
 * FileBrowser — main file management UI.
 *
 * Features:
 * - Breadcrumb navigation through folders
 * - Grid / List view toggle
 * - Drag-drop upload zone (covers entire browser)
 * - Folder and file context menus (rename, delete, move)
 * - New folder creation
 * - Links to file detail page for preview
 *
 * @param {{
 *   workspace: { id: string, slug: string },
 *   folders: Array<{ id: string, name: string, parent_id: string|null, created_at: string }>,
 *   files: Array<{ id: string, name: string, mime_type: string, size_bytes: number, created_at: string, is_review_asset: boolean, folder_id: string|null }>,
 *   currentFolderId: string | null,
 *   breadcrumbs: Array<{ id: string|null, name: string }>,
 *   canEdit: boolean,
 * }} props
 */
export default function FileBrowser({
  workspace,
  folders,
  files,
  currentFolderId,
  breadcrumbs,
  canEdit,
}) {
  const [viewMode, setViewMode]             = useState('grid'); // 'grid' | 'list'
  const [dragging, setDragging]             = useState(false);
  const [showUploader, setShowUploader]     = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName]   = useState('');
  const [error, setError]                   = useState(null);
  const [loading, setLoading]               = useState(null); // id of item being acted on

  const workspaceId   = workspace.id;
  const workspaceSlug = workspace.slug;

  // ── Folder creation ────────────────────────────────────────────────────────
  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setLoading('new-folder');
    setError(null);
    try {
      await createFolder(workspaceId, currentFolderId, newFolderName, workspaceSlug);
      setNewFolderName('');
      setCreatingFolder(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  // ── Folder rename ──────────────────────────────────────────────────────────
  async function handleRenameFolder(folderId, currentName) {
    const name = window.prompt('Nuevo nombre de carpeta:', currentName);
    if (!name || name === currentName) return;
    setLoading(folderId);
    setError(null);
    try {
      await renameFolder(folderId, name, workspaceId, workspaceSlug);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  // ── Folder delete ──────────────────────────────────────────────────────────
  async function handleDeleteFolder(folderId, name) {
    if (!confirm(`¿Eliminar la carpeta "${name}"? Los archivos dentro quedarán en la raíz del workspace.`)) return;
    setLoading(folderId);
    setError(null);
    try {
      await deleteFolder(folderId, workspaceId, workspaceSlug);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  // ── File rename ────────────────────────────────────────────────────────────
  async function handleRenameFile(fileId, currentName) {
    const name = window.prompt('Nuevo nombre:', currentName);
    if (!name || name === currentName) return;
    setLoading(fileId);
    setError(null);
    try {
      await renameFile(fileId, name, workspaceId, workspaceSlug);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  // ── File delete ────────────────────────────────────────────────────────────
  async function handleDeleteFile(fileId, name) {
    if (!confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) return;
    setLoading(fileId);
    setError(null);
    try {
      await deleteFile(fileId, workspaceId, workspaceSlug);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  // ── Toggle review asset ────────────────────────────────────────────────────
  async function handleToggleReview(fileId) {
    setLoading(fileId);
    try {
      await toggleReviewAsset(fileId, workspaceId, workspaceSlug);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  // ── Drag-drop on entire browser ────────────────────────────────────────────
  function handleDragOver(e) {
    e.preventDefault();
    if (canEdit) setDragging(true);
  }
  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  }
  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (!canEdit || !e.dataTransfer.files.length) return;
    setShowUploader(true);
    // The FileUploader will handle the dropped files via its own drag logic.
    // We can't pass files from here to FileUploader directly — user should
    // drop directly onto the FileUploader zone that appears.
  }

  return (
    <div
      className="relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-over overlay */}
      {dragging && canEdit && (
        <div className="absolute inset-0 z-20 border-2 border-dashed border-[#d9ff00] rounded-xl bg-[#d9ff00]/5 flex items-center justify-center pointer-events-none">
          <p className="text-[#d9ff00] font-semibold">Suelta para subir</p>
        </div>
      )}

      {/* Breadcrumbs + toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 text-sm flex-wrap">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            const href   = crumb.id
              ? `/w/${workspaceSlug}/files?folder=${crumb.id}`
              : `/w/${workspaceSlug}/files`;
            return (
              <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-zinc-700" />}
                {isLast ? (
                  <span className="text-white font-medium">{crumb.name}</span>
                ) : (
                  <Link href={href} className="text-zinc-400 hover:text-white transition-colors">
                    {crumb.name}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-600 hover:text-zinc-300'}`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-600 hover:text-zinc-300'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {canEdit && (
            <>
              <button
                onClick={() => setCreatingFolder(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Carpeta
              </button>
              <button
                onClick={() => setShowUploader(!showUploader)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#d9ff00] text-black font-semibold rounded-lg hover:bg-yellow-300 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Subir
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300 flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-300">×</button>
        </div>
      )}

      {/* Uploader (shown when Subir is clicked) */}
      {showUploader && canEdit && (
        <div className="mb-4 p-4 border border-zinc-800 rounded-xl bg-zinc-900/30">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-white">Subir archivos</p>
            <button onClick={() => setShowUploader(false)} className="text-zinc-600 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <FileUploader
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            folderId={currentFolderId}
            onComplete={() => setShowUploader(false)}
          />
        </div>
      )}

      {/* New folder input */}
      {creatingFolder && (
        <form onSubmit={handleCreateFolder} className="mb-4 flex items-center gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Nombre de carpeta"
            autoFocus
            className="flex-1 px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={!newFolderName.trim() || loading === 'new-folder'}
            className="px-3 py-2 text-sm bg-[#d9ff00] text-black font-semibold rounded-lg disabled:opacity-50"
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}
            className="px-3 py-2 text-sm text-zinc-400 hover:text-white"
          >
            Cancelar
          </button>
        </form>
      )}

      {/* Empty state */}
      {folders.length === 0 && files.length === 0 && (
        <div className="text-center py-20 text-zinc-600">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {canEdit ? 'Esta carpeta está vacía. Sube archivos o crea una subcarpeta.' : 'Esta carpeta está vacía.'}
          </p>
        </div>
      )}

      {/* Grid view */}
      {viewMode === 'grid' && (folders.length > 0 || files.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Folders first */}
          {folders.map(folder => (
            <FolderCard
              key={folder.id}
              folder={folder}
              workspaceSlug={workspaceSlug}
              isLoading={loading === folder.id}
              canEdit={canEdit}
              onRename={() => handleRenameFolder(folder.id, folder.name)}
              onDelete={() => handleDeleteFolder(folder.id, folder.name)}
            />
          ))}
          {/* Files */}
          {files.map(file => (
            <FileCard
              key={file.id}
              file={file}
              workspaceSlug={workspaceSlug}
              isLoading={loading === file.id}
              canEdit={canEdit}
              onRename={() => handleRenameFile(file.id, file.name)}
              onDelete={() => handleDeleteFile(file.id, file.name)}
              onToggleReview={() => handleToggleReview(file.id)}
            />
          ))}
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (folders.length > 0 || files.length > 0) && (
        <div className="border border-zinc-900 rounded-xl overflow-hidden">
          {folders.map(folder => (
            <FolderRow
              key={folder.id}
              folder={folder}
              workspaceSlug={workspaceSlug}
              isLoading={loading === folder.id}
              canEdit={canEdit}
              onRename={() => handleRenameFolder(folder.id, folder.name)}
              onDelete={() => handleDeleteFolder(folder.id, folder.name)}
            />
          ))}
          {files.map(file => (
            <FileRow
              key={file.id}
              file={file}
              workspaceSlug={workspaceSlug}
              isLoading={loading === file.id}
              canEdit={canEdit}
              onRename={() => handleRenameFile(file.id, file.name)}
              onDelete={() => handleDeleteFile(file.id, file.name)}
              onToggleReview={() => handleToggleReview(file.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FolderCard({ folder, workspaceSlug, isLoading, canEdit, onRename, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={`relative group rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors bg-zinc-900/20 ${isLoading ? 'opacity-50' : ''}`}>
      <Link href={`/w/${workspaceSlug}/files?folder=${folder.id}`} className="block p-4">
        <Folder className="w-8 h-8 text-yellow-500 mb-2" />
        <p className="text-sm text-white font-medium truncate">{folder.name}</p>
      </Link>
      {canEdit && (
        <ContextMenu open={menuOpen} onToggle={() => setMenuOpen(!menuOpen)} onClose={() => setMenuOpen(false)}>
          <MenuItem icon={Pencil} label="Renombrar" onClick={() => { setMenuOpen(false); onRename(); }} />
          <MenuItem icon={Trash2} label="Eliminar" onClick={() => { setMenuOpen(false); onDelete(); }} danger />
        </ContextMenu>
      )}
    </div>
  );
}

function FileCard({ file, workspaceSlug, isLoading, canEdit, onRename, onDelete, onToggleReview }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={`relative group rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors bg-zinc-900/20 ${isLoading ? 'opacity-50' : ''}`}>
      <Link href={`/w/${workspaceSlug}/files/${file.id}`} className="block p-4">
        <div className="flex items-start justify-between mb-2">
          <FileIcon mimeType={file.mime_type} className="w-8 h-8" />
          {file.is_review_asset && (
            <Star className="w-3.5 h-3.5 text-[#d9ff00]" />
          )}
        </div>
        <p className="text-sm text-white font-medium truncate">{file.name}</p>
        <p className="text-xs text-zinc-600 mt-0.5">{formatBytes(file.size_bytes)}</p>
      </Link>
      {canEdit && (
        <ContextMenu open={menuOpen} onToggle={() => setMenuOpen(!menuOpen)} onClose={() => setMenuOpen(false)}>
          <MenuItem icon={Pencil} label="Renombrar" onClick={() => { setMenuOpen(false); onRename(); }} />
          <MenuItem icon={Star}   label={file.is_review_asset ? 'Quitar de Review' : 'Marcar para Review'} onClick={() => { setMenuOpen(false); onToggleReview(); }} />
          <MenuItem icon={Trash2} label="Eliminar"  onClick={() => { setMenuOpen(false); onDelete(); }} danger />
        </ContextMenu>
      )}
    </div>
  );
}

function FolderRow({ folder, workspaceSlug, isLoading, canEdit, onRename, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={`flex items-center gap-3 p-3 border-b border-zinc-900 last:border-0 hover:bg-zinc-900/30 transition-colors ${isLoading ? 'opacity-50' : ''}`}>
      <Folder className="w-5 h-5 text-yellow-500 flex-shrink-0" />
      <Link href={`/w/${workspaceSlug}/files?folder=${folder.id}`} className="flex-1 text-sm text-white truncate hover:underline">
        {folder.name}
      </Link>
      <span className="text-xs text-zinc-600 whitespace-nowrap">
        {formatDistanceToNow(new Date(folder.created_at), { addSuffix: true, locale: es })}
      </span>
      {canEdit && (
        <ContextMenu open={menuOpen} onToggle={() => setMenuOpen(!menuOpen)} onClose={() => setMenuOpen(false)}>
          <MenuItem icon={Pencil} label="Renombrar" onClick={() => { setMenuOpen(false); onRename(); }} />
          <MenuItem icon={Trash2} label="Eliminar"  onClick={() => { setMenuOpen(false); onDelete(); }} danger />
        </ContextMenu>
      )}
    </div>
  );
}

function FileRow({ file, workspaceSlug, isLoading, canEdit, onRename, onDelete, onToggleReview }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={`flex items-center gap-3 p-3 border-b border-zinc-900 last:border-0 hover:bg-zinc-900/30 transition-colors ${isLoading ? 'opacity-50' : ''}`}>
      <FileIcon mimeType={file.mime_type} className="w-5 h-5 flex-shrink-0" />
      <Link href={`/w/${workspaceSlug}/files/${file.id}`} className="flex-1 text-sm text-white truncate hover:underline">
        {file.name}
      </Link>
      {file.is_review_asset && <Star className="w-3.5 h-3.5 text-[#d9ff00] flex-shrink-0" />}
      <span className="text-xs text-zinc-600 whitespace-nowrap">{formatBytes(file.size_bytes)}</span>
      <span className="text-xs text-zinc-600 whitespace-nowrap">
        {formatDistanceToNow(new Date(file.created_at), { addSuffix: true, locale: es })}
      </span>
      {canEdit && (
        <ContextMenu open={menuOpen} onToggle={() => setMenuOpen(!menuOpen)} onClose={() => setMenuOpen(false)}>
          <MenuItem icon={Pencil} label="Renombrar"  onClick={() => { setMenuOpen(false); onRename(); }} />
          <MenuItem icon={Star}   label={file.is_review_asset ? 'Quitar de Review' : 'Marcar para Review'} onClick={() => { setMenuOpen(false); onToggleReview(); }} />
          <MenuItem icon={Trash2} label="Eliminar"   onClick={() => { setMenuOpen(false); onDelete(); }} danger />
        </ContextMenu>
      )}
    </div>
  );
}

function ContextMenu({ open, onToggle, onClose, children }) {
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggle(); }}
        className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition-all text-zinc-400"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onClose} />
          <div className="absolute right-0 top-8 z-40 bg-zinc-950 border border-zinc-800 rounded-xl shadow-xl overflow-hidden min-w-36 py-1">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors ${
        danger ? 'text-red-400 hover:bg-red-900/20' : 'text-zinc-300 hover:bg-zinc-800'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

// Re-export X for the uploader close button (used inside FileBrowser)
function X({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
