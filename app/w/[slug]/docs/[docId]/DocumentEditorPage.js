'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, FileText, Trash2 } from 'lucide-react';
import Link from 'next/link';
import DocumentEditor from '@/components/workspace/DocumentEditor';
import DocumentCommentSidebar from '@/components/workspace/DocumentCommentSidebar';
import { updateDocument, deleteDocument, createDocumentComment } from '@/app/w/[slug]/docs/actions';

/**
 * DocumentEditorPage — client component that manages shared state between
 * the Tiptap editor and the comment sidebar.
 *
 * Responsibilities:
 *  - Realtime subscription on document_comments (INSERT / UPDATE / DELETE)
 *  - Pending comment state (selection waiting for body input)
 *  - Reply threading state
 *  - Editor instance ref (for applying CommentMark after comment created)
 *  - Delete document with confirmation
 */
export default function DocumentEditorPage({
  doc,
  workspace,
  initialComments,
  members,
  currentUserId,
  canEdit,
  canComment,
  isAdmin,
}) {
  const [comments,          setComments]         = useState(initialComments);
  const [focusedCommentId,  setFocusedCommentId] = useState(null);
  const [pendingComment,    setPendingComment]   = useState(null); // { from, to, text }
  const [replyToId,         setReplyToId]        = useState(null);
  const [deleting,          setDeleting]         = useState(false);

  const editorRef    = useRef(null);   // holds the Tiptap editor instance
  const profileCache = useRef({});     // { userId: { full_name, avatar_url, email } }

  // Pre-populate profile cache from initial comments
  useEffect(() => {
    initialComments.forEach(c => {
      if (c.author)   profileCache.current[c.author_id]   = c.author;
      if (c.resolver) profileCache.current[c.resolved_by] = c.resolver;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: subscribe to document_comments for this document ────────────
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`doc_comments_${doc.id}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'document_comments',
          filter: `document_id=eq.${doc.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new;
            // Deduplicate: skip if already in state (optimistic insert from self)
            setComments(prev => {
              if (prev.some(c => c.id === row.id)) return prev;
              const cached = profileCache.current[row.author_id];
              const enriched = {
                ...row,
                author:   cached || { id: row.author_id, full_name: null, avatar_url: null, email: null },
                resolver: null,
              };
              return [...prev, enriched];
            });
          }

          if (payload.eventType === 'UPDATE') {
            const row = payload.new;
            setComments(prev => prev.map(c => {
              if (c.id !== row.id) return c;
              const resolverCached = row.resolved_by ? profileCache.current[row.resolved_by] : null;
              return {
                ...c,
                ...row,
                author:   c.author,   // preserve enriched author
                resolver: resolverCached
                  ? resolverCached
                  : row.resolved_by
                    ? { id: row.resolved_by, full_name: null, avatar_url: null, email: null }
                    : null,
              };
            }));
          }

          if (payload.eventType === 'DELETE') {
            setComments(prev => prev.filter(c => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [doc.id]);

  // ── Save handler (passed to DocumentEditor) ───────────────────────────────
  const handleSave = useCallback(async (docId, updates) => {
    await updateDocument(docId, updates);
  }, []);

  // ── Comment request: user selected text and clicked "Comentar" ────────────
  const handleCommentRequest = useCallback((selection) => {
    setPendingComment(selection);
    setReplyToId(null);
    setFocusedCommentId(null);
  }, []);

  // ── Submit comment from sidebar ───────────────────────────────────────────
  const handleSubmitComment = useCallback(async (body) => {
    const opts = {};

    if (replyToId) {
      opts.parent_id = replyToId;
    } else if (pendingComment) {
      opts.selection_from = pendingComment.from;
      opts.selection_to   = pendingComment.to;
      opts.selection_text = pendingComment.text;
    }

    const { comment } = await createDocumentComment(doc.id, body, opts);

    // If there was a pending selection, apply CommentMark to the editor
    if (!replyToId && pendingComment && editorRef.current) {
      const editor = editorRef.current;
      const { from, to } = pendingComment;

      // Restore selection and apply mark
      editor
        .chain()
        .setTextSelection({ from, to })
        .setMark('comment', { commentId: comment.id, resolved: false })
        .run();

      // Immediately save the content with the new mark
      const newContent = editor.getJSON();
      await updateDocument(doc.id, { content: newContent }).catch(console.error);
    }

    // Optimistic add to state (Realtime INSERT will deduplicate)
    const currentUserProfile = profileCache.current[currentUserId] || {
      id: currentUserId, full_name: null, avatar_url: null, email: null,
    };

    setComments(prev => [
      ...prev,
      {
        ...comment,
        author:   { ...currentUserProfile },
        resolver: null,
      },
    ]);

    setPendingComment(null);
    setReplyToId(null);
    setFocusedCommentId(comment.id);
  }, [doc.id, pendingComment, replyToId, currentUserId]);

  // ── Delete document ───────────────────────────────────────────────────────
  const handleDeleteDoc = async () => {
    if (!confirm(`¿Eliminar el documento "${doc.title}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await deleteDocument(doc.id, workspace.id, workspace.slug);
      window.location.href = `/w/${workspace.slug}/docs`;
    } catch (err) {
      alert(err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-900 shrink-0">
        <Link
          href={`/w/${workspace.slug}/docs`}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <FileText className="w-4 h-4 text-zinc-600" />

        <p className="flex-1 text-sm font-medium text-zinc-300 truncate">
          {doc.title || 'Sin título'}
        </p>

        {(canEdit || isAdmin) && (
          <button
            onClick={handleDeleteDoc}
            disabled={deleting}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-900 transition-colors disabled:opacity-40"
            title="Eliminar documento"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Split panel: editor + sidebar ───────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor panel */}
        <div className="flex-1 overflow-hidden flex flex-col bg-zinc-950">
          <DocumentEditor
            docId={doc.id}
            initialTitle={doc.title}
            initialContent={doc.content || {}}
            members={members}
            canEdit={canEdit}
            canComment={canComment}
            onSave={handleSave}
            onCommentRequest={handleCommentRequest}
            onMountEditor={(editor) => { editorRef.current = editor; }}
            focusedCommentId={focusedCommentId}
            initialComments={comments}
          />
        </div>

        {/* Comment sidebar — always visible on desktop */}
        <div className="w-80 shrink-0 overflow-hidden flex flex-col">
          <DocumentCommentSidebar
            comments={comments}
            currentUserId={currentUserId}
            canEdit={canEdit}
            isAdmin={isAdmin}
            canComment={canComment}
            focusedCommentId={focusedCommentId}
            onFocusComment={setFocusedCommentId}
            onReplyTo={(parentId) => {
              setReplyToId(parentId);
              setPendingComment(null);
            }}
            pendingComment={pendingComment}
            onCancelPending={() => setPendingComment(null)}
            onSubmitComment={handleSubmitComment}
            replyToId={replyToId}
            onCancelReply={() => setReplyToId(null)}
          />
        </div>
      </div>
    </div>
  );
}
