import { Router } from 'express';
import { getReleves, getPayments } from '../services/storage';
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
    const payments = await getPayments();

    // Somme des deltas de tous les mois complets (avec 3 decades)
    const deltaCumulTotal = analyses
      .filter(a => a.decadesPresentes.length === 3)
      .reduce((sum, a) => sum + a.delta, 0);

    // Total paiements manuels saisis sur les réclamations
    const regulTotal = payments.reduce((sum, p) => sum + p.amount, 0);

    // Grouper par annee (deltas + reguls)
    const deltasParAnnee: Record<number, number> = {};
    const regulsParAnnee: Record<number, number> = {};

    for (const analyse of analyses) {
      if (analyse.decadesPresentes.length === 3) {
        const annee = parseInt(analyse.mois.split('-')[0]);
        deltasParAnnee[annee] = (deltasParAnnee[annee] || 0) + analyse.delta;
      }
    }

    for (const payment of payments) {
      const annee = parseInt(payment.date.split('-')[0]);
      regulsParAnnee[annee] = (regulsParAnnee[annee] || 0) + payment.amount;
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

// GET /api/stats/annees - Annees disponibles dans les donnees
router.get('/annees', async (_req, res) => {
  try {
    const releves = await getReleves();
    const anneesSet = new Set(releves.map(r => r.annee));
    // Toujours inclure l'annee en cours
    anneesSet.add(new Date().getFullYear());
    const annees = [...anneesSet].sort((a, b) => a - b);
    res.json({ annees });
  } catch (err) {
    console.error('[Stats] Erreur annees:', err);
    res.status(500).json({ error: 'Erreur lors de la recuperation des annees' });
  }
});

export { router as statsRouter };
