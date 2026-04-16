'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Video, MapPin, X, Send } from 'lucide-react';
import { createComment } from '@/app/w/[slug]/files/[fileId]/actions';

/**
 * Formats milliseconds to M:SS timecode.
 * @param {number|null} ms
 * @returns {string|null}
 */
function msToTimecode(ms) {
  if (ms == null) return null;
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/**
 * CommentComposer — textarea for creating new comments.
 * Auto-links to the current video timestamp or image coordinate.
 *
 * Props:
 *  fileId         {string}
 *  activeTimestamp  {number|null}   Current video position in ms (from VideoReviewer).
 *  activeCoord      {{ x_percent, y_percent }|null}  Image pin from ImageReviewer.
 *  replyToId        {string|null}   Parent comment id for threaded replies.
 *  replyToBody      {string|null}   Preview of the comment being replied to.
 *  onCancelReply    {() => void}    Clears the replyTo state.
 *  onCoordClear     {() => void}    Called after submit to clear the pending image pin.
 *  onSuccess        {(comment: object) => void}  Called with the newly created comment.
 *
 * @param {object} props
 */
export default function CommentComposer({
  fileId,
  activeTimestamp = null,
  activeCoord     = null,
  replyToId       = null,
  replyToBody     = null,
  onCancelReply,
  onCoordClear,
  onSuccess,
}) {
  const [body, setBody] = useState('');
  const [error, setError]     = useState(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef(null);

  // Focus the textarea when a reply is requested
  useEffect(() => {
    if (replyToId && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyToId]);

  // Determine what context to attach (timestamp wins over coords)
  const timecode    = replyToId ? null : msToTimecode(activeTimestamp);
  const coordLabel  = replyToId ? null : (activeCoord
    ? `${Math.round(activeCoord.x_percent)}%, ${Math.round(activeCoord.y_percent)}%`
    : null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!body.trim()) return;

    setError(null);

    startTransition(async () => {
      try {
        const opts = {};

        if (replyToId) {
          // Replies don't attach timestamp/coords — they inherit from parent
          opts.parent_id = replyToId;
        } else {
          if (activeTimestamp != null) opts.timestamp_ms = activeTimestamp;
          if (activeCoord) {
            opts.x_percent = activeCoord.x_percent;
            opts.y_percent = activeCoord.y_percent;
          }
        }

        const result = await createComment(fileId, body, opts);
        setBody('');
        onSuccess?.(result.comment);
        onCancelReply?.();
        if (!replyToId) onCoordClear?.();
      } catch (err) {
        setError(err.message || 'Error al publicar el comentario. Inténtalo de nuevo.');
      }
    });
  };

  const handleKeyDown = (e) => {
    // Cmd/Ctrl+Enter submits
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-zinc-900 p-4 space-y-2.5">
      {/* Reply context banner */}
      {replyToId && replyToBody && (
        <div className="flex items-start gap-2 bg-zinc-900 rounded-lg px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-500">Respondiendo a:</p>
            <p className="text-xs text-zinc-400 truncate">{replyToBody}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Timestamp / coordinate context badge */}
      {!replyToId && (timecode || coordLabel) && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {timecode && (
            <span className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded">
              <Video className="w-3 h-3 text-[#d9ff00]/70" />
              <span className="text-[#d9ff00]/80">en {timecode}</span>
            </span>
          )}
          {coordLabel && (
            <span className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded">
              <MapPin className="w-3 h-3 text-blue-400/70" />
              <span className="text-blue-400/80">{coordLabel}</span>
            </span>
          )}
          <span className="text-zinc-700">(se adjuntará al comentario)</span>
        </div>
      )}

      {/* Text input */}
      <form onSubmit={handleSubmit} className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={replyToId ? 'Escribe tu respuesta...' : 'Escribe un comentario...'}
          rows={3}
          disabled={isPending}
          className="
            w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 pr-10
            text-sm text-white placeholder-zinc-600 resize-none
            focus:outline-none focus:border-zinc-600
            disabled:opacity-60 transition-colors
          "
        />

        <button
          type="submit"
          disabled={!body.trim() || isPending}
          className="
            absolute right-2.5 bottom-2.5
            w-7 h-7 rounded-lg bg-[#d9ff00] text-black
            flex items-center justify-center
            hover:opacity-90 disabled:opacity-30
            transition-opacity
          "
          title="Publicar comentario (⌘Enter)"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      <p className="text-[10px] text-zinc-700">⌘Enter para publicar</p>
    </div>
  );
}
