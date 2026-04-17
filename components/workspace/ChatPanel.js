'use client';

import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatComposer from './ChatComposer';
import {
  sendChatMessage,
  editChatMessage,
  deleteChatMessage,
  markChatRead,
  getChatSignedUploadUrl,
} from '@/app/w/[slug]/chat/actions';

// ---------------------------------------------------------------------------
// ChatPanel — full chat view with infinite scroll, realtime, and read tracking.
//
// Props:
//   workspace       {object}  { id, slug }
//   initialMessages {Array}   last ~50 messages, enriched with author profile
//   members         {Array}   [{id, label, full_name, email, avatar_url}]
//   currentUser     {object}  { id, full_name, email, avatar_url }
//   canWrite        {boolean} commenter+ role
//   isAdmin         {boolean}
//   hasMore         {boolean} true if there are older messages to paginate
//   oldestCreatedAt {string|null}  ISO timestamp of the oldest loaded message
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

export default function ChatPanel({
  workspace,
  initialMessages = [],
  members         = [],
  currentUser,
  canWrite        = false,
  isAdmin         = false,
  hasMore:        initHasMore = false,
  oldestCreatedAt: initOldest = null,
}) {
  const [messages,  setMessages]  = useState(initialMessages);
  const [hasMore,   setHasMore]   = useState(initHasMore);
  const [oldest,    setOldest]    = useState(initOldest);
  const [loading,   setLoading]   = useState(false);
  const [replyTo,   setReplyTo]   = useState(null);
  const [atBottom,  setAtBottom]  = useState(true);

  const scrollRef   = useRef(null);   // the scrollable container
  const bottomRef   = useRef(null);   // sentinel at the very bottom
  const profileCache = useRef({});    // {userId: profileObj}

  const supabase    = createClient();

  // ---------------------------------------------------------------------------
  // Pre-seed profile cache from initial messages
  // ---------------------------------------------------------------------------
  useEffect(() => {
    initialMessages.forEach(m => {
      if (m.author) profileCache.current[m.author_id] = m.author;
    });
    if (currentUser) profileCache.current[currentUser.id] = currentUser;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Scroll helpers
  // ---------------------------------------------------------------------------
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  // Detect whether the user is near the bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(nearBottom);
  }, []);

  // Initial scroll to bottom (instant, no animation)
  useEffect(() => {
    scrollToBottom('instant');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom when new messages arrive (only if already at bottom)
  useEffect(() => {
    if (atBottom) {
      scrollToBottom();
    }
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Mark read — update when we scroll to bottom
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!atBottom || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.id) {
      markChatRead(workspace.id, lastMsg.id).catch(() => {});
    }
  }, [atBottom, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Supabase Realtime — subscribe to new messages.
  //
  // Must call getUser() FIRST so the session cookie is loaded into the client's
  // internal auth state before the WebSocket handshake. If we subscribe
  // synchronously, the connection goes out with the anon key and RLS blocks
  // every row delivery (same fix pattern as NotificationBell).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();
    let channel    = null;
    let cancelled  = false;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;

      channel = supabase
        .channel(`chat:${workspace.id}`)
        .on(
          'postgres_changes',
          {
            event:  '*',
            schema: 'public',
            table:  'chat_messages',
            filter: `workspace_id=eq.${workspace.id}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const row     = payload.new;
              const cached  = profileCache.current[row.author_id];
              const enriched = {
                ...row,
                author:   cached || { id: row.author_id, full_name: null, avatar_url: null, email: null },
                reply_to: null,
              };
              setMessages(prev => {
                // UPSERT: replace if already optimistically added
                const idx = prev.findIndex(m => m.id === row.id);
                if (idx !== -1) {
                  const next = [...prev];
                  next[idx] = { ...prev[idx], ...enriched };
                  return next;
                }
                return [...prev, enriched];
              });
            }

            if (payload.eventType === 'UPDATE') {
              const row = payload.new;
              setMessages(prev => prev.map(m =>
                m.id === row.id ? { ...m, body: row.body, edited_at: row.edited_at } : m
              ));
            }

            if (payload.eventType === 'DELETE') {
              setMessages(prev => prev.filter(m => m.id !== payload.old.id));
            }
          }
        )
        .subscribe((status) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ChatPanel] Realtime status:', status);
          }
        });
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [workspace.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Load more (scroll up to paginate)
  // ---------------------------------------------------------------------------
  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !oldest) return;
    setLoading(true);

    const scrollEl  = scrollRef.current;
    const prevHeight = scrollEl?.scrollHeight ?? 0;

    try {
      const supabaseSSR = createClient();
      const { data: rows } = await supabaseSSR
        .from('chat_messages')
        .select('id, workspace_id, author_id, body, attachments, reply_to_id, edited_at, created_at')
        .eq('workspace_id', workspace.id)
        .lt('created_at', oldest)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (!rows || rows.length === 0) {
        setHasMore(false);
        return;
      }

      // Enrich with cached profiles (best-effort)
      const enriched = rows.map(r => ({
        ...r,
        author:   profileCache.current[r.author_id] || { id: r.author_id, full_name: null, email: null, avatar_url: null },
        reply_to: null,
      })).reverse();

      setMessages(prev => [...enriched, ...prev]);
      setOldest(rows[rows.length - 1].created_at);
      setHasMore(rows.length === PAGE_SIZE);

      // Restore scroll position so the view doesn't jump
      requestAnimationFrame(() => {
        if (scrollEl) {
          scrollEl.scrollTop = scrollEl.scrollHeight - prevHeight;
        }
      });
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, oldest, workspace.id]);

  // Intersection Observer on the top of the list to trigger loadMore
  const topSentinelRef = useRef(null);
  useEffect(() => {
    const el = topSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { root: scrollRef.current, threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  // ---------------------------------------------------------------------------
  // Send message — optimistic + dedupe via Realtime
  // ---------------------------------------------------------------------------
  const handleSend = useCallback(async (body, attachments, replyToId) => {
    const optimisticId = `opt-${Date.now()}`;
    const optimistic = {
      id:           optimisticId,
      workspace_id: workspace.id,
      author_id:    currentUser.id,
      body,
      attachments:  attachments || [],
      reply_to_id:  replyToId || null,
      edited_at:    null,
      created_at:   new Date().toISOString(),
      author:       profileCache.current[currentUser.id] || currentUser,
      reply_to:     replyToId ? messages.find(m => m.id === replyToId) || null : null,
      _optimistic:  true,
    };

    setMessages(prev => {
      if (prev.some(m => m.id === optimisticId)) return prev;
      return [...prev, optimistic];
    });
    setReplyTo(null);
    scrollToBottom();

    try {
      const { message } = await sendChatMessage(workspace.id, body, attachments, replyToId);
      // Replace optimistic entry with real server row
      setMessages(prev => prev.map(m =>
        m.id === optimisticId
          ? { ...m, ...message, author: profileCache.current[message.author_id] || currentUser, reply_to: optimistic.reply_to, _optimistic: false }
          : m
      ));
    } catch (err) {
      // Remove optimistic on error
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      console.error('[ChatPanel] send error', err);
    }
  }, [workspace.id, currentUser, messages, scrollToBottom]);

  // ---------------------------------------------------------------------------
  // Edit message
  // ---------------------------------------------------------------------------
  const handleEdit = useCallback(async (messageId, newBody) => {
    await editChatMessage(messageId, newBody);
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, body: newBody, edited_at: new Date().toISOString() } : m
    ));
  }, []);

  // ---------------------------------------------------------------------------
  // Delete message
  // ---------------------------------------------------------------------------
  const handleDelete = useCallback(async (messageId) => {
    await deleteChatMessage(messageId, workspace.id);
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, [workspace.id]);

  // ---------------------------------------------------------------------------
  // Upload attachment
  // ---------------------------------------------------------------------------
  const handleUploadFile = useCallback(async (file) => {
    const { signedUrl, storagePath } = await getChatSignedUploadUrl(
      workspace.id,
      file.name,
      file.type
    );

    await fetch(signedUrl, {
      method:  'PUT',
      headers: { 'Content-Type': file.type },
      body:    file,
    });

    // For images, generate a signed read URL immediately (1h)
    // For other files, url will be null here; ChatMessage fetches on demand
    const isImage = file.type.startsWith('image/');
    let url = null;
    if (isImage) {
      try {
        const { getChatAttachmentUrl } = await import('@/app/w/[slug]/chat/actions');
        const { url: signed } = await getChatAttachmentUrl(workspace.id, storagePath);
        url = signed;
      } catch { /* non-critical */ }
    }

    return {
      name:         file.name,
      mime_type:    file.type,
      storage_path: storagePath,
      url,
    };
  }, [workspace.id]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const membersForMention = members.map(m => ({
    id:    m.id,
    label: m.full_name || m.email || m.label || 'Usuario',
  }));

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-4 space-y-1"
      >
        {/* Top sentinel for pagination */}
        <div ref={topSentinelRef} className="h-px" />

        {/* Load more indicator */}
        {loading && (
          <div className="flex justify-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
          </div>
        )}

        {/* No messages empty state */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full py-16 text-zinc-600">
            <p className="text-sm">El chat está vacío.</p>
            {canWrite && <p className="text-xs mt-1">¡Escribe el primer mensaje!</p>}
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            currentUserId={currentUser?.id}
            isAdmin={isAdmin}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onReply={setReplyTo}
            members={membersForMention}
          />
        ))}

        {/* Bottom anchor */}
        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Composer */}
      {canWrite ? (
        <ChatComposer
          onSend={handleSend}
          onUploadFile={handleUploadFile}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          members={membersForMention}
        />
      ) : (
        <div className="border-t border-zinc-800 px-4 py-3 text-xs text-zinc-600 text-center">
          Solo los miembros con rol commenter o superior pueden enviar mensajes.
        </div>
      )}
    </div>
  );
}
