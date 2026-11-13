/**
 * Safety rules for mapping imported ingredient names onto the taxonomy.
 *
 * Written after the first real TheMealDB import (2026-11-13), whose report
 * showed the resolver's partial matching is right for a pantry chip and wrong
 * for a recipe. "Water Chestnut" became Water, a staple everyone is assumed to
 * have, so the recipe looked Ready without its chestnuts. "Ground Nut Oil" became
 * vegetable oil and lost its peanut allergen. "Egg Rolls" became Egg. A shopper
 * can correct a pantry chip; nobody reviews an imported line, so these rules
 * decide what is safe to accept unattended:
 *
 *  1. A partial match is accepted only when every word it left over is a
 *     harmless modifier: a size, colour, freshness word or variety ("Baby New
 *     Potatoes" → Potato). Anything else is `ambiguous`, for a person to decide.
 *  2. Whatever the method, a mapping that would lose an allergen the name
 *     itself implies ("soya milk" → Milk has no soy) is `ambiguous`.
 *  3. A recipe only gets a vegetarian or vegan tag when no line's own name
 *     says meat, fish or (for vegan) another animal product, even when that line
 *     mapped to something neutral ("Chicken Stock" → Stock).
 *
 * All of these lists are matched against `ingredientTokens()` output, the same
 * singularised tokens the resolver uses, so "Leaves" and "leaf" agree.
 */
import type { Ingredient } from '../types';
import { ingredientTokens } from '../matching/normalize';

const toks = (words: string): Set<string> => new Set(words.split(/\s+/).flatMap((w) => ingredientTokens(w)));

/** Words that never change what you would buy. */
export const UNIVERSAL_MODIFIERS = toks(`
  baby new young raw fresh large small medium big jumbo king mini whole full fat
  ripe unwaxed organic free range chilled cold warm hot room temperature pitted flaked lean
  smoked smoky red green yellow orange purple black brown golden light dark
  unsalted salted good quality plain extra virgin
`);

/**
 * Words that don't change what you'd buy *for this ingredient*: varieties,
 * cuts and forms. "Savoy" is fine for cabbage and means nothing for chicken.
 */
export const MODIFIERS_BY_ID: Readonly<Record<string, Set<string>>> = {
  egg: toks('yolk yolks white whites wash'),
  sugar: toks('caster icing powdered granulated demerara cane white'),
  'brown-sugar': toks('soft muscovado demerara'),
  flour: toks('self raising rising strong white bread wheat all purpose'),
  potato: toks('jersey royal charlotte floury waxy maris piper king edward salad'),
  cabbage: toks('savoy napa hispi sweetheart chinese white'),
  apple: toks('bramley braeburn cooking eating granny smith pink lady gala'),
  tomato: toks('plum cherry beef beefsteak vine salad'),
  lettuce: toks('little gem romaine cos iceberg leaf leaves'),
  mushroom: toks('wild shiitake oyster chestnut button portobello cremini'),
  prawns: toks('tiger king jumbo raw cooked peeled'),
  olives: toks('kalamata'),
  lamb: toks('leg loin chop chops shoulder shank shanks rack neck fillet'),
  'beef-steak': toks('sirloin flank skirt rump ribeye fillet'),
  'stewing-beef': toks('chuck braising stewing'),
  sausage: toks('italian fennel pork german cumberland lincolnshire kabanos toulouse'),
  salmon: toks('fillet fillets hot flaked'),
  'white-fish': toks('cod haddock pollock hake fillet fillets'),
  stock: toks('cube cubes concentrate chicken beef vegetable veg pot'),
  'black-pepper': toks('peppercorn peppercorns cracked ground'),
  'bell-pepper': toks('sweet romano'),
  'curry-paste': toks('thai massaman panang penang'),
  vinegar: toks('apple cider sherry malt white wine seasoned distilled'),
  wine: toks('dry'),
  'vegetable-oil': toks('sunflower rapeseed canola neutral cooking'),
  oats: toks('rolled porridge jumbo'),
  paprika: toks('sweet hot'),
  cocoa: toks('unsweetened'),
  'dark-chocolate': toks('chip chips'),
  mozzarella: toks('ball balls buffalo'),
  parmesan: toks('parmigiano reggiano'),
  butter: toks('chilled'),
  milk: toks('semi skimmed'),
  yoghurt: toks('greek strained natural'),
  'sour-cream': toks(''),
  'coconut-milk': toks('unsweetened tinned'),
  tofu: toks('firm silken marinated extra'),
  banana: toks(''),
  peas: toks('frozen garden'),
  broccoli: toks('purple sprouting tenderstem'),
  honey: toks('clear runny'),
  tahini: toks('paste'),
  harissa: toks('paste'),
  yeast: toks('fast action dried instant easy blend'),
  vanilla: toks('pod bean paste essence powder'),
  noodles: toks('udon ramen soba egg wheat'),
  pasta: toks('linguine penne rigate bowtie paccheri fusilli rigatoni farfalle'),
  aubergine: toks(''),
  water: toks('boiling warm hot cold tap'),
  // Herbs: the leaves are the herb.
  basil: toks('leaf leaves sweet thai'),
  coriander: toks('leaf leaves'),
  parsley: toks('leaf leaves flat curly'),
  mint: toks('leaf leaves'),
  dill: toks('leaf leaves'),
  rosemary: toks('sprig sprigs'),
  thyme: toks('sprig sprigs'),
  // Ground spices are the spice.
  cumin: toks('ground powder'),
  turmeric: toks('ground powder'),
  cinnamon: toks('ground stick sticks'),
  nutmeg: toks('ground'),
  'five-spice': toks('chinese powder'),
  'curry-powder': toks('jamaican madras mild hot'),
  'garam-masala': toks('powder'),
  'chilli-powder': toks('hot mild'),
};

