import {
  FileText, FileImage, FileVideo, FileAudio,
  FileArchive, FileCode, File,
} from 'lucide-react';

/**
 * Returns the appropriate lucide-react icon component for a given MIME type.
 * Used in FileBrowser and file lists.
 *
 * @param {{ mimeType: string, className?: string, size?: number }} props
 */
export default function FileIcon({ mimeType, className = 'w-5 h-5', size }) {
  const mime = (mimeType || '').toLowerCase();

  let Icon;
  let colorClass;

  if (mime.startsWith('image/')) {
    Icon = FileImage;
    colorClass = 'text-blue-400';
  } else if (mime.startsWith('video/')) {
    Icon = FileVideo;
    colorClass = 'text-purple-400';
  } else if (mime.startsWith('audio/')) {
    Icon = FileAudio;
    colorClass = 'text-pink-400';
  } else if (mime === 'application/pdf') {
    Icon = FileText;
    colorClass = 'text-red-400';
  } else if (mime === 'application/zip') {
    Icon = FileArchive;
    colorClass = 'text-yellow-500';
  } else if (
    mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv'
  ) {
    Icon = FileText;
    colorClass = 'text-green-400';
  } else if (
    mime.includes('presentation') || mime.includes('powerpoint')
  ) {
    Icon = FileText;
    colorClass = 'text-orange-400';
  } else if (
    mime.includes('word') || mime.includes('document') ||
    mime === 'text/plain' || mime === 'text/markdown'
  ) {
    Icon = FileText;
    colorClass = 'text-blue-300';
  } else if (mime.startsWith('text/')) {
    Icon = FileCode;
    colorClass = 'text-zinc-400';
  } else {
    Icon = File;
    colorClass = 'text-zinc-500';
  }

  return <Icon className={`${className} ${colorClass}`} size={size} />;
}

/**
 * Returns a human-readable label for a MIME type.
 * @param {string} mimeType
 * @returns {string}
 */
export function mimeLabel(mimeType) {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/'))   return 'Imagen';
  if (mime.startsWith('video/'))   return 'Video';
  if (mime.startsWith('audio/'))   return 'Audio';
  if (mime === 'application/pdf')  return 'PDF';
  if (mime === 'application/zip')  return 'ZIP';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') return 'Planilla';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'Presentación';
  if (mime.includes('word') || mime.includes('document'))           return 'Documento';
  if (mime === 'text/plain')     return 'Texto';
  if (mime === 'text/markdown')  return 'Markdown';
  return 'Archivo';
}

/**
 * Format bytes as human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k     = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i     = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
