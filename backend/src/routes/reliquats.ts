import { Router } from 'express';
import { getReliquats, addReliquat, updateReliquat, deleteReliquat } from '../services/storage';

const router = Router();

// GET /api/reliquats?status=active
router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const reliquats = await getReliquats(status);
    res.json(reliquats);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture reliquats' });
  }
});

// POST /api/reliquats
router.post('/', async (req, res) => {
  try {
    const { originReclamationId, periodStart, periodEnd, initialAmount, remainingAmount, status } = req.body;
    if (!originReclamationId || !periodStart || !periodEnd || initialAmount == null) {
      res.status(400).json({ error: 'Champs requis manquants' });
      return;
    }
    const reliquat = await addReliquat({
      originReclamationId,
      periodStart,
      periodEnd,
      initialAmount: parseFloat(initialAmount),
      remainingAmount: remainingAmount != null ? parseFloat(remainingAmount) : parseFloat(initialAmount),
      status: status ?? 'active'
    });
    res.status(201).json(reliquat);
  } catch (err) {
    res.status(500).json({ error: 'Erreur création reliquat' });
  }
});

// PUT /api/reliquats/:id
router.put('/:id', async (req, res) => {
  try {
    const updated = await updateReliquat(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Reliquat non trouvé' });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erreur modification reliquat' });
  }
});

// DELETE /api/reliquats/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteReliquat(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Reliquat non trouvé' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression reliquat' });
  }
});

export { router as reliquatsRouter };
