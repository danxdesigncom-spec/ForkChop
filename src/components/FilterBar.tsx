'use client';

interface Props {
  allTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  assumeStaples: boolean;
  onAssumeStaplesChange: (value: boolean) => void;
  maxTotalMinutes: number | null;
  onMaxTotalMinutesChange: (value: number | null) => void;
}

const TIME_OPTIONS = [
  { label: 'Any time', value: null },
  { label: 'Under 20 min', value: 20 },
  { label: 'Under 30 min', value: 30 },
  { label: 'Under 1 hr', value: 60 },
];

/**
 * Time, style tags and the staples assumption. Diet, region and meal now live
 * in their own sections — this is what is left.
 */
export function FilterBar({
  allTags,
  selectedTags,
  onToggleTag,
  assumeStaples,
  onAssumeStaplesChange,
  maxTotalMinutes,
  onMaxTotalMinutesChange,
}: Props) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="time-filter" className="mb-1.5 block text-xs font-medium text-muted">
          Time
        </label>
        <select
          id="time-filter"
          value={maxTotalMinutes ?? ''}
          onChange={(e) => onMaxTotalMinutesChange(e.target.value ? Number(e.target.value) : null)}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        >
          {TIME_OPTIONS.map((option) => (
            <option key={option.label} value={option.value ?? ''}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {allTags.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Style</p>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onToggleTag(tag)}
                  aria-pressed={active}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors
                    ${
                      active
                        ? 'border-brand bg-brand text-white'
                        : 'border-border text-muted hover:border-brand hover:text-brand'
                    }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={assumeStaples}
          onChange={(e) => onAssumeStaplesChange(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--brand)]"
        />
        <span>
          I have the basics
          <span className="block text-xs text-muted">
            Salt, pepper, oil, stock, sugar and water are assumed — never listed as missing.
          </span>
        </span>
      </label>
    </div>
  );
}
