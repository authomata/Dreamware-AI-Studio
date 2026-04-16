'use client';

import { useState, useTransition } from 'react';
import { setUserRole, setUserCreditLimit, banUser, unbanUser, deleteUser, savePlatformSetting } from './actions';

const ROLE_COLORS = {
  admin: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  team:  'bg-[#d9ff00]/10 text-[#d9ff00] border-[#d9ff00]/20',
  free:  'bg-white/5 text-white/40 border-white/10',
};

const ROLE_LABELS = { admin: 'Admin', team: 'Team', free: 'Free' };

export default function AdminClient({ users, settings }) {
  const [activeTab, setActiveTab] = useState('users');
  const [muapiKey, setMuapiKey] = useState(settings.central_muapi_key || '');
  const [keyVisible, setKeyVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleSaveKey = async () => {
    setSaving(true);
    await savePlatformSetting('central_muapi_key', muapiKey);
    setSaving(false);
    setSavedMsg('Saved');
    setTimeout(() => setSavedMsg(''), 2000);
  };

  const handleRole = (userId, role) => {
    startTransition(() => setUserRole(userId, role));
  };

  const handleLimit = (userId, limit) => {
    startTransition(() => setUserCreditLimit(userId, limit));
  };

  const handleBan = (userId, banned) => {
    startTransition(() => banned ? unbanUser(userId) : banUser(userId));
  };

  const handleDelete = (userId) => {
    if (confirmDelete !== userId) { setConfirmDelete(userId); return; }
    setConfirmDelete(null);
    startTransition(() => deleteUser(userId));
  };

  const teamUsers = users.filter(u => u.role === 'team' || u.role === 'admin');
  const totalCreditsUsed = teamUsers.reduce((sum, u) => sum + (u.credits_used || 0), 0);

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#d9ff00] rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight">DREAMWARE ADMIN</h1>
            <p className="text-white/30 text-[10px]">{users.length} usuarios · {teamUsers.length} team</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin/clients" className="text-white/50 hover:text-white text-xs transition-colors">Clientes →</a>
          <a href="/studio" className="text-white/30 hover:text-white text-xs transition-colors">← Volver al Studio</a>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-8 pt-6 pb-0 flex gap-1 border-b border-white/[0.06]">
        {['users', 'settings'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-bold capitalize rounded-t-lg transition-all ${
              activeTab === tab
                ? 'bg-[#111111] text-white border border-b-0 border-white/[0.08]'
                : 'text-white/30 hover:text-white/60'
            }`}
          >
            {tab === 'users' ? `Usuarios (${users.length})` : 'Configuración'}
          </button>
        ))}
      </div>

      <div className="p-8">
        {/* ── USERS TAB ── */}
        {activeTab === 'users' && (
          <div>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total usuarios', value: users.length },
                { label: 'Team', value: users.filter(u => u.role === 'team').length },
                { label: 'Free', value: users.filter(u => u.role === 'free').length },
                { label: 'Baneados', value: users.filter(u => u.banned).length },
              ].map(stat => (
                <div key={stat.label} className="bg-[#111111] border border-white/[0.06] rounded-xl p-4">
                  <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest mb-1">{stat.label}</p>
                  <p className="text-2xl font-black text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Usuario', 'Rol', 'Estado', 'API Key', 'Créditos', 'Registro', 'Acciones'].map(h => (
                      <th key={h} className="text-left text-[10px] font-bold text-white/30 uppercase tracking-widest px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${user.banned ? 'opacity-50' : ''}`}>
                      {/* Email */}
                      <td className="px-4 py-3">
                        <p className="text-sm text-white font-medium">{user.email}</p>
                        <p className="text-[10px] text-white/20">{user.id.slice(0, 8)}…</p>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <select
                          defaultValue={user.role}
                          onChange={e => handleRole(user.id, e.target.value)}
                          disabled={isPending}
                          className={`text-[10px] font-bold px-2 py-1 rounded-md border bg-transparent cursor-pointer ${ROLE_COLORS[user.role]}`}
                        >
                          <option value="free">Free</option>
                          <option value="team">Team</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${user.banned ? 'bg-red-500/20 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                          {user.banned ? 'Baneado' : 'Activo'}
                        </span>
                      </td>

                      {/* API Key */}
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold ${user.muapi_key ? 'text-[#d9ff00]' : 'text-white/20'}`}>
                          {user.role === 'team' ? 'Central' : user.muapi_key ? '✓ Configurada' : '✗ Sin key'}
                        </span>
                      </td>

                      {/* Credits */}
                      <td className="px-4 py-3">
                        {user.role === 'team' || user.role === 'admin' ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-white">{user.credits_used}</span>
                            <span className="text-white/20 text-xs">/</span>
                            <input
                              type="number"
                              defaultValue={user.credit_limit ?? ''}
                              placeholder="∞"
                              onBlur={e => handleLimit(user.id, e.target.value)}
                              className="w-14 text-xs bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-0.5 text-white/60 placeholder:text-white/20 focus:outline-none focus:border-white/20"
                            />
                          </div>
                        ) : (
                          <span className="text-white/20 text-xs">—</span>
                        )}
                      </td>

                      {/* Joined */}
                      <td className="px-4 py-3">
                        <p className="text-xs text-white/40">{new Date(user.created_at).toLocaleDateString('es', { day:'2-digit', month:'short', year:'2-digit' })}</p>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleBan(user.id, user.banned)}
                            disabled={isPending}
                            className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${
                              user.banned
                                ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                                : 'border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10'
                            }`}
                          >
                            {user.banned ? 'Restaurar' : 'Revocar'}
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            disabled={isPending}
                            className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${
                              confirmDelete === user.id
                                ? 'border-red-500 text-red-400 bg-red-500/10'
                                : 'border-white/10 text-white/30 hover:border-red-500/30 hover:text-red-400'
                            }`}
                          >
                            {confirmDelete === user.id ? '¿Confirmar?' : 'Eliminar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div className="max-w-xl space-y-6">
            <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-6">
              <h2 className="text-sm font-bold text-white mb-1">API Key Central de muapi.ai</h2>
              <p className="text-white/30 text-xs mb-4">Usada por usuarios con rol <span className="text-[#d9ff00]">Team</span>. Nunca se expone al browser.</p>

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

            <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-6">
              <h2 className="text-sm font-bold text-white mb-1">Roles del sistema</h2>
              <div className="space-y-2 mt-3">
                {[
                  { role: 'admin', desc: 'Acceso total al panel admin. Usa key central.' },
                  { role: 'team', desc: 'Usa key central de Dreamware. Créditos trackeados y limitables.' },
                  { role: 'free', desc: 'Pone su propia key de muapi.ai. Sin acceso a créditos Dreamware.' },
                ].map(({ role, desc }) => (
                  <div key={role} className="flex items-start gap-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border mt-0.5 ${ROLE_COLORS[role]}`}>{ROLE_LABELS[role]}</span>
                    <p className="text-white/40 text-xs">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
