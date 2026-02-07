import { useState } from 'react';
import { Card, Badge } from '@tremor/react';
import { api, Regularisation } from '../services/api';
import { formatEuros } from '../utils/formatters';

interface RegularisationsProps {
  regularisations: Regularisation[];
  onUpdate: () => void;
}

export function Regularisations({ regularisations, onUpdate }: RegularisationsProps) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: '', montant: '', annee: new Date().getFullYear().toString(), description: '' });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function resetForm() {
    setForm({ date: '', montant: '', annee: new Date().getFullYear().toString(), description: '' });
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(r: Regularisation) {
    setForm({
      date: r.date,
      montant: r.montant.toString(),
      annee: r.annee.toString(),
      description: r.description
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
        description: form.description
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
    <Card className="mb-4">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Regularisations</span>
          <Badge size="xs" color="blue">{regularisations.length}</Badge>
          {totalRegul > 0 && (
            <span className="text-sm text-green-600 font-medium">+{formatEuros(totalRegul)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowForm(!showForm); setExpanded(true); setEditId(null); }}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
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
            <form onSubmit={handleSubmit} className="mb-3 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-semibold mb-2 text-gray-600">
                {editId ? 'Modifier la regularisation' : 'Nouvelle regularisation'}
              </p>
              <div className="grid grid-cols-4 gap-2">
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
                  className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
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
                      <span className="text-gray-500 text-xs w-20">{new Date(r.date).toLocaleDateString('fr-FR')}</span>
                      <span className="text-green-600 font-medium w-24 text-right">{formatEuros(r.montant)}</span>
                      <Badge size="xs" color="gray">{r.annee}</Badge>
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
    </Card>
  );
}
