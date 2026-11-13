/**
 * Recipe image URLs.
 *
 * TheMealDB serves smaller renditions of every meal photo when a size suffix is
 * appended to the image path. The v1 card draws its photo as a plain 44px
 * `<img>` that never goes through the Next image optimiser, so pulling the
 * full-size photo there costs a few hundred KB per card for nothing.
 *
 * v2 cards use `next/image`, which resizes on the server, so they keep the
 * original URL; so does the recipe detail page.
 *
 * Verified 2026-11-13: TheMealDB serves `/small` (150×150, ~9 KB), `/medium`
 * (350×350) and `/large` (500×500), against ~130 KB for the 700×700
 * original. `/preview` is an older alias of `/small`. 150 px covers the 44 px
 * card at 3× density.
 */
export const THEMEALDB_THUMB_SUFFIX = '/small';

const THEMEALDB_IMAGE = /^https:\/\/www\.themealdb\.com\/images\/media\/meals\/[^/?#]+\.(?:jpe?g|png|webp)$/i;

/** A thumbnail-sized URL where the host offers one; anything else passes through untouched. */
export function cardImageUrl(url: string): string;
export function cardImageUrl(url: string | null | undefined): string | null | undefined;
export function cardImageUrl(url: string | null | undefined): string | null | undefined {
  if (!url) return url;
  return THEMEALDB_IMAGE.test(url) ? `${url}${THEMEALDB_THUMB_SUFFIX}` : url;
}
