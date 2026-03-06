import { useState } from 'react';
import { AppLayout } from './components/AppLayout';
import { PageAccueil } from './pages/PageAccueil';
import { PageReclamations } from './pages/PageReclamations';
import { PageDonnees } from './pages/PageDonnees';
import { api } from './services/api';

type Page = 'accueil' | 'reclamations' | 'donnees';

const PAGE_TITLES: Record<Page, string> = {
  accueil: 'Accueil',
  reclamations: 'Réclamations',
  donnees: 'Données'
};

function App() {
  const [page, setPage] = useState<Page>('accueil');
  const [isShutdown, setIsShutdown] = useState(false);

  async function handleShutdown() {
    if (!confirm('Voulez-vous vraiment quitter l\'application ?')) return;
    try { await api.shutdown(); } catch { /* serveur s'arrete */ }
    setIsShutdown(true);
  }

  if (isShutdown) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Application arrêtée</h2>
          <p className="text-gray-600">Les serveurs ont été arrêtés. Vous pouvez fermer cet onglet.</p>
        </div>
      </div>
    );
  }

  return (
    <AppLayout
      page={page}
      onNavigate={setPage}
      onShutdown={handleShutdown}
      pageTitle={PAGE_TITLES[page]}
    >
      {page === 'accueil' && <PageAccueil onNavigate={setPage} />}
      {page === 'reclamations' && <PageReclamations />}
      {page === 'donnees' && <PageDonnees />}
    </AppLayout>
  );
}

export default App;
