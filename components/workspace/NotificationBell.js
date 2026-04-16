'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  markNotificationRead,
  markAllNotificationsRead,
} from '@/app/w/[slug]/files/[fileId]/actions';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const MAX_NOTIFICATIONS = 20;

/**
 * NotificationBell — realtime notification badge + dropdown.
 *
 * - Fetches the last MAX_NOTIFICATIONS notifications on mount.
 * - Subscribes to postgres_changes for new notifications via Supabase Realtime.
 * - Badge shows unread count.
 * - Click on notification → navigate to its link + mark as read.
 * - "Marcar todo como leído" bulk action.
 *
 * Note: this component resolves imports from the fileId actions file because
 * that's where the notification actions are defined (per Phase 3 spec). The
 * Next.js bundler handles the [slug] and [fileId] dynamic segments as literal
 * directory names when importing via alias path.
 *
 * @param {{ workspaceId: string }} props
 */
export default function NotificationBell({ workspaceId }) {
  const router = useRouter();
  const dropdownRef = useRef(null);
  const [open,          setOpen]          = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [isPending,     startTransition]  = useTransition();

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  // ---------------------------------------------------------------------------
  // Initial fetch
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function fetchNotifications() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from('notifications')
        .select('id, type, title, body, link, read_at, created_at, workspace_id')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(MAX_NOTIFICATIONS);

      if (!cancelled) {
        setNotifications(data || []);
        setLoading(false);
      }
    }

    fetchNotifications();
    return () => { cancelled = true; };
  }, [workspaceId]);

  // ---------------------------------------------------------------------------
  // Realtime subscription
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();
    let userId = null;

    // Get user id first, then subscribe
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      userId = user.id;

      const channel = supabase
        .channel(`notifications_ws_${workspaceId}_${userId}`)
        .on(
          'postgres_changes',
          {
            event:  'INSERT',
            schema: 'public',
            table:  'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            // Only add if it belongs to this workspace bell
            if (payload.new.workspace_id !== workspaceId) return;
            setNotifications((prev) => [payload.new, ...prev].slice(0, MAX_NOTIFICATIONS));
          },
        )
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            setNotifications((prev) =>
              prev.map((n) => n.id === payload.new.id ? { ...n, ...payload.new } : n)
            );
          },
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    });
  }, [workspaceId]);

  // ---------------------------------------------------------------------------
  // Close dropdown on outside click
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => { document.removeEventListener('mousedown', handleClick); };
  }, [open]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleNotifClick = async (notif) => {
    setOpen(false);

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n)
    );

    try {
      await markNotificationRead(notif.id);
    } catch { /* non-fatal */ }

    if (notif.link) {
      router.push(notif.link);
    }
  };

  const handleMarkAll = () => {
    // Optimistic update
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || now })));

    startTransition(async () => {
      try {
        await markAllNotificationsRead();
      } catch { /* non-fatal */ }
    });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`
          relative w-8 h-8 rounded-lg flex items-center justify-center
          transition-colors
          ${open ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-900'}
        `}
        title="Notificaciones"
        aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} no leídas)` : ''}`}
      >
        <Bell className="w-4 h-4" />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 bg-[#d9ff00] text-black text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="
          absolute right-0 top-full mt-2 w-80 z-50
          bg-zinc-950 border border-zinc-800 rounded-xl shadow-xl
          flex flex-col overflow-hidden
          max-h-[480px]
        ">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900">
            <span className="text-sm font-semibold text-white">Notificaciones</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                disabled={isPending}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                title="Marcar todas como leídas"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todo como leído
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="py-8 text-center text-sm text-zinc-600">Cargando…</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-zinc-500">Sin notificaciones</p>
                <p className="text-xs text-zinc-700 mt-1">Te avisaremos cuando haya actividad.</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={`
                    w-full text-left px-4 py-3 border-b border-zinc-900/50
                    hover:bg-zinc-900/50 transition-colors flex items-start gap-3
                    ${!notif.read_at ? 'bg-zinc-900/20' : ''}
                  `}
                >
                  {/* Unread dot */}
                  <span className={`
                    mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0
                    ${notif.read_at ? 'bg-transparent' : 'bg-[#d9ff00]'}
                  `} />

                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${notif.read_at ? 'text-zinc-400' : 'text-white'}`}>
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2 leading-relaxed">
                        {notif.body}
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-700 mt-1">
                      {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: es })}
                    </p>
                  </div>

                  {notif.link && (
                    <ExternalLink className="w-3 h-3 text-zinc-700 flex-shrink-0 mt-1" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
