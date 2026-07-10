import { useState } from 'react';
import { api, Regularisation, RegularisationType } from '../services/api';
import { formatEuros } from '../utils/formatters';

const TYPE_OPTIONS: { value: RegularisationType; label: string }[] = [
  { value: 'VERSEMENT_RECU', label: 'Versement recu' },
  { value: 'FRAIS_INDU', label: 'Frais indu (reclamable)' },
  { value: 'CLAWBACK_GENERIQUES', label: 'Clawback generiques (non contestable)' },
  { value: 'FRAIS_AUTRE', label: 'Autre (a qualifier)' }
];

interface RegularisationsProps {
  regularisations: Regularisation[];
  onUpdate: () => void;
}

export function Regularisations({ regularisations, onUpdate }: RegularisationsProps) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: '', montant: '', annee: new Date().getFullYear().toString(), description: '', type: 'VERSEMENT_RECU' as RegularisationType });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function resetForm() {
    setForm({ date: '', montant: '', annee: new Date().getFullYear().toString(), description: '', type: 'VERSEMENT_RECU' });
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(r: Regularisation) {
    setForm({
      date: r.date,
      montant: r.montant.toString(),
      annee: r.annee.toString(),
      description: r.description,
      type: r.type ?? 'VERSEMENT_RECU'
    });
    setEditId(r.id);
    setShowForm(true);
    setExpanded(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        date: form.date,
        montant: parseFloat(form.montant),
        annee: parseInt(form.annee),
        description: form.description,
        type: form.type
      };
      if (editId) {
        await api.updateRegularisation(editId, data);
      } else {
        await api.addRegularisation(data);
      }
      resetForm();
      onUpdate();
    } catch (err) {
      console.error('Erreur sauvegarde regularisation:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette regularisation ?')) return;
    try {
      await api.deleteRegularisation(id);
      onUpdate();
    } catch (err) {
      console.error('Erreur suppression:', err);
    }
  }

  const totalRegul = regularisations.reduce((sum, r) => sum + r.montant, 0);

  return (
    <div className="p-4">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Regularisations</span>
          <span
            className="px-1.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: '#E8F5EE', color: '#1B6B40', borderRadius: '4px' }}
          >
            {regularisations.length}
          </span>
          {totalRegul > 0 && (
            <span className="text-sm font-medium data-val" style={{ color: '#1B6B40' }}>
              +{formatEuros(totalRegul)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowForm(!showForm); setExpanded(true); setEditId(null); }}
            className="px-2 py-1 text-xs text-white"
            style={{ backgroundColor: '#1B6B40', borderRadius: '4px' }}
          >
            + Regularisation
          </button>
          <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3">
          {/* Formulaire ajout/edition */}
          {showForm && (
            <form onSubmit={handleSubmit} className="mb-3 p-3" style={{ backgroundColor: '#E8F5EE', borderRadius: '4px' }}>
              <p className="text-xs font-semibold mb-2 text-gray-600">
                {editId ? 'Modifier la regularisation' : 'Nouvelle regularisation'}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  required
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Montant"
                  value={form.montant}
                  onChange={e => setForm({ ...form, montant: e.target.value })}
                  required
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded"
                />
                <input
                  type="number"
                  placeholder="Annee"
                  value={form.annee}
                  onChange={e => setForm({ ...form, annee: e.target.value })}
                  required
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded"
                />
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value as RegularisationType })}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded"
                  title="Type de regularisation"
                >
                  {TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Description (ex: Avoir n°123)"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3 py-1 text-xs text-white disabled:opacity-50"
                  style={{ backgroundColor: '#1B6B40', borderRadius: '4px' }}
                >
                  {saving ? 'Enregistrement...' : editId ? 'Modifier' : 'Ajouter'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}

          {/* Liste des regularisations */}
          {regularisations.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">Aucune regularisation enregistree</p>
          ) : (
            <div className="space-y-1">
              {regularisations
                .sort((a, b) => b.date.localeCompare(a.date))
                .map(r => (
                  <div key={r.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 text-xs w-20 data-val">{new Date(r.date).toLocaleDateString('fr-FR')}</span>
                      <span className="font-medium w-24 text-right data-val" style={{ color: '#1B6B40' }}>{formatEuros(r.montant)}</span>
                      <span
                        className="px-1.5 py-0.5 text-xs font-medium data-val"
                        style={{ backgroundColor: '#F1F5F9', color: '#64748B', borderRadius: '4px' }}
                      >
                        {r.annee}
                      </span>
                      <span className="text-gray-600 text-xs">{r.description}</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(r)}
                        className="px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 rounded"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 rounded"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
