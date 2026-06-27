/**
 * Test de non-regression du parser PDF.
 * Compare la sortie de parsePDF() a des valeurs de reference (tests/expected.json)
 * pour chaque PDF de tests/fixtures/.
 *
 * Lancer : npx tsx test-parser.ts
 * Les PDF de fixtures sont gitignores (factures client) -> une fixture absente est SKIP, pas FAIL.
 */
import fs from 'fs';
import path from 'path';
import { parsePDF } from './src/services/pdfParser';

const FIXTURES_DIR = path.join(__dirname, 'tests', 'fixtures');
const EXPECTED_PATH = path.join(__dirname, 'tests', 'expected.json');

type ExpectedFields = Record<string, number | string | null>;
const EPSILON = 0.01;

function valuesEqual(expected: number | string | null, actual: unknown): boolean {
  // undefined (champ absent) est traite comme null
  const a = actual === undefined ? null : actual;
  if (expected === null) return a === null;
  if (typeof expected === 'number' && typeof a === 'number') {
    return Math.abs(expected - a) < EPSILON;
  }
  return expected === a;
}

async function main() {
  const expectedAll: Record<string, ExpectedFields> = JSON.parse(fs.readFileSync(EXPECTED_PATH, 'utf8'));

  let totalChecks = 0;
  let totalFail = 0;
  let filesTested = 0;
  let filesSkipped = 0;

  for (const [filename, expected] of Object.entries(expectedAll)) {
    const pdfPath = path.join(FIXTURES_DIR, filename);
    console.log(`\n===== ${filename} =====`);

    if (!fs.existsSync(pdfPath)) {
      console.log('  SKIP (fixture absente — PDF gitignore, a deposer dans tests/fixtures/)');
      filesSkipped++;
      continue;
    }

    const parsed = await parsePDF(pdfPath);
    filesTested++;

    if (!parsed) {
      console.log('  FAIL : parsePDF a retourne null');
      totalFail++;
      totalChecks++;
      continue;
    }

    for (const [field, expVal] of Object.entries(expected)) {
      totalChecks++;
      const actual = (parsed as Record<string, unknown>)[field];
      const ok = valuesEqual(expVal, actual);
      if (!ok) totalFail++;
      const actualStr = actual === undefined ? 'null' : JSON.stringify(actual);
      console.log(`  [${ok ? 'OK  ' : 'FAIL'}] ${field.padEnd(22)} attendu=${JSON.stringify(expVal)}  obtenu=${actualStr}`);
    }
  }

  console.log('\n=====================================');
  console.log(`Fichiers testes : ${filesTested}  | ignores (absents) : ${filesSkipped}`);
  console.log(`Verifications   : ${totalChecks}  | echecs : ${totalFail}`);
  if (totalFail > 0) {
    console.log('RESULTAT : REGRESSION DETECTEE');
    process.exit(1);
  } else if (filesTested === 0) {
    console.log('RESULTAT : aucune fixture disponible (rien teste)');
  } else {
    console.log('RESULTAT : OK — aucune regression');
  }
}

main().catch(err => {
  console.error('Erreur execution test-parser:', err);
  process.exit(1);
});
