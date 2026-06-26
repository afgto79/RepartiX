import { Router } from 'express';
import { getRegularisations, addRegularisation, updateRegularisation, deleteRegularisation } from '../services/storage';

const router = Router();

// GET /api/regularisations?annee=2025
router.get('/', async (req, res) => {
  try {
    const annee = req.query.annee ? parseInt(req.query.annee as string) : undefined;
    const reguls = await getRegularisations(annee);
    res.json(reguls);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture regularisations' });
  }
});

// POST /api/regularisations
router.post('/', async (req, res) => {
  try {
    const { date, montant, annee, description, reclamationId, type } = req.body;
    if (!date || montant === undefined || !annee) {
      return res.status(400).json({ error: 'Champs requis: date, montant, annee' });
    }
    const regul = await addRegularisation({
      date,
      montant: parseFloat(montant),
      annee: parseInt(annee),
      description: description || '',
      ...(reclamationId !== undefined ? { reclamationId } : {}),
      ...(type !== undefined ? { type } : {})
    });
    res.status(201).json(regul);
  } catch (err) {
    res.status(500).json({ error: 'Erreur creation regularisation' });
  }
});

// PUT /api/regularisations/:id
router.put('/:id', async (req, res) => {
  try {
    const { date, montant, annee, description, reclamationId, type } = req.body;
    const updates: Record<string, unknown> = {};
    if (date !== undefined) updates.date = date;
    if (montant !== undefined) updates.montant = parseFloat(montant);
    if (annee !== undefined) updates.annee = parseInt(annee);
    if (description !== undefined) updates.description = description;
    if (reclamationId !== undefined) updates.reclamationId = reclamationId;
    if (type !== undefined) updates.type = type;

    const regul = await updateRegularisation(req.params.id, updates);
    if (!regul) {
      return res.status(404).json({ error: 'Regularisation non trouvee' });
    }
    res.json(regul);
  } catch (err) {
    res.status(500).json({ error: 'Erreur modification regularisation' });
  }
});

// DELETE /api/regularisations/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteRegularisation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Regularisation non trouvee' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression regularisation' });
  }
});

export { router as regularisationsRouter };
