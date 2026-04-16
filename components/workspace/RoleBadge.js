/**
 * RoleBadge — colored badge representing a workspace role.
 * Uses design token colors from SPEC_CAPA_CLIENTES.md section 5.1.
 */

const ROLE_CONFIG = {
  owner:     { label: 'Propietario', className: 'bg-[#d9ff00]/10 text-[#d9ff00] border-[#d9ff00]/30' },
  admin:     { label: 'Admin',       className: 'bg-lime-400/10 text-lime-400 border-lime-400/30' },
  editor:    { label: 'Editor',      className: 'bg-blue-400/10 text-blue-400 border-blue-400/30' },
  commenter: { label: 'Comentador',  className: 'bg-purple-400/10 text-purple-400 border-purple-400/30' },
  viewer:    { label: 'Solo lectura',className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
};

/**
 * @param {{ role: 'owner'|'admin'|'editor'|'commenter'|'viewer', className?: string }} props
 */
export default function RoleBadge({ role, className = '' }) {
  const config = ROLE_CONFIG[role] || { label: role, className: 'bg-zinc-800 text-zinc-400 border-zinc-700' };

  return (
    <span
      className={`
        inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium
        ${config.className} ${className}
      `}
    >
      {config.label}
    </span>
  );
}
