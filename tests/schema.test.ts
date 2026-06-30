import { describe, expect, it } from 'vitest';
import type { NormalizedMenu } from '../src/types/dining.js';

describe('normalized menu schema', () => {
  it('supports nutrition, ingredients, allergens, dietary tags, and provenance', () => {
    const menu: NormalizedMenu = {
      schoolId: 'georgia-tech',
      providerKind: 'vendor_nutrislice',
      sourceUrl: 'https://techdining.nutrislice.com/m/',
      fetchedAt: '2026-06-29T11:30:00.000Z',
      freshnessMinutes: 0,
      locations: [
        {
          id: 'north-ave',
          name: 'North Avenue Dining Hall',
          sourceLocationId: 'north-ave',
          timezone: 'America/New_York',
          date: '2026-06-29',
          periods: [
            {
              id: 'lunch',
              name: 'Lunch',
              startTime: '11:00',
              endTime: '14:00',
              stations: [
                {
                  id: 'grill',
                  name: 'Grill',
                  items: [
                    {
                      id: 'grill-black-bean-burger',
                      sourceItemId: '123',
                      name: 'Black Bean Burger',
                      normalizedName: 'black bean burger',
                      description: 'Black bean patty on a bun',
                      category: 'entree',
                      stationId: 'grill',
                      stationName: 'Grill',
                      servingSizeText: '1 sandwich',
                      availability: {
                        status: 'planned',
                        startTime: '11:00',
                        endTime: '14:00',
                      },
                      dietaryTags: ['vegetarian'],
                      allergens: [
                        {
                          key: 'wheat',
                          label: 'Wheat',
                          status: 'contains',
                        },
                      ],
                      ingredientStatement: 'Black beans, wheat bun, spices',
                      ingredients: [
                        {
                          name: 'Black beans',
                          normalizedName: 'black beans',
                        },
                        {
                          name: 'Wheat bun',
                          normalizedName: 'wheat bun',
                          containsAllergenKeys: ['wheat'],
                        },
                      ],
                      nutrition: [
                        {
                          key: 'calories',
                          label: 'Calories',
                          amount: 420,
                          unit: 'kcal',
                        },
                        {
                          key: 'sodium',
                          label: 'Sodium',
                          amount: 760,
                          unit: 'mg',
                          dailyValuePercent: 33,
                        },
                      ],
                      sourceUrl: 'https://techdining.nutrislice.com/m/',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const item = menu.locations[0]?.periods[0]?.stations[0]?.items[0];

    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(420);
    expect(item?.ingredients[1]?.containsAllergenKeys).toContain('wheat');
    expect(item?.allergens[0]?.status).toBe('contains');
  });
});
