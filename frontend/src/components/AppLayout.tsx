import React from 'react';

type Page = 'accueil' | 'reclamations' | 'donnees' | 'confrontation';

interface AppLayoutProps {
  page: Page;
  onNavigate: (page: Page) => void;
  onShutdown: () => void;
  pageTitle: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: Page; label: string; icon: React.ReactNode }[] = [
  {
    id: 'accueil',
    label: 'Accueil',
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )
  },
  {
    id: 'reclamations',
    label: 'Réclamations',
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  {
    id: 'donnees',
    label: 'Données',
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16M9 11h6M9 15h4" />
      </svg>
    )
  },
  {
    id: 'confrontation',
    label: 'Confrontation',
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )
  }
];

export function AppLayout({ page, onNavigate, onShutdown, pageTitle, headerRight, children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8FAFB' }}>
      {/* Sidebar */}
      <aside className="w-48 flex-shrink-0 flex flex-col bg-white" style={{ borderRight: '1px solid #E2E8F0' }}>
        {/* Brand */}
        <div className="px-5 py-5" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <p className="text-xl font-bold tracking-tight" style={{ color: '#1A2332' }}>
            Reparti<span style={{ color: '#1B6B40' }}>X</span>
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-widest mt-0.5" style={{ color: '#94A3B8', letterSpacing: '0.1em' }}>
            Audit remise grossiste
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map(item => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                style={{
                  borderLeft: active ? '3px solid #1B6B40' : '3px solid transparent',
                  backgroundColor: active ? '#E8F5EE' : 'transparent',
                  color: active ? '#1B6B40' : '#64748B',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Quitter */}
        <div className="py-2" style={{ borderTop: '1px solid #E2E8F0' }}>
          <button
            onClick={onShutdown}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-red-50 group"
            style={{ borderLeft: '3px solid transparent', color: '#94A3B8' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#991B1B'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#94A3B8'; }}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Quitter
          </button>
        </div>
      </aside>

      {/* Zone principale */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header
          className="px-6 py-3 flex items-center justify-between flex-shrink-0 bg-white"
          style={{ borderBottom: '1px solid #E2E8F0' }}
        >
          <h1 className="text-sm font-semibold" style={{ color: '#1A2332' }}>{pageTitle}</h1>
          {headerRight && <div className="flex items-center gap-3">{headerRight}</div>}
        </header>

        {/* Contenu */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
