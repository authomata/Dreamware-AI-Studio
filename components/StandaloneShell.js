'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSupabaseHistory } from '@/hooks/useSupabaseHistory';
import { ImageStudio, VideoStudio, LipSyncStudio, CinemaStudio, CharacterStudio, StoryStudio, getUserBalance } from 'studio';

// ── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  {
    id: 'image',
    label: 'Image Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
  {
    id: 'video',
    label: 'Video Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
  {
    id: 'lipsync',
    label: 'Lip Sync',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
  },
  {
    id: 'cinema',
    label: 'Cinema Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="15" rx="2" />
        <polyline points="17 2 12 7 7 2" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="7" y1="7" x2="7" y2="22" />
        <line x1="17" y1="7" x2="17" y2="22" />
      </svg>
    ),
  },
  {
    id: 'character',
    label: 'Characters',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
  {
    id: 'story',
    label: 'Story Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <line x1="2" y1="11" x2="22" y2="11" />
        <line x1="7" y1="6" x2="7" y2="11" />
        <line x1="12" y1="6" x2="12" y2="11" />
        <line x1="17" y1="6" x2="17" y2="11" />
      </svg>
    ),
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function StandaloneShell() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [user, setUser] = useState(null);
  const [apiKey, setApiKey] = useState(null);
  const [balance, setBalance] = useState(null);
  const [activeTab, setActiveTab] = useState('image');
  const [showSettings, setShowSettings] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyLoading, setKeyLoading] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [pendingAnimateUrl, setPendingAnimateUrl] = useState(null);

  // ── Supabase history per studio type ────────────────────────────────────────
  const imageHistory  = useSupabaseHistory('image');
  const videoHistory  = useSupabaseHistory('video');
  const lipsyncHistory = useSupabaseHistory('lipsync');
  const cinemaHistory = useSupabaseHistory('cinema');

  const handleAnimate = useCallback((imageUrl) => {
    setPendingAnimateUrl(imageUrl);
    setActiveTab('video');
  }, []);

  const fetchBalance = useCallback(async (key) => {
    try {
      const data = await getUserBalance(key);
      setBalance(data.balance);
    } catch (err) {
      console.error('Balance fetch failed:', err);
    }
  }, []);

  // ── Init: get session + profile ──────────────────────────────────────────
  useEffect(() => {
    setHasMounted(true);

    const initAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUser(user);

      const { data: profile } = await supabase
        .from('profiles')
        .select('muapi_key')
        .eq('id', user.id)
        .single();

      if (profile?.muapi_key) {
        setApiKey(profile.muapi_key);
        fetchBalance(profile.muapi_key);
      } else {
        setShowKeyModal(true);
      }
    };

    initAuth();
  }, [supabase, router, fetchBalance]);

  // ── Poll balance every 30s ───────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey) return;
    const interval = setInterval(() => fetchBalance(apiKey), 30000);
    return () => clearInterval(interval);
  }, [apiKey, fetchBalance]);

  // ── Save muapi key to Supabase ───────────────────────────────────────────
  const handleKeySave = useCallback(async () => {
    if (!keyInput.trim() || !user) return;
    setKeyLoading(true);
    try {
      await supabase
        .from('profiles')
        .update({ muapi_key: keyInput.trim(), updated_at: new Date().toISOString() })
        .eq('id', user.id);
      setApiKey(keyInput.trim());
      setShowKeyModal(false);
      setKeyInput('');
      fetchBalance(keyInput.trim());
    } catch (err) {
      console.error('Failed to save API key:', err);
    } finally {
      setKeyLoading(false);
    }
  }, [keyInput, user, supabase, fetchBalance]);

  // ── Change muapi key ─────────────────────────────────────────────────────
  const handleKeyChange = useCallback(async () => {
    if (!user) return;
    await supabase
      .from('profiles')
      .update({ muapi_key: null, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    setApiKey(null);
    setBalance(null);
    setShowSettings(false);
    setKeyInput('');
    setShowKeyModal(true);
  }, [user, supabase]);

  // ── Sign out ─────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/login');
  }, [supabase, router]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (!hasMounted || (hasMounted && !user && !showKeyModal)) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
        <div className="animate-spin text-[#d9ff00] text-3xl">◌</div>
      </div>
    );
  }

  // ── muapi key setup modal (shown after login if no key yet) ──────────────
  if (showKeyModal) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-[#111111] border border-white/[0.08] rounded-xl p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-12 h-12 bg-[#d9ff00]/10 rounded-xl flex items-center justify-center border border-[#d9ff00]/20 mb-5">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d9ff00" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L12 17.25l-4.5-4.5L15.5 7.5z"/>
              </svg>
            </div>
            <h2 className="text-white font-black text-lg tracking-tight mb-1">Set your API key</h2>
            <p className="text-white/30 text-xs leading-relaxed">
              Enter your{' '}
              <a href="https://muapi.ai/access-keys" target="_blank" rel="noreferrer" className="text-primary hover:text-[#e5ff33] transition-colors">
                muapi.ai
              </a>{' '}
              key. It gets saved to your account so you only set it once.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleKeySave()}
              placeholder="Paste your key here…"
              autoFocus
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/15 focus:outline-none focus:border-primary/40 transition-all font-mono"
            />
            <button
              onClick={handleKeySave}
              disabled={!keyInput.trim() || keyLoading}
              className="w-full h-10 bg-[#d9ff00] text-black font-black text-sm rounded-lg hover:bg-[#e5ff33] active:scale-[0.98] transition-all duration-200 shadow-lg shadow-[#d9ff00]/15 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {keyLoading ? <span className="animate-spin inline-block">◌</span> : 'Save & Continue'}
            </button>
            <button
              onClick={handleSignOut}
              className="text-white/20 hover:text-white/50 text-xs text-center transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main app ─────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-[#0e0e0e] flex flex-col overflow-hidden text-white">

      {/* ── HEADER ── */}
      <header className="flex-shrink-0 h-14 border-b border-white/[0.06] flex items-center justify-between px-5 bg-[#0e0e0e]/80 backdrop-blur-xl z-40">

        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#d9ff00] rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div className="hidden sm:block">
            <span className="text-sm font-black tracking-tight text-white leading-none">DREAMWARE</span>
            <span className="text-[10px] font-medium text-white/30 tracking-widest block leading-none mt-0.5">AI STUDIO</span>
          </div>
        </div>

        {/* Right: balance + avatar */}
        <div className="flex items-center gap-3">
          {/* Balance */}
          {apiKey && (
            <div className="flex items-center gap-2 bg-white/[0.04] px-3 py-1.5 rounded-lg border border-white/[0.06]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#d9ff00] animate-pulse" />
              <span className="text-xs font-bold text-white/80 tabular-nums">
                ${balance !== null ? balance : '—'}
              </span>
            </div>
          )}

          {/* Avatar / settings */}
          <button
            type="button"
            title={user?.email}
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#d9ff00] to-[#a8c800] border border-white/10 cursor-pointer hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
          >
            <span className="text-black text-[10px] font-black">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </span>
          </button>
        </div>
      </header>

      {/* ── BODY: sidebar rail + studio content ── */}
      <div className="flex-1 min-h-0 overflow-hidden flex">

        {/* Icon rail */}
        <nav className="flex-shrink-0 w-14 border-r border-white/[0.06] flex flex-col items-center pt-3 pb-4 gap-1 bg-[#111111]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              title={tab.label}
              onClick={() => setActiveTab(tab.id)}
              className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-[#d9ff00]/10 text-[#d9ff00]'
                  : 'text-white/25 hover:text-white/70 hover:bg-white/[0.05]'
              }`}
            >
              {tab.icon}
              {activeTab === tab.id && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-[#d9ff00] rounded-r-full" />
              )}
            </button>
          ))}
        </nav>

        {/* Studio content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === 'image'     && <ImageStudio     apiKey={apiKey} onAnimate={handleAnimate}
                                          historyItems={imageHistory.history}
                                          onAddHistory={imageHistory.addEntry}
                                          onDeleteHistory={imageHistory.deleteEntry} />}
          {activeTab === 'video'     && <VideoStudio     apiKey={apiKey} initialImage={pendingAnimateUrl} onInitialImageConsumed={() => setPendingAnimateUrl(null)}
                                          historyItems={videoHistory.history}
                                          onAddHistory={videoHistory.addEntry}
                                          onDeleteHistory={videoHistory.deleteEntry} />}
          {activeTab === 'lipsync'   && <LipSyncStudio   apiKey={apiKey}
                                          historyItems={lipsyncHistory.history}
                                          onAddHistory={lipsyncHistory.addEntry}
                                          onDeleteHistory={lipsyncHistory.deleteEntry} />}
          {activeTab === 'cinema'    && <CinemaStudio    apiKey={apiKey}
                                          historyItems={cinemaHistory.history}
                                          onAddHistory={cinemaHistory.addEntry}
                                          onDeleteHistory={cinemaHistory.deleteEntry} />}
          {activeTab === 'character' && <CharacterStudio apiKey={apiKey} />}
          {activeTab === 'story'     && <StoryStudio     apiKey={apiKey} onAnimate={handleAnimate} />}
        </div>
      </div>

      {/* ── SETTINGS MODAL ── */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}
        >
          <div className="bg-[#111111] border border-white/[0.08] rounded-xl p-7 w-full max-w-sm shadow-3xl">
            <h2 className="text-white font-bold text-base mb-1 tracking-tight">Settings</h2>
            <p className="text-white/30 text-xs mb-6">Manage your account and API key.</p>

            <div className="space-y-3 mb-6">
              {/* Account */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3.5">
                <label className="block text-[10px] font-bold text-white/25 uppercase tracking-widest mb-1.5">Account</label>
                <p className="text-sm text-white/70 font-medium">{user?.email}</p>
              </div>

              {/* API Key */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3.5">
                <label className="block text-[10px] font-bold text-white/25 uppercase tracking-widest mb-1.5">Muapi.ai Key</label>
                <p className="text-sm font-mono text-white/60">
                  {apiKey ? `${apiKey.slice(0, 10)}••••••••••` : '—'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleKeyChange}
                className="w-full h-9 rounded-lg bg-white/[0.05] text-white/60 hover:bg-white/[0.09] text-xs font-semibold transition-all duration-200 active:scale-95 border border-white/[0.06]"
              >
                Change API Key
              </button>
              <button
                onClick={handleSignOut}
                className="w-full h-9 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-all duration-200 active:scale-95"
              >
                Sign Out
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="w-full h-9 rounded-lg bg-white/[0.04] text-white/40 hover:bg-white/[0.07] text-xs font-semibold transition-all duration-200 active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
