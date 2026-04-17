'use client';

import { useState } from 'react';
import { savePlatformSetting } from './actions';

const ROLE_COLORS = {
  admin: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  team:  'bg-[#d9ff00]/10 text-[#d9ff00] border-[#d9ff00]/20',
  free:  'bg-white/5 text-white/40 border-white/10',
};

const ROLE_LABELS = { admin: 'Admin', team: 'Team', free: 'Free' };

export default function AdminSettingsClient({ settings }) {
  const [muapiKey, setMuapiKey] = useState(settings.central_muapi_key || '');
  const [keyVisible, setKeyVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const handleSaveKey = async () => {
    setSaving(true);
    await savePlatformSetting('central_muapi_key', muapiKey);
    setSaving(false);
    setSavedMsg('Guardado');
    setTimeout(() => setSavedMsg(''), 2000);
  };

  return (
    <div className="p-8 max-w-2xl">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-lg font-black tracking-tight text-white">Configuración</h1>
        <p className="text-white/30 text-xs mt-0.5">Ajustes globales de la plataforma</p>
      </div>

      <div className="space-y-6">
        {/* Central muapi key */}
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-6">
          <h2 className="text-sm font-bold text-white mb-1">API Key Central de muapi.ai</h2>
          <p className="text-white/30 text-xs mb-4">
            Usada por usuarios con rol <span className="text-[#d9ff00]">Team</span>. Nunca se expone al browser.
          </p>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={keyVisible ? 'text' : 'password'}
                value={muapiKey}
                onChange={e => setMuapiKey(e.target.value)}
                placeholder="sk-muapi-..."
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/15 focus:outline-none focus:border-white/20 pr-10"
              />
              <button
                type="button"
                onClick={() => setKeyVisible(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {keyVisible
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                  }
                </svg>
              </button>
            </div>
            <button
              onClick={handleSaveKey}
              disabled={saving}
              className="px-4 py-2.5 bg-[#d9ff00] text-black text-xs font-black rounded-lg hover:bg-[#e5ff33] transition-colors disabled:opacity-50"
            >
              {savedMsg || (saving ? 'Guardando…' : 'Guardar')}
            </button>
          </div>

          <p className="text-white/20 text-[10px] mt-3">
            ⚠️ Esta key se guarda en Supabase y se usa server-side. Asegúrate de que RLS esté activo en platform_settings.
          </p>
        </div>

        {/* Role reference */}
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-6">
          <h2 className="text-sm font-bold text-white mb-3">Roles del sistema</h2>
          <div className="space-y-2">
            {[
              { role: 'admin', desc: 'Acceso total al panel admin. Usa key central.' },
              { role: 'team',  desc: 'Usa key central de Dreamware. Créditos trackeados y limitables.' },
              { role: 'free',  desc: 'Pone su propia key de muapi.ai. Sin acceso a créditos Dreamware.' },
            ].map(({ role, desc }) => (
              <div key={role} className="flex items-start gap-3">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border mt-0.5 ${ROLE_COLORS[role]}`}>{ROLE_LABELS[role]}</span>
                <p className="text-white/40 text-xs">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
