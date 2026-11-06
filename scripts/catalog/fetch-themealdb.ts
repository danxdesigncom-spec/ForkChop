/**
 * Fetches TheMealDB's full catalogue into data/sources/themealdb/raw.json.
 *
 *   npx tsx scripts/catalog/fetch-themealdb.ts
 *
 * Runs on a developer machine (the cloud sandbox can't reach themealdb.com).
 * Needs THEMEALDB_API_KEY in .env.local, and refuses to run without it: there
 * is deliberately no fallback to the public test key. The key is redacted from
 * everything printed, and the script checks the file it writes doesn't contain
 * it before finishing.
 *
 * Then run scripts/catalog/import-themealdb.ts. See docs/catalog/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_THEMEALDB_BASE, fetchCatalogue } from '../../src/lib/catalog/themealdb-fetch';
import { redactKey } from '../../src/lib/catalog/themealdb';

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'sources', 'themealdb', 'raw.json');

for (const file of ['.env.local', '.env']) {
  const full = path.join(ROOT, file);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}

const key = process.env.THEMEALDB_API_KEY?.trim();
if (!key) {
  console.error(
    'THEMEALDB_API_KEY is not set. Add it to .env.local (it is script-only: never NEXT_PUBLIC_, never on Vercel).\n' +
      'There is intentionally no fallback to the public test key.',
  );
  process.exit(1);
}
const base = process.env.THEMEALDB_API_BASE?.trim() || DEFAULT_THEMEALDB_BASE;

async function main() {
  console.log(`Fetching from ${redactKey(`${base}${key}/`, key)} …`);
  const result = await fetchCatalogue({ base, key: key!, log: (m) => console.log(`  ${m}`) });

  const body = `${JSON.stringify(result, null, 2)}\n`;
  if (body.includes(key!)) {
    throw new Error('Refusing to write raw.json: the output contains the API key.');
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body);

  const s = result.summary;
  console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
  console.log(`  meals:              ${s.total}`);
  console.log(`  via letter search:  ${s.bySearch}`);
  console.log(`  via categories:     ${s.byCategory} ids over ${s.categories} categories`);
  console.log(`  looked up (missed): ${s.missingFromSearch.length}`);
  console.log(`  latest.php present: ${s.latest.length - s.missingFromLatest.length}/${s.latest.length}`);
  console.log(`  requests:           ${s.requests}`);
  console.log('\nNext: npx tsx scripts/catalog/import-themealdb.ts');
}

main().catch((error) => {
  console.error(redactKey(String(error?.stack ?? error), key));
  process.exit(1);
});
