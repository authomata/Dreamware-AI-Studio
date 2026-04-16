'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { formatBytes } from './FileIcon';
import { registerUploadedFile } from '@/app/w/[slug]/files/actions';

const MAX_MB       = parseInt(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB || '50', 10);
const MAX_BYTES    = MAX_MB * 1024 * 1024;

/**
 * @typedef {{ id: string, file: File, status: 'pending'|'uploading'|'done'|'error', progress: number, error?: string }} UploadItem
 */

/**
 * FileUploader — multi-file uploader with per-file progress bars.
 *
 * Upload flow:
 *   1. POST /api/upload/sign  → get signed URL + storage_path + file_id
 *   2. PUT signed URL with binary  → uploads to Supabase Storage
 *   3. registerUploadedFile() server action → creates files table row
 *
 * @param {{
 *   workspaceId: string,
 *   workspaceSlug: string,
 *   folderId: string | null,
 *   onComplete?: () => void,
 *   compact?: boolean,
 * }} props
 */
export default function FileUploader({ workspaceId, workspaceSlug, folderId, onComplete, compact = false }) {
  const [items, setItems]       = useState(/** @type {UploadItem[]} */ ([]));
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const updateItem = useCallback((id, patch) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }, []);

  async function uploadFile(item) {
    updateItem(item.id, { status: 'uploading', progress: 0 });

    try {
      // Step 1: get signed URL
      const signRes = await fetch('/api/upload/sign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          folder_id:    folderId || null,
          filename:     item.file.name,
          mime_type:    item.file.type || 'application/octet-stream',
          size:         item.file.size,
        }),
      });

      const signData = await signRes.json();

      if (!signRes.ok) {
        updateItem(item.id, { status: 'error', error: signData.error || 'Error al preparar el upload.' });
        return;
      }

      const { upload_url, storage_path, file_id } = signData;

      // Step 2: PUT binary to signed URL using XMLHttpRequest for progress tracking
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', upload_url);
        xhr.setRequestHeader('Content-Type', item.file.type || 'application/octet-stream');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            updateItem(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
          }
        };
        xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Error de red durante el upload.'));
        xhr.send(item.file);
      });

      updateItem(item.id, { progress: 95 }); // 5% reserved for registerUploadedFile

      // Step 3: register in files table
      await registerUploadedFile(
        workspaceId,
        folderId || null,
        {
          file_id,
          name:         item.file.name,
          storage_path,
          mime_type:    item.file.type || 'application/octet-stream',
          size_bytes:   item.file.size,
          metadata:     {},
        },
        workspaceSlug,
      );

      updateItem(item.id, { status: 'done', progress: 100 });

    } catch (err) {
      updateItem(item.id, { status: 'error', error: err.message || 'Error desconocido.' });
    }
  }

  function handleFiles(fileList) {
    const newItems = Array.from(fileList).map(file => ({
      id:       crypto.randomUUID(),
      file,
      status:   'pending',
      progress: 0,
    }));

    // Client-side size pre-check (server also validates, this is UX only)
    const toUpload = newItems.map(item => {
      if (item.file.size > MAX_BYTES) {
        return { ...item, status: 'error', error: `Supera el límite de ${MAX_MB} MB.` };
      }
      return item;
    });

    setItems(prev => [...prev, ...toUpload]);

    // Start uploads for valid items
    toUpload
      .filter(i => i.status === 'pending')
      .forEach(item => uploadFile(item));
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  function handleInputChange(e) {
    if (e.target.files.length) handleFiles(e.target.files);
    e.target.value = ''; // reset so the same file can be selected again
  }

  function removeItem(id) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function clearCompleted() {
    setItems(prev => prev.filter(i => i.status !== 'done'));
    if (onComplete) onComplete();
  }

  const hasActive  = items.some(i => i.status === 'uploading' || i.status === 'pending');
  const allDone    = items.length > 0 && items.every(i => i.status === 'done' || i.status === 'error');

  if (compact && items.length === 0) {
    return (
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors"
      >
        <Upload className="w-4 h-4 text-zinc-400" />
        Subir archivos
        <input ref={inputRef} type="file" multiple className="hidden" onChange={handleInputChange} />
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
          ${dragging
            ? 'border-[#d9ff00] bg-[#d9ff00]/5'
            : 'border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900/30'}
        `}
      >
        <Upload className={`w-7 h-7 mx-auto mb-2 transition-colors ${dragging ? 'text-[#d9ff00]' : 'text-zinc-600'}`} />
        <p className="text-sm text-zinc-400">
          <span className="text-white font-medium">Arrastra archivos aquí</span> o haz clic para seleccionar
        </p>
        <p className="text-xs text-zinc-600 mt-1">Máximo {MAX_MB} MB por archivo</p>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={handleInputChange} />
      </div>

      {/* Upload queue */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <UploadRow
              key={item.id}
              item={item}
              onRemove={() => removeItem(item.id)}
            />
          ))}

          {allDone && (
            <button
              onClick={clearCompleted}
              className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1.5 transition-colors"
            >
              Limpiar completados
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Single row in the upload queue */
function UploadRow({ item, onRemove }) {
  const { file, status, progress, error } = item;

  const statusIcon = {
    pending:   <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />,
    uploading: <div className="w-4 h-4 rounded-full border-2 border-t-[#d9ff00] border-zinc-700 animate-spin" />,
    done:      <CheckCircle className="w-4 h-4 text-[#d9ff00]" />,
    error:     <AlertCircle className="w-4 h-4 text-red-400" />,
  }[status];

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
      status === 'error' ? 'border-red-900/50 bg-red-900/10' : 'border-zinc-800 bg-zinc-900/30'
    }`}>
      {statusIcon}

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{file.name}</p>

        {status === 'uploading' && (
          <div className="mt-1.5 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#d9ff00] rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {status === 'error' && (
          <p className="text-xs text-red-400 mt-0.5">{error}</p>
        )}

        {status === 'done' && (
          <p className="text-xs text-zinc-500 mt-0.5">{formatBytes(file.size)} · Subido</p>
        )}

        {status === 'pending' && (
          <p className="text-xs text-zinc-600 mt-0.5">{formatBytes(file.size)} · En espera…</p>
        )}
      </div>

      {(status === 'done' || status === 'error') && (
        <button onClick={onRemove} className="p-0.5 text-zinc-600 hover:text-zinc-300 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
