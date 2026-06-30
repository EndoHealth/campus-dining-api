import type {
  AllergenFact,
  AllergenKey,
  DietaryTag,
  NormalizedMenu,
  NormalizedMenuItem,
} from '../types/dining.js';

const ALLERGEN_LABELS: Record<AllergenKey, string> = {
  milk: 'Milk',
  egg: 'Egg',
  fish: 'Fish',
  crustacean_shellfish: 'Crustacean Shellfish',
  tree_nut: 'Tree Nut',
  peanut: 'Peanut',
  wheat: 'Wheat',
  soy: 'Soy',
  sesame: 'Sesame',
  gluten: 'Gluten',
  other: 'Other',
};

export function enrichMenuAllergensFromIngredients(menu: NormalizedMenu): NormalizedMenu {
  return {
    ...menu,
    locations: menu.locations.map((location) => ({
      ...location,
      periods: location.periods.map((period) => ({
        ...period,
        stations: period.stations.map((station) => ({
          ...station,
          items: station.items.map(enrichItemAllergensFromIngredients),
        })),
      })),
    })),
  };
}

export function enrichMenuDietaryTagsFromSourceText(menu: NormalizedMenu): NormalizedMenu {
  return {
    ...menu,
    locations: menu.locations.map((location) => ({
      ...location,
      periods: location.periods.map((period) => ({
        ...period,
        stations: period.stations.map((station) => ({
          ...station,
          items: station.items.map(enrichItemDietaryTagsFromSourceText),
        })),
      })),
    })),
  };
}

function enrichItemAllergensFromIngredients(item: NormalizedMenuItem): NormalizedMenuItem {
  if (item.allergens.length > 0 || item.ingredients.length === 0) return item;

  const ingredientNamesByKey = new Map<AllergenKey, string[]>();
  for (const ingredient of item.ingredients) {
    for (const key of ingredient.containsAllergenKeys ?? []) {
      if (key === 'other') continue;
      const names = ingredientNamesByKey.get(key) ?? [];
      names.push(ingredient.name);
      ingredientNamesByKey.set(key, names);
    }
  }

  if (ingredientNamesByKey.size === 0) return item;

  const allergens: AllergenFact[] = [...ingredientNamesByKey.entries()].map(([key, names]) => ({
    key,
    label: ALLERGEN_LABELS[key],
    status: 'contains',
    sourceText: `Derived from source ingredients: ${dedupe(names).join('; ')}`,
  }));

  return {
    ...item,
    allergens,
  };
}

function enrichItemDietaryTagsFromSourceText(item: NormalizedMenuItem): NormalizedMenuItem {
  const tags = [
    ...item.dietaryTags,
    ...dietaryTagsFromItemName(item.name),
    ...dietaryTagsFromProgramLabel(item.category),
    ...dietaryTagsFromProgramLabel(item.stationName),
  ];
  const deduped = dedupe(tags);

  if (deduped.length === item.dietaryTags.length) return item;

  return {
    ...item,
    dietaryTags: deduped,
  };
}

function dietaryTagsFromItemName(name: string): DietaryTag[] {
  const value = name.toLowerCase();
  const tags: DietaryTag[] = [];

  if (/\bvegan\b/.test(value)) tags.push('vegan');
  if (/\bvegetarian\b/.test(value)) tags.push('vegetarian');
  if (/\bhalal\b/.test(value)) tags.push('halal');
  if (/\bgluten[-\s]?free\b|\bgf\b/.test(value)) tags.push('gluten_free');
  if (/\bgluten[-\s]?friendly\b|\bmade without gluten\b/.test(value)) tags.push('made_without_gluten');
  if (/\bspicy\b/.test(value)) tags.push('spicy');

  return tags;
}

function dietaryTagsFromProgramLabel(label?: string): DietaryTag[] {
  const value = label?.trim().toLowerCase();
  if (!value) return [];

  if (/^(vegan|vegan station|plant[-\s]?based)$/.test(value)) return ['vegan'];
  if (/^(vegetarian|vegetarian option|vegetarian station)$/.test(value)) return ['vegetarian'];
  if (/^halal( station| breakfast| lunch| dinner)?$/.test(value)) return ['halal'];
  if (/^kosher( station| comfort(?:\s*-.*)?)?$/.test(value)) return ['kosher'];
  if (/^(gluten[-\s]?free|gluten friendly)( station)?$/.test(value)) return ['made_without_gluten'];

  return [];
}

function dedupe<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}
