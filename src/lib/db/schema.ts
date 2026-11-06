/**
 * Canonical DDL. Kept as a TS string rather than a .sql file so it survives
 * Next.js bundling without any file-tracing configuration.
 */
/**
 * Bump when the shape below changes. `client.ts` compares this against the
 * database's `user_version` and rebuilds from seed data on a mismatch, which is
 * the right trade for a store that is entirely derived from files in the repo.
 */
export const SCHEMA_VERSION = 5;

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ingredients (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL,
  -- Staples (salt, water, oil...) are assumed present in any working kitchen,
  -- so the matcher never reports them as missing unless asked to.
  is_staple  INTEGER NOT NULL DEFAULT 0,
  allergens  TEXT NOT NULL DEFAULT '[]', -- JSON array of allergen ids
  is_spicy   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ingredient_aliases (
  alias         TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aliases_ingredient ON ingredient_aliases(ingredient_id);

CREATE TABLE IF NOT EXISTS recipes (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  cuisine       TEXT NOT NULL,
  meal_types    TEXT NOT NULL, -- JSON array of meal type ids
  -- Nullable since v5: imported catalogues (TheMealDB) publish no times,
  -- servings or difficulty, and an honest "unknown" beats a fake "0 min".
  servings      INTEGER,
  prep_minutes  INTEGER,
  cook_minutes  INTEGER,
  difficulty    TEXT,
  emoji         TEXT NOT NULL,
  tags          TEXT NOT NULL, -- JSON array of strings
  instructions  TEXT NOT NULL, -- JSON array of strings

  -- Provenance (v5). Seed rows are source 'forkchop'; see docs/catalog/.
  source        TEXT NOT NULL DEFAULT 'forkchop',
  source_id     TEXT,          -- id within the source (TheMealDB idMeal)
  source_url    TEXT,
  licence       TEXT,
  attribution   TEXT,          -- e.g. "Recipe from TheMealDB"
  attribution_url TEXT,
  image_url     TEXT,
  image_licence TEXT,
  video_url     TEXT,
  imported_at   TEXT,          -- ISO timestamp
  -- needs_review rows are never returned by queries.ts; the seeder does not
  -- insert them at all today, so this is defence in depth.
  status        TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'needs_review')),
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_recipes_source ON recipes(source, status);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id     TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
  quantity      REAL,
  unit          TEXT,
  note          TEXT,
  -- The measure exactly as the source wrote it ("1 ½ tbs", "to taste"), so a
  -- parse that loses something never loses it from the recipe page. Null for
  -- seed recipes, whose structured quantity/unit/note are authoritative.
  display       TEXT,
  importance    TEXT NOT NULL DEFAULT 'normal', -- core | normal | optional
  PRIMARY KEY (recipe_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient
  ON recipe_ingredients(ingredient_id);
`;

/** Drops everything the schema owns, so a version bump can rebuild cleanly. */
export const DROP_SQL = `
DROP TABLE IF EXISTS recipe_ingredients;
DROP TABLE IF EXISTS recipes;
DROP TABLE IF EXISTS ingredient_aliases;
DROP TABLE IF EXISTS ingredients;
`;
