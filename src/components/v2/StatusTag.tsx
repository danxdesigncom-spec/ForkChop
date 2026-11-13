import { Check } from 'lucide-react';

interface Props {
  /** 0 means ready to cook. */
  missingCount: number;
}

/** "Ready to cook" (sprout, check) or "Missing N" (saffron). */
export function StatusTag({ missingCount }: Props) {
  if (missingCount === 0) {
    return (
      <span className="inline-flex min-h-6 items-center gap-1 rounded-md bg-brand-soft px-2 text-[13px] font-semibold text-brand-strong">
        <Check aria-hidden="true" size={14} />
        Ready to cook
      </span>
    );
  }
  return (
    <span className="inline-flex min-h-6 items-center rounded-md bg-saffron-soft px-2 text-[13px] font-semibold text-saffron-text">
      Missing {missingCount}
    </span>
  );
}
