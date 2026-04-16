'use client';

import { useRef, useEffect, useState, useTransition } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, Circle, Trash2, Edit2, Reply, Video, MapPin, ChevronDown, ChevronRight } from 'lucide-react';
import {
  resolveComment,
  unresolveComment,
  deleteComment,
  editComment,
} from '@/app/w/[slug]/files/[fileId]/actions';

/**
 * Formats milliseconds into a readable timecode M:SS.
 * @param {number} ms
 */
function msToTimecode(ms) {
  if (ms == null) return null;
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Single comment card with inline actions.
 * @param {{ comment, currentUserId, canEdit, onFocusReply, onSeekRequest, focusedCommentId, onFocusComment }} props
 */
function CommentCard({
  comment,
  currentUserId,
  canEdit,
  isAdmin,
  onFocusReply,
  onSeekRequest,
  focusedCommentId,
  onFocusComment,
  replies = [],
}) {
  const cardRef         = useRef(null);
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing]        = useState(false);
  const [editBody, setEditBody]      = useState(comment.body);
  const [showReplies, setShowReplies] = useState(true);

  const isFocused  = comment.id === focusedCommentId;
  const isAuthor   = comment.author_id === currentUserId;
  const isResolved = !!comment.resolved_at;

  const timecode  = msToTimecode(comment.timestamp_ms);
  const hasCoord  = comment.x_percent != null && comment.y_percent != null;

  // Scroll into view when focused
  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isFocused]);

  const handleResolveToggle = () => {
    startTransition(async () => {
      try {
        if (isResolved) await unresolveComment(comment.id);
        else            await resolveComment(comment.id);
      } catch (err) {
        console.error(err);
      }
    });
  };

  const handleDelete = () => {
    if (!confirm('¿Estás seguro de que quieres eliminar este comentario?')) return;
    startTransition(async () => {
      try {
        await deleteComment(comment.id);
      } catch (err) {
        console.error(err);
      }
    });
  };

  const handleEditSave = () => {
    if (!editBody.trim()) return;
    startTransition(async () => {
      try {
        await editComment(comment.id, editBody);
        setEditing(false);
      } catch (err) {
        console.error(err);
      }
    });
  };

  const authorName = comment.author?.full_name || comment.author?.email || 'Usuario';
  const authorInitial = authorName.charAt(0).toUpperCase();

  return (
    <div
      ref={cardRef}
      className={`
        rounded-xl border p-3 space-y-2 transition-colors
        ${isFocused
          ? 'border-[#d9ff00]/40 bg-[#d9ff00]/5'
          : isResolved
            ? 'border-zinc-800/50 bg-zinc-950/30 opacity-60'
            : 'border-zinc-800 bg-zinc-950/50'
        }
      `}
      onClick={() => onFocusComment?.(comment.id)}
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        {/* Author avatar */}
        <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 mt-0.5">
          {comment.author?.avatar_url
            ? <img src={comment.author.avatar_url} alt={authorName} className="w-6 h-6 rounded-full object-cover" />
            : authorInitial}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-white">{authorName}</span>
            <span className="text-xs text-zinc-600">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: es })}
            </span>

            {/* Timestamp badge for video */}
            {timecode && (
              <button
                onClick={(e) => { e.stopPropagation(); onSeekRequest?.(comment.timestamp_ms); }}
                className="flex items-center gap-1 text-xs text-[#d9ff00]/80 hover:text-[#d9ff00] transition-colors"
                title="Ir a este momento en el video"
              >
                <Video className="w-3 h-3" />
                {timecode}
              </button>
            )}

            {/* Coordinate badge for image */}
            {hasCoord && (
              <span className="flex items-center gap-1 text-xs text-blue-400/80">
                <MapPin className="w-3 h-3" />
                {Math.round(comment.x_percent)}%, {Math.round(comment.y_percent)}%
              </span>
            )}

            {/* Resolved badge */}
            {isResolved && (
              <span className="text-xs text-zinc-600 italic">Resuelto</span>
            )}
          </div>

          {/* Body or edit form */}
          {editing ? (
            <div className="mt-1.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={3}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-white resize-none focus:outline-none focus:border-zinc-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleEditSave}
                  disabled={isPending}
                  className="text-xs px-2.5 py-1 bg-[#d9ff00] text-black rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  Guardar
                </button>
                <button
                  onClick={() => { setEditing(false); setEditBody(comment.body); }}
                  className="text-xs px-2.5 py-1 text-zinc-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap break-words leading-relaxed">
                {comment.body}
              </p>

              {/* Frame.io resolve audit line — who resolved it and when */}
              {comment.resolved_at && comment.resolver && (
                <p className="text-xs text-zinc-600 mt-1.5 italic">
                  Resuelto por {comment.resolver.full_name || 'alguien'}{' '}
                  {formatDistanceToNow(new Date(comment.resolved_at), {
                    locale: es,
                    addSuffix: true,
                  })}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Actions row */}
      {!editing && (
        <div className="flex items-center gap-3 pl-8" onClick={(e) => e.stopPropagation()}>
          {/* Reply */}
          <button
            onClick={() => onFocusReply?.(comment.id)}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <Reply className="w-3 h-3" />
            Responder
          </button>

          {/* Resolve / Unresolve (editor+ or admin) */}
          {canEdit && (
            <button
              onClick={handleResolveToggle}
              disabled={isPending}
              className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-40"
              title={isResolved ? 'Reabrir comentario' : 'Marcar como resuelto'}
            >
              {isResolved
                ? <><Circle        className="w-3 h-3" /> Reabrir</>
                : <><CheckCircle2 className="w-3 h-3" /> Resolver</>
              }
            </button>
          )}

          {/* Edit (author only) */}
          {isAuthor && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              <Edit2 className="w-3 h-3" />
              Editar
            </button>
          )}

          {/* Delete (author or admin) */}
          {(isAuthor || isAdmin) && (
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="flex items-center gap-1 text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
            >
              <Trash2 className="w-3 h-3" />
              Eliminar
            </button>
          )}
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="pl-8 space-y-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowReplies((s) => !s); }}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {showReplies ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {replies.length} {replies.length === 1 ? 'respuesta' : 'respuestas'}
          </button>

          {showReplies && replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              canEdit={canEdit}
              isAdmin={isAdmin}
              onFocusReply={onFocusReply}
              onSeekRequest={onSeekRequest}
              focusedCommentId={focusedCommentId}
              onFocusComment={onFocusComment}
              replies={[]} // no nested replies beyond 1 level in UI
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentThread — full list of comments grouped as top-level + replies
// ---------------------------------------------------------------------------

/**
 * CommentThread — renders all comments for a file, threaded by parent_id.
 *
 * @param {{
 *   comments: Array,
 *   currentUserId: string,
 *   canEdit: boolean,
 *   isAdmin: boolean,
 *   focusedCommentId: string|null,
 *   onFocusComment: (id: string) => void,
 *   onReplyTo: (parentId: string) => void,
 *   onSeekRequest: (ms: number) => void,
 *   showResolved: boolean,
 * }} props
 */
export default function CommentThread({
  comments = [],
  currentUserId,
  canEdit = false,
  isAdmin = false,
  focusedCommentId,
  onFocusComment,
  onReplyTo,
  onSeekRequest,
  showResolved = true,
}) {
  const [filterResolved, setFilterResolved] = useState(!showResolved);

  // Separate top-level from replies
  const topLevel = comments.filter((c) => c.parent_id == null);
  const repliesMap = {};
  comments.filter((c) => c.parent_id != null).forEach((c) => {
    if (!repliesMap[c.parent_id]) repliesMap[c.parent_id] = [];
    repliesMap[c.parent_id].push(c);
  });

  const visible = filterResolved
    ? topLevel.filter((c) => !c.resolved_at)
    : topLevel;

  const resolvedCount = topLevel.filter((c) => c.resolved_at).length;

  if (comments.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-zinc-500 text-sm">Aún no hay comentarios.</p>
          <p className="text-zinc-700 text-xs mt-1">
            {canEdit ? 'Agrega el primero abajo.' : 'Los comentarios aparecerán acá.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Filter bar */}
      <div className="px-4 py-2 border-b border-zinc-900 flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          {topLevel.length} {topLevel.length === 1 ? 'comentario' : 'comentarios'}
        </span>
        {resolvedCount > 0 && (
          <button
            onClick={() => setFilterResolved((f) => !f)}
            className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            {filterResolved
              ? `Mostrar ${resolvedCount} resueltos`
              : `Ocultar ${resolvedCount} resueltos`
            }
          </button>
        )}
      </div>

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {visible.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            currentUserId={currentUserId}
            canEdit={canEdit}
            isAdmin={isAdmin}
            onFocusReply={onReplyTo}
            onSeekRequest={onSeekRequest}
            focusedCommentId={focusedCommentId}
            onFocusComment={onFocusComment}
            replies={repliesMap[comment.id] || []}
          />
        ))}
        {visible.length === 0 && resolvedCount > 0 && (
          <p className="text-xs text-zinc-600 text-center py-4">
            Todos los comentarios están resueltos.
          </p>
        )}
      </div>
    </div>
  );
}
