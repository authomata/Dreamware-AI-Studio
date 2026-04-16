'use client';

import { useRef, useEffect, useState, useTransition } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  CheckCircle2, Circle, Trash2, Reply,
  ChevronDown, ChevronRight, Quote,
} from 'lucide-react';
import {
  resolveDocumentComment,
  unresolveDocumentComment,
  deleteDocumentComment,
} from '@/app/w/[slug]/docs/actions';

// ---------------------------------------------------------------------------
// Single comment card
// ---------------------------------------------------------------------------

function DocCommentCard({
  comment,
  currentUserId,
  canEdit,
  isAdmin,
  focusedCommentId,
  onFocusComment,
  onReplyTo,
  replies = [],
}) {
  const cardRef  = useRef(null);
  const [isPending, startTransition] = useTransition();
  const [showReplies, setShowReplies] = useState(true);

  const isFocused  = comment.id === focusedCommentId;
  const isAuthor   = comment.author_id === currentUserId;
  const isResolved = !!comment.resolved_at;

  const authorName = comment.author?.full_name || comment.author?.email || 'Usuario';

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isFocused]);

  const handleResolveToggle = () => {
    startTransition(async () => {
      try {
        if (isResolved) await unresolveDocumentComment(comment.id);
        else            await resolveDocumentComment(comment.id);
      } catch (err) {
        console.error(err);
      }
    });
  };

  const handleDelete = () => {
    if (!confirm('¿Eliminar este comentario?')) return;
    startTransition(async () => {
      try {
        await deleteDocumentComment(comment.id);
      } catch (err) {
        console.error(err);
      }
    });
  };

  return (
    <div
      ref={cardRef}
      onClick={() => onFocusComment?.(comment.id)}
      className={`
        rounded-xl border p-3 space-y-2 transition-colors cursor-pointer
        ${isFocused
          ? 'border-[#d9ff00]/40 bg-[#d9ff00]/5'
          : isResolved
            ? 'border-zinc-800/50 bg-zinc-950/30 opacity-60'
            : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
        }
        ${isPending ? 'opacity-50' : ''}
      `}
    >
      {/* Selection text quote */}
      {comment.selection_text && (
        <div className="flex items-start gap-1.5 pb-2 border-b border-zinc-800/50">
          <Quote className="w-3 h-3 text-zinc-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-500 italic line-clamp-2 leading-relaxed">
            {comment.selection_text}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-100 flex-shrink-0 mt-0.5">
          {comment.author?.avatar_url
            ? <img src={comment.author.avatar_url} alt={authorName} className="w-6 h-6 rounded-full object-cover" />
            : authorName.charAt(0).toUpperCase()
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-white">{authorName}</span>
            <span className="text-xs text-zinc-600">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: es })}
            </span>
            {isResolved && (
              <span className="text-xs text-zinc-600 italic">Resuelto</span>
            )}
          </div>

          <p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap break-words leading-relaxed">
            {comment.body}
          </p>

          {/* Resolve audit line */}
          {comment.resolved_at && comment.resolver && (
            <p className="text-xs text-zinc-400 mt-1.5 italic">
              Resuelto por {
                comment.resolver.full_name ||
                comment.resolver.email     ||
                'alguien'
              }{' '}
              {formatDistanceToNow(new Date(comment.resolved_at), {
                locale: es, addSuffix: true,
              })}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pl-8" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onReplyTo?.(comment.id)}
          className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          <Reply className="w-3 h-3" />
          Responder
        </button>

        {canEdit && (
          <button
            onClick={handleResolveToggle}
            disabled={isPending}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-40"
          >
            {isResolved
              ? <><Circle className="w-3 h-3" /> Reabrir</>
              : <><CheckCircle2 className="w-3 h-3" /> Resolver</>
            }
          </button>
        )}

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

      {/* Replies */}
      {replies.length > 0 && (
        <div className="pl-8 space-y-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowReplies(s => !s); }}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {showReplies ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {replies.length} {replies.length === 1 ? 'respuesta' : 'respuestas'}
          </button>

          {showReplies && replies.map((reply) => (
            <DocCommentCard
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              canEdit={canEdit}
              isAdmin={isAdmin}
              focusedCommentId={focusedCommentId}
              onFocusComment={onFocusComment}
              onReplyTo={onReplyTo}
              replies={[]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocumentCommentSidebar — full comment panel
// ---------------------------------------------------------------------------

/**
 * Right-side panel showing all comments for a document.
 *
 * Props:
 *  comments          {Array}         enriched comment objects (with author, resolver)
 *  currentUserId     {string}
 *  canEdit           {boolean}       editor+ role (can resolve/unresolve)
 *  isAdmin           {boolean}       admin+ role (can delete any comment)
 *  canComment        {boolean}       commenter+ role (can add comments)
 *  focusedCommentId  {string|null}
 *  onFocusComment    {(id) => void}
 *  onReplyTo         {(parentId) => void}
 *  pendingComment    {{ text: string } | null}  selection waiting for comment
 *  onCancelPending   {() => void}
 *  onSubmitComment   {(body: string) => Promise<void>}
 */
export default function DocumentCommentSidebar({
  comments = [],
  currentUserId,
  canEdit    = false,
  isAdmin    = false,
  canComment = false,
  focusedCommentId,
  onFocusComment,
  onReplyTo,
  pendingComment,
  onCancelPending,
  onSubmitComment,
  replyToId,
  onCancelReply,
}) {
  const [filterResolved, setFilterResolved] = useState(false);
  const [body, setBody]                     = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [error, setError]                   = useState(null);
  const textareaRef                         = useRef(null);

  // Focus the textarea when a pending comment is requested or a reply is set
  useEffect(() => {
    if ((pendingComment || replyToId) && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [pendingComment, replyToId]);

  const topLevel   = comments.filter(c => c.parent_id == null);
  const repliesMap = {};
  comments.filter(c => c.parent_id != null).forEach(c => {
    if (!repliesMap[c.parent_id]) repliesMap[c.parent_id] = [];
    repliesMap[c.parent_id].push(c);
  });

  const resolvedCount = topLevel.filter(c => c.resolved_at).length;
  const visible = filterResolved ? topLevel.filter(c => !c.resolved_at) : topLevel;

  const replyTarget = replyToId ? comments.find(c => c.id === replyToId) : null;

  const handleSubmit = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmitComment(body.trim());
      setBody('');
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const showComposer = canComment && (pendingComment || replyToId);

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 shrink-0">
        <span className="text-sm font-medium text-white">
          Comentarios
          {comments.length > 0 && (
            <span className="ml-1.5 text-xs text-zinc-500">({topLevel.length})</span>
          )}
        </span>
        {resolvedCount > 0 && (
          <button
            onClick={() => setFilterResolved(f => !f)}
            className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            {filterResolved
              ? `Mostrar ${resolvedCount} resueltos`
              : `Ocultar ${resolvedCount} resueltos`
            }
          </button>
        )}
      </div>

      {/* Comment composer */}
      {showComposer && (
        <div className="px-4 py-3 border-b border-zinc-900 space-y-2 shrink-0">
          {/* Selection text preview */}
          {pendingComment?.text && !replyToId && (
            <div className="flex items-start gap-1.5 p-2 bg-zinc-900 rounded-lg">
              <Quote className="w-3 h-3 text-zinc-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-500 italic line-clamp-2">{pendingComment.text}</p>
            </div>
          )}

          {/* Reply preview */}
          {replyTarget && (
            <div className="flex items-start gap-1.5 p-2 bg-zinc-900 rounded-lg">
              <Reply className="w-3 h-3 text-zinc-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-500 line-clamp-1">{replyTarget.body}</p>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={replyToId ? 'Escribir respuesta...' : 'Añadir comentario...'}
            rows={3}
            className="
              w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2
              text-sm text-white placeholder-zinc-600
              resize-none focus:outline-none focus:border-zinc-500
            "
          />

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-700">⌘ + Enter para publicar</span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setBody('');
                  setError(null);
                  replyToId ? onCancelReply?.() : onCancelPending?.();
                }}
                className="text-xs text-zinc-500 hover:text-white transition-colors px-2 py-1"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!body.trim() || submitting}
                className="text-xs px-3 py-1 bg-[#d9ff00] text-black rounded-lg font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {submitting ? 'Publicando...' : 'Publicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {comments.length === 0 && !showComposer && (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <p className="text-zinc-500 text-sm">Sin comentarios.</p>
            {canComment && (
              <p className="text-zinc-700 text-xs mt-1">
                Selecciona texto en el documento y haz clic en «Comentar».
              </p>
            )}
          </div>
        </div>
      )}

      {/* Comment list */}
      {comments.length > 0 && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {visible.map(comment => (
            <DocCommentCard
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              canEdit={canEdit}
              isAdmin={isAdmin}
              focusedCommentId={focusedCommentId}
              onFocusComment={onFocusComment}
              onReplyTo={onReplyTo}
              replies={repliesMap[comment.id] || []}
            />
          ))}

          {visible.length === 0 && resolvedCount > 0 && (
            <p className="text-xs text-zinc-600 text-center py-4">
              Todos los comentarios están resueltos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
