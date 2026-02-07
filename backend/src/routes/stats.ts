import { Router } from 'express';
import { getReleves, getRegularisations } from '../services/storage';
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

// GET /api/stats/cumul - Retard cumule toutes annees avec regularisations
router.get('/cumul', async (_req, res) => {
  try {
    const releves = await getReleves();
    const analyses = calculerRemisesMensuelles(releves);
    const regularisations = await getRegularisations();

    // Somme des deltas de tous les mois complets (avec 3 decades)
    const deltaCumulTotal = analyses
      .filter(a => a.decadesPresentes.length === 3)
      .reduce((sum, a) => sum + a.delta, 0);

    // Total regularisations
    const regulTotal = regularisations.reduce((sum, r) => sum + r.montant, 0);

    // Grouper par annee (deltas + reguls)
    const deltasParAnnee: Record<number, number> = {};
    const regulsParAnnee: Record<number, number> = {};

    for (const analyse of analyses) {
      if (analyse.decadesPresentes.length === 3) {
        const annee = parseInt(analyse.mois.split('-')[0]);
        deltasParAnnee[annee] = (deltasParAnnee[annee] || 0) + analyse.delta;
      }
    }

    for (const regul of regularisations) {
      regulsParAnnee[regul.annee] = (regulsParAnnee[regul.annee] || 0) + regul.montant;
    }

    // Toutes les annees concernees
    const allYears = new Set([...Object.keys(deltasParAnnee), ...Object.keys(regulsParAnnee)].map(Number));

    res.json({
      deltaCumulTotal: Math.round(deltaCumulTotal * 100) / 100,
      regulTotal: Math.round(regulTotal * 100) / 100,
      resteDu: Math.round((deltaCumulTotal + regulTotal) * 100) / 100,
      parAnnee: [...allYears]
        .sort((a, b) => a - b)
        .map(annee => ({
          annee,
          delta: Math.round((deltasParAnnee[annee] || 0) * 100) / 100,
          regul: Math.round((regulsParAnnee[annee] || 0) * 100) / 100,
          resteDu: Math.round(((deltasParAnnee[annee] || 0) + (regulsParAnnee[annee] || 0)) * 100) / 100
        }))
    });
  } catch (err) {
    console.error('[Stats] Erreur cumul:', err);
    res.status(500).json({
      error: 'Erreur lors du calcul du cumul',
      details: err instanceof Error ? err.message : 'Erreur inconnue'
    });
  }
});

export { router as statsRouter };
