/**
 * The canonical ingredient catalog.
 *
 * Recipes never store free text — they reference these ids. Anything a user
 * types ("2 boneless chicken breasts", "extra-virgin olive oil", "scallions")
 * is resolved down to one of these ids by src/lib/matching/normalize.ts, using
 * the `aliases` below plus generic singularisation and typo tolerance.
 *
 * Only add aliases here that normalisation can't derive on its own. Plurals
 * ("tomatoes"), prep words ("chopped onion") and units ("2 cups rice") are
 * already handled, so listing them is just noise.
 */

import type { AllergenId } from '../../allergens';

export type IngredientCategory =
  | 'produce'
  | 'protein'
  | 'dairy'
  | 'grain'
  | 'pantry'
  | 'spice'
  | 'condiment'
  | 'bakery'
  | 'other';

export interface SeedIngredient {
  id: string;
  name: string;
  category: IngredientCategory;
  /** Assumed present in any working kitchen; never reported as missing. */
  staple?: boolean;
  aliases?: string[];
  /**
   * Allergens this ingredient carries, from src/lib/allergens.ts. Used to
   * exclude recipes outright, so err toward over-tagging: a false positive
   * costs a recipe, a false negative costs a reaction.
   */
  allergens?: AllergenId[];
  /**
   * Carries real chilli heat. Drives the 🌶️ badge and the "no spicy food"
   * filter. Warming-but-not-hot spices (paprika, ginger, black pepper) are
   * deliberately excluded — flag those and almost every recipe reads as spicy,
   * which makes the badge meaningless.
   */
  spicy?: boolean;
}

