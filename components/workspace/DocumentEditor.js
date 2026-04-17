'use client';

import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Link as TiptapLink } from '@tiptap/extension-link';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import Mention from '@tiptap/extension-mention';
import { Mark, mergeAttributes } from '@tiptap/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import tippy from 'tippy.js';
import DocumentToolbar from './DocumentToolbar';
import MentionList from './MentionList';

// ---------------------------------------------------------------------------
// CustomMention — extends Mention to explicitly declare id + label attrs.
//
// Tiptap v3's built-in Mention does list both attrs in addAttributes(), but
// configure() appears to not wire them into the ProseMirror schema in certain
// call patterns, causing toJSON() to emit {"type":"mention"} with no attrs.
// Extending the node class here gives us full ownership of the schema attrs
// so serialization is guaranteed to include id and label.
// ---------------------------------------------------------------------------
const CustomMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),          // keeps mentionSuggestionChar from parent
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (attrs) => (attrs.id ? { 'data-id': attrs.id } : {}),
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-label'),
        renderHTML: (attrs) => (attrs.label ? { 'data-label': attrs.label } : {}),
      },
    };
  },
});

// ---------------------------------------------------------------------------
// CommentMark — custom Tiptap mark that highlights commented text.
// Stored in the document JSON as { type: 'comment', attrs: { commentId, resolved } }.
// Renders as <span data-comment-id="..." data-resolved="...">text</span>
// ---------------------------------------------------------------------------
const CommentMark = Mark.create({
  name: 'comment',

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => ({ 'data-comment-id': attrs.commentId }),
      },
      resolved: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-resolved') === 'true',
        renderHTML: (attrs) => ({ 'data-resolved': String(attrs.resolved) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ class: 'doc-comment-mark' }, HTMLAttributes),
      0,
    ];
  },

  // Allow the mark to span multiple nodes
  inclusive: false,
  spanning: true,
});

// ---------------------------------------------------------------------------
// Save status badge
// ---------------------------------------------------------------------------
function SaveStatus({ status }) {
  if (status === 'idle')    return null;
  if (status === 'saving')  return <span className="text-xs text-zinc-500 animate-pulse">Guardando…</span>;
  if (status === 'saved')   return <span className="text-xs text-zinc-600">Guardado</span>;
  if (status === 'error')   return <span className="text-xs text-red-400">Error al guardar</span>;
  return null;
}

// ---------------------------------------------------------------------------
// DocumentEditor
// ---------------------------------------------------------------------------

/**
 * DocumentEditor — Tiptap WYSIWYG editor with autosave, mention, and comment mark.
 *
 * Props:
 *  docId            {string}    Supabase document id
 *  initialTitle     {string}
 *  initialContent   {object}    Tiptap JSON (stored in documents.content)
 *  members          {Array}     [{ id, label }] for @ mention autocomplete
 *  canEdit          {boolean}   editor+ — title/content editable
 *  canComment       {boolean}   commenter+ — can use comment button
 *  onSave           {(docId, { title?, content? }) => Promise<void>}
 *  onCommentRequest {({ from, to, text }) => void}  called when "Comentar" clicked
 *  onMountEditor    {(editor) => void}  exposes editor instance to parent
 *  focusedCommentId {string|null}  when set, applies focused style to that mark
 *  initialComments  {Array}     needed to set resolved state on marks at load
 */
