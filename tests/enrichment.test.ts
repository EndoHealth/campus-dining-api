import { describe, expect, it } from 'vitest';
import { allergenKeysInIngredientText } from '../src/providers/allergen-text.js';
import {
  enrichMenuAllergensFromIngredients,
  enrichMenuDietaryTagsFromSourceText,
} from '../src/providers/enrichment.js';
import type { NormalizedMenu, NormalizedMenuItem } from '../src/types/dining.js';

describe('provider enrichment', () => {
  it('matches source ingredient allergens without substring false positives', () => {
    expect(allergenKeysInIngredientText('Whole Eggs, Salt')).toEqual(['egg']);
    expect(allergenKeysInIngredientText('soybean oil')).toEqual(['soy']);
    expect(allergenKeysInIngredientText('wheat flour')).toEqual(['wheat']);
    expect(allergenKeysInIngredientText('Eggplant, zucchini, squash')).toEqual([]);
    expect(allergenKeysInIngredientText('gluten free bread')).toEqual([]);
    expect(allergenKeysInIngredientText('Not manufactured with wheat, gluten, soy, or milk ingredients')).toEqual([]);
  });

  it('derives item allergens from source ingredient allergen keys only when explicit allergens are absent', () => {
    const menu = makeMenu([
      makeItem({
        id: 'explicit',
        allergens: [
          {
            key: 'soy',
            label: 'Soy',
            status: 'contains',
            sourceText: 'Soy',
          },
        ],
        ingredients: [
          {
            name: 'Whole Milk',
            containsAllergenKeys: ['milk'],
            sourceText: 'Whole Milk',
          },
        ],
      }),
      makeItem({
        id: 'derived',
        allergens: [],
        ingredients: [
          {
            name: 'Whole Milk',
            containsAllergenKeys: ['milk'],
            sourceText: 'Whole Milk',
          },
          {
            name: 'Wheat Flour',
            containsAllergenKeys: ['wheat', 'gluten'],
            sourceText: 'Wheat Flour',
          },
        ],
      }),
    ]);

    const items = flattenItems(enrichMenuAllergensFromIngredients(menu));

    expect(items[0]?.allergens.map((allergen) => allergen.key)).toEqual(['soy']);
    expect(items[1]?.allergens.map((allergen) => allergen.key)).toEqual([
      'milk',
      'wheat',
      'gluten',
    ]);
    expect(items[1]?.allergens[0]?.sourceText).toContain('Derived from source ingredients');
  });

  it('adds conservative dietary tags from item names and exact program labels', () => {
    const menu = makeMenu([
      makeItem({
        id: 'name',
        name: 'Gluten Free Vegan Brownie',
      }),
      makeItem({
        id: 'program',
        name: 'Roasted Potatoes',
        stationName: 'Halal Lunch',
      }),
      makeItem({
        id: 'ingredient-noise',
        name: 'Dill Pickle Spear',
        ingredientStatement: 'Cucumber, kosher salt',
      }),
      makeItem({
        id: 'station-noise',
        name: 'Eel Sauce',
        stationName: 'Spicy Tuna Poke Bowl Toppings',
      }),
    ]);

    const items = flattenItems(enrichMenuDietaryTagsFromSourceText(menu));

    expect(items[0]?.dietaryTags).toEqual(['vegan', 'gluten_free']);
    expect(items[1]?.dietaryTags).toEqual(['halal']);
    expect(items[2]?.dietaryTags).toEqual([]);
    expect(items[3]?.dietaryTags).toEqual([]);
  });
});

function makeMenu(items: NormalizedMenuItem[]): NormalizedMenu {
  return {
    schoolId: 'test',
    providerKind: 'official_api',
    sourceUrl: 'https://example.test',
    fetchedAt: '2026-06-29T00:00:00.000Z',
    locations: [
      {
        id: 'location',
        name: 'Location',
        date: '2026-06-29',
        periods: [
          {
            id: 'period',
            name: 'Lunch',
            stations: [
              {
                id: 'station',
                name: 'Station',
                items,
              },
            ],
          },
        ],
      },
    ],
  };
}

function makeItem(item: Partial<NormalizedMenuItem> & Pick<NormalizedMenuItem, 'id'>): NormalizedMenuItem {
  return {
    sourceItemId: item.id,
    name: item.id,
    availability: {
      status: 'planned',
    },
    dietaryTags: [],
    allergens: [],
    ingredients: [],
    nutrition: [],
    sourceUrl: 'https://example.test',
    ...item,
  };
}

function flattenItems(menu: NormalizedMenu) {
  return menu.locations.flatMap((location) =>
    location.periods.flatMap((period) => period.stations.flatMap((station) => station.items))
  );
}
