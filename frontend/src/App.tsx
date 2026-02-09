import { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { DashboardPanorama } from './components/DashboardPanorama';
import { DashboardChronos } from './components/DashboardChronos';
import { MoisDetail } from './components/MoisDetail';
import { UploadZone } from './components/UploadZone';
import { api } from './services/api';

type Page = 'dashboard' | 'panorama' | 'chronos' | 'upload' | 'detail';

interface DetailState {
  annee: number;
  mois: number;
}

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [isShutdown, setIsShutdown] = useState(false);

  function navigateToMois(annee: number, mois: number) {
    setDetail({ annee, mois });
    setPage('detail');
  }

  function navigateToDashboard() {
    setPage('dashboard');
    setDetail(null);
  }

  async function handleShutdown() {
    if (!confirm('Voulez-vous vraiment quitter l\'application ?')) return;

    try {
      await api.shutdown();
    } catch {
      // Le serveur s'arrete, donc la requete peut echouer
    }
    setIsShutdown(true);
  }

  // Affichage du popup d'arret
  if (isShutdown) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Application arretee</h2>
          <p className="text-gray-600 mb-4">
            Les serveurs ont ete arretes avec succes.<br />
            Vous pouvez fermer cet onglet.
          </p>
          <p className="text-sm text-gray-400">
            Pour relancer l'application, executez <code className="bg-gray-100 px-2 py-1 rounded">npm run dev</code> dans les dossiers backend et frontend.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-blue-700">RepartiX</span>
              <span className="text-sm text-gray-400">|</span>
              <span className="text-sm text-gray-500">Controle Remises Alliance Healthcare</span>
            </div>

            <div className="flex gap-1 items-center">
              <button
                onClick={() => setPage('dashboard')}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  page === 'dashboard' || page === 'detail'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setPage('panorama')}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  page === 'panorama'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Panorama
              </button>
              <button
                onClick={() => setPage('chronos')}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  page === 'chronos'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Chronos
              </button>
              <button
                onClick={() => setPage('upload')}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  page === 'upload'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Import
              </button>
              <div className="w-px h-6 bg-gray-300 mx-2"></div>
              <button
                onClick={handleShutdown}
                className="px-4 py-2 text-sm rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Contenu */}
      {page === 'dashboard' && (
        <Dashboard onNavigateToMois={navigateToMois} />
      )}

      {page === 'panorama' && (
        <DashboardPanorama onNavigateToMois={navigateToMois} />
      )}

      {page === 'chronos' && (
        <DashboardChronos onNavigateToMois={navigateToMois} />
      )}

      {page === 'detail' && detail && (
        <MoisDetail
          annee={detail.annee}
          mois={detail.mois}
          onBack={navigateToDashboard}
        />
      )}

      {page === 'upload' && (
        <UploadZone />
      )}
    </div>
  );
}

export default App;
