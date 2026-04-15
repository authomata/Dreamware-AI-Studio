'use client';

import { useState, useEffect, useCallback } from 'react';
import { ImageStudio, VideoStudio, LipSyncStudio, CinemaStudio, CharacterStudio, getUserBalance } from 'studio';
import ApiKeyModal from './ApiKeyModal';

const TABS = [
  { id: 'image',     label: 'Image Studio' },
  { id: 'video',     label: 'Video Studio' },
  { id: 'lipsync',   label: 'Lip Sync' },
  { id: 'cinema',    label: 'Cinema Studio' },
  { id: 'character', label: 'Characters' },
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

  // Poll for balance every 30 seconds if key is present
  useEffect(() => {
    if (!apiKey) return;
    const interval = setInterval(() => fetchBalance(apiKey), 30000);
    return () => clearInterval(interval);
  }, [apiKey, fetchBalance]);

  if (!hasMounted) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="animate-spin text-[#d9ff00] text-3xl">◌</div>
    </div>
  );

  if (!apiKey) {
    return <ApiKeyModal onSave={handleKeySave} />;
  }

  return (
    <div className="h-screen bg-[#030303] flex flex-col overflow-hidden text-white">
      {/* Header */}
      <header className="flex-shrink-0 h-14 border-b border-white/[0.03] flex items-center justify-between px-6 bg-black/20 backdrop-blur-md z-40">
        {/* Left: Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight hidden sm:block">Dreamware AI Studio</span>
        </div>

        {/* Center: Navigation */}
        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative py-4 text-[13px] font-medium transition-all whitespace-nowrap px-1 ${
                activeTab === tab.id
                  ? 'text-[#d9ff00]'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#d9ff00] rounded-full" />
              )}
            </button>
          ))}
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-full border border-white/5 transition-colors">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white/90">
                ${balance !== null ? `${balance}` : '---'}
              </span>
            </div>
          </div>

          <div 
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#d9ff00] to-yellow-200 border border-white/20 cursor-pointer hover:scale-105 transition-transform" 
          />
        </div>
      </header>

      {/* Studio Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'image'     && <ImageStudio     apiKey={apiKey} onAnimate={handleAnimate} />}
        {activeTab === 'video'     && <VideoStudio     apiKey={apiKey} initialImage={pendingAnimateUrl} onInitialImageConsumed={() => setPendingAnimateUrl(null)} />}
        {activeTab === 'lipsync'   && <LipSyncStudio   apiKey={apiKey} />}
        {activeTab === 'cinema'    && <CinemaStudio    apiKey={apiKey} />}
        {activeTab === 'character' && <CharacterStudio apiKey={apiKey} />}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-8 w-full max-w-sm shadow-2xl">
            <h2 className="text-white font-bold text-lg mb-2">Settings</h2>
            <p className="text-white/40 text-[13px] mb-8">
              Manage your AI studio preferences and authentication.
            </p>
            
            <div className="space-y-4 mb-8">
              <div className="bg-white/5 border border-white/[0.03] rounded-md p-4">
                <label className="block text-xs font-bold text-white/30 mb-2">
                  Active API Key
                </label>
                <div className="text-[13px] font-mono text-white/80">
                  {apiKey.slice(0, 8)}••••••••••••••••
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleKeyChange}
                className="flex-1 h-10 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-all"
              >
                Change Key
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 h-10 rounded-md bg-white/5 text-white/80 hover:bg-white/10 text-xs font-semibold transition-all border border-white/5"
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
