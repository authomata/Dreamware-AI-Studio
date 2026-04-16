'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import MediaReviewer from '@/components/workspace/MediaReviewer';
import FilePreview from '@/components/workspace/FilePreview';
import CommentThread from '@/components/workspace/CommentThread';
import CommentComposer from '@/components/workspace/CommentComposer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merges a realtime INSERT payload with the existing comments array.
 * Falls back gracefully if the author profile is not in profileMap.
 *
 * @param {object}                  newRow
 * @param {Record<string, object>}  profileMap
 * @returns {object}
 */
function enrichRealtimeComment(newRow, profileMap) {
  return {
    ...newRow,
    author: profileMap[newRow.author_id] || { id: newRow.author_id, full_name: null, avatar_url: null },
  };
}

// ---------------------------------------------------------------------------
// FileDetailClient
// ---------------------------------------------------------------------------

/**
 * FileDetailClient — interactive split-panel for file detail pages.
 *
 * Layout:
 *   Desktop: [MediaReviewer or FilePreview] | [CommentThread + CommentComposer]
 *   Mobile:  tabs switching between Preview and Comments
 *
 * State:
 *   comments         — maintained locally, seeded from initialComments; kept fresh via realtime.
 *   activeTimestamp  — current video position in ms (from VideoReviewer).
 *   activeCoord      — image pin coordinate from ImageReviewer.
 *   focusedCommentId — highlight a specific comment (from pin click or URL param ?c=).
 *   replyToId        — parent id for threaded reply (from CommentThread).
 *   tab              — mobile tab: 'preview' | 'comments'.
 *
 * @param {{
 *   file: object,
 *   workspace: object,      // { id, slug, member_role }
 *   signedUrl: string,
 *   initialComments: Array,
 *   profileMap: Record<string, object>,
 *   currentUserId: string,
 *   initialFocusedCommentId?: string,
 * }} props
 */
