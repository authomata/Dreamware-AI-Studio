'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import MemberAvatar from './MemberAvatar';
import RoleBadge from './RoleBadge';
import { updateMemberRole, removeMember, revokeInvitation } from '@/app/w/[slug]/actions';
import { MoreHorizontal, X, Clock } from 'lucide-react';

const ASSIGNABLE_ROLES = ['admin', 'editor', 'commenter', 'viewer'];
const ROLE_LABELS = {
  owner:     'Propietario',
  admin:     'Administrador',
  editor:    'Editor',
  commenter: 'Comentador',
  viewer:    'Solo lectura',
};

/**
 * MemberList — shows all workspace members + pending invitations.
 * Allows admins/owners to change roles and remove members.
 */
export default function MemberList({
  members,
  pendingInvitations,
  currentUserRole,
  workspaceId,
  workspaceSlug,
}) {
  const [loading, setLoading]   = useState(null);  // tracks which member row is loading
  const [error,   setError]     = useState(null);

  const canManage = ['owner', 'admin'].includes(currentUserRole);
  const isOwner   = currentUserRole === 'owner';

  async function handleRoleChange(userId, newRole) {
    setLoading(userId);
    setError(null);
    try {
      await updateMemberRole(workspaceId, userId, newRole, workspaceSlug);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function handleRemove(userId) {
    if (!confirm('¿Estás seguro de que quieres eliminar a este miembro?')) return;
    setLoading(userId);
    setError(null);
    try {
      await removeMember(workspaceId, userId, workspaceSlug);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function handleRevokeInvitation(invitationId) {
    if (!confirm('¿Quieres revocar esta invitación?')) return;
    setLoading(invitationId);
    setError(null);
    try {
      await revokeInvitation(invitationId, workspaceId, workspaceSlug);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Active members */}
      <div className="space-y-1">
        {members.map((member) => {
          const name    = member.profile?.full_name || member.email || 'Usuario';
          const isRow   = loading === member.profile?.id;
          const canEdit = canManage && member.role !== 'owner';
          const canEditOwner = isOwner && member.role === 'owner';

          return (
            <div
              key={member.id}
              className={`
                flex items-center gap-3 p-3 rounded-xl
                ${isRow ? 'opacity-50' : 'hover:bg-zinc-900/50'}
                transition-opacity
              `}
            >
              <MemberAvatar member={member} size="md" showTooltip={false} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{name}</p>
                {member.email && member.email !== name && (
                  <p className="text-xs text-zinc-500 truncate">{member.email}</p>
                )}
              </div>

              {/* Role selector (admin+ only, can't touch owners unless you're owner) */}
              {canManage && (canEdit || canEditOwner) ? (
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.profile?.id, e.target.value)}
                  disabled={isRow}
                  className="
                    text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1
                    text-zinc-300 focus:outline-none focus:border-zinc-500
                  "
                >
                  {isOwner && <option value="owner">Propietario</option>}
                  {ASSIGNABLE_ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              ) : (
                <RoleBadge role={member.role} />
              )}

              {/* Remove button */}
              {canManage && canEdit && (
                <button
                  onClick={() => handleRemove(member.profile?.id)}
                  disabled={isRow}
                  className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                  title="Eliminar miembro"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Pending invitations */}
      {pendingInvitations.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            Invitaciones pendientes ({pendingInvitations.length})
          </p>
          <div className="space-y-1">
            {pendingInvitations.map((inv) => {
              const isRow = loading === inv.id;
              return (
                <div
                  key={inv.id}
                  className={`
                    flex items-center gap-3 p-3 rounded-xl
                    ${isRow ? 'opacity-50' : ''}
                    border border-zinc-800/50
                  `}
                >
                  {/* Generic avatar for pending */}
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                    <Clock className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 truncate">{inv.email}</p>
                    <p className="text-xs text-zinc-600">
                      Expira {formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true, locale: es })}
                    </p>
                  </div>

                  <RoleBadge role={inv.role} />

                  <button
                    onClick={() => handleRevokeInvitation(inv.id)}
                    disabled={isRow}
                    className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                    title="Revocar invitación"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
