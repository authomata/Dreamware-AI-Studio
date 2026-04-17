'use client';

import { useRef, useState } from 'react';
import { Send, Paperclip, X, CornerDownRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// ChatComposer — message input with markdown hints, @mention autocomplete,
// reply-to context, and attachment previews.
//
// Props:
//   onSend          {(body, attachments, replyToId) => Promise<void>}
//   onUploadFile    {(file) => Promise<{name, mime_type, storage_path, url}>}
//   replyTo         {object|null}  message being replied to
//   onCancelReply   {() => void}
//   members         {Array}  [{id, label}] for @mention autocomplete
//   disabled        {boolean}
// ---------------------------------------------------------------------------
export default function ChatComposer({
  onSend,
  onUploadFile,
  replyTo       = null,
  onCancelReply,
  members       = [],
  disabled      = false,
}) {
  const [body,       setBody]       = useState('');
  const [atts,       setAtts]       = useState([]);
  const [sending,    setSending]    = useState(false);
  const [mention,    setMention]    = useState(null);  // { query, start }
  const [mentionIdx, setMentionIdx] = useState(0);

  const textareaRef = useRef(null);
  const fileRef     = useRef(null);

  // ---------------------------------------------------------------------------
  // @mention autocomplete
  // ---------------------------------------------------------------------------
  const results = mention
    ? members
        .filter(m => (m.label || '').toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, 6)
    : [];

  const insertMention = (member) => {
    const ta     = textareaRef.current;
    const before = body.slice(0, mention.start);
    const after  = body.slice(ta.selectionStart);
    const next   = before + `@${member.id} ` + after;
    setBody(next);
    setMention(null);
    setMentionIdx(0);
    requestAnimationFrame(() => {
      if (!ta) return;
      const pos = (before + `@${member.id} `).length;
      ta.setSelectionRange(pos, pos);
      ta.focus();
    });
  };

  // ---------------------------------------------------------------------------
  // Body change → detect @ trigger
  // ---------------------------------------------------------------------------
  const handleChange = (e) => {
    const val    = e.target.value;
    const cursor = e.target.selectionStart;
    setBody(val);
    const match = val.slice(0, cursor).match(/@(\S*)$/);
    if (match) {
      setMention({ query: match[1], start: cursor - match[0].length });
      setMentionIdx(0);
    } else {
      setMention(null);
    }
    // Auto-grow
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  };

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------
  const handleKeyDown = (e) => {
    if (mention && results.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, results.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(results[mentionIdx]); return; }
      if (e.key === 'Escape') { setMention(null); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // ---------------------------------------------------------------------------
  // File attachment
  // ---------------------------------------------------------------------------
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !onUploadFile) return;
    e.target.value = '';

    for (const file of files) {
      const tempId = `${Date.now()}-${Math.random()}`;
      setAtts(prev => [...prev, { id: tempId, name: file.name, uploading: true }]);
      try {
        const att = await onUploadFile(file);
        setAtts(prev => prev.map(a => a.id === tempId ? { ...a, ...att, uploading: false } : a));
      } catch (err) {
        console.error('[ChatComposer] upload error', err);
        setAtts(prev => prev.filter(a => a.id !== tempId));
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------
  const handleSend = async () => {
    const trimmed = body.trim();
    const hasContent = trimmed || atts.some(a => !a.uploading && a.storage_path);
    if (!hasContent || sending || atts.some(a => a.uploading)) return;

    setSending(true);
    try {
      const payload = atts.map(({ name, mime_type, storage_path, url }) => ({ name, mime_type, storage_path, url }));
      await onSend(trimmed, payload, replyTo?.id || null);
      setBody('');
      setAtts([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err) {
      console.error('[ChatComposer] send error', err);
    } finally {
      setSending(false);
    }
  };

  const canSend = !sending && !disabled
    && !atts.some(a => a.uploading)
    && (body.trim().length > 0 || atts.some(a => a.storage_path));

  return (
    <div className="border-t border-zinc-800 p-4 shrink-0">
      {/* Reply banner */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-zinc-800/60 rounded-lg text-xs text-zinc-400">
          <CornerDownRight className="w-3 h-3 shrink-0 text-zinc-500" />
          <span>Respondiendo a <span className="text-zinc-300 font-medium">
            {replyTo.author?.full_name || replyTo.author?.email || 'Alguien'}
          </span></span>
          <span className="truncate text-zinc-600 ml-1">{replyTo.body?.slice(0, 60)}</span>
          <button onClick={onCancelReply} className="ml-auto text-zinc-600 hover:text-zinc-300 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attachment chips */}
      {atts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {atts.map(att => (
            <div key={att.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300">
              {att.uploading
                ? <span className="animate-pulse text-zinc-500">Subiendo {att.name}…</span>
                : <span className="truncate max-w-[180px]">{att.name}</span>
              }
              {!att.uploading && (
                <button onClick={() => setAtts(p => p.filter(a => a.id !== att.id))} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="relative">
        {/* @mention popup */}
        {mention && results.length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden min-w-[200px] max-w-[280px] z-50">
            {results.map((m, i) => (
              <button
                key={m.id}
                onClick={() => insertMention(m)}
                className={`w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                  i === mentionIdx ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-100 flex-shrink-0">
                  {(m.label || '?').charAt(0).toUpperCase()}
                </div>
                <span className="truncate">{m.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Attach */}
          {onUploadFile && (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={disabled}
                className="shrink-0 mb-1 p-2 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-40"
                title="Adjuntar archivo"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
            </>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || sending}
            placeholder={disabled ? 'No tienes permiso para enviar mensajes' : 'Escribe un mensaje… (⌘↵ enviar, @ mencionar)'}
            rows={1}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500 transition-colors overflow-hidden"
            style={{ minHeight: '42px', maxHeight: '160px' }}
          />

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`shrink-0 mb-1 p-2 rounded-lg transition-colors ${
              canSend ? 'bg-zinc-700 hover:bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            }`}
            title="Enviar (⌘↵)"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-700 mt-1.5 ml-1">
          **negrita** · *itálica* · `código` · ⌘↵ enviar
        </p>
      </div>
    </div>
  );
}
