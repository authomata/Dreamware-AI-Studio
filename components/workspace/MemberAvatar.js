/**
 * MemberAvatar — circular avatar with a tooltip showing the member's name and role.
 * Falls back to initials if no avatar_url is set.
 */

const ROLE_DOT_COLOR = {
  owner:     'bg-[#d9ff00]',
  admin:     'bg-lime-400',
  editor:    'bg-blue-400',
  commenter: 'bg-purple-400',
  viewer:    'bg-zinc-500',
};

const SIZE_CLASS = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

/**
 * @param {{
 *   member: {
 *     id: string,
 *     role: string,
 *     profile?: { full_name?: string, avatar_url?: string },
 *     email?: string,
 *   },
 *   size?: 'sm'|'md'|'lg',
 *   showTooltip?: boolean,
 * }} props
 */
export default function MemberAvatar({ member, size = 'md', showTooltip = true }) {
  const profile   = member.profile || {};
  const name      = profile.full_name || member.email || 'Usuario';
  const initials  = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('');

  const dotColor  = ROLE_DOT_COLOR[member.role] || 'bg-zinc-600';
  const sizeClass = SIZE_CLASS[size] || SIZE_CLASS.md;

  return (
    <div className="relative group inline-block">
      {/* Avatar circle */}
      <div
        className={`
          ${sizeClass}
          rounded-full border-2 border-black flex items-center justify-center
          overflow-hidden bg-zinc-700 text-zinc-100 font-semibold flex-shrink-0
        `}
        title={showTooltip ? `${name} · ${member.role}` : undefined}
      >
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{initials || '?'}</span>
        )}
      </div>

      {/* Online dot / role indicator — hidden when no role provided (e.g. chat context) */}
      {member.role && (
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-black ${dotColor}`}
          aria-hidden="true"
        />
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div className="
          pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
          bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5
          text-xs text-white whitespace-nowrap
          opacity-0 group-hover:opacity-100 transition-opacity z-50
        ">
          <p className="font-medium">{name}</p>
          <p className="text-zinc-400 capitalize">{member.role}</p>
        </div>
      )}
    </div>
  );
}
