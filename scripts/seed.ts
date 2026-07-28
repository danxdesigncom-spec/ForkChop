/**
 * Rebuilds the recipe database from src/lib/db/data/*.
 * Run after editing seed data:  npm run db:seed
 */
import { getDb } from '../src/lib/db/client';
import { seed } from '../src/lib/db/seed';

const db = getDb();
const result = seed(db);

console.log(
  `Seeded ${result.recipes} recipes, ${result.ingredients} ingredients, ${result.aliases} lookup phrases.`,
);
