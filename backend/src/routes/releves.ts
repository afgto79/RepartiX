import { Router } from 'express';
import { getReleves, deleteReleve, clearReleves } from '../services/storage';
import { calculerRemisesMensuelles } from '../services/remises';

const router = Router();

// GET /api/releves - Liste de toutes les decades importees
router.get('/', async (_req, res) => {
  try {
    const releves = await getReleves();
    const sorted = releves.sort((a, b) => {
      if (a.annee !== b.annee) return b.annee - a.annee;
      if (a.mois !== b.mois) return b.mois - a.mois;
      return a.decade - b.decade;
    });
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: 'Erreur liste releves' });
  }
});

// GET /api/releves/:annee/:mois - Detail d'un mois
router.get('/:annee/:mois', async (req, res) => {
  try {
    const annee = parseInt(req.params.annee);
    const mois = parseInt(req.params.mois);

    if (isNaN(annee) || isNaN(mois) || mois < 1 || mois > 12) {
      res.status(400).json({ error: 'Annee ou mois invalide' });
      return;
    }

    const releves = await getReleves({ annee, mois });
    const moisKey = `${annee}-${String(mois).padStart(2, '0')}`;

    // Calcul analyse pour ce mois
    const analyses = calculerRemisesMensuelles(releves);
    const analyse = analyses.find(a => a.mois === moisKey);

    const decades = releves
      .map(r => ({
        decade: r.decade,
        totalNetHT: r.totalNetHT,
        totalTTC: r.totalTTC,
        remiseAbnMargeHT: r.remiseAbnMargeHT,
        remisesPartenariatsHT: r.remisesPartenariatsHT,
        avoirsCommerciauxHT: r.avoirsCommerciauxHT,
        source: r.source,
        id: r.id,
        parsingStatus: r.parsingStatus,
        parsingErrors: r.parsingErrors
      }))
      .sort((a, b) => a.decade - b.decade);

    res.json({
      mois: moisKey,
      decades,
      analyse: analyse ?? {
        totalHTCumule: 0,
        remiseAttendue: 0,
        remiseReelle: 0,
        deltaEuros: 0,
        deltaPourcent: 0
      }
    });
  } catch (err) {
    console.error('[Releves] Erreur detail mois:', err);
    res.status(500).json({
      error: 'Erreur lors du chargement du detail',
      details: err instanceof Error ? err.message : 'Erreur inconnue'
    });
  }
});

// DELETE /api/releves - Suppression de toutes les decades (sans toucher aux réclamations)
router.delete('/', async (_req, res) => {
  try {
    const count = await clearReleves();
    res.json({ deleted: count });
  } catch (err) {
    console.error('[Releves] Erreur suppression totale:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// DELETE /api/releves/:id - Suppression d'un releve
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteReleve(req.params.id);

    if (deleted) {
      res.json({ deleted: true });
    } else {
      res.status(404).json({ error: 'Releve non trouve' });
    }
  } catch (err) {
    console.error('[Releves] Erreur suppression:', err);
    res.status(500).json({
      error: 'Erreur lors de la suppression',
      details: err instanceof Error ? err.message : 'Erreur inconnue'
    });
  }
});

export { router as relevesRouter };
