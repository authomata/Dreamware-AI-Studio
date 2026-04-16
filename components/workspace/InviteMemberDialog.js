'use client';

import { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { inviteMember } from '@/app/w/[slug]/actions';

const ROLE_OPTIONS = [
  { value: 'editor',    label: 'Editor',      description: 'Puede crear y editar archivos y documentos.' },
  { value: 'commenter', label: 'Comentador',   description: 'Solo puede ver y comentar.' },
  { value: 'viewer',    label: 'Solo lectura', description: 'Solo lectura, sin comentarios.' },
  { value: 'admin',     label: 'Admin',        description: 'Puede gestionar miembros y todo el contenido.' },
];

/**
 * InviteMemberDialog — modal dialog for inviting a user by email.
 * Opens as an overlay; submits via Server Action inviteMember.
 */
export default function InviteMemberDialog({ workspaceId, workspaceSlug }) {
  const [open,    setOpen]    = useState(false);
  const [email,   setEmail]   = useState('');
  const [role,    setRole]    = useState('editor');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [success, setSuccess] = useState(false);

  function handleClose() {
    setOpen(false);
    setEmail('');
    setRole('editor');
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await inviteMember(workspaceId, email.trim(), role, workspaceSlug);
      setSuccess(true);
      setEmail('');
    } catch (err) {
      setError(err.message || 'Error al enviar la invitación. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 bg-[#d9ff00] text-black text-sm font-semibold rounded-lg hover:bg-yellow-300 transition-colors"
      >
        <UserPlus className="w-4 h-4" />
        Invitar
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70"
            onClick={handleClose}
          />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Invitar miembro</h2>
              <button
                onClick={handleClose}
                className="p-1 text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {success ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-3">🎉</div>
                <p className="text-white font-semibold mb-1">¡Invitación enviada!</p>
                <p className="text-sm text-zinc-400 mb-5">
                  Cuando acepte, aparecerá en la lista de miembros.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSuccess(false)}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                  >
                    Invitar otro
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-sm text-zinc-400 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@empresa.com"
                    required
                    className="
                      w-full px-3 py-2.5 bg-zinc-900 border border-zinc-700
                      rounded-lg text-white text-sm placeholder:text-zinc-600
                      focus:outline-none focus:border-zinc-500
                    "
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="block text-sm text-zinc-400 mb-1.5">
                    Rol
                  </label>
                  <div className="space-y-2">
                    {ROLE_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`
                          flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                          ${role === opt.value
                            ? 'border-[#d9ff00]/50 bg-[#d9ff00]/5'
                            : 'border-zinc-800 hover:border-zinc-700'}
                        `}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={opt.value}
                          checked={role === opt.value}
                          onChange={() => setRole(opt.value)}
                          className="mt-0.5 accent-[#d9ff00]"
                        />
                        <div>
                          <p className="text-sm font-medium text-white">{opt.label}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{opt.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="
                    w-full py-3 bg-[#d9ff00] text-black font-semibold rounded-lg
                    hover:bg-yellow-300 transition-colors
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  {loading ? 'Enviando...' : 'Enviar invitación'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