export const INGREDIENTS: SeedIngredient[] = [
  // ---------------------------------------------------------------- produce
  { id: 'onion', name: 'Onion', category: 'produce', aliases: ['yellow onion', 'brown onion', 'white onion', 'cooking onion'] },
  { id: 'red-onion', name: 'Red onion', category: 'produce' },
  { id: 'spring-onion', name: 'Spring onion', category: 'produce', aliases: ['scallion', 'green onion', 'salad onion'] },
  { id: 'garlic', name: 'Garlic', category: 'produce', aliases: ['garlic clove', 'clove of garlic', 'minced garlic'] },
  { id: 'ginger', name: 'Ginger', category: 'produce', aliases: ['fresh ginger', 'root ginger', 'ginger root'] },
  { id: 'tomato', name: 'Tomato', category: 'produce', aliases: ['fresh tomato', 'vine tomato', 'plum tomato'] },
  { id: 'cherry-tomato', name: 'Cherry tomato', category: 'produce', aliases: ['grape tomato'] },
  { id: 'potato', name: 'Potato', category: 'produce', aliases: ['white potato', 'russet potato', 'baking potato'] },
  { id: 'sweet-potato', name: 'Sweet potato', category: 'produce', aliases: ['yam'] },
  { id: 'carrot', name: 'Carrot', category: 'produce' },
  { id: 'celery', name: 'Celery', category: 'produce', aliases: ['celery stalk'], allergens: ['celery'] },
  { id: 'bell-pepper', name: 'Bell pepper', category: 'produce', aliases: ['capsicum', 'sweet pepper', 'red pepper', 'green pepper', 'yellow pepper'] },
  { id: 'chilli', name: 'Chilli', category: 'produce', aliases: ['chili', 'chile', 'red chilli', 'green chilli', 'jalapeno', 'birds eye chilli', 'hot pepper'], spicy: true },
  { id: 'mushroom', name: 'Mushroom', category: 'produce', aliases: ['button mushroom', 'chestnut mushroom', 'cremini', 'portobello'] },
  { id: 'spinach', name: 'Spinach', category: 'produce', aliases: ['baby spinach'] },
  { id: 'kale', name: 'Kale', category: 'produce' },
  { id: 'lettuce', name: 'Lettuce', category: 'produce', aliases: ['romaine', 'cos lettuce', 'iceberg lettuce', 'salad leaves'] },
  { id: 'cabbage', name: 'Cabbage', category: 'produce', aliases: ['white cabbage', 'green cabbage'] },
  { id: 'broccoli', name: 'Broccoli', category: 'produce', aliases: ['broccoli floret'] },
  { id: 'cauliflower', name: 'Cauliflower', category: 'produce' },
  { id: 'courgette', name: 'Courgette', category: 'produce', aliases: ['zucchini'] },
  { id: 'aubergine', name: 'Aubergine', category: 'produce', aliases: ['eggplant', 'brinjal'] },
  { id: 'cucumber', name: 'Cucumber', category: 'produce' },
  { id: 'green-bean', name: 'Green bean', category: 'produce', aliases: ['french bean', 'string bean'] },
  { id: 'peas', name: 'Peas', category: 'produce', aliases: ['garden pea', 'frozen pea', 'petit pois'] },
  { id: 'sweetcorn', name: 'Sweetcorn', category: 'produce', aliases: ['corn', 'corn kernel', 'canned corn'] },
  { id: 'avocado', name: 'Avocado', category: 'produce' },
  { id: 'lemon', name: 'Lemon', category: 'produce', aliases: ['lemon juice', 'lemon zest'] },
  { id: 'lime', name: 'Lime', category: 'produce', aliases: ['lime juice', 'lime zest'] },
  { id: 'orange', name: 'Orange', category: 'produce', aliases: ['orange juice', 'orange zest'] },
  { id: 'apple', name: 'Apple', category: 'produce' },
  { id: 'banana', name: 'Banana', category: 'produce' },
  { id: 'berries', name: 'Berries', category: 'produce', aliases: ['blueberry', 'raspberry', 'strawberry', 'mixed berries'] },
  { id: 'coriander', name: 'Coriander', category: 'produce', aliases: ['cilantro', 'fresh coriander'] },
  { id: 'parsley', name: 'Parsley', category: 'produce', aliases: ['flat leaf parsley', 'fresh parsley'] },
  { id: 'basil', name: 'Basil', category: 'produce', aliases: ['fresh basil', 'thai basil'] },
  { id: 'mint', name: 'Mint', category: 'produce', aliases: ['fresh mint'] },
  { id: 'dill', name: 'Dill', category: 'produce', aliases: ['fresh dill'] },
  { id: 'rosemary', name: 'Rosemary', category: 'produce' },
  { id: 'thyme', name: 'Thyme', category: 'produce' },
  { id: 'lemongrass', name: 'Lemongrass', category: 'produce' },

  // --------------------------------------------------------------- protein
  { id: 'chicken-breast', name: 'Chicken breast', category: 'protein', aliases: ['chicken fillet', 'boneless chicken', 'chicken'] },
  { id: 'chicken-thigh', name: 'Chicken thigh', category: 'protein', aliases: ['chicken leg', 'chicken drumstick'] },
  { id: 'beef-mince', name: 'Beef mince', category: 'protein', aliases: ['ground beef', 'minced beef', 'hamburger meat'] },
  { id: 'beef-steak', name: 'Beef steak', category: 'protein', aliases: ['steak', 'sirloin', 'ribeye', 'rump steak'] },
  { id: 'stewing-beef', name: 'Stewing beef', category: 'protein', aliases: ['beef chuck', 'braising steak', 'beef stew meat'] },
  { id: 'pork-mince', name: 'Pork mince', category: 'protein', aliases: ['ground pork', 'minced pork'] },
  { id: 'pork-chop', name: 'Pork chop', category: 'protein', aliases: ['pork loin'] },
  { id: 'bacon', name: 'Bacon', category: 'protein', aliases: ['streaky bacon', 'pancetta', 'bacon lardon'] },
  { id: 'sausage', name: 'Sausage', category: 'protein', aliases: ['pork sausage', 'italian sausage', 'chorizo'] },
  { id: 'lamb', name: 'Lamb', category: 'protein', aliases: ['lamb shoulder', 'lamb mince', 'ground lamb'] },
  { id: 'salmon', name: 'Salmon', category: 'protein', aliases: ['salmon fillet'], allergens: ['fish'] },
  { id: 'white-fish', name: 'White fish', category: 'protein', aliases: ['cod', 'haddock', 'pollock', 'tilapia', 'fish fillet'], allergens: ['fish'] },
  { id: 'tuna', name: 'Tuna', category: 'protein', aliases: ['canned tuna', 'tinned tuna'], allergens: ['fish'] },
  { id: 'prawns', name: 'Prawns', category: 'protein', aliases: ['shrimp', 'king prawn'], allergens: ['shellfish'] },
  { id: 'egg', name: 'Egg', category: 'protein', aliases: ['eggs', 'free range egg'], allergens: ['egg'] },
  { id: 'tofu', name: 'Tofu', category: 'protein', aliases: ['firm tofu', 'bean curd'], allergens: ['soy'] },
  { id: 'chickpeas', name: 'Chickpeas', category: 'protein', aliases: ['garbanzo bean', 'canned chickpeas'] },
  { id: 'black-beans', name: 'Black beans', category: 'protein', aliases: ['canned black beans'] },
  { id: 'kidney-beans', name: 'Kidney beans', category: 'protein', aliases: ['red kidney bean'] },
  { id: 'cannellini-beans', name: 'Cannellini beans', category: 'protein', aliases: ['white bean', 'butter bean', 'haricot bean'] },
  { id: 'red-lentils', name: 'Red lentils', category: 'protein', aliases: ['split red lentil', 'masoor dal'] },
  { id: 'green-lentils', name: 'Green lentils', category: 'protein', aliases: ['brown lentil', 'puy lentil'] },

  // ----------------------------------------------------------------- dairy
  { id: 'milk', name: 'Milk', category: 'dairy', aliases: ['whole milk', 'semi skimmed milk', 'dairy milk'], allergens: ['dairy'] },
  { id: 'butter', name: 'Butter', category: 'dairy', aliases: ['unsalted butter', 'salted butter'], allergens: ['dairy'] },
  { id: 'cheddar', name: 'Cheddar', category: 'dairy', aliases: ['cheddar cheese', 'mature cheddar', 'grated cheese'], allergens: ['dairy'] },
  { id: 'parmesan', name: 'Parmesan', category: 'dairy', aliases: ['parmigiano', 'pecorino', 'parmesan cheese'], allergens: ['dairy'] },
  { id: 'mozzarella', name: 'Mozzarella', category: 'dairy', aliases: ['mozzarella cheese', 'buffalo mozzarella'], allergens: ['dairy'] },
  { id: 'feta', name: 'Feta', category: 'dairy', aliases: ['feta cheese'], allergens: ['dairy'] },
  { id: 'cream-cheese', name: 'Cream cheese', category: 'dairy', aliases: ['soft cheese'], allergens: ['dairy'] },
  { id: 'double-cream', name: 'Double cream', category: 'dairy', aliases: ['heavy cream', 'whipping cream', 'single cream'], allergens: ['dairy'] },
  { id: 'sour-cream', name: 'Sour cream', category: 'dairy', aliases: ['creme fraiche'], allergens: ['dairy'] },
  { id: 'yoghurt', name: 'Yoghurt', category: 'dairy', aliases: ['yogurt', 'greek yoghurt', 'greek yogurt', 'natural yoghurt'], allergens: ['dairy'] },

  // ----------------------------------------------------------------- grain
  { id: 'rice', name: 'Rice', category: 'grain', aliases: ['white rice', 'basmati rice', 'jasmine rice', 'long grain rice'] },
  { id: 'arborio-rice', name: 'Arborio rice', category: 'grain', aliases: ['risotto rice', 'carnaroli rice'] },
  { id: 'pasta', name: 'Pasta', category: 'grain', aliases: ['spaghetti', 'penne', 'fusilli', 'linguine', 'rigatoni', 'macaroni', 'tagliatelle'], allergens: ['gluten'] },
  { id: 'lasagne-sheets', name: 'Lasagne sheets', category: 'grain', aliases: ['lasagna noodle', 'lasagne sheet'], allergens: ['gluten'] },
  { id: 'noodles', name: 'Noodles', category: 'grain', aliases: ['egg noodle', 'rice noodle', 'ramen noodle', 'udon'], allergens: ['gluten'] },
  { id: 'couscous', name: 'Couscous', category: 'grain', allergens: ['gluten'] },
  { id: 'quinoa', name: 'Quinoa', category: 'grain' },
  { id: 'oats', name: 'Oats', category: 'grain', aliases: ['rolled oat', 'porridge oat', 'oatmeal'], allergens: ['gluten'] },
  { id: 'flour', name: 'Plain flour', category: 'grain', aliases: ['all purpose flour', 'white flour', 'flour'], allergens: ['gluten'] },
  { id: 'breadcrumbs', name: 'Breadcrumbs', category: 'grain', aliases: ['panko', 'panko breadcrumb'], allergens: ['gluten'] },
  { id: 'tortilla', name: 'Tortilla', category: 'grain', aliases: ['flour tortilla', 'corn tortilla', 'wrap'], allergens: ['gluten'] },

  // ---------------------------------------------------------------- bakery
  { id: 'bread', name: 'Bread', category: 'bakery', aliases: ['sliced bread', 'sourdough', 'baguette', 'crusty bread', 'toast'], allergens: ['gluten'] },
  { id: 'pitta', name: 'Pitta bread', category: 'bakery', aliases: ['pita', 'pita bread', 'flatbread'], allergens: ['gluten'] },
  { id: 'burger-bun', name: 'Burger bun', category: 'bakery', aliases: ['brioche bun', 'bread roll', 'hamburger bun'], allergens: ['gluten'] },

  // ---------------------------------------------------------------- pantry
  { id: 'olive-oil', name: 'Olive oil', category: 'pantry', staple: true, aliases: ['extra virgin olive oil', 'evoo'] },
  { id: 'vegetable-oil', name: 'Vegetable oil', category: 'pantry', staple: true, aliases: ['sunflower oil', 'rapeseed oil', 'canola oil', 'cooking oil', 'oil'] },
  { id: 'sesame-oil', name: 'Sesame oil', category: 'pantry', aliases: ['toasted sesame oil'], allergens: ['sesame'] },
  { id: 'salt', name: 'Salt', category: 'spice', staple: true, aliases: ['sea salt', 'table salt', 'kosher salt', 'flaky salt'] },
  { id: 'black-pepper', name: 'Black pepper', category: 'spice', staple: true, aliases: ['pepper', 'ground black pepper', 'peppercorn'] },
  { id: 'sugar', name: 'Sugar', category: 'pantry', staple: true, aliases: ['caster sugar', 'granulated sugar', 'white sugar'] },
  { id: 'brown-sugar', name: 'Brown sugar', category: 'pantry', aliases: ['light brown sugar', 'dark brown sugar', 'muscovado'] },
  { id: 'honey', name: 'Honey', category: 'pantry', aliases: ['runny honey'] },
  { id: 'maple-syrup', name: 'Maple syrup', category: 'pantry' },
  { id: 'chopped-tomatoes', name: 'Chopped tomatoes', category: 'pantry', aliases: ['canned tomato', 'tinned tomato', 'crushed tomato', 'passata', 'plum tomatoes canned'] },
  { id: 'tomato-puree', name: 'Tomato purée', category: 'pantry', aliases: ['tomato paste', 'tomato puree'] },
  { id: 'coconut-milk', name: 'Coconut milk', category: 'pantry', aliases: ['canned coconut milk', 'coconut cream'] },
  { id: 'stock', name: 'Stock', category: 'pantry', staple: true, aliases: ['chicken stock', 'vegetable stock', 'beef stock', 'broth', 'stock cube', 'bouillon'] },
  { id: 'peanut-butter', name: 'Peanut butter', category: 'pantry', allergens: ['peanut'] },
  { id: 'nuts', name: 'Nuts', category: 'pantry', aliases: ['peanut', 'cashew', 'almond', 'walnut', 'pine nut', 'pecan'], allergens: ['peanut', 'tree-nut'] },
  { id: 'sesame-seeds', name: 'Sesame seeds', category: 'pantry', aliases: ['sesame seed'], allergens: ['sesame'] },
  { id: 'raisins', name: 'Raisins', category: 'pantry', aliases: ['sultana', 'dried fruit', 'currant'] },
  { id: 'olives', name: 'Olives', category: 'pantry', aliases: ['black olive', 'green olive', 'kalamata'] },
  { id: 'baking-powder', name: 'Baking powder', category: 'pantry', staple: true, aliases: ['bicarbonate of soda', 'baking soda'] },
  { id: 'vanilla', name: 'Vanilla extract', category: 'pantry', aliases: ['vanilla essence', 'vanilla'] },
  { id: 'cocoa', name: 'Cocoa powder', category: 'pantry', aliases: ['cacao powder', 'cocoa'] },
  { id: 'dark-chocolate', name: 'Dark chocolate', category: 'pantry', aliases: ['chocolate', 'chocolate chip'] },
  { id: 'yeast', name: 'Yeast', category: 'pantry', aliases: ['dried yeast', 'instant yeast', 'active dry yeast'] },
  { id: 'cornflour', name: 'Cornflour', category: 'pantry', aliases: ['cornstarch', 'corn starch'] },

  // ------------------------------------------------------------- condiment
  { id: 'soy-sauce', name: 'Soy sauce', category: 'condiment', aliases: ['light soy sauce', 'dark soy sauce', 'tamari'], allergens: ['soy', 'gluten'] },
  { id: 'fish-sauce', name: 'Fish sauce', category: 'condiment', aliases: ['nam pla'], allergens: ['fish'] },
  { id: 'oyster-sauce', name: 'Oyster sauce', category: 'condiment', allergens: ['shellfish'] },
  { id: 'vinegar', name: 'Vinegar', category: 'condiment', staple: true, aliases: ['white vinegar', 'red wine vinegar', 'white wine vinegar', 'cider vinegar', 'rice vinegar'] },
  { id: 'balsamic', name: 'Balsamic vinegar', category: 'condiment', aliases: ['balsamic'] },
  { id: 'mustard', name: 'Mustard', category: 'condiment', aliases: ['dijon mustard', 'wholegrain mustard', 'english mustard'], allergens: ['mustard'] },
  { id: 'mayonnaise', name: 'Mayonnaise', category: 'condiment', aliases: ['mayo'], allergens: ['egg'] },
  { id: 'ketchup', name: 'Ketchup', category: 'condiment', aliases: ['tomato ketchup'] },
  { id: 'sriracha', name: 'Sriracha', category: 'condiment', aliases: ['hot sauce', 'chilli sauce', 'tabasco'], spicy: true },
  { id: 'worcestershire', name: 'Worcestershire sauce', category: 'condiment', allergens: ['fish'] },
  { id: 'tahini', name: 'Tahini', category: 'condiment', aliases: ['sesame paste'], allergens: ['sesame'] },
  { id: 'harissa', name: 'Harissa', category: 'condiment', aliases: ['harissa paste'], spicy: true },
  { id: 'curry-paste', name: 'Curry paste', category: 'condiment', aliases: ['thai curry paste', 'red curry paste', 'green curry paste'], allergens: ['shellfish'], spicy: true },
  { id: 'pesto', name: 'Pesto', category: 'condiment', aliases: ['basil pesto', 'green pesto'], allergens: ['dairy', 'tree-nut'] },
  { id: 'wine', name: 'Wine', category: 'condiment', aliases: ['white wine', 'red wine', 'cooking wine'] },

  // ----------------------------------------------------------------- spice
  { id: 'cumin', name: 'Cumin', category: 'spice', aliases: ['ground cumin', 'cumin seed'] },
  { id: 'coriander-seed', name: 'Ground coriander', category: 'spice', aliases: ['coriander powder', 'coriander seed'] },
  { id: 'turmeric', name: 'Turmeric', category: 'spice', aliases: ['ground turmeric'] },
  { id: 'paprika', name: 'Paprika', category: 'spice', aliases: ['smoked paprika', 'sweet paprika'] },
  { id: 'chilli-powder', name: 'Chilli powder', category: 'spice', aliases: ['chili powder', 'cayenne', 'chilli flake', 'red pepper flake'], spicy: true },
  { id: 'garam-masala', name: 'Garam masala', category: 'spice' },
  { id: 'curry-powder', name: 'Curry powder', category: 'spice', aliases: ['madras curry powder'] },
  { id: 'cinnamon', name: 'Cinnamon', category: 'spice', aliases: ['ground cinnamon', 'cinnamon stick'] },
  { id: 'oregano', name: 'Oregano', category: 'spice', aliases: ['dried oregano'] },
  { id: 'mixed-herbs', name: 'Mixed herbs', category: 'spice', aliases: ['italian seasoning', 'herbes de provence', 'dried herb'] },
  { id: 'bay-leaf', name: 'Bay leaf', category: 'spice' },
  { id: 'nutmeg', name: 'Nutmeg', category: 'spice', aliases: ['ground nutmeg'] },
  { id: 'cardamom', name: 'Cardamom', category: 'spice', aliases: ['green cardamom', 'cardamom pod'] },
  { id: 'star-anise', name: 'Star anise', category: 'spice' },
  { id: 'five-spice', name: 'Five spice', category: 'spice', aliases: ['chinese five spice'] },
  { id: 'saffron', name: 'Saffron', category: 'spice' },

  // ----------------------------------------------------------------- other
  { id: 'water', name: 'Water', category: 'other', staple: true },
];
