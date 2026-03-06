import { Router } from 'express';
import { getPayments, addPayment, updatePayment, deletePayment } from '../services/storage';

const router = Router();

// GET /api/payments?claimId=xxx
router.get('/', async (req, res) => {
  try {
    const claimId = req.query.claimId as string | undefined;
    const payments = await getPayments(claimId);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture paiements' });
  }
});

// POST /api/payments
router.post('/', async (req, res) => {
  try {
    const { claimId, date, amount, comment } = req.body;
    if (!claimId || !date || amount === undefined) {
      return res.status(400).json({ error: 'Champs requis: claimId, date, amount' });
    }
    const payment = await addPayment({
      claimId,
      date,
      amount: parseFloat(amount),
      comment: comment || ''
    });
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: 'Erreur creation paiement' });
  }
});

// PUT /api/payments/:id
router.put('/:id', async (req, res) => {
  try {
    const { date, amount, comment } = req.body;
    const updates: Record<string, unknown> = {};
    if (date !== undefined) updates.date = date;
    if (amount !== undefined) updates.amount = parseFloat(String(amount));
    if (comment !== undefined) updates.comment = comment;

    const payment = await updatePayment(req.params.id, updates);
    if (!payment) {
      return res.status(404).json({ error: 'Paiement non trouve' });
    }
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: 'Erreur modification paiement' });
  }
});

// DELETE /api/payments/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deletePayment(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Paiement non trouve' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression paiement' });
  }
});

export { router as paymentsRouter };
