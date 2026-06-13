import React, { useState } from 'react';
import {
  Sun, Moon, Globe, LayoutDashboard, Building2, Users, ShieldCheck,
  Wallet, LogOut, Menu, X, ChevronRight, Briefcase, Network,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useTheme } from './primitives';

export default function Shell({ view, setView, children }) {
  const { profile, perms, signOut, L, lang, setLang, dark, setDark } = useApp();
  const theme = useTheme(dark);
  const [navOpen, setNavOpen] = useState(false);

  const canSeeUsers = profile?.is_admin;

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: L.nav.dashboard },
    { id: 'companies', icon: Briefcase, label: L.nav.companies },
    { id: 'organization', icon: Network, label: L.nav.organization },
    { id: 'employees', icon: Users, label: L.nav.employees },
    ...(canSeeUsers ? [{ id: 'users', icon: ShieldCheck, label: L.nav.users }] : []),
  ];

  return (
    <div className={`min-h-screen ${theme.bg} ${theme.text} font-sans antialiased`}>
      <header className={`sticky top-0 z-30 ${theme.surface} border-b ${theme.border}`}>
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setNavOpen(!navOpen)} className={`lg:hidden -ml-2 p-2 rounded-lg ${theme.hover}`}>
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-white" strokeWidth={2.4} />
              </div>
              <div className="min-w-0">
                <div className="font-bold tracking-tight truncate">{L.appName}</div>
                <div className={`text-[11px] ${theme.textDim} -mt-0.5 truncate`}>{L.tagline}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`hidden sm:flex items-center gap-2 pr-2 mr-1 border-r ${theme.border}`}>
              <div className="text-right">
                <div className="text-xs font-bold leading-tight">{profile?.display_name}</div>
                <div className={`text-[10px] ${theme.textDim} leading-tight`}>
                  {profile?.is_admin ? 'Admin' : (perms?.can_edit_employees || perms?.can_edit_salaries ? L.emp.active : L.readOnly)}
                </div>
              </div>
            </div>
            <button onClick={() => setLang(lang === 'en' ? 'az' : 'en')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${theme.border} ${theme.hover} flex items-center gap-1.5`}>
              <Globe className="w-3.5 h-3.5" />{lang.toUpperCase()}
            </button>
            <button onClick={() => setDark(!dark)} className={`p-2 rounded-lg ${theme.hover}`}>
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={signOut} className={`p-2 rounded-lg ${theme.hover}`} title={L.actions.logout}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 lg:py-8 flex gap-8">
        <aside className={`
          ${navOpen ? 'fixed' : 'hidden'} lg:block lg:relative
          ${navOpen ? `inset-0 z-40 ${theme.bg}` : ''}
          lg:w-56 shrink-0
        `}>
          {navOpen && (
            <div className={`lg:hidden flex items-center justify-between h-16 px-4 border-b ${theme.border}`}>
              <span className="font-semibold">{L.appName}</span>
              <button onClick={() => setNavOpen(false)} className={`p-2 rounded-lg ${theme.hover}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
          <nav className={`${navOpen ? 'p-4' : ''} lg:p-0 space-y-1`}>
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = view === item.id;
              return (
                <button key={item.id}
                  onClick={() => { setView(item.id); setNavOpen(false); }}
                  className={`
                    w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold border
                    ${isActive ? theme.activeNav : `border-transparent ${theme.textDim} ${theme.hover}`}
                  `}>
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />{item.label}
                  </span>
                  {isActive && <ChevronRight className="w-4 h-4" />}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
