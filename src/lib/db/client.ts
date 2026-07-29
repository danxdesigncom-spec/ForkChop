import fs from 'node:fs';
import os from 'node:os';
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

/**
 * Serverless platforms ship the app on a read-only filesystem with only the
 * temp directory writable. Detecting that here rather than requiring an env var
 * means a plain `vercel deploy` works — the alternative is a 500 on first
 * render with `EROFS: mkdir '/var/task/data'`, which is a miserable way to find
 * out.
 */
function isReadOnlyDeployment(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NETLIFY ||
      process.env.FUNCTIONS_WORKER_RUNTIME,
  );
}

function defaultDbPath(): string {
  if (isReadOnlyDeployment()) return path.join(os.tmpdir(), 'forkchop.db');
  return path.join(process.cwd(), 'data', 'forkchop.db');
}

function resolveDbPath(): string {
  return process.env.FORKCHOP_DB_PATH || defaultDbPath();
}

/** Create the parent directory, reporting whether the location is usable. */
function ensureDirectory(dbPath: string): boolean {
  if (dbPath === ':memory:') return true;
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Anything other than "you may not write here" is a real problem.
    if (code !== 'EROFS' && code !== 'EACCES' && code !== 'EPERM') throw error;
    return false;
  }
}

function open(): Database.Database {
  let dbPath = resolveDbPath();

  if (!ensureDirectory(dbPath)) {
    // Last-resort fallback for a host we did not anticipate. Safe because the
    // database holds nothing but seed data derived from files in the repo, so
    // a per-instance copy in the temp directory is fully equivalent.
    const fallback = path.join(os.tmpdir(), 'forkchop.db');
    console.warn(
      `[forkchop] ${dbPath} is not writable; falling back to ${fallback}. ` +
        'Set FORKCHOP_DB_PATH to choose a different location.',
    );
    dbPath = fallback;
    ensureDirectory(dbPath);
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