/** Leftover words from a partial match that this rule set accepts for `id`. */
export function leftoversAreHarmless(id: string, leftovers: string[]): boolean {
  const own = MODIFIERS_BY_ID[id];
  return leftovers.every((w) => UNIVERSAL_MODIFIERS.has(w) || own?.has(w));
}

// ------------------------------------------------------------------ allergens

/**
 * Phrases that look like an allergen word and aren't, or that imply a
 * different one. They're checked, and removed, before the single words below.
 */
const ALLERGEN_PHRASES: [RegExp, string[]][] = [
  [/\bpeanut butter\b/, ['peanut']],
  [/\bbutter ?beans?\b/, []],
  [/\bcocoa butter\b/, []],
  [/\bcoconut (milk|cream|yoghurt|yogurt)\b/, []],
  [/\bsoya? (milk|cream|yoghurt|yogurt)\b/, ['soy']],
  [/\b(almond|cashew|hazelnut) (milk|cream|butter)\b/, ['tree-nut']],
  [/\b(oat|rice) (milk|cream)\b/, []],
  [/\begg ?plants?\b/, []],
  [/\bwater chestnuts?\b/, []],
  [/\boyster mushrooms?\b/, []],
  [/\bcream of tartar\b/, []],
  [/\b(vegan|plant[- ]based|dairy[- ]free) (butter|cheese|milk|cream|yoghurt|yogurt)\b/, []],
  [/\bflax ?eggs?\b/, []],
  [/\bground ?nuts?\b|\bmonkey nuts?\b/, ['peanut']],
];

/** Single words that mean an allergen is present. */
const ALLERGEN_WORDS: Record<string, string> = {
  peanut: 'peanut', groundnut: 'peanut',
  nut: 'nut', almond: 'tree-nut', cashew: 'tree-nut', walnut: 'tree-nut', pecan: 'tree-nut',
  hazelnut: 'tree-nut', pistachio: 'tree-nut', macadamia: 'tree-nut', marzipan: 'tree-nut',
  praline: 'tree-nut', frangipane: 'tree-nut',
  milk: 'dairy', cream: 'dairy', butter: 'dairy', buttermilk: 'dairy', cheese: 'dairy', yoghurt: 'dairy',
  yogurt: 'dairy', ghee: 'dairy', custard: 'dairy', mascarpone: 'dairy', ricotta: 'dairy', paneer: 'dairy',
  halloumi: 'dairy', creme: 'dairy', crème: 'dairy',
  egg: 'egg', mayonnaise: 'egg', mayo: 'egg', meringue: 'egg',
  soy: 'soy', soya: 'soy', tofu: 'soy', miso: 'soy', edamame: 'soy', tempeh: 'soy',
  sesame: 'sesame', tahini: 'sesame',
  fish: 'fish', anchovy: 'fish', anchovies: 'fish', salmon: 'fish', tuna: 'fish', cod: 'fish',
  haddock: 'fish', mackerel: 'fish', sardine: 'fish', trout: 'fish', pollock: 'fish', hake: 'fish',
  kipper: 'fish', monkfish: 'fish',
  prawn: 'shellfish', shrimp: 'shellfish', crab: 'shellfish', lobster: 'shellfish', mussel: 'shellfish',
  clam: 'shellfish', oyster: 'shellfish', scallop: 'shellfish', squid: 'shellfish', calamari: 'shellfish',
  octopus: 'shellfish', crayfish: 'shellfish', langoustine: 'shellfish', seafood: 'shellfish',
  mustard: 'mustard', celery: 'celery', celeriac: 'celery',
  wheat: 'gluten', spelt: 'gluten', rye: 'gluten', barley: 'gluten', semolina: 'gluten', bulgur: 'gluten',
};

