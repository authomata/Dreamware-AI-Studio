'use client';

import { useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import FileIcon from './FileIcon';

/**
 * FilePreview — renders a file inline based on its MIME type.
 *
 * Supported:
 *   - image/*      → <img> with signed URL
 *   - video/*      → <video controls> with signed URL
 *   - audio/*      → <audio controls> with signed URL
 *   - application/pdf → <iframe> with signed URL
 *   - others       → icon + download button
 *
 * All URLs are pre-generated server-side (1-hour signed URLs) and passed as props.
 *
 * @param {{
 *   file: { id: string, name: string, mime_type: string, size_bytes: number },
 *   signedUrl: string | null,
 *   className?: string,
 * }} props
 */
export default function FilePreview({ file, signedUrl, className = '' }) {
  const [imgError, setImgError] = useState(false);
  const mime = (file.mime_type || '').toLowerCase();

  if (!signedUrl) {
    return (
      <UnsupportedPreview file={file} signedUrl={null} reason="URL no disponible." />
    );
  }

  // Image
  if (mime.startsWith('image/') && !imgError) {
    return (
      <div className={`relative ${className}`}>
        <img
          src={signedUrl}
          alt={file.name}
          loading="lazy"
          onError={() => setImgError(true)}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>
    );
  }

  // Video
  if (mime.startsWith('video/')) {
    return (
      <div className={`w-full ${className}`}>
        <video
          src={signedUrl}
          controls
          className="w-full rounded-lg bg-black"
          preload="metadata"
        >
          Tu navegador no soporta reproducción de video.
        </video>
      </div>
    );
  }

  // Audio
  if (mime.startsWith('audio/')) {
    return (
      <div className={`w-full flex flex-col items-center gap-4 py-8 ${className}`}>
        <FileIcon mimeType={mime} className="w-16 h-16" />
        <p className="text-sm text-zinc-400 truncate max-w-xs">{file.name}</p>
        <audio src={signedUrl} controls className="w-full max-w-sm">
          Tu navegador no soporta reproducción de audio.
        </audio>
      </div>
    );
  }

  // PDF
  if (mime === 'application/pdf') {
    return (
      <div className={`w-full h-full min-h-[600px] ${className}`}>
        <iframe
          src={signedUrl}
          title={file.name}
          className="w-full h-full min-h-[600px] rounded-lg border border-zinc-800"
        />
      </div>
    );
  }

  // Fallback — download only
  return <UnsupportedPreview file={file} signedUrl={signedUrl} className={className} />;
}

function UnsupportedPreview({ file, signedUrl, className = '', reason }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-5 py-16 ${className}`}>
      <FileIcon mimeType={file.mime_type} className="w-20 h-20 opacity-60" />
      <div className="text-center">
        <p className="text-white font-medium">{file.name}</p>
        <p className="text-sm text-zinc-500 mt-1">
          {reason || 'Vista previa no disponible para este tipo de archivo.'}
        </p>
      </div>
      {signedUrl && (
        <a
          href={signedUrl}
          download={file.name}
          className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white transition-colors"
        >
          <Download className="w-4 h-4" />
          Descargar
        </a>
      )}
    </div>
  );
}
