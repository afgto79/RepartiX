import { Router } from 'express';
import { getGeneriques, setGeneriques, deleteGeneriques } from '../services/storage';
import { GeneriquesData } from '../types/releve';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const data = await getGeneriques();
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Erreur lecture generiques' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body as { source?: string; entrees: unknown[] };
    if (!body.entrees || !Array.isArray(body.entrees)) {
      return res.status(400).json({ error: 'entrees[] manquant' });
    }
    for (const e of body.entrees as Record<string, unknown>[]) {
      if (typeof e.annee !== 'number' || typeof e.mois !== 'number' ||
          typeof e.laboratoire !== 'string' || typeof e.netHT !== 'number') {
        return res.status(400).json({ error: 'Entree invalide : annee, mois, laboratoire, netHT requis' });
      }
    }
    const stored: GeneriquesData = {
      source: typeof body.source === 'string' ? body.source : 'GENERIQUES_ORPEC',
      dateImport: new Date().toISOString(),
      entrees: body.entrees as GeneriquesData['entrees']
    };
    const result = await setGeneriques(stored);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Erreur import generiques' });
  }
});

router.delete('/', async (_req, res) => {
  try {
    const deleted = await deleteGeneriques();
    res.json({ deleted });
  } catch {
    res.status(500).json({ error: 'Erreur suppression generiques' });
  }
});

export { router as generiquesRouter };
