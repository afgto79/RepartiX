import { useEffect, useState } from 'react';
import { api, Reclamation, Payment, Reliquat, AnalyseRemise } from '../services/api';
import { formatEuros, formatMoisLabel } from '../utils/formatters';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';

type ClaimStatus = 'ouverte' | 'prete_a_clore' | 'cloturee';
type Filter = 'toutes' | 'ouverte' | 'prete_a_clore' | 'cloturee' | 'reliquat';

function getMoisRange(debut: string, fin: string): string[] {
  const result: string[] = [];
  let cur = debut;
  while (cur <= fin) {
    result.push(cur);
    const [y, m] = cur.split('-').map(Number);
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return result;
}

function computeStatus(claim: Reclamation, received: number): ClaimStatus {
  if (claim.statut === 'soldee' || claim.statut === 'cloturee') return 'cloturee';
  if (claim.montantReclame > 0 && received >= claim.montantReclame) return 'prete_a_clore';
  return 'ouverte';
}

function StatusBadge({ status }: { status: ClaimStatus }) {
  if (status === 'cloturee') return <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-700">Cloturée</span>;
  if (status === 'prete_a_clore') return <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-100 text-blue-700">Prête à clore</span>;
  return <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">Ouverte</span>;
}

const TODAY = new Date().toISOString().slice(0, 10);

export function PageReclamations() {
  const [claims, setClaims] = useState<Reclamation[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reliquats, setReliquats] = useState<Reliquat[]>([]);
  const [allAnalyses, setAllAnalyses] = useState<AnalyseRemise[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [selectedReliquatId, setSelectedReliquatId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('toutes');
  const [loading, setLoading] = useState(true);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // Formulaire réclamation
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [editClaimId, setEditClaimId] = useState<string | null>(null);
  const [claimForm, setClaimForm] = useState({
    moisDebut: '', moisFin: '', dateCreation: TODAY,
    montantReclame: '', description: ''
  });
  const [autoAmount, setAutoAmount] = useState<number | null>(null);

  // Prompt reliquat (après soumission si montant < calculé)
  const [pendingReliquat, setPendingReliquat] = useState<{
    claimId: string; moisDebut: string; moisFin: string; amount: number
  } | null>(null);

  // Formulaire "créer réclamation depuis reliquat"
  const [showClaimFromReliquat, setShowClaimFromReliquat] = useState(false);
  const [claimFromReliquatAmount, setClaimFromReliquatAmount] = useState('');

  // Formulaire paiement
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editPaymentId, setEditPaymentId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({ date: TODAY, amount: '', comment: '' });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [c, p, r, years] = await Promise.all([
        api.getReclamations(),
        api.getPayments(),
        api.getReliquats(),
        api.getAnnees()
      ]);
      setClaims(c);
      setPayments(p);
      setReliquats(r);

      const all: AnalyseRemise[] = [];
      for (const y of years) {
        const d = await api.getDashboard(y);
        all.push(...d.mois);
      }
      setAllAnalyses(all);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function getReceived(claimId: string) {
    return payments.filter(p => p.claimId === claimId).reduce((s, p) => s + p.amount, 0);
  }

  function getClaimPayments(claimId: string) {
    return payments.filter(p => p.claimId === claimId).sort((a, b) => b.date.localeCompare(a.date));
  }

  function selectClaim(id: string) {
    setSelectedClaimId(id);
    setSelectedReliquatId(null);
    setShowPaymentForm(false);
    setShowClaimFromReliquat(false);
  }

  function selectReliquat(id: string) {
    setSelectedReliquatId(id);
    setSelectedClaimId(null);
    setShowPaymentForm(false);
    setShowClaimFromReliquat(false);
  }

  const selectedClaim = claims.find(c => c.id === selectedClaimId) ?? null;
  const selectedReliquat = reliquats.find(r => r.id === selectedReliquatId) ?? null;
  const selectedPayments = selectedClaimId ? getClaimPayments(selectedClaimId) : [];

  // Liste combinée claims + reliquats filtrée
  type ListItem = { kind: 'claim'; data: Reclamation } | { kind: 'reliquat'; data: Reliquat };
  const listItems: ListItem[] = [];
  if (filter !== 'reliquat') {
    claims.forEach(c => {
      const received = getReceived(c.id);
      const status = computeStatus(c, received);
      if (filter === 'toutes' || status === filter) {
        listItems.push({ kind: 'claim', data: c });
      }
    });
  }
  if (filter === 'toutes' || filter === 'reliquat') {
    reliquats.forEach(r => listItems.push({ kind: 'reliquat', data: r }));
  }
  listItems.sort((a, b) => {
    const dateA = a.kind === 'claim' ? a.data.dateCreation : a.data.createdAt;
    const dateB = b.kind === 'claim' ? b.data.dateCreation : b.data.createdAt;
    return dateB.localeCompare(dateA);
  });

  // Auto-calcul montant depuis les mois sélectionnés
  useEffect(() => {
    if (!claimForm.moisDebut || !claimForm.moisFin || claimForm.moisDebut > claimForm.moisFin) {
      setAutoAmount(null);
      return;
    }
    const range = getMoisRange(claimForm.moisDebut, claimForm.moisFin);
    const total = allAnalyses
      .filter(a => range.includes(a.mois) && a.delta < 0 && a.decadesPresentes.length === 3)
      .reduce((s, a) => s + Math.abs(a.delta), 0);
    setAutoAmount(total);
    if (!editClaimId) {
      setClaimForm(f => ({ ...f, montantReclame: total.toFixed(2) }));
    }
  }, [claimForm.moisDebut, claimForm.moisFin]);

  // --- Claim CRUD ---
  function openNewClaim() {
    setEditClaimId(null);
    setClaimForm({ moisDebut: '', moisFin: '', dateCreation: TODAY, montantReclame: '', description: '' });
    setAutoAmount(null);
    setShowClaimForm(true);
  }

  function openEditClaim(c: Reclamation) {
    setEditClaimId(c.id);
    setClaimForm({ moisDebut: c.moisDebut, moisFin: c.moisFin, dateCreation: c.dateCreation, montantReclame: c.montantReclame.toString(), description: c.description });
    setShowClaimForm(true);
  }

  async function submitClaim(e: React.FormEvent) {
    e.preventDefault();
    try {
      const amount = parseFloat(claimForm.montantReclame);
      const data = {
        moisDebut: claimForm.moisDebut, moisFin: claimForm.moisFin,
        dateCreation: claimForm.dateCreation, statut: 'ouverte',
        montantReclame: amount, description: claimForm.description
      };
      if (editClaimId) {
        await api.updateReclamation(editClaimId, data);
        setShowClaimForm(false);
        setEditClaimId(null);
        await loadAll();
      } else {
        const created = await api.addReclamation(data);
        setShowClaimForm(false);
        selectClaim(created.id);
        await loadAll();
        // Propose reliquat si montant < déficit calculé
        if (autoAmount !== null && amount < autoAmount - 0.01) {
          setPendingReliquat({
            claimId: created.id,
            moisDebut: claimForm.moisDebut,
            moisFin: claimForm.moisFin,
            amount: Math.round((autoAmount - amount) * 100) / 100
          });
        }
      }
    } catch (err) { console.error(err); }
  }

  async function confirmReliquat(create: boolean) {
    if (create && pendingReliquat) {
      try {
        await api.addReliquat({
          originReclamationId: pendingReliquat.claimId,
          periodStart: pendingReliquat.moisDebut,
          periodEnd: pendingReliquat.moisFin,
          initialAmount: pendingReliquat.amount,
          remainingAmount: pendingReliquat.amount,
          status: 'active'
        });
        await loadAll();
      } catch (err) { console.error(err); }
    }
    setPendingReliquat(null);
  }

  async function closeClaim(id: string) {
    if (!confirm('Marquer cette réclamation comme cloturée ?')) return;
    try {
      await api.updateReclamation(id, { statut: 'cloturee' });
      await loadAll();
    } catch (err) { console.error(err); }
  }

  async function deleteClaim(id: string) {
    if (!confirm('Supprimer cette réclamation et tous ses paiements ?')) return;
    try {
      await api.deleteReclamation(id);
      setSelectedClaimId(null);
      await loadAll();
    } catch (err) { console.error(err); }
  }

  async function clearAllClaims() {
    try {
      await api.clearAllReclamations();
      setSelectedClaimId(null);
      await loadAll();
    } catch (err) { console.error(err); }
  }

  // --- Reliquat actions ---
  async function abandonReliquat(id: string) {
    if (!confirm('Marquer ce reliquat comme abandonné ?')) return;
    try {
      await api.updateReliquat(id, { status: 'abandoned' });
      await loadAll();
    } catch (err) { console.error(err); }
  }

  async function deleteReliquatItem(id: string) {
    if (!confirm('Supprimer ce reliquat ?')) return;
    try {
      await api.deleteReliquat(id);
      setSelectedReliquatId(null);
      await loadAll();
    } catch (err) { console.error(err); }
  }

  async function submitClaimFromReliquat(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedReliquat) return;
    try {
      const amount = parseFloat(claimFromReliquatAmount);
      // Créer la réclamation liée au reliquat
      const created = await api.addReclamation({
        moisDebut: selectedReliquat.periodStart,
        moisFin: selectedReliquat.periodEnd,
        dateCreation: TODAY,
        statut: 'ouverte',
        montantReclame: amount,
        description: (() => {
          const originClaim = claims.find(c => c.id === selectedReliquat.originReclamationId);
          return originClaim ? `Depuis reliquat de ${originClaim.reference}` : 'Depuis reliquat';
        })(),
        sourceReliquatId: selectedReliquat.id
      });
      // Réduire le remainingAmount du reliquat (ne pas le clore, sauf si épuisé)
      const newRemaining = Math.round((selectedReliquat.remainingAmount - amount) * 100) / 100;
      await api.updateReliquat(selectedReliquat.id, {
        remainingAmount: Math.max(0, newRemaining),
        status: newRemaining <= 0.01 ? 'closed' : 'active'
      });
      setShowClaimFromReliquat(false);
      selectClaim(created.id);
      await loadAll();
    } catch (err) { console.error(err); }
  }

  // --- Payment CRUD ---
  function openNewPayment() {
    setEditPaymentId(null);
    setPaymentForm({ date: TODAY, amount: '', comment: '' });
    setShowPaymentForm(true);
  }

  function openEditPayment(p: Payment) {
    setEditPaymentId(p.id);
    setPaymentForm({ date: p.date, amount: p.amount.toString(), comment: p.comment });
    setShowPaymentForm(true);
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClaimId) return;
    try {
      if (editPaymentId) {
        await api.updatePayment(editPaymentId, { date: paymentForm.date, amount: parseFloat(paymentForm.amount), comment: paymentForm.comment });
      } else {
        await api.addPayment({ claimId: selectedClaimId, date: paymentForm.date, amount: parseFloat(paymentForm.amount), comment: paymentForm.comment });
      }
      setShowPaymentForm(false);
      setEditPaymentId(null);
      await loadAll();
    } catch (err) { console.error(err); }
  }

  async function deletePaymentItem(id: string) {
    if (!confirm('Supprimer ce paiement ?')) return;
    try {
      await api.deletePayment(id);
      await loadAll();
    } catch (err) { console.error(err); }
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Chargement...</div>;

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'toutes', label: 'Toutes' },
    { id: 'ouverte', label: 'Ouvertes' },
    { id: 'prete_a_clore', label: 'Prêtes à clore' },
    { id: 'cloturee', label: 'Cloturées' },
    { id: 'reliquat', label: 'Reliquats' }
  ];

  return (
    <div className="flex h-full">
      {showConfirmClear && (
        <ConfirmDeleteModal
          title="Supprimer toutes les réclamations ?"
          description={`${claims.length} réclamation(s) et tous leurs paiements seront supprimés définitivement.`}
          onConfirm={() => { setShowConfirmClear(false); clearAllClaims(); }}
          onCancel={() => setShowConfirmClear(false)}
        />
      )}

      {/* Prompt reliquat */}
      {pendingReliquat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-sm font-bold text-slate-800 mb-2">Différence non réclamée</h2>
            <p className="text-xs text-slate-500 mb-4">
              Le montant réclamé est inférieur au déficit calculé.<br />
              Différence : <span className="font-semibold text-amber-700">{formatEuros(pendingReliquat.amount)}</span>
            </p>
            <p className="text-xs text-slate-600 mb-4">Que faire de cette différence ?</p>
            <div className="flex gap-2">
              <button onClick={() => confirmReliquat(true)}
                className="flex-1 py-2 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600">
                Créer un reliquat
              </button>
              <button onClick={() => confirmReliquat(false)}
                className="flex-1 py-2 text-xs font-semibold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
                Abandonner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Colonne gauche — liste */}
      <div className="w-80 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <button onClick={openNewClaim}
            className="w-full py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            + Nouvelle réclamation
          </button>
          {claims.length > 0 && (
            <button onClick={() => setShowConfirmClear(true)}
              className="w-full py-1.5 text-xs font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              Tout supprimer
            </button>
          )}
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                  filter === f.id
                    ? f.id === 'reliquat' ? 'bg-amber-400 text-white' : 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Formulaire réclamation */}
        {showClaimForm && (
          <div className="p-4 border-b border-slate-200 bg-blue-50">
            <p className="text-xs font-semibold text-blue-800 mb-3">{editClaimId ? 'Modifier' : 'Nouvelle réclamation'}</p>
            <form onSubmit={submitClaim} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500">Début</label>
                  <input type="month" value={claimForm.moisDebut} onChange={e => setClaimForm(f => ({ ...f, moisDebut: e.target.value }))}
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1" required />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">Fin</label>
                  <input type="month" value={claimForm.moisFin} onChange={e => setClaimForm(f => ({ ...f, moisFin: e.target.value }))}
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1" required />
                </div>
              </div>
              {claimForm.moisDebut && claimForm.moisFin &&
               claimForm.moisDebut.split('-')[0] !== claimForm.moisFin.split('-')[0] && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  Période à cheval sur deux années : les montants récupérés seront répartis au pro-rata des mois dans chaque année pour les exports PDF.
                </p>
              )}
              <div>
                <label className="text-[10px] text-slate-500">
                  Montant réclamé
                  {autoAmount !== null && <span className="text-blue-600 ml-1">(calculé: {formatEuros(autoAmount)})</span>}
                </label>
                <input type="number" step="0.01" value={claimForm.montantReclame} onChange={e => setClaimForm(f => ({ ...f, montantReclame: e.target.value }))}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1" required />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Date</label>
                <input type="date" value={claimForm.dateCreation} onChange={e => setClaimForm(f => ({ ...f, dateCreation: e.target.value }))}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1" required />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Commentaire</label>
                <input type="text" value={claimForm.description} onChange={e => setClaimForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1" placeholder="Optionnel" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" className="flex-1 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700">
                  {editClaimId ? 'Modifier' : 'Créer'}
                </button>
                <button type="button" onClick={() => { setShowClaimForm(false); setEditClaimId(null); }}
                  className="flex-1 py-1.5 bg-white text-slate-600 text-xs font-semibold rounded border border-slate-200 hover:bg-slate-50">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Liste mixte */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {listItems.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-8">Aucun élément</p>
          )}
          {listItems.map(item => {
            if (item.kind === 'claim') {
              const c = item.data;
              const received = getReceived(c.id);
              const remaining = c.montantReclame - received;
              const status = computeStatus(c, received);
              const isSelected = c.id === selectedClaimId;
              return (
                <button key={`claim-${c.id}`} onClick={() => selectClaim(c.id)}
                  className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-blue-600' : ''}`}>
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-700">{c.reference}</span>
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-[10px] text-slate-500 mb-1">{formatMoisLabel(c.moisDebut)} → {formatMoisLabel(c.moisFin)}</p>
                  {c.sourceReliquatId && (() => {
                    const rel = reliquats.find(r => r.id === c.sourceReliquatId);
                    const originClaim = rel ? claims.find(oc => oc.id === rel.originReclamationId) : null;
                    return originClaim ? (
                      <p className="text-[10px] text-amber-600 mb-1">Reliquat de {originClaim.reference}</p>
                    ) : null;
                  })()}
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Réclamé: <span className="font-medium text-slate-700">{formatEuros(c.montantReclame)}</span></span>
                    <span className={remaining > 0.01 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                      {remaining > 0.01 ? `-${formatEuros(remaining)}` : 'Soldé'}
                    </span>
                  </div>
                </button>
              );
            } else {
              const r = item.data;
              const isSelected = r.id === selectedReliquatId;
              const originClaim = claims.find(c => c.id === r.originReclamationId);
              return (
                <button key={`reliquat-${r.id}`} onClick={() => selectReliquat(r.id)}
                  style={{ backgroundColor: isSelected ? '#FFF0A0' : '#FFF7D6' }}
                  className={`w-full text-left p-4 hover:opacity-80 transition-opacity ${isSelected ? 'border-l-2 border-amber-500' : ''}`}>
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-xs font-semibold text-amber-800">
                      Reliquat {originClaim ? `de ${originClaim.reference}` : ''}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                      r.status === 'closed' ? 'bg-slate-100 text-slate-500' :
                      r.status === 'abandoned' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {r.status === 'closed' ? 'Clos' : r.status === 'abandoned' ? 'Abandonné' : 'Actif'}
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-700 mb-2">{formatMoisLabel(r.periodStart)} → {formatMoisLabel(r.periodEnd)}</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-700">Initial: <span className="font-medium">{formatEuros(r.initialAmount)}</span></span>
                    <span className="text-amber-800 font-semibold">Reste: {formatEuros(r.remainingAmount)}</span>
                  </div>
                </button>
              );
            }
          })}
        </div>
      </div>

      {/* Colonne droite — détail */}
      <div className="flex-1 overflow-y-auto bg-gray-50">

        {/* Détail réclamation */}
        {selectedClaim && (() => {
          const received = getReceived(selectedClaim.id);
          const remaining = selectedClaim.montantReclame - received;
          const status = computeStatus(selectedClaim, received);
          const pct = selectedClaim.montantReclame > 0 ? Math.min(100, Math.round((received / selectedClaim.montantReclame) * 100)) : 0;
          return (
            <div className="p-6 space-y-5 max-w-3xl">
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-base font-bold text-slate-800">{selectedClaim.reference}</h2>
                      <StatusBadge status={status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {formatMoisLabel(selectedClaim.moisDebut)} → {formatMoisLabel(selectedClaim.moisFin)}
                      <span className="mx-1">·</span>
                      {new Date(selectedClaim.dateCreation).toLocaleDateString('fr-FR')}
                    </p>
                    {selectedClaim.description && <p className="text-xs text-slate-400 mt-1 italic">{selectedClaim.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEditClaim(selectedClaim)} className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50">Modifier</button>
                    {status !== 'cloturee' && (
                      <button onClick={() => closeClaim(selectedClaim.id)} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Clôturer</button>
                    )}
                    <button onClick={() => deleteClaim(selectedClaim.id)} className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Supprimer</button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">Réclamé</p>
                    <p className="text-lg font-bold text-slate-800">{formatEuros(selectedClaim.montantReclame)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">Reçu</p>
                    <p className="text-lg font-bold text-emerald-700">{formatEuros(received)}</p>
                  </div>
                  <div className={`rounded-lg p-3 ${remaining > 0.01 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                    <p className="text-[10px] text-slate-400 uppercase mb-1">Reste</p>
                    <p className={`text-lg font-bold ${remaining > 0.01 ? 'text-red-700' : 'text-emerald-700'}`}>{formatEuros(remaining)}</p>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{pct}% recouvré</p>
              </div>

              {/* Paiements */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Paiements reçus</h3>
                  {status !== 'cloturee' && (
                    <button onClick={openNewPayment} className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">
                      + Ajouter
                    </button>
                  )}
                </div>
                {showPaymentForm && (
                  <div className="px-5 py-4 bg-blue-50 border-b border-blue-100">
                    <form onSubmit={submitPayment} className="flex items-end gap-3 flex-wrap">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Date</label>
                        <input type="date" value={paymentForm.date} onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))}
                          className="text-xs border border-slate-200 rounded px-2 py-1.5 w-36" required />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Montant</label>
                        <input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                          className="text-xs border border-slate-200 rounded px-2 py-1.5 w-28" placeholder="0.00" required />
                      </div>
                      <div className="flex-1 min-w-[150px]">
                        <label className="text-[10px] text-slate-500 block mb-1">Commentaire</label>
                        <input type="text" value={paymentForm.comment} onChange={e => setPaymentForm(f => ({ ...f, comment: e.target.value }))}
                          className="text-xs border border-slate-200 rounded px-2 py-1.5 w-full" placeholder="Optionnel" />
                      </div>
                      <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700">
                        {editPaymentId ? 'Modifier' : 'Enregistrer'}
                      </button>
                      <button type="button" onClick={() => { setShowPaymentForm(false); setEditPaymentId(null); }}
                        className="px-3 py-1.5 bg-white text-slate-600 text-xs border border-slate-200 rounded hover:bg-slate-50">
                        Annuler
                      </button>
                    </form>
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-5 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="text-right px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Montant</th>
                      <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Commentaire</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {selectedPayments.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-6 text-slate-400 text-xs">Aucun paiement enregistré</td></tr>
                    )}
                    {selectedPayments.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-700">{new Date(p.date).toLocaleDateString('fr-FR')}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatEuros(p.amount)}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{p.comment || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => openEditPayment(p)} className="text-[10px] text-slate-400 hover:text-slate-700">Modifier</button>
                            <button onClick={() => deletePaymentItem(p.id)} className="text-[10px] text-red-400 hover:text-red-700">Supprimer</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Détail reliquat */}
        {selectedReliquat && (() => {
          const originClaim = claims.find(c => c.id === selectedReliquat.originReclamationId);
          return (
            <div className="p-6 space-y-5 max-w-3xl">
              <div className="rounded-xl border shadow-sm p-5" style={{ backgroundColor: '#FFF7D6', borderColor: '#F6D860' }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-base font-bold text-amber-900">Reliquat</h2>
                      <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                        selectedReliquat.status === 'closed' ? 'bg-slate-200 text-slate-600' :
                        selectedReliquat.status === 'abandoned' ? 'bg-red-100 text-red-700' : 'bg-amber-200 text-amber-800'
                      }`}>
                        {selectedReliquat.status === 'closed' ? 'Clos' : selectedReliquat.status === 'abandoned' ? 'Abandonné' : 'Actif'}
                      </span>
                    </div>
                    {originClaim && (
                      <p className="text-xs text-amber-700">
                        Issu de <button onClick={() => selectClaim(originClaim.id)} className="underline font-semibold">{originClaim.reference}</button>
                      </p>
                    )}
                    <p className="text-xs text-amber-700 mt-1">
                      {formatMoisLabel(selectedReliquat.periodStart)} → {formatMoisLabel(selectedReliquat.periodEnd)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {selectedReliquat.status === 'active' && (
                      <button onClick={() => abandonReliquat(selectedReliquat.id)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-white">
                        Abandonner
                      </button>
                    )}
                    <button onClick={() => deleteReliquatItem(selectedReliquat.id)}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                      Supprimer
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="bg-white/60 rounded-lg p-3">
                    <p className="text-[10px] text-amber-600 uppercase mb-1">Montant initial</p>
                    <p className="text-lg font-bold text-amber-900">{formatEuros(selectedReliquat.initialAmount)}</p>
                  </div>
                  <div className="bg-white/60 rounded-lg p-3">
                    <p className="text-[10px] text-amber-600 uppercase mb-1">Reste à réclamer</p>
                    <p className="text-lg font-bold text-amber-900">{formatEuros(selectedReliquat.remainingAmount)}</p>
                  </div>
                </div>

                {/* Réclamations issues de ce reliquat */}
                {(() => {
                  const linked = claims.filter(c => c.sourceReliquatId === selectedReliquat.id);
                  if (linked.length === 0) return null;
                  return (
                    <div className="mb-5">
                      <p className="text-[10px] text-amber-700 uppercase font-semibold mb-2">Réclamations émises</p>
                      <div className="space-y-1">
                        {linked.map(c => (
                          <button key={c.id} onClick={() => selectClaim(c.id)}
                            className="w-full flex items-center justify-between bg-white/60 rounded-lg px-3 py-2 text-xs hover:bg-white/90 transition-colors">
                            <span className="font-semibold text-amber-900">{c.reference}</span>
                            <span className="text-amber-700">{formatEuros(c.montantReclame)}</span>
                          </button>
                        ))}
                        <p className="text-[10px] text-amber-600 text-right pt-1">
                          Total réclamé : {formatEuros(linked.reduce((s, c) => s + c.montantReclame, 0))}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {selectedReliquat.status === 'active' && (
                  <>
                    {!showClaimFromReliquat ? (
                      <button
                        onClick={() => { setShowClaimFromReliquat(true); setClaimFromReliquatAmount(selectedReliquat.remainingAmount.toFixed(2)); }}
                        className="w-full py-2 text-sm font-semibold rounded-lg text-white"
                        style={{ backgroundColor: '#6B2D8B' }}>
                        Créer une réclamation depuis ce reliquat
                      </button>
                    ) : (
                      <form onSubmit={submitClaimFromReliquat} className="bg-white/70 rounded-lg p-4 space-y-3">
                        <p className="text-xs font-semibold text-amber-900">Nouvelle réclamation depuis reliquat</p>
                        <div className="grid grid-cols-2 gap-3 text-xs text-amber-700">
                          <div>
                            <p className="text-[10px] mb-0.5">Période (fixe)</p>
                            <p className="font-medium">{formatMoisLabel(selectedReliquat.periodStart)} → {formatMoisLabel(selectedReliquat.periodEnd)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] mb-0.5">Max réclamable</p>
                            <p className="font-bold">{formatEuros(selectedReliquat.remainingAmount)}</p>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-amber-700 block mb-1">Montant à réclamer</label>
                          <input type="number" step="0.01" min="0.01" max={selectedReliquat.remainingAmount}
                            value={claimFromReliquatAmount} onChange={e => setClaimFromReliquatAmount(e.target.value)}
                            className="w-full text-xs border border-amber-300 rounded px-2 py-1.5 bg-white" required />
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" className="flex-1 py-2 text-xs font-semibold text-white rounded-lg" style={{ backgroundColor: '#6B2D8B' }}>
                            Créer
                          </button>
                          <button type="button" onClick={() => setShowClaimFromReliquat(false)}
                            className="flex-1 py-2 text-xs font-medium border border-amber-300 text-amber-800 rounded-lg hover:bg-white">
                            Annuler
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {!selectedClaim && !selectedReliquat && (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Sélectionnez une réclamation ou un reliquat
          </div>
        )}
      </div>
    </div>
  );
}
