import { Router } from 'express';
import { getOrpecData, setOrpecData, deleteOrpecData } from '../services/storage';

const router = Router();

const MOIS_REGEX = /^\d{4}-\d{2}$/;

// GET /api/orpec/:mois
router.get('/:mois', async (req, res) => {
  try {
    const mois = req.params.mois;
    if (!MOIS_REGEX.test(mois)) {
      res.status(400).json({ error: 'Format mois invalide (attendu YYYY-MM)' });
      return;
    }
    const data = await getOrpecData(mois);
    if (!data) {
      res.status(404).json({ data: null });
      return;
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture donnees ORPEC' });
  }
});

// PUT /api/orpec/:mois
router.put('/:mois', async (req, res) => {
  try {
    const mois = req.params.mois;
    if (!MOIS_REGEX.test(mois)) {
      res.status(400).json({ error: 'Format mois invalide (attendu YYYY-MM)' });
      return;
    }

    const caHTorpec = parseFloat(req.body?.caHTorpec);
    const achatsGeneriques = parseFloat(req.body?.achatsGeneriques);
    const achatsAlvita = parseFloat(req.body?.achatsAlvita);

    if ([caHTorpec, achatsGeneriques, achatsAlvita].some(n => Number.isNaN(n))) {
      res.status(400).json({
        error: 'Champs requis manquants ou invalides (caHTorpec, achatsGeneriques, achatsAlvita)'
      });
      return;
    }

    const saved = await setOrpecData(mois, { caHTorpec, achatsGeneriques, achatsAlvita });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Erreur sauvegarde donnees ORPEC' });
  }
});

// DELETE /api/orpec/:mois
router.delete('/:mois', async (req, res) => {
  try {
    const mois = req.params.mois;
    const deleted = await deleteOrpecData(mois);
    if (!deleted) {
      res.status(404).json({ error: 'Donnees ORPEC non trouvees' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression donnees ORPEC' });
  }
});

export { router as orpecRouter };
