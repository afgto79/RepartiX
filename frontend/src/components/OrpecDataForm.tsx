import { useEffect, useState } from 'react';
import { api, OrpecPutPayload, OrpecRemiseAnnoncee } from '../services/api';
import { formatEuros } from '../utils/formatters';

interface Props {
  initialMois?: string;   // "YYYY-MM"
  onClose: () => void;
  onSaved: () => void;
}

type SaisieMode = 'DETAIL' | 'ASSIETTE_DIRECTE';
type AnnonceSource = OrpecRemiseAnnoncee['source'];

function currentMois(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function toNum(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isNaN(n) ? undefined : n;
}

const inputCls = 'w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:border-green-700';

export function OrpecDataForm({ initialMois, onClose, onSaved }: Props) {
  const [mois, setMois] = useState(initialMois ?? currentMois());
  const [saisieMode, setSaisieMode] = useState<SaisieMode>('DETAIL');
  // Mode DETAIL
  const [caHTorpec, setCaHTorpec] = useState('');
  const [achatsGeneriques, setAchatsGeneriques] = useState('');
  const [achatsAlvita, setAchatsAlvita] = useState('');
  // Mode ASSIETTE_DIRECTE
  const [ventesHT, setVentesHT] = useState('');
  const [assietteDirecte, setAssietteDirecte] = useState('');
  // Remise annoncee
  const [annonceMontant, setAnnonceMontant] = useState('');
  const [annonceSource, setAnnonceSource] = useState<AnnonceSource>('FACTURE_ORPEC');
  const [annonceReference, setAnnonceReference] = useState('');
  const [annonceExistante, setAnnonceExistante] = useState(false);

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
        setSaisieMode(data?.saisieMode ?? 'DETAIL');
        setCaHTorpec(data?.caHTorpec !== undefined ? String(data.caHTorpec) : '');
        setAchatsGeneriques(data?.achatsGeneriques !== undefined ? String(data.achatsGeneriques) : '');
        setAchatsAlvita(data?.achatsAlvita !== undefined ? String(data.achatsAlvita) : '');
        setVentesHT(data?.ventesHT !== undefined ? String(data.ventesHT) : '');
        setAssietteDirecte(data?.saisieMode === 'ASSIETTE_DIRECTE' && data.assiette !== undefined ? String(data.assiette) : '');
        setAnnonceMontant(data?.remiseAnnoncee !== undefined ? String(data.remiseAnnoncee.montantHT) : '');
        setAnnonceSource(data?.remiseAnnoncee?.source ?? 'FACTURE_ORPEC');
        setAnnonceReference(data?.remiseAnnoncee?.reference ?? '');
        setAnnonceExistante(data?.remiseAnnoncee !== undefined);
        setExistant(data !== null);
      } catch (err) {
        if (!annule) setError(err instanceof Error ? err.message : 'Erreur chargement');
      } finally {
        if (!annule) setLoading(false);
      }
    }
    charger();
    return () => { annule = true; };
  }, [mois]);

  // Bloc assiette : absent (rien saisi), valide, ou incomplet (saisie partielle)
  const detailVals = [toNum(caHTorpec), toNum(achatsGeneriques), toNum(achatsAlvita)];
  const detailSaisis = [caHTorpec, achatsGeneriques, achatsAlvita].filter(v => v.trim() !== '').length;
  const assietteEtat: 'absent' | 'valide' | 'incomplet' =
    saisieMode === 'DETAIL'
      ? (detailSaisis === 0 ? 'absent' : detailVals.every(v => v !== undefined) ? 'valide' : 'incomplet')
      : (toNum(assietteDirecte) !== undefined ? 'valide'
        : assietteDirecte.trim() === '' && ventesHT.trim() === '' ? 'absent' : 'incomplet');

  const assiette = saisieMode === 'DETAIL'
    ? (assietteEtat === 'valide' ? detailVals[0]! - detailVals[1]! - detailVals[2]! : undefined)
    : toNum(assietteDirecte);
  const remiseDue = assiette !== undefined ? Math.round(assiette * 0.03 * 100) / 100 : undefined;

  // Annonce : objet si montant saisi ; null (retrait) si vide alors qu'une annonce existait ; sinon omise
  const annonceMontantNum = toNum(annonceMontant);
  const annoncePayload: OrpecRemiseAnnoncee | null | undefined =
    annonceMontantNum !== undefined
      ? {
        montantHT: annonceMontantNum,
        source: annonceSource,
        ...(annonceReference.trim() !== '' ? { reference: annonceReference.trim() } : {})
      }
      : annonceExistante ? null : undefined;

  const peutEnregistrer = assietteEtat !== 'incomplet'
    && (assietteEtat === 'valide' || annoncePayload !== undefined);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: OrpecPutPayload = {};
      if (assietteEtat === 'valide') {
        if (saisieMode === 'DETAIL') {
          payload.saisieMode = 'DETAIL';
          payload.caHTorpec = detailVals[0];
          payload.achatsGeneriques = detailVals[1];
          payload.achatsAlvita = detailVals[2];
        } else {
          payload.saisieMode = 'ASSIETTE_DIRECTE';
          payload.assiette = toNum(assietteDirecte);
          const v = toNum(ventesHT);
          if (v !== undefined) payload.ventesHT = v;
        }
      }
      if (annoncePayload !== undefined) payload.remiseAnnoncee = annoncePayload;
      await api.putOrpec(mois, payload);
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
      <div
        className="bg-white shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        style={{ borderRadius: '4px' }}
      >
        <h2 className="text-sm font-bold text-slate-800 mb-1">Saisir donnees ORPEC (PIEVE)</h2>
        <p className="text-xs text-slate-500 mb-4">
          Assiette contractuelle : detail (CA HT &minus; generiques &minus; Alvita) ou saisie directe
          de la colonne &laquo; Sans RSF &raquo;. Remise due = 3% de l&apos;assiette.
        </p>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
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
              className={inputCls}
            />
            {existant && (
              <p className="text-xs text-amber-600 mt-1">Donnees existantes pour ce mois (modification).</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Mode de saisie de l&apos;assiette</label>
            <div className="flex gap-1 p-1" style={{ backgroundColor: '#F1F5F9', borderRadius: '4px' }}>
              <button
                type="button"
                onClick={() => setSaisieMode('DETAIL')}
                className={`flex-1 text-xs font-medium px-2 py-1.5 ${saisieMode === 'DETAIL' ? 'bg-white shadow' : 'text-slate-500'}`}
                style={saisieMode === 'DETAIL'
                  ? { borderRadius: '4px', color: '#1B6B40', borderBottom: '2px solid #1B6B40' }
                  : { borderRadius: '4px' }}
              >
                Detail
              </button>
              <button
                type="button"
                onClick={() => setSaisieMode('ASSIETTE_DIRECTE')}
                className={`flex-1 text-xs font-medium px-2 py-1.5 ${saisieMode === 'ASSIETTE_DIRECTE' ? 'bg-white shadow' : 'text-slate-500'}`}
                style={saisieMode === 'ASSIETTE_DIRECTE'
                  ? { borderRadius: '4px', color: '#1B6B40', borderBottom: '2px solid #1B6B40' }
                  : { borderRadius: '4px' }}
              >
                Assiette directe (Sans RSF)
              </button>
            </div>
          </div>

          {saisieMode === 'DETAIL' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">CA HT ORPEC (&euro;)</label>
                <input
                  type="number" step="0.01" inputMode="decimal"
                  value={caHTorpec}
                  onChange={e => setCaHTorpec(e.target.value)}
                  disabled={loading}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Achats generiques (&euro;)</label>
                <input
                  type="number" step="0.01" inputMode="decimal"
                  value={achatsGeneriques}
                  onChange={e => setAchatsGeneriques(e.target.value)}
                  disabled={loading}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Achats Alvita (&euro;)</label>
                <input
                  type="number" step="0.01" inputMode="decimal"
                  value={achatsAlvita}
                  onChange={e => setAchatsAlvita(e.target.value)}
                  disabled={loading}
                  className={inputCls}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Ventes HT (&euro;) &mdash; optionnel</label>
                <input
                  type="number" step="0.01" inputMode="decimal"
                  value={ventesHT}
                  onChange={e => setVentesHT(e.target.value)}
                  disabled={loading}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Assiette &laquo; Sans RSF &raquo; (&euro;)</label>
                <input
                  type="number" step="0.01" inputMode="decimal"
                  value={assietteDirecte}
                  onChange={e => setAssietteDirecte(e.target.value)}
                  disabled={loading}
                  className={inputCls}
                />
              </div>
            </>
          )}

          <div className="pt-2 border-t border-slate-200">
            <p className="text-xs font-medium text-slate-600 mb-2">
              Remise annoncee (facture ORPEC / tableau PIEVE) &mdash; optionnel
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Montant HT (&euro;)</label>
                <input
                  type="number" step="0.01" inputMode="decimal"
                  value={annonceMontant}
                  onChange={e => setAnnonceMontant(e.target.value)}
                  disabled={loading}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Source</label>
                <select
                  value={annonceSource}
                  onChange={e => setAnnonceSource(e.target.value as AnnonceSource)}
                  disabled={loading}
                  className={inputCls}
                >
                  <option value="FACTURE_ORPEC">Facture ORPEC</option>
                  <option value="TABLEAU_PIEVE">Tableau PIEVE</option>
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">Reference &mdash; optionnel (ex: n&deg; facture)</label>
              <input
                type="text"
                value={annonceReference}
                onChange={e => setAnnonceReference(e.target.value)}
                disabled={loading}
                className={inputCls}
              />
            </div>
            {annonceExistante && annonceMontantNum === undefined && (
              <p className="text-xs text-amber-600 mt-1">
                Montant vide : la remise annoncee existante sera retiree a l&apos;enregistrement.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <div>
              <p className="text-xs text-slate-500">Assiette {saisieMode === 'DETAIL' ? 'calculee' : 'saisie'}</p>
              <p className="text-sm font-semibold text-slate-800 data-val">
                {assiette !== undefined ? formatEuros(assiette) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Remise due (3%)</p>
              <p className="text-sm font-bold data-val" style={{ color: '#1B6B40' }}>
                {remiseDue !== undefined ? formatEuros(remiseDue) : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-between items-center mt-5">
          <div>
            {existant && (
              <button
                onClick={handleDelete}
                disabled={saving || loading}
                className="px-3 py-2 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
              >
                Supprimer
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !peutEnregistrer}
              className="px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#1B6B40', borderRadius: '4px' }}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
