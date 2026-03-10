import express from 'express';
import cors from 'cors';
import { uploadRouter } from './routes/upload';
import { relevesRouter } from './routes/releves';
import { statsRouter } from './routes/stats';
import { regularisationsRouter } from './routes/regularisations';
import { reclamationsRouter } from './routes/reclamations';
import { paymentsRouter } from './routes/payments';
import { reliquatsRouter } from './routes/reliquats';
import { scanFolder } from './services/fileWatcher';

const app = express();
const PORT = 4001;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/upload', uploadRouter);
app.use('/api/releves', relevesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/regularisations', regularisationsRouter);
app.use('/api/reclamations', reclamationsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/reliquats', reliquatsRouter);

// Scan dossier reseau
app.post('/api/scan-folder', async (req, res) => {
  try {
    const force = req.body?.force === true;
    const result = await scanFolder(force);
    res.json(result);
  } catch (err) {
    console.error('[Scan] Erreur:', err);
    res.status(500).json({
      error: 'Erreur lors du scan du dossier',
      details: err instanceof Error ? err.message : 'Erreur inconnue'
    });
  }
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Arret du serveur
app.post('/api/shutdown', (_req, res) => {
  console.log('[Server] Arret demande...');
  res.json({ status: 'shutting_down' });

  // Delai pour laisser la reponse partir
  setTimeout(() => {
    console.log('[Server] Arret en cours...');
    process.exit(0);
  }, 500);
});

// Demarrage
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Backend demarre sur http://127.0.0.1:${PORT}`);
});
