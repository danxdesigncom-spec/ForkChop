/**
 * Kroger's regional banners.
 *
 * Kroger runs about twenty supermarket chains under different names. Someone
 * in Cincinnati shops at "Kroger"; the same company in Los Angeles is
 * "Ralphs", in San Bernardino "Food 4 Less", in Denver "King Soopers". Each
 * banner has its own website — ralphs.com, food4less.com — and sending a
 * Food 4 Less shopper to kroger.com lands them on a site where their store
 * does not exist.
 *
 * So the checkout option is named after the banner of the store actually being
 * priced, and the deep link points at that banner's own domain.
 *
 * Chain codes below were read off the live Locations API rather than taken
 * from documentation, by sampling zip codes across each banner's territory —
 * which is why they look inconsistent ("FRED" for Fred Meyer, "PICK N SAVE"
 * with spaces, "FOOD4LESS" without). Match with `normaliseChain` rather than
 * comparing raw strings.
 */

export interface KrogerBanner {
  /** How the store brands itself to shoppers. */
  name: string;
  /** The banner's own storefront, for the search deep link. */
  domain: string;
}

const BANNERS: Record<string, KrogerBanner> = {
  KROGER: { name: 'Kroger', domain: 'www.kroger.com' },
  RALPHS: { name: 'Ralphs', domain: 'www.ralphs.com' },
  FOOD4LESS: { name: 'Food 4 Less', domain: 'www.food4less.com' },
  FRYS: { name: "Fry's", domain: 'www.frysfood.com' },
  KINGSOOPERS: { name: 'King Soopers', domain: 'www.kingsoopers.com' },
  SMITHS: { name: "Smith's", domain: 'www.smithsfoodanddrug.com' },
  FRED: { name: 'Fred Meyer', domain: 'www.fredmeyer.com' },
  QFC: { name: 'QFC', domain: 'www.qfc.com' },
  DILLONS: { name: 'Dillons', domain: 'www.dillons.com' },
  HART: { name: 'Harris Teeter', domain: 'www.harristeeter.com' },
  MARIANOS: { name: "Mariano's", domain: 'www.marianos.com' },
  PICKNSAVE: { name: "Pick 'n Save", domain: 'www.picknsave.com' },
  METROMARKET: { name: 'Metro Market', domain: 'www.metromarket.net' },
  BAKERS: { name: "Baker's", domain: 'www.bakersplus.com' },
  GERBES: { name: 'Gerbes', domain: 'www.gerbes.com' },
  JAYC: { name: 'Jay C', domain: 'www.jaycfoods.com' },
  CITYMARKET: { name: 'City Market', domain: 'www.citymarket.com' },
};

/** Fallback when the chain is unknown or no store has been chosen yet. */
export const DEFAULT_BANNER: KrogerBanner = BANNERS.KROGER;

/**
 * Chain codes arrive with inconsistent spacing and punctuation
 * ("PICK N SAVE", "FOOD4LESS"), so strip everything that isn't a letter or
 * digit before looking up.
 */
export function normaliseChain(chain: string | null | undefined): string {
  return (chain ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function bannerForChain(chain: string | null | undefined): KrogerBanner {
  return BANNERS[normaliseChain(chain)] ?? DEFAULT_BANNER;
}

/** Every banner, for docs and tests. */
export function listBanners(): { chain: string; banner: KrogerBanner }[] {
  return Object.entries(BANNERS).map(([chain, banner]) => ({ chain, banner }));
}
