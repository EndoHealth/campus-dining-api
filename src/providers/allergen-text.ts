import type { AllergenKey } from '../types/dining.js';

const INGREDIENT_ALLERGEN_PATTERNS: Array<[AllergenKey, RegExp[]]> = [
  ['milk', [/\bmilk\b/i, /\bdairy\b/i]],
  ['egg', [/\beggs?\b/i]],
  ['fish', [/\bfish\b/i]],
  ['crustacean_shellfish', [/\bshellfish\b/i, /\bcrustacean\b/i, /\bshrimp\b/i, /\bcrab\b/i, /\blobster\b/i]],
  ['tree_nut', [/\btree nuts?\b/i, /\balmonds?\b/i, /\bwalnuts?\b/i, /\bcashews?\b/i, /\bpecans?\b/i]],
  ['peanut', [/\bpeanuts?\b/i]],
  ['wheat', [/\bwheat\b/i]],
  ['soy', [/\bsoy(?:beans?)?\b/i]],
  ['sesame', [/\bsesame\b/i]],
  ['gluten', [/\bgluten\b/i]],
];

const MADE_WITHOUT_PATTERN =
  /\b(gluten|dairy|milk|egg|nut|peanut|soy|wheat|sesame)[-\s]?free\b|\bmade without\b|\bnot manufactured with\b|\bnot made with\b|\bdoes not contain\b/i;

export function allergenKeysInIngredientText(value: string): AllergenKey[] {
  if (MADE_WITHOUT_PATTERN.test(value)) return [];

  const keys = new Set<AllergenKey>();
  for (const [key, patterns] of INGREDIENT_ALLERGEN_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(value))) keys.add(key);
  }

  return [...keys];
}
