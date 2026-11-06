# TheMealDB source data

| File | Written by | Committed |
|---|---|---|
| `raw.json` | `npx tsx scripts/catalog/fetch-themealdb.ts` (needs `THEMEALDB_API_KEY`, Mac only) | Yes: it is the reproducible input |
| `import-report.md` | `npx tsx scripts/catalog/import-themealdb.ts` | Yes |

The import also writes `src/lib/db/data/themealdb.json`, which is what the app's seeder reads.
Neither file may ever contain the API key; the fetch script refuses to write one that does.

Content is from TheMealDB's API, used under its terms (copying and modifying API content is
allowed, with TheMealDB credited as the source; scraping the website is not). See
`docs/catalog/01-themealdb-import.md`.
