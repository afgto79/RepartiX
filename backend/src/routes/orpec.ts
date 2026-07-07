import { Router } from 'express';
import {
  getOrpecData, setOrpecData, deleteOrpecData, OrpecAssietteInput,
  getOrpecAnnuel, setOrpecAnnuel, deleteOrpecAnnuel
} from '../services/storage';
import { OrpecRemiseAnnoncee } from '../types/releve';

const router = Router();

const MOIS_REGEX = /^\d{4}-\d{2}$/;
const ANNEE_REGEX = /^\d{4}$/;

function parseNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isNaN(n) ? undefined : n;
}

// --- Reference annuelle (avant /:mois pour lisibilite ; pas de conflit, 2 segments) ---

// GET /api/orpec/annuel/:annee
router.get('/annuel/:annee', async (req, res) => {
  try {
    const annee = req.params.annee;
    if (!ANNEE_REGEX.test(annee)) {
      res.status(400).json({ error: 'Format annee invalide (attendu YYYY)' });
      return;
    }
    const data = await getOrpecAnnuel(annee);
    if (!data) {
      res.status(404).json({ data: null });
      return;
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture reference annuelle ORPEC' });
  }
});

// PUT /api/orpec/annuel/:annee
// Body : { assiette, remiseDue, remiseVersee, delta?, source? }
// delta est recalcule (remiseVersee - remiseDue) ; s'il est fourni, il doit concorder.
router.put('/annuel/:annee', async (req, res) => {
  try {
    const annee = req.params.annee;
    if (!ANNEE_REGEX.test(annee)) {
      res.status(400).json({ error: 'Format annee invalide (attendu YYYY)' });
      return;
    }

    const assiette = parseNum(req.body?.assiette);
    const remiseDue = parseNum(req.body?.remiseDue);
    const remiseVersee = parseNum(req.body?.remiseVersee);
    if (assiette === undefined || remiseDue === undefined || remiseVersee === undefined) {
      res.status(400).json({
        error: 'Champs requis manquants ou invalides (assiette, remiseDue, remiseVersee)'
      });
      return;
    }

    const deltaFourni = parseNum(req.body?.delta);
    const deltaCalcule = Math.round((remiseVersee - remiseDue) * 100) / 100;
    if (deltaFourni !== undefined && Math.abs(deltaFourni - deltaCalcule) > 0.005) {
      res.status(400).json({
        error: `delta incoherent : fourni ${deltaFourni}, attendu ${deltaCalcule} (remiseVersee - remiseDue)`
      });
      return;
    }

    const source = typeof req.body?.source === 'string' && req.body.source.trim() !== ''
      ? req.body.source.trim()
      : undefined;

    const saved = await setOrpecAnnuel(annee, { assiette, remiseDue, remiseVersee, source });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Erreur sauvegarde reference annuelle ORPEC' });
  }
});

// DELETE /api/orpec/annuel/:annee
router.delete('/annuel/:annee', async (req, res) => {
  try {
    const deleted = await deleteOrpecAnnuel(req.params.annee);
    if (!deleted) {
      res.status(404).json({ error: 'Reference annuelle ORPEC non trouvee' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression reference annuelle ORPEC' });
  }
});

// --- Donnees mensuelles ---

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
// Body — deux blocs independants, fusionnes avec l'existant (bloc absent = conserve) :
// - assiette : saisieMode 'DETAIL' (caHTorpec, achatsGeneriques, achatsAlvita)
//   ou 'ASSIETTE_DIRECTE' (assiette = colonne "Sans RSF", ventesHT optionnel).
//   Retrocompat : les 3 champs DETAIL sans saisieMode = mode DETAIL.
// - remiseAnnoncee : { montantHT, source: 'FACTURE_ORPEC'|'TABLEAU_PIEVE', reference? }
//   ou null pour retirer l'annonce.
// Repond null si l'entree devient vide (mois supprime).
router.put('/:mois', async (req, res) => {
  try {
    const mois = req.params.mois;
    if (!MOIS_REGEX.test(mois)) {
      res.status(400).json({ error: 'Format mois invalide (attendu YYYY-MM)' });
      return;
    }

    const body = req.body ?? {};
    const caHTorpec = parseNum(body.caHTorpec);
    const achatsGeneriques = parseNum(body.achatsGeneriques);
    const achatsAlvita = parseNum(body.achatsAlvita);
    const assietteDirecte = parseNum(body.assiette);
    const ventesHT = parseNum(body.ventesHT);

    let saisieMode: unknown = body.saisieMode;
    if (saisieMode === undefined
      && caHTorpec !== undefined && achatsGeneriques !== undefined && achatsAlvita !== undefined) {
      saisieMode = 'DETAIL';
    }

    let assietteBlock: OrpecAssietteInput | undefined;
    if (saisieMode === 'DETAIL') {
      if (caHTorpec === undefined || achatsGeneriques === undefined || achatsAlvita === undefined) {
        res.status(400).json({
          error: 'Mode DETAIL : champs requis caHTorpec, achatsGeneriques, achatsAlvita'
        });
        return;
      }
      assietteBlock = { saisieMode: 'DETAIL', caHTorpec, achatsGeneriques, achatsAlvita };
    } else if (saisieMode === 'ASSIETTE_DIRECTE') {
      if (assietteDirecte === undefined) {
        res.status(400).json({
          error: 'Mode ASSIETTE_DIRECTE : champ requis assiette (colonne "Sans RSF")'
        });
        return;
      }
      assietteBlock = { saisieMode: 'ASSIETTE_DIRECTE', assiette: assietteDirecte, ventesHT };
    } else if (saisieMode !== undefined) {
      res.status(400).json({ error: 'saisieMode invalide (DETAIL | ASSIETTE_DIRECTE)' });
      return;
    }

    let remiseAnnoncee: OrpecRemiseAnnoncee | null | undefined;
    if ('remiseAnnoncee' in body) {
      if (body.remiseAnnoncee === null) {
        remiseAnnoncee = null;
      } else {
        const montantHT = parseNum(body.remiseAnnoncee?.montantHT);
        const source = body.remiseAnnoncee?.source;
        if (montantHT === undefined || (source !== 'FACTURE_ORPEC' && source !== 'TABLEAU_PIEVE')) {
          res.status(400).json({
            error: 'remiseAnnoncee invalide (requis : montantHT numerique, source FACTURE_ORPEC | TABLEAU_PIEVE)'
          });
          return;
        }
        remiseAnnoncee = { montantHT, source };
        const reference = body.remiseAnnoncee?.reference;
        if (typeof reference === 'string' && reference.trim() !== '') {
          remiseAnnoncee.reference = reference.trim();
        }
      }
    }

    if (!assietteBlock && remiseAnnoncee === undefined) {
      res.status(400).json({
        error: 'Aucune donnee a enregistrer (bloc assiette ou remiseAnnoncee requis)'
      });
      return;
    }

    const saved = await setOrpecData(mois, { assiette: assietteBlock, remiseAnnoncee });
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
