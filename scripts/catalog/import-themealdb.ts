/**
 * Transforms data/sources/themealdb/raw.json into the committed catalogue the
 * seeder reads, plus the import report.
 *
 *   npx tsx scripts/catalog/import-themealdb.ts           write both files
 *   npx tsx scripts/catalog/import-themealdb.ts --check   exit 1 if either would change
 *
 * Offline and deterministic: the same raw.json and taxonomy always produce
 * byte-identical output, so re-running is idempotent and `--check` can guard
 * it. After it runs, `npm run db:seed` rebuilds the local database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RECIPES } from '../../src/lib/db/data/recipes';
import { seedLexicon } from '../../src/lib/catalog/lexicon';
import { THEMEALDB_OVERRIDES } from '../../src/lib/catalog/themealdb-overrides';
import { buildReport, importCatalog, type TheMealDbRaw } from '../../src/lib/catalog/themealdb';

const ROOT = path.resolve(__dirname, '..', '..');
const RAW = path.join(ROOT, 'data', 'sources', 'themealdb', 'raw.json');
const REPORT = path.join(ROOT, 'data', 'sources', 'themealdb', 'import-report.md');
const DATA = path.join(ROOT, 'src', 'lib', 'db', 'data', 'themealdb.json');
const check = process.argv.includes('--check');

if (!fs.existsSync(RAW)) {
  console.error(`${path.relative(ROOT, RAW)} not found. Run scripts/catalog/fetch-themealdb.ts first.`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(RAW, 'utf8')) as TheMealDbRaw;
const lexicon = seedLexicon();
const result = importCatalog(raw, {
  lexicon,
  overrides: THEMEALDB_OVERRIDES,
  seeds: RECIPES.map((r) => ({ slug: r.slug, title: r.title, ingredientIds: r.ingredients.map((i) => i.id) })),
});

const outputs: [string, string][] = [
  [DATA, `${JSON.stringify(result.catalog, null, 2)}\n`],
  [REPORT, `${buildReport(result, lexicon)}\n`],
];

let changed = 0;
for (const [file, body] of outputs) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === body) continue;
  changed += 1;
  if (check) console.error(`would change: ${path.relative(ROOT, file)}`);
  else fs.writeFileSync(file, body);
}

const ready = result.catalog.recipes.filter((r) => r.status === 'ready').length;
const imported = result.catalog.recipes.length;
console.log(
  `fetched ${result.fetched} · duplicates ${result.duplicates.length} · imported ${imported} · ` +
    `ready ${ready} (${imported ? ((ready / imported) * 100).toFixed(1) : '0.0'} %) · needs_review ${imported - ready}`,
);
if (check) {
  console.log(changed ? `${changed} file(s) out of date` : 'up to date');
  process.exit(changed ? 1 : 0);
}
console.log(changed ? `wrote ${changed} file(s); now run: npm run db:seed` : 'no changes');
