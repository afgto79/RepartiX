import { Router } from 'express';
import { getReleves } from '../services/storage';
import { calculerRemisesMensuelles } from '../services/remises';

const router = Router();

// GET /api/stats/dashboard?annee=2025
router.get('/dashboard', async (req, res) => {
  try {
    const annee = req.query.annee ? parseInt(req.query.annee as string) : new Date().getFullYear();

    const releves = await getReleves({ annee });
    const analyses = calculerRemisesMensuelles(releves);

    res.json({
      annee,
      mois: analyses
    });
  } catch (err) {
    console.error('[Stats] Erreur dashboard:', err);
    res.status(500).json({
      error: 'Erreur lors du calcul des statistiques',
      details: err instanceof Error ? err.message : 'Erreur inconnue'
    });
  }
});

export { router as statsRouter };
