'use client';

import { useState, useEffect, useCallback } from 'react';
import { ImageStudio, VideoStudio, LipSyncStudio, CinemaStudio, CharacterStudio, getUserBalance } from 'studio';
import ApiKeyModal from './ApiKeyModal';

// ── Tab definitions with inline SVG icons ────────────────────────────────────

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
];

const STORAGE_KEY = 'muapi_key';

export default function StandaloneShell() {
  const [apiKey, setApiKey] = useState(null);
  const [activeTab, setActiveTab] = useState('image');
  const [balance, setBalance] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [pendingAnimateUrl, setPendingAnimateUrl] = useState(null);

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

  useEffect(() => {
    setHasMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
      fetchBalance(stored);
    }
  }, [fetchBalance]);

  const handleKeySave = useCallback((key) => {
    localStorage.setItem(STORAGE_KEY, key);
    setApiKey(key);
    fetchBalance(key);
  }, [fetchBalance]);

  const handleKeyChange = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey(null);
    setBalance(null);
  }, []);

  // Poll balance every 30s
  useEffect(() => {
    if (!apiKey) return;
    const interval = setInterval(() => fetchBalance(apiKey), 30000);
    return () => clearInterval(interval);
  }, [apiKey, fetchBalance]);

  if (!hasMounted) return (
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
      <div className="animate-spin text-[#d9ff00] text-3xl">◌</div>
    </div>
  );

  if (!apiKey) {
    return <ApiKeyModal onSave={handleKeySave} />;
  }

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

        {/* Right: balance + settings avatar */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/[0.04] px-3 py-1.5 rounded-lg border border-white/[0.06]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#d9ff00] animate-pulse" />
            <span className="text-xs font-bold text-white/80 tabular-nums">
              ${balance !== null ? balance : '—'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#d9ff00] to-[#a8c800] border border-white/10 cursor-pointer hover:scale-105 active:scale-95 transition-all duration-200"
          />
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
          {activeTab === 'image'     && <ImageStudio     apiKey={apiKey} onAnimate={handleAnimate} />}
          {activeTab === 'video'     && <VideoStudio     apiKey={apiKey} initialImage={pendingAnimateUrl} onInitialImageConsumed={() => setPendingAnimateUrl(null)} />}
          {activeTab === 'lipsync'   && <LipSyncStudio   apiKey={apiKey} />}
          {activeTab === 'cinema'    && <CinemaStudio    apiKey={apiKey} />}
          {activeTab === 'character' && <CharacterStudio apiKey={apiKey} />}
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
            <p className="text-white/30 text-xs mb-7">Manage your API key and preferences.</p>

            <div className="space-y-4 mb-7">
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-4">
                <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">
                  Active API Key
                </label>
                <div className="text-[13px] font-mono text-white/70 tracking-wider">
                  {apiKey.slice(0, 8)}••••••••••••••••
                </div>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={handleKeyChange}
                className="flex-1 h-9 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-all duration-200 active:scale-95"
              >
                Change Key
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 h-9 rounded-lg bg-white/[0.05] text-white/70 hover:bg-white/[0.09] text-xs font-semibold transition-all duration-200 active:scale-95 border border-white/[0.06]"
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
