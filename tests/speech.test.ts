import { describe, expect, it } from 'vitest';
import { splitSpokenItems } from '@/lib/speech';

/**
 * splitSpokenItems is what turns one dictated sentence into individual
 * ingredients. It runs against real transcripts from a speech recognizer,
 * which don't emit commas and often bolt filler onto the front of each item.
 */

describe('splitSpokenItems', () => {
  it('separates items joined with "and"', () => {
    expect(splitSpokenItems('onions and garlic and tomatoes')).toEqual([
      'onions',
      'garlic',
      'tomatoes',
    ]);
  });

  it('splits on the other common connectives', () => {
    expect(splitSpokenItems('rice plus chickpeas also lemons then cumin')).toEqual([
      'rice',
      'chickpeas',
      'lemons',
      'cumin',
    ]);
  });

  it('handles commas from dictation software that adds them', () => {
    expect(splitSpokenItems('flour, sugar, butter')).toEqual(['flour', 'sugar', 'butter']);
  });

  it('leaves "chicken breasts" as one item', () => {
    // Whitespace-only splitting would produce ["two", "chicken", "breasts"].
    expect(splitSpokenItems('two chicken breasts')).toEqual(['two chicken breasts']);
    expect(splitSpokenItems('two chicken breasts and rice')).toEqual([
      'two chicken breasts',
      'rice',
    ]);
  });

  it('strips filler off the front of each item', () => {
    expect(splitSpokenItems('some rice and a few carrots and the parsley')).toEqual([
      'rice',
      'carrots',
      'parsley',
    ]);
  });

  it('drops trailing punctuation the recognizer sometimes emits', () => {
    expect(splitSpokenItems('flour. sugar. butter.')).toEqual(['flour', 'sugar', 'butter']);
  });

  it('ignores empty and single-character fragments', () => {
    expect(splitSpokenItems('rice and and lemons')).toEqual(['rice', 'lemons']);
    expect(splitSpokenItems('')).toEqual([]);
    expect(splitSpokenItems('a and b and cheese')).toEqual(['cheese']);
  });

  it('does not split on "and" that is part of a word', () => {
    // "brandy" contains "and". A regex without word boundaries would break here.
    expect(splitSpokenItems('brandy and rum')).toEqual(['brandy', 'rum']);
  });
});
