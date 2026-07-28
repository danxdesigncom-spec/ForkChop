import { PigMascot } from './PigMascot';

interface Props {
  ready: number;
  almost: number;
  /** Recipes actually considered — the corpus minus anything filtered out. */
  searched: number;
  /** Removed by allergy or dislike filters. */
  excluded: number;
  loading: boolean;
}

/**
 * The headline numbers, sitting directly above the recipe cards where they are
 * read alongside the results rather than tucked into the page header.
 */
export function StatsRow({ ready, almost, searched, excluded, loading }: Props) {
  const tiles = [
    {
      label: 'Ready to cook',
      value: ready,
      fg: 'var(--score-high)',
      soft: 'var(--score-high-soft)',
    },
    {
      label: 'Almost there',
      value: almost,
      fg: 'var(--score-mid)',
      soft: 'var(--score-mid-soft)',
    },
    {
      label: 'Recipes searched',
      value: searched,
      fg: 'var(--brand)',
      soft: 'var(--brand-soft)',
    },
  ];

  return (
    <div className="mb-6">
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-2xl border px-4 py-3.5"
            style={{ backgroundColor: tile.soft, borderColor: tile.fg }}
          >
            <p
              className="text-4xl font-extrabold leading-none tabular-nums sm:text-5xl"
              style={{ color: tile.fg }}
            >
              {tile.value}
            </p>
            <p className="mt-1.5 text-xs font-semibold sm:text-sm" style={{ color: tile.fg }}>
              {tile.label}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted">
        <PigMascot size={16} mood={ready > 0 ? 'happy' : 'hungry'} />
        {excluded > 0 ? (
          <span>
            {excluded} recipe{excluded === 1 ? '' : 's'} hidden by your allergy and dislike settings.
          </span>
        ) : (
          <span>Every recipe in the book is in the running.</span>
        )}
        {loading && <span className="opacity-60">· updating…</span>}
      </p>
    </div>
  );
}
