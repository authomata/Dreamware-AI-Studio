'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Layers } from 'lucide-react';

/**
 * WorkspaceSwitcher — dropdown in the main header to switch between workspaces.
 * Also shows "Sin workspace" (back to /studio) as an option.
 *
 * @param {{
 *   workspaces: Array<{
 *     id: string,
 *     name: string,
 *     slug: string,
 *     logo_url: string | null,
 *     brand_color: string | null,
 *     member_role: string,
 *   }>,
 *   currentSlug?: string | null,
 * }} props
 */
export default function WorkspaceSwitcher({ workspaces, currentSlug = null }) {
  const [open, setOpen] = useState(false);

  const current = workspaces.find(w => w.slug === currentSlug) || null;

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors text-sm"
      >
        {current ? (
          <>
            <WorkspaceIcon workspace={current} size={16} />
            <span className="text-white max-w-32 truncate">{current.name}</span>
          </>
        ) : (
          <>
            <Layers className="w-4 h-4 text-zinc-400" />
            <span className="text-zinc-400">Workspaces</span>
          </>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          <div className="absolute right-0 top-full mt-1.5 z-50 w-56 bg-zinc-950 border border-zinc-800 rounded-xl shadow-xl overflow-hidden">
            {/* Workspace list */}
            {workspaces.length > 0 ? (
              <div className="p-1">
                {workspaces.map((ws) => (
                  <Link
                    key={ws.id}
                    href={`/w/${ws.slug}`}
                    onClick={() => setOpen(false)}
                    className={`
                      flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
                      ${ws.slug === currentSlug
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'}
                    `}
                  >
                    <WorkspaceIcon workspace={ws} size={20} />
                    <span className="truncate">{ws.name}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-3 py-3 text-xs text-zinc-600">
                No tienes workspaces aún.
              </div>
            )}

            {/* Divider + back to studio */}
            <div className="border-t border-zinc-800 p-1">
              <Link
                href="/studio"
                onClick={() => setOpen(false)}
                className={`
                  flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
                  ${!currentSlug
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}
                `}
              >
                <div className="w-5 h-5 rounded flex items-center justify-center text-zinc-500">
                  ✦
                </div>
                <span>Studio (sin workspace)</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Small workspace logo or initial badge */
function WorkspaceIcon({ workspace, size = 20 }) {
  const brandBg      = workspace.brand_color || '#d9ff00';
  const brandInitial = workspace.name.charAt(0).toUpperCase();

  if (workspace.logo_url) {
    return (
      <img
        src={workspace.logo_url}
        alt={workspace.name}
        style={{ width: size, height: size }}
        className="rounded object-cover flex-shrink-0"
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: brandBg,
        fontSize: size * 0.5,
      }}
      className="rounded flex items-center justify-center text-black font-bold flex-shrink-0"
    >
      {brandInitial}
    </div>
  );
}
