import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DROP_SQL, SCHEMA_SQL, SCHEMA_VERSION } from './schema';
import { seed } from './seed';

/**
 * Single shared connection. Cached on globalThis because Next.js re-evaluates
 * modules on every hot reload in dev, and we do not want a new file handle
 * (or a re-seed) each time a route file is touched.
 */
declare global {
  var __forkchopDb: Database.Database | undefined;
}

function resolveDbPath(): string {
  if (process.env.FORKCHOP_DB_PATH) return process.env.FORKCHOP_DB_PATH;
  return path.join(process.cwd(), 'data', 'forkchop.db');
}

function open(): Database.Database {
  const dbPath = resolveDbPath();

  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Everything in here is derived from files in the repo, so an out-of-date
  // schema is rebuilt rather than migrated — there is no user data to preserve.
  const [{ user_version: version }] = db.pragma('user_version') as { user_version: number }[];
  if (version !== SCHEMA_VERSION) {
    db.exec(DROP_SQL);
  }

  db.exec(SCHEMA_SQL);

  // First run, a wiped file, or a rebuild: populate so `npm run dev` just works
  // without a separate step. `npm run db:seed` forces a refresh after data edits.
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM recipes').get() as { n: number };
  if (n === 0) seed(db);

  db.pragma(`user_version = ${SCHEMA_VERSION}`);

  return db;
}

export function getDb(): Database.Database {
  if (!globalThis.__forkchopDb) {
    globalThis.__forkchopDb = open();
  }
  return globalThis.__forkchopDb;
}