/** Allergens a name implies on its own, e.g. "Seafood stock" → shellfish. 'nut' means peanut or tree nut. */
export function impliedAllergens(name: string): string[] {
  let text = ` ${name.toLowerCase().replace(/[^a-zà-ÿ\s-]/g, ' ').replace(/\s+/g, ' ')} `;
  const found = new Set<string>();
  for (const [pattern, allergens] of ALLERGEN_PHRASES) {
    if (pattern.test(text)) {
      allergens.forEach((a) => found.add(a));
      text = text.replace(pattern, ' ');
    }
  }
  for (const raw of text.split(/[\s-]+/)) {
    if (!raw) continue;
    const word = raw.replace(/(ies)$/, 'y').replace(/s$/, '');
    const allergen = ALLERGEN_WORDS[raw] ?? ALLERGEN_WORDS[word];
    if (allergen) found.add(allergen);
  }
  return [...found].sort();
}

/** Allergens the name implies that the mapped ingredient doesn't carry. */
export function lostAllergens(name: string, target: Ingredient): string[] {
  const has = new Set(target.allergens);
  return impliedAllergens(name).filter((a) =>
    a === 'nut' ? !has.has('peanut') && !has.has('tree-nut') : !has.has(a),
  );
}

// ---------------------------------------------------------------------- diets

const NOT_MEAT = /\b(vegetable|veg|veggie|vegan|vegetarian|plant[- ]based|meat[- ]free|quorn|mushroom)s?\b/;
const MEAT_OR_FISH_WORDS = new Set(
  `chicken beef pork lamb mutton veal bacon ham gammon prosciutto pancetta chorizo salami pepperoni
   sausage mince turkey duck goose venison rabbit pheasant liver kidney oxtail brisket steak
   gelatine gelatin lard suet dripping rennet
   fish anchovy anchovies salmon tuna cod haddock mackerel sardine trout pollock hake kipper monkfish
   prawn shrimp crab lobster mussel clam oyster scallop squid calamari octopus crayfish seafood
   worcestershire`.split(/\s+/),
);
const NOT_VEGAN = /\b(vegan|plant[- ]based|dairy[- ]free|soya?|oat|almond|coconut|rice|flax)\b/;
const ANIMAL_PRODUCT_WORDS = new Set(
  `egg eggs milk cream butter buttermilk cheese yoghurt yogurt ghee honey custard mayonnaise mayo
   meringue mascarpone ricotta paneer halloumi parmesan cheddar mozzarella feta creme`.split(/\s+/),
);

const words = (name: string) =>
  name.toLowerCase().replace(/[^a-zà-ÿ\s-]/g, ' ').split(/[\s-]+/).filter(Boolean)
    .map((w) => (MEAT_OR_FISH_WORDS.has(w) || ANIMAL_PRODUCT_WORDS.has(w) ? w : w.replace(/s$/, '')));

/** Does this line's own name say meat or fish? ("Chicken Stock" yes, "Vegetable Stock" no.) */
export function nameSaysMeatOrFish(name: string): boolean {
  const lower = name.toLowerCase();
  if (NOT_MEAT.test(lower) && !/\b(chicken|beef|pork|lamb|fish)\b/.test(lower.replace(NOT_MEAT, ''))) return false;
  // Words that contain a meat word without being meat.
  const cleaned = lower.replace(/\b(oyster mushrooms?|kidney beans?|chicken of the woods|hamburger buns?|beef tomato(es)?|beefsteak tomato(es)?)\b/g, ' ');
  return words(cleaned).some((w) => MEAT_OR_FISH_WORDS.has(w));
}

/** Does this line's own name say egg, dairy or honey? ("Soya milk" no.) */
export function nameSaysAnimalProduct(name: string): boolean {
  const lower = name.toLowerCase();
  if (NOT_VEGAN.test(lower) || /\bpeanut butter\b|\bbutter ?beans?\b|\bcocoa butter\b|\begg ?plants?\b|\bcream of tartar\b/.test(lower)) {
    return false;
  }
  return words(name).some((w) => ANIMAL_PRODUCT_WORDS.has(w));
}