export default function DocumentEditor({
  docId,
  initialTitle    = '',
  initialContent  = {},
  members         = [],
  canEdit         = false,
  canComment      = false,
  onSave,
  onCommentRequest,
  onMountEditor,
  focusedCommentId,
  initialComments = [],
}) {
  const [title,      setTitle]      = useState(initialTitle);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle'|'saving'|'saved'|'error'
  const [hasSelection, setHasSelection] = useState(false);

  const saveTimerRef    = useRef(null);
  const lastSavedRef    = useRef({ title: initialTitle, content: null });
  const pendingSelRef   = useRef(null); // { from, to, text } stored for comment action

  // ---------------------------------------------------------------------------
  // Autosave helper — debounced 2s
  // ---------------------------------------------------------------------------
  const scheduleSave = useCallback((updates) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(async () => {
      try {
        await onSave?.(docId, updates);
        setSaveStatus('saved');
        // Reset to idle after 3s
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch {
        setSaveStatus('error');
      }
    }, 2000);
  }, [docId, onSave]);

  // ---------------------------------------------------------------------------
  // Tiptap editor
  // ---------------------------------------------------------------------------
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // heading levels 1–3 only
        heading: { levels: [1, 2, 3] },
      }),

      Placeholder.configure({
        placeholder: 'Empieza a escribir…',
      }),

      TiptapLink.configure({
        openOnClick:    false,
        autolink:       true,
        linkOnPaste:    true,
        HTMLAttributes: { class: 'doc-link', rel: 'noopener noreferrer', target: '_blank' },
      }),

      TaskList,
      TaskItem.configure({ nested: false }),

      CommentMark,

      CustomMention.configure({
        HTMLAttributes: { class: 'doc-mention' },
        // Render HTML for the mention node — reads straight from persisted attrs.
        // self-contained: no state lookups, safe on any client that loads the doc.
        renderHTML({ node }) {
          const display = node.attrs.label ?? node.attrs.id ?? '';
          return [
            'span',
            {
              class:        'doc-mention',
              'data-type':  'mention',
              'data-id':    node.attrs.id    ?? '',
              'data-label': node.attrs.label ?? '',
            },
            `@${display}`,
          ];
        },
        suggestion: {
          items: ({ query }) => {
            if (!query) return members.slice(0, 8);
            const q = query.toLowerCase();
            return members
              .filter(m => (m.label || '').toLowerCase().includes(q))
              .slice(0, 8);
          },
          // Explicit command: persist { id, label } into attrs. Do NOT rely on
          // the Tiptap default which spreads props — it doesn't include label
          // consistently across versions.
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type:  'mention',
                  attrs: { id: props.id, label: props.label },
                },
                { type: 'text', text: ' ' },
              ])
              .run();
          },
          render: () => {
            let component;
            let popup;

            return {
              onStart(props) {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content:  component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger:  'manual',
                  placement: 'bottom-start',
                });
              },

              onUpdate(props) {
                component.updateProps(props);
                if (!props.clientRect) return;
                popup[0].setProps({ getReferenceClientRect: props.clientRect });
              },

              onKeyDown(props) {
                if (props.event.key === 'Escape') {
                  popup[0].hide();
                  return true;
                }
                return component.ref?.onKeyDown(props) ?? false;
              },

              onExit() {
                popup[0].destroy();
                component.destroy();
              },
            };
          },
        },
      }),
    ],

    content:   Object.keys(initialContent).length > 0 ? initialContent : '',
    editable:  canEdit,
    immediatelyRender: false,   // avoids SSR hydration mismatch

    onSelectionUpdate({ editor: ed }) {
      const { empty } = ed.state.selection;
      setHasSelection(!empty);

      if (!empty) {
        const { from, to } = ed.state.selection;
        const text = ed.state.doc.textBetween(from, to, ' ');
        pendingSelRef.current = { from, to, text: text.trim() };
      } else {
        pendingSelRef.current = null;
      }
    },

    onUpdate({ editor: ed }) {
      if (!canEdit) return;
      const content = ed.getJSON();
      lastSavedRef.current.content = content;

      // DEV VERIFICATION — confirm mention attrs survive toJSON()
      if (process.env.NODE_ENV === 'development') {
        const mentions = [];
        const findMentions = (node) => {
          if (node.type === 'mention') mentions.push(node);
          if (node.content) node.content.forEach(findMentions);
        };
        findMentions(content);
        if (mentions.length > 0) {
          console.log('[DocumentEditor] mentions in JSON:', JSON.stringify(mentions, null, 2));
        }
      }

      scheduleSave({ content });
    },
  });

  // Expose editor to parent (for applying comment marks from outside)
  useEffect(() => {
    if (editor) onMountEditor?.(editor);
  }, [editor, onMountEditor]);

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Title change handler
  // ---------------------------------------------------------------------------
  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    lastSavedRef.current.title = newTitle;
    scheduleSave({ title: newTitle });
  };

  // ---------------------------------------------------------------------------
  // Comment request handler — triggered by toolbar "Comentar" button
  // ---------------------------------------------------------------------------
  const handleCommentRequest = () => {
    if (!pendingSelRef.current) return;
    onCommentRequest?.(pendingSelRef.current);
  };

  // ---------------------------------------------------------------------------
  // Apply / remove CommentMark by commentId (called by parent after comment created)
  // ---------------------------------------------------------------------------
  // This function is exposed to the parent via onMountEditor.
  // The parent can call editor.commands.setTextSelection() + setMark() directly.

  return (
    <div className="flex flex-col h-full">
      {/* Editor CSS — injected once */}
      <style>{`
        .ProseMirror {
          outline: none;
          min-height: 400px;
          color: #e4e4e7;
          font-size: 0.9375rem;
          line-height: 1.7;
          caret-color: #d9ff00;
        }
        .ProseMirror p { margin: 0.5em 0; }
        .ProseMirror h1 { font-size: 1.75rem; font-weight: 700; margin: 1.2em 0 0.4em; color: #fff; }
        .ProseMirror h2 { font-size: 1.375rem; font-weight: 600; margin: 1em 0 0.3em; color: #fff; }
        .ProseMirror h3 { font-size: 1.125rem; font-weight: 600; margin: 0.8em 0 0.3em; color: #d4d4d8; }
        .ProseMirror ul { list-style: disc; padding-left: 1.5em; margin: 0.5em 0; }
        .ProseMirror ol { list-style: decimal; padding-left: 1.5em; margin: 0.5em 0; }
        .ProseMirror li { margin: 0.2em 0; }
        .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0.25em; }
        .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
        .ProseMirror ul[data-type="taskList"] li > label { margin-top: 0.2em; flex-shrink: 0; }
        .ProseMirror ul[data-type="taskList"] li > div { flex: 1; }
        .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div { text-decoration: line-through; color: #52525b; }
        .ProseMirror blockquote { border-left: 3px solid #3f3f46; padding-left: 1em; color: #a1a1aa; margin: 0.75em 0; font-style: italic; }
        .ProseMirror code { font-family: 'Fira Code', 'Consolas', monospace; background: #27272a; padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.85em; color: #d9ff00; }
        .ProseMirror pre { background: #18181b; border: 1px solid #3f3f46; border-radius: 0.5rem; padding: 1rem; overflow-x: auto; margin: 0.75em 0; }
        .ProseMirror pre code { background: none; padding: 0; font-size: 0.875em; color: #e4e4e7; }
        .ProseMirror hr { border: none; border-top: 1px solid #3f3f46; margin: 1.5em 0; }
        .ProseMirror a.doc-link { color: #60a5fa; text-decoration: underline; }
        .ProseMirror a.doc-link:hover { color: #93c5fd; }
        .ProseMirror .doc-mention { background: rgba(217,255,0,0.12); color: #d9ff00; border-radius: 4px; padding: 0.05em 0.3em; font-weight: 500; }
        .ProseMirror span.doc-comment-mark { background: rgba(217,255,0,0.15); border-bottom: 2px solid rgba(217,255,0,0.5); cursor: pointer; border-radius: 2px; }
        .ProseMirror span.doc-comment-mark[data-resolved="true"] { background: transparent; border-bottom: 2px solid rgba(100,100,100,0.3); }
        .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #52525b; float: left; height: 0; pointer-events: none; }
        .ProseMirror:focus-visible { outline: none; }
      `}</style>

      {/* Toolbar */}
      <DocumentToolbar
        editor={editor}
        hasSelection={hasSelection}
        onCommentRequest={handleCommentRequest}
        canComment={canComment}
      />

      {/* Title + save status row */}
      <div className="flex items-center gap-4 px-8 pt-6 pb-2 shrink-0">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          readOnly={!canEdit}
          placeholder="Sin título"
          className="
            flex-1 bg-transparent text-3xl font-bold text-white
            placeholder-zinc-700 focus:outline-none
            border-none p-0
          "
        />
        <div className="shrink-0">
          <SaveStatus status={saveStatus} />
        </div>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-y-auto px-8 pb-16">
        <EditorContent editor={editor} className="max-w-prose" />
      </div>
    </div>
  );
}
