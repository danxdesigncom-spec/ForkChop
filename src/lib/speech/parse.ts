/**
 * Split a spoken sentence into individual ingredients.
 *
 * Two important constraints, both learned from actually saying things at a
 * microphone:
 *
 *   1. Speech recognizers don't emit commas. "onions garlic and two chicken
 *      breasts" is what arrives, not "onions, garlic, and two chicken
 *      breasts". So the splitter has to work primarily on connective words.
 *
 *   2. "two chicken breasts" is one ingredient, not two. Splitting purely on
 *      whitespace would fracture every quantity. Only the connectives do it.
 */

/**
 * Sentence-ending punctuation also separates items — some recognizers emit
 * a period between clauses ("flour. sugar. butter.") and treating that as
 * one item would defeat the whole tray.
 */
const CONNECTIVES = /,|;|\.\s*| and | plus | also | then /i;

/**
 * Words a person says without meaning them: "some rice", "a few carrots".
 * Stripped from the start of each item so the entry the user sees is what
 * they'd have typed. Ordered longest-first — "a few" must match before "a".
 */
const LEADING_STOP_WORDS = /^(a few|and|some|a|an|the|few|maybe|also|then|plus)\s+/i;

export function splitSpokenItems(transcript: string): string[] {
  return transcript
    .split(CONNECTIVES)
    .map((part) =>
      part
        .replace(/^\s+|\s+$/g, '')
        // Trailing punctuation from an interim result, occasionally.
        .replace(/[.,;!?\s]+$/g, '')
        .replace(LEADING_STOP_WORDS, '')
        .trim(),
    )
    .filter((part) => part.length > 1);
}
