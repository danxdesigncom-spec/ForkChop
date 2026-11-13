import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src/components/v2', 'src/lib/v2'];
// Pictographic emoji plus the variation selector and keycap combiner.
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/u;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

describe('v2 uses Lucide icons, not emoji', () => {
  for (const file of ROOTS.flatMap(files)) {
    it(file, () => {
      const lines = readFileSync(file, 'utf8').split('\n');
      const hits = lines.flatMap((line, i) => (EMOJI.test(line) ? [`${i + 1}: ${line.trim()}`] : []));
      expect(hits).toEqual([]);
    });
  }
});
