'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Building2, Settings, ChevronLeft } from 'lucide-react';

const NAV = [
  { href: '/admin/users',    label: 'Usuarios',       icon: Users },
  { href: '/admin/clients',  label: 'Clientes',        icon: Building2 },
  { href: '/admin/settings', label: 'Configuración',   icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  const isActive = (href) => pathname === href || pathname.startsWith(href + '/');

  return (
    <aside className="flex-shrink-0 w-56 h-full bg-[#0a0a0a] border-r border-white/[0.06] flex flex-col">

      {/* Logo / Brand */}
      <div className="h-14 px-4 flex items-center gap-2.5 border-b border-white/[0.06] flex-shrink-0">
        <div className="w-7 h-7 bg-[#d9ff00] rounded-md flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <p className="text-xs font-black tracking-tight text-white leading-none">DREAMWARE</p>
          <p className="text-[9px] font-medium text-white/25 tracking-widest leading-none mt-0.5">ADMIN</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                ${active
                  ? 'bg-[#d9ff00]/10 text-[#d9ff00] border border-[#d9ff00]/15'
                  : 'text-white/40 hover:text-white hover:bg-white/[0.04] border border-transparent'
                }
              `}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-white/[0.06] flex-shrink-0">
        <Link
          href="/studio"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/25 hover:text-white/60 hover:bg-white/[0.03] transition-all"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Volver al Studio
        </Link>
      </div>
    </aside>
  );
}
