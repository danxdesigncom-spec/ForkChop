import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BANNER,
  bannerForChain,
  listBanners,
  normaliseChain,
} from '@/lib/grocery/kroger-banners';

/**
 * Kroger trades under about twenty names. Getting the banner wrong sends a
 * Food 4 Less shopper to kroger.com, where their store does not exist — so
 * these tests pin the mapping and, more importantly, the normalisation, since
 * the chain codes come off the API with inconsistent punctuation.
 */

describe('normaliseChain', () => {
  it('strips spaces and punctuation and upper-cases', () => {
    // Real codes observed on the live Locations API.
    expect(normaliseChain('PICK N SAVE')).toBe('PICKNSAVE');
    expect(normaliseChain('METRO MARKET')).toBe('METROMARKET');
    expect(normaliseChain('food4less')).toBe('FOOD4LESS');
    expect(normaliseChain("Fry's")).toBe('FRYS');
  });

  it('is safe on null and undefined', () => {
    expect(normaliseChain(null)).toBe('');
    expect(normaliseChain(undefined)).toBe('');
  });
});

describe('bannerForChain', () => {
  it.each([
    ['KROGER', 'Kroger', 'www.kroger.com'],
    ['RALPHS', 'Ralphs', 'www.ralphs.com'],
    ['FOOD4LESS', 'Food 4 Less', 'www.food4less.com'],
    ['KINGSOOPERS', 'King Soopers', 'www.kingsoopers.com'],
    ['FRED', 'Fred Meyer', 'www.fredmeyer.com'],
    ['HART', 'Harris Teeter', 'www.harristeeter.com'],
    ['PICK N SAVE', "Pick 'n Save", 'www.picknsave.com'],
    ['METRO MARKET', 'Metro Market', 'www.metromarket.net'],
  ])('maps %s to %s', (chain, name, domain) => {
    const banner = bannerForChain(chain);
    expect(banner.name).toBe(name);
    expect(banner.domain).toBe(domain);
  });

  it('falls back to Kroger for an unknown or missing chain', () => {
    // A new banner we have not seen must still produce a working link.
    expect(bannerForChain('SOMENEWBANNER')).toEqual(DEFAULT_BANNER);
    expect(bannerForChain(null)).toEqual(DEFAULT_BANNER);
    expect(bannerForChain('')).toEqual(DEFAULT_BANNER);
  });
});

describe('banner table', () => {
  it('gives every banner a distinct, well-formed domain', () => {
    const banners = listBanners();
    expect(banners.length).toBeGreaterThanOrEqual(16);

    const domains = banners.map((b) => b.banner.domain);
    // A duplicated domain would silently send one banner's shoppers to another.
    expect(new Set(domains).size).toBe(domains.length);

    for (const { banner } of banners) {
      expect(banner.domain).toMatch(/^www\.[a-z0-9.-]+\.[a-z]{2,}$/);
      expect(banner.name.length).toBeGreaterThan(0);
    }
  });
});
