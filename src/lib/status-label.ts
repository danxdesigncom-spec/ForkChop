import type { MatchStatus } from './types';

/**
 * Human labels for match sections. Lives in lib (not in a component) so v1
 * and v2 share one source without v2 importing a v1 component.
 */
export const STATUS_LABEL: Record<MatchStatus, string> = {
  ready: 'Ready to cook',
  almost: 'Almost there',
  stretch: 'Worth a shop',
};
