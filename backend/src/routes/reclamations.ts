import { Router } from 'express';
import { getReclamations, addReclamation, updateReclamation, deleteReclamation, clearReclamations } from '../services/storage';

const router = Router();

// GET /api/reclamations?statut=en_cours
router.get('/', async (req, res) => {
  try {
    const statut = req.query.statut as string | undefined;
    const reclamations = await getReclamations(statut);
    res.json(reclamations);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture reclamations' });
  }
});

// POST /api/reclamations
router.post('/', async (req, res) => {
  try {
    const { moisDebut, moisFin, dateCreation, statut, montantReclame, description } = req.body;
    if (!moisDebut || !moisFin || !dateCreation || !statut || montantReclame === undefined) {
      return res.status(400).json({ error: 'Champs requis: moisDebut, moisFin, dateCreation, statut, montantReclame' });
    }
    const reclam = await addReclamation({
      moisDebut,
      moisFin,
      dateCreation,
      statut,
      montantReclame: parseFloat(montantReclame),
      description: description || ''
    });
    res.status(201).json(reclam);
  } catch (err) {
    res.status(500).json({ error: 'Erreur creation reclamation' });
  }
});

// PUT /api/reclamations/:id
router.put('/:id', async (req, res) => {
  try {
    const { moisDebut, moisFin, dateCreation, statut, montantReclame, description } = req.body;
    const updates: Record<string, unknown> = {};
    if (moisDebut !== undefined) updates.moisDebut = moisDebut;
    if (moisFin !== undefined) updates.moisFin = moisFin;
    if (dateCreation !== undefined) updates.dateCreation = dateCreation;
    if (statut !== undefined) updates.statut = statut;
    if (montantReclame !== undefined) updates.montantReclame = parseFloat(String(montantReclame));
    if (description !== undefined) updates.description = description;

    const reclam = await updateReclamation(req.params.id, updates);
    if (!reclam) {
      return res.status(404).json({ error: 'Reclamation non trouvee' });
    }
    res.json(reclam);
  } catch (err) {
    res.status(500).json({ error: 'Erreur modification reclamation' });
  }
});

// DELETE /api/reclamations/:id
// DELETE /api/reclamations - Suppression de toutes les réclamations et paiements associés
router.delete('/', async (_req, res) => {
  try {
    const count = await clearReclamations();
    res.json({ deleted: count });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression totale' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteReclamation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Reclamation non trouvee' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression reclamation' });
  }
});

export { router as reclamationsRouter };
