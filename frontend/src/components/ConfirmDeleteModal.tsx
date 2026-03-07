import { useState } from 'react';

interface Props {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const KEYWORD = 'TOUT SUPPRIMER';

export function ConfirmDeleteModal({ title, description, onConfirm, onCancel }: Props) {
  const [input, setInput] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h2 className="text-sm font-bold text-slate-800 mb-1">{title}</h2>
        <p className="text-xs text-slate-500 mb-4">{description}</p>
        <p className="text-xs text-slate-600 mb-2">
          Tapez <span className="font-mono font-bold text-red-600">{KEYWORD}</span> pour confirmer :
        </p>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={KEYWORD}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:border-red-400"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={input !== KEYWORD}
            className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
