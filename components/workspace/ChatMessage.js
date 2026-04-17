'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Pencil, Trash2, CornerDownRight, X, Check } from 'lucide-react';
import MemberAvatar from './MemberAvatar';

// ---------------------------------------------------------------------------
// ChatMessage — renders a single chat message with avatar, body, actions.
//
// Props:
//   message      {object}  enriched message (see ChatPanel for shape)
//   currentUserId {string}
//   isAdmin      {boolean}
//   onDelete     {(messageId, workspaceId) => void}
//   onEdit       {(messageId, newBody) => Promise<void>}
//   onReply      {(message) => void}
//   members      {Array}   [{id, label, avatar_url}] for @mention resolving
// ---------------------------------------------------------------------------

/** Resolve @uuid mentions in message body to readable labels. */
function resolveMentions(body, members) {
  if (!body || !members?.length) return body;
  const memberMap = Object.fromEntries(members.map(m => [m.id, m.label || m.email || 'Alguien']));
  return body.replace(
    /@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
    (_, id) => `**@${memberMap[id] || id.slice(0, 8)}**`
  );
}

export default function ChatMessage({
  message,
  currentUserId,
  isAdmin,
  onDelete,
  onEdit,
  onReply,
  members = [],
}) {
  const [editing, setEditing]       = useState(false);
  const [editBody, setEditBody]     = useState(message.body);
  const [saving, setSaving]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isOwn = message.author_id === currentUserId;
  const canEdit = isOwn && !message.edited_at
    ? Date.now() - new Date(message.created_at).getTime() < 15 * 60 * 1000
    : false;
  // Also allow editing if within window even if edited before
  const withinEditWindow = Date.now() - new Date(message.created_at).getTime() < 15 * 60 * 1000;
  const canEditNow = isOwn && withinEditWindow;
  const canDelete = isOwn || isAdmin;

  const author = message.author || {};
  const authorName = author.full_name || author.email || 'Alguien';
  const createdAt  = message.created_at ? new Date(message.created_at) : null;

  const resolvedBody = resolveMentions(message.body, members);

  const handleEditSave = async () => {
    if (!editBody.trim()) return;
    setSaving(true);
    try {
      await onEdit(message.id, editBody);
      setEditing(false);
    } catch (e) {
      console.error('[ChatMessage] edit error', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await onDelete(message.id, message.workspace_id);
    } catch (e) {
      console.error('[ChatMessage] delete error', e);
    } finally {
      setConfirmDelete(false);
    }
  };

  return (
    <div className="group flex gap-3 px-4 py-2 hover:bg-zinc-900/30 rounded-lg transition-colors">
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        <MemberAvatar
          profile={{ full_name: author.full_name, avatar_url: author.avatar_url, email: author.email }}
          size="sm"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Reply context */}
        {message.reply_to && (
          <div className="flex items-start gap-1.5 mb-1 text-xs text-zinc-500 border-l-2 border-zinc-700 pl-2">
            <CornerDownRight className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="truncate">
              <span className="font-medium text-zinc-400">
                {message.reply_to.author?.full_name || message.reply_to.author?.email || 'Alguien'}
              </span>
              {': '}
              <span className="text-zinc-500 line-clamp-1">{message.reply_to.body}</span>
            </span>
          </div>
        )}

        {/* Header: author + time */}
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold text-white">{authorName}</span>
          {createdAt && (
            <span className="text-xs text-zinc-600">
              {formatDistanceToNow(createdAt, { addSuffix: true, locale: es })}
            </span>
          )}
          {message.edited_at && (
            <span className="text-xs text-zinc-700 italic">(editado)</span>
          )}
        </div>

        {/* Body — edit mode or read mode */}
        {editing ? (
          <div className="mt-1">
            <textarea
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-zinc-500"
              rows={3}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleEditSave();
                if (e.key === 'Escape') { setEditing(false); setEditBody(message.body); }
              }}
              autoFocus
            />
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={handleEditSave}
                disabled={saving}
                className="flex items-center gap-1 px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                onClick={() => { setEditing(false); setEditBody(message.body); }}
                className="flex items-center gap-1 px-2.5 py-1 text-zinc-400 hover:text-white text-xs rounded-lg transition-colors"
              >
                <X className="w-3 h-3" />
                Cancelar
              </button>
              <span className="text-xs text-zinc-600">⌘↵ para guardar</span>
            </div>
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none text-zinc-300">
            <ReactMarkdown
              components={{
                // Remove wrapping <p> to keep inline flow
                p: ({ children }) => <span className="block">{children}</span>,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                    {children}
                  </a>
                ),
                code: ({ inline, children }) => inline
                  ? <code className="bg-zinc-800 px-1 py-0.5 rounded text-xs font-mono text-yellow-300">{children}</code>
                  : <pre className="bg-zinc-800 rounded-lg p-3 overflow-x-auto text-xs font-mono text-zinc-300"><code>{children}</code></pre>,
              }}
            >
              {resolvedBody}
            </ReactMarkdown>
          </div>
        )}

        {/* Attachments */}
        {message.attachments?.length > 0 && !editing && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((att, idx) => (
              <ChatAttachment key={idx} attachment={att} />
            ))}
          </div>
        )}
      </div>

      {/* Inline action buttons — visible on group hover */}
      {!editing && (
        <div className="shrink-0 flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
          {/* Reply */}
          <button
            onClick={() => onReply?.(message)}
            className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Responder"
          >
            <CornerDownRight className="w-3.5 h-3.5" />
          </button>

          {/* Edit (author + within window) */}
          {canEditNow && (
            <button
              onClick={() => { setEditing(true); setEditBody(message.body); }}
              className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Delete */}
          {canDelete && (
            <button
              onClick={handleDelete}
              className={`p-1.5 rounded transition-colors ${
                confirmDelete
                  ? 'text-red-400 bg-red-900/30 hover:bg-red-900/50'
                  : 'text-zinc-600 hover:text-red-400 hover:bg-zinc-800'
              }`}
              title={confirmDelete ? 'Click para confirmar' : 'Eliminar'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatAttachment — inline preview for image, download link for others
// ---------------------------------------------------------------------------
function ChatAttachment({ attachment }) {
  const isImage = attachment.mime_type?.startsWith('image/');

  if (isImage && attachment.url) {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer">
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-48 max-w-xs rounded-lg border border-zinc-700 object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
    >
      <span className="truncate max-w-[200px]">{attachment.name}</span>
    </a>
  );
}
