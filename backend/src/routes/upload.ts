import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { parsePDF } from '../services/pdfParser';
import { saveReleve, getFileHash, isDuplicate } from '../services/storage';

const router = Router();

const upload = multer({
  dest: path.join(__dirname, '../../uploads/'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seulement les fichiers PDF sont acceptes'));
    }
  }
});

router.post('/', upload.array('pdfs', 50), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'Aucun fichier envoye' });
      return;
    }

    const results = {
      success: true,
      imported: 0,
      duplicates: 0,
      errors: [] as { file: string; error: string }[]
    };

    for (const file of files) {
      try {
        // Verifier doublon via hash
        const hash = await getFileHash(file.path);
        if (await isDuplicate(hash)) {
          results.duplicates++;
          continue;
        }

        // Parser le PDF
        const releveData = await parsePDF(file.path);

        if (!releveData) {
          results.errors.push({
            file: file.originalname,
            error: 'Parsing echoue - structure PDF non reconnue'
          });
          continue;
        }

        // Sauvegarder
        await saveReleve({
          ...releveData,
          source: file.originalname,
          hash
        });

        results.imported++;
      } catch (err) {
        results.errors.push({
          file: file.originalname,
          error: err instanceof Error ? err.message : 'Erreur inconnue'
        });
      }
    }

    res.json(results);
  } catch (err) {
    console.error('[Upload] Erreur:', err);
    res.status(500).json({
      error: "Erreur serveur lors de l'import",
      details: err instanceof Error ? err.message : 'Erreur inconnue'
    });
  }
});

export { router as uploadRouter };
