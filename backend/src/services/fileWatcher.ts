import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import { parsePDF } from './pdfParser';
import { saveReleve, getFileHash, isDuplicate } from './storage';

const WATCH_FOLDER = '\\\\SERVEUR\\decadespouranalyse';

let watcher: chokidar.FSWatcher | null = null;

export function initWatcher(): void {
  try {
    watcher = chokidar.watch(WATCH_FOLDER, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    watcher.on('add', async (filePath: string) => {
      if (!filePath.toLowerCase().endsWith('.pdf')) return;

      console.info(`[Watcher] Nouveau fichier detecte: ${filePath}`);
      await processFile(filePath);
    });

    watcher.on('error', (error: Error) => {
      console.error('[Watcher] Erreur:', error.message);
    });

    console.info(`[Watcher] Surveillance du dossier: ${WATCH_FOLDER}`);
  } catch (err) {
    console.warn('[Watcher] Impossible de surveiller le dossier:', err);
  }
}

export function stopWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    console.info('[Watcher] Arrete');
  }
}

async function processFile(filePath: string): Promise<{ imported: boolean; duplicate: boolean; error?: string }> {
  try {
    const hash = await getFileHash(filePath);
    if (await isDuplicate(hash)) {
      console.info(`[Watcher] Doublon ignore: ${path.basename(filePath)}`);
      return { imported: false, duplicate: true };
    }

    const releveData = await parsePDF(filePath);
    if (!releveData) {
      console.error(`[Watcher] Parsing echoue: ${path.basename(filePath)}`);
      return { imported: false, duplicate: false, error: 'Parsing echoue' };
    }

    await saveReleve({
      ...releveData,
      source: path.basename(filePath),
      hash
    });

    console.info(`[Watcher] Importe: ${path.basename(filePath)}`);
    return { imported: true, duplicate: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error(`[Watcher] Erreur traitement ${path.basename(filePath)}:`, message);
    return { imported: false, duplicate: false, error: message };
  }
}

/**
 * Scan manuel du dossier reseau
 */
export async function scanFolder(force: boolean = false): Promise<{
  scanned: number;
  new: number;
  duplicates: number;
  errors: { file: string; error: string }[];
}> {
  const result = {
    scanned: 0,
    new: 0,
    duplicates: 0,
    errors: [] as { file: string; error: string }[]
  };

  try {
    const files = await fs.readdir(WATCH_FOLDER);
    const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

    for (const file of pdfFiles) {
      result.scanned++;
      const filePath = path.join(WATCH_FOLDER, file);

      try {
        const hash = await getFileHash(filePath);

        if (!force && await isDuplicate(hash)) {
          result.duplicates++;
          continue;
        }

        const releveData = await parsePDF(filePath);
        if (!releveData) {
          result.errors.push({ file, error: 'Parsing echoue' });
          continue;
        }

        await saveReleve({
          ...releveData,
          source: file,
          hash
        });

        result.new++;
      } catch (err) {
        result.errors.push({
          file,
          error: err instanceof Error ? err.message : 'Erreur inconnue'
        });
      }
    }
  } catch (err) {
    console.error('[Scanner] Erreur acces dossier:', err);
    throw new Error(`Impossible d'acceder au dossier reseau: ${WATCH_FOLDER}`);
  }

  return result;
}
