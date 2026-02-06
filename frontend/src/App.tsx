import { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { MoisDetail } from './components/MoisDetail';
import { UploadZone } from './components/UploadZone';

type Page = 'dashboard' | 'upload' | 'detail';

interface DetailState {
  annee: number;
  mois: number;
}

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [detail, setDetail] = useState<DetailState | null>(null);

  function navigateToMois(annee: number, mois: number) {
    setDetail({ annee, mois });
    setPage('detail');
  }

  function navigateToDashboard() {
    setPage('dashboard');
    setDetail(null);
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

            <div className="flex gap-1">
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
                onClick={() => setPage('upload')}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  page === 'upload'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Contenu */}
      {page === 'dashboard' && (
        <Dashboard onNavigateToMois={navigateToMois} />
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
