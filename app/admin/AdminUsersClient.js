'use client';

import { useState, useTransition } from 'react';
import { setUserRole, setUserCreditLimit, banUser, unbanUser, deleteUser } from './actions';

const ROLE_COLORS = {
  admin: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  team:  'bg-[#d9ff00]/10 text-[#d9ff00] border-[#d9ff00]/20',
  free:  'bg-white/5 text-white/40 border-white/10',
};

const ROLE_LABELS = { admin: 'Admin', team: 'Team', free: 'Free' };

export default function AdminUsersClient({ users }) {
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(null);

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

  return (
    <div className="p-8">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-lg font-black tracking-tight text-white">Usuarios</h1>
        <p className="text-white/30 text-xs mt-0.5">{users.length} registrados · {teamUsers.length} en el equipo</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total usuarios', value: users.length },
          { label: 'Team',           value: users.filter(u => u.role === 'team').length },
          { label: 'Free',           value: users.filter(u => u.role === 'free').length },
          { label: 'Baneados',       value: users.filter(u => u.banned).length },
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
                  <p className="text-xs text-white/40">
                    {new Date(user.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </p>
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
  );
}
