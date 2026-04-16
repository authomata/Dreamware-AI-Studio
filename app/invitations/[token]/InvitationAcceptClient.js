'use client';

import { useState } from 'react';
import { acceptInvitation } from './actions';

const ROLE_LABELS = {
  owner:     'Propietario',
  admin:     'Administrador',
  editor:    'Editor',
  commenter: 'Comentador',
  viewer:    'Solo lectura',
};

/**
 * Client component for the invitation acceptance flow.
 * - If the current user's email matches the invitation email → show "Accept" button.
 * - If logged in with a different email → show mismatch warning.
 * - If not logged in → redirect to /login with a return URL.
 */
export default function InvitationAcceptClient({ invitation, token, currentUserEmail }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const workspace    = invitation.workspace;
  const brandBg      = workspace.brand_color || '#d9ff00';
  const brandInitial = workspace.name.charAt(0).toUpperCase();

  async function handleAccept() {
    setLoading(true);
    setError(null);
    try {
      const result = await acceptInvitation(token);
      if (result?.error) {
        setError(result.error);
      }
      // On success, the server action will redirect — no client-side redirect needed
    } catch (e) {
      setError(e.message || 'Ocurrió un error. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function handleLogin() {
    // Redirect to login with a return_url so after login they come back here
    window.location.href = `/login?return_url=${encodeURIComponent(window.location.pathname)}`;
  }

  const emailMatches = currentUserEmail === invitation.email;
  const isLoggedIn   = !!currentUserEmail;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Workspace brand */}
        <div className="flex items-center gap-3 mb-8">
          {workspace.logo_url ? (
            <img
              src={workspace.logo_url}
              alt={workspace.name}
              className="w-12 h-12 rounded-xl object-cover"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-black font-bold text-xl"
              style={{ backgroundColor: brandBg }}
            >
              {brandInitial}
            </div>
          )}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Invitación a</p>
            <h1 className="text-lg font-bold text-white">{workspace.name}</h1>
          </div>
        </div>

        {/* Invitation details */}
        <div className="glass-panel border border-zinc-800 rounded-xl p-5 mb-6">
          <p className="text-sm text-zinc-300 mb-4">
            Te invitaron a colaborar como{' '}
            <span className="text-white font-semibold">
              {ROLE_LABELS[invitation.role] || invitation.role}
            </span>{' '}
            en <span className="text-white font-semibold">{workspace.name}</span>.
          </p>
          <p className="text-xs text-zinc-500">
            Invitación para: <span className="text-zinc-300">{invitation.email}</span>
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}

        {/* CTA depending on auth state */}
        {!isLoggedIn && (
          <div>
            <p className="text-sm text-zinc-400 mb-4">
              Para aceptar la invitación necesitas iniciar sesión con{' '}
              <span className="text-white">{invitation.email}</span>.
            </p>
            <button
              onClick={handleLogin}
              className="w-full py-3 bg-[#d9ff00] text-black font-semibold rounded-lg hover:bg-yellow-300 transition-colors"
            >
              Iniciar sesión / Crear cuenta
            </button>
          </div>
        )}

        {isLoggedIn && !emailMatches && (
          <div>
            <div className="p-4 bg-amber-900/20 border border-amber-700 rounded-lg mb-4">
              <p className="text-sm text-amber-300">
                Estás conectado como <span className="font-semibold">{currentUserEmail}</span>, pero
                esta invitación es para <span className="font-semibold">{invitation.email}</span>.
              </p>
              <p className="text-xs text-amber-400 mt-1">
                Cierra sesión e inicia con el email correcto para aceptar.
              </p>
            </div>
            <a
              href="/api/auth/signout"
              className="block w-full text-center py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
            >
              Cerrar sesión
            </a>
          </div>
        )}

        {isLoggedIn && emailMatches && (
          <button
            onClick={handleAccept}
            disabled={loading}
            className="w-full py-3 bg-[#d9ff00] text-black font-semibold rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Aceptando...' : 'Aceptar invitación'}
          </button>
        )}
      </div>
    </div>
  );
}