export default function FileDetailClient({
  file,
  workspace,
  signedUrl,
  initialComments = [],
  profileMap = {},
  currentUserId,
  initialFocusedCommentId,
}) {
  const [comments,         setComments]         = useState(initialComments);
  const [activeTimestamp,  setActiveTimestamp]  = useState(null);
  const [activeCoord,      setActiveCoord]      = useState(null);
  const [focusedCommentId, setFocusedCommentId] = useState(initialFocusedCommentId || null);
  const [replyToId,        setReplyToId]        = useState(null);
  const [tab,              setTab]              = useState('preview'); // mobile only

  // Ref to the VideoReviewer's imperative seekTo function
  const seekFnRef = useRef(null);

  // Permissions
  const role       = workspace.member_role;
  const canComment = ['commenter', 'editor', 'admin', 'owner'].includes(role);
  const canEdit    = ['editor', 'admin', 'owner'].includes(role);
  const isAdmin    = ['admin', 'owner'].includes(role);

  // Decide viewer type
  const isVideo         = file.mime_type?.startsWith('video/');
  const isImage         = file.mime_type?.startsWith('image/');
  const showMediaReview = file.is_review_asset && (isVideo || isImage);

  // ---------------------------------------------------------------------------
  // Realtime subscription for comments
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();
    const channel  = supabase
      .channel(`media_comments_file_${file.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'media_comments', filter: `file_id=eq.${file.id}` },
        (payload) => {
          switch (payload.eventType) {
            case 'INSERT':
              setComments((prev) => {
                // Avoid duplicate if this client already appended it optimistically
                if (prev.some((c) => c.id === payload.new.id)) return prev;
                return [...prev, enrichRealtimeComment(payload.new, profileMap)];
              });
              break;
            case 'UPDATE':
              setComments((prev) =>
                prev.map((c) => c.id === payload.new.id ? { ...c, ...payload.new } : c)
              );
              break;
            case 'DELETE':
              setComments((prev) => prev.filter((c) => c.id !== payload.old.id));
              break;
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [file.id]); // profileMap intentionally excluded — stable during session

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /** Called by VideoReviewer on every timeupdate */
  const handleTimestampChange = useCallback((ms) => {
    setActiveTimestamp(ms);
  }, []);

  /** Called by ImageReviewer when user clicks a point */
  const handleCoordSelect = useCallback((coord) => {
    setActiveCoord(coord);
    // Switch mobile tab to comments so composer is visible
    setTab('comments');
  }, []);

  /** Clears the pending image pin after a comment is submitted */
  const handleCoordClear = useCallback(() => {
    setActiveCoord(null);
  }, []);

  /** Called when user clicks a comment pin (video timeline or image pin) */
  const handleFocusComment = useCallback((id) => {
    setFocusedCommentId(id);
    setTab('comments'); // ensure comments tab is visible on mobile
  }, []);

  /** Called when VideoReviewer mounts — gives us the seekTo(ms) imperative handle */
  const handleMountSeekFn = useCallback((fn) => {
    seekFnRef.current = fn;
  }, []);

  /** Seeks the video player to a specific timestamp (called from CommentThread) */
  const handleSeekRequest = useCallback((ms) => {
    seekFnRef.current?.(ms);
    setTab('preview'); // ensure the player is visible on mobile
  }, []);

  /** Called when CommentComposer successfully submits a new comment */
  const handleCommentSuccess = useCallback((newComment) => {
    if (!newComment) return;
    const enriched = enrichRealtimeComment(newComment, profileMap);
    setComments((prev) => {
      if (prev.some((c) => c.id === enriched.id)) return prev;
      return [...prev, enriched];
    });
    setReplyToId(null);
    setFocusedCommentId(enriched.id);
  }, [profileMap]);

  // Reply-to helpers
  const replyToComment = comments.find((c) => c.id === replyToId);
  const replyToBody    = replyToComment?.body || null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 65px - 44px)' }}>

      {/* Mobile tab switcher */}
      <div className="lg:hidden flex border-b border-zinc-900">
        {(['preview', 'comments']).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`
              flex-1 py-2.5 text-sm font-medium transition-colors
              ${tab === t
                ? 'text-white border-b-2 border-[#d9ff00]'
                : 'text-zinc-500 hover:text-zinc-300'
              }
            `}
          >
            {t === 'preview' ? 'Preview' : `Comentarios (${comments.length})`}
          </button>
        ))}
      </div>

      {/* Split layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ── Left: Preview / MediaReviewer ── */}
        <div className={`
          flex-1 flex items-start justify-center p-6 bg-zinc-950/30 overflow-auto
          ${tab !== 'preview' ? 'hidden lg:flex' : 'flex'}
        `}>
          <div className="w-full max-w-4xl">
            {showMediaReview ? (
              <MediaReviewer
                file={file}
                signedUrl={signedUrl}
                comments={comments}
                focusedCommentId={focusedCommentId}
                onTimestampChange={handleTimestampChange}
                onCoordSelect={handleCoordSelect}
                onFocusComment={handleFocusComment}
                onMountSeekFn={handleMountSeekFn}
              />
            ) : (
              <FilePreview file={file} signedUrl={signedUrl} />
            )}
          </div>
        </div>

        {/* ── Right: Comments ── */}
        <aside className={`
          w-full lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-zinc-900
          flex flex-col overflow-hidden
          ${tab !== 'comments' ? 'hidden lg:flex' : 'flex'}
        `}>
          {/* Comment panel header */}
          <div className="px-4 py-3 border-b border-zinc-900">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Comentarios
            </h2>
          </div>

          {/* Thread — takes remaining height */}
          <CommentThread
            comments={comments}
            currentUserId={currentUserId}
            canEdit={canEdit}
            isAdmin={isAdmin}
            focusedCommentId={focusedCommentId}
            onFocusComment={setFocusedCommentId}
            onReplyTo={(parentId) => {
              setReplyToId(parentId);
              setTab('comments');
            }}
            onSeekRequest={handleSeekRequest}
          />

          {/* Composer — always at the bottom */}
          {canComment && (
            <CommentComposer
              fileId={file.id}
              activeTimestamp={showMediaReview && isVideo ? activeTimestamp : null}
              activeCoord={showMediaReview && isImage ? activeCoord : null}
              replyToId={replyToId}
              replyToBody={replyToBody}
              onCancelReply={() => setReplyToId(null)}
              onCoordClear={handleCoordClear}
              onSuccess={handleCommentSuccess}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
