import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { formatEuros } from '../utils/formatters';

interface Props {
  initialMois?: string;   // "YYYY-MM"
  onClose: () => void;
  onSaved: () => void;
}

function currentMois(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function toNum(v: string): number {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

export function OrpecDataForm({ initialMois, onClose, onSaved }: Props) {
  const [mois, setMois] = useState(initialMois ?? currentMois());
  const [caHTorpec, setCaHTorpec] = useState('');
  const [achatsGeneriques, setAchatsGeneriques] = useState('');
  const [achatsAlvita, setAchatsAlvita] = useState('');
  const [existant, setExistant] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-remplissage au changement de mois
  useEffect(() => {
    let annule = false;
    async function charger() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getOrpec(mois);
        if (annule) return;
        if (data) {
          setCaHTorpec(String(data.caHTorpec));
          setAchatsGeneriques(String(data.achatsGeneriques));
          setAchatsAlvita(String(data.achatsAlvita));
          setExistant(true);
        } else {
          setCaHTorpec('');
          setAchatsGeneriques('');
          setAchatsAlvita('');
          setExistant(false);
        }
      } catch (err) {
        if (!annule) setError(err instanceof Error ? err.message : 'Erreur chargement');
      } finally {
        if (!annule) setLoading(false);
      }
    }
    charger();
    return () => { annule = true; };
  }, [mois]);

  const assiette = toNum(caHTorpec) - toNum(achatsGeneriques) - toNum(achatsAlvita);
  const remiseDue = Math.round(assiette * 0.03 * 100) / 100;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.putOrpec(mois, {
        caHTorpec: toNum(caHTorpec),
        achatsGeneriques: toNum(achatsGeneriques),
        achatsAlvita: toNum(achatsAlvita)
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur sauvegarde');
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      await api.deleteOrpec(mois);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur suppression');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-sm font-bold text-slate-800 mb-1">Saisir donnees ORPEC (PIEVE)</h2>
        <p className="text-xs text-slate-500 mb-4">
          Assiette contractuelle = CA HT ORPEC &minus; achats generiques &minus; achats Alvita.
          Remise due = 3% de l&apos;assiette.
        </p>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Mois</label>
            <input
              type="month"
              value={mois}
              onChange={e => setMois(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
            />
            {existant && (
              <p className="text-xs text-amber-600 mt-1">Donnees existantes pour ce mois (modification).</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">CA HT ORPEC (&euro;)</label>
            <input
              type="number" step="0.01" inputMode="decimal"
              value={caHTorpec}
              onChange={e => setCaHTorpec(e.target.value)}
              disabled={loading}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Achats generiques (&euro;)</label>
            <input
              type="number" step="0.01" inputMode="decimal"
              value={achatsGeneriques}
              onChange={e => setAchatsGeneriques(e.target.value)}
              disabled={loading}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Achats Alvita (&euro;)</label>
            <input
              type="number" step="0.01" inputMode="decimal"
              value={achatsAlvita}
              onChange={e => setAchatsAlvita(e.target.value)}
              disabled={loading}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-500">Assiette calculee</p>
              <p className="text-sm font-semibold text-slate-800">{formatEuros(assiette)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Remise due (3%)</p>
              <p className="text-sm font-bold" style={{ color: '#6B2D8B' }}>{formatEuros(remiseDue)}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-between items-center mt-5">
          <div>
            {existant && (
              <button
                onClick={handleDelete}
                disabled={saving || loading}
                className="px-3 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                Supprimer
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 text-xs font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#6B2D8B' }}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
