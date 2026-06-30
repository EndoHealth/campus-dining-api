import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOP_50_SCHOOLS } from '../src/data/top50-schools.js';
import { getProviderAdapter } from '../src/providers/registry.js';
import {
  normalizeColumbiaMenuFromPageData,
  parseNorthwesternFlikPdfText,
} from '../src/providers/official-html.js';
import { parseCmuStaticMenuText } from '../src/providers/student-api.js';

describe('provider adapters', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it(
    'fetches and normalizes Dartmouth public menuapi nutrition, ingredients, and allergens',
    async () => {
      const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'dartmouth');
      expect(school).toBeDefined();

      const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
        date: '2026-06-29',
        meal: 'Specials',
      });

      expect(result.state).toBe('adapter_ready');
      if (result.state !== 'adapter_ready') return;

      const items = result.data.locations.flatMap((location) =>
        location.periods.flatMap((period) => period.stations.flatMap((station) => station.items))
      );

      expect(items.length).toBeGreaterThan(0);
      expect(items.some((item) => item.nutrition.length > 0)).toBe(true);
      expect(items.some((item) => item.ingredients.length > 0)).toBe(true);
      expect(items.some((item) => item.allergens.length > 0)).toBe(true);
    },
    25000
  );

  it('returns an explicit pending reason for DineOnCampus schools', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'uchicago');
    expect(school).toBeDefined();

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-30',
    });

    expect(result.state).toBe('adapter_pending');
    if (result.state === 'adapter_ready') return;

    expect(result.provider).toBe('vendor_dineoncampus');
    expect(result.reason).toContain('Cloudflare 403');
    expect(result.error).toBe('cloudflare_403_direct_fetch');
  });

  it('normalizes Nutrislice source tags conservatively', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'yale');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/menu/api/schools/')) {
          return new Response(
            JSON.stringify([
              {
                id: 1,
                name: 'Test College',
                slug: 'test-college',
                active_menu_types: [
                  {
                    id: 2,
                    name: 'Lunch',
                    slug: 'lunch',
                    urls: {
                      full_menu_by_date_api_url_template:
                        '/menu/api/weeks/school/test-college/menu-type/lunch/{year}/{month}/{day}/',
                    },
                  },
                ],
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (url.includes('/menu/api/weeks/school/test-college/menu-type/lunch/2026/06/30/')) {
          return new Response(
            JSON.stringify({
              last_updated: '2026-06-30T12:00:00Z',
              days: [
                {
                  date: '2026-06-30',
                  menu_items: [
                    { id: 10, text: 'Entrees', is_station_header: true, station_id: 99 },
                    {
                      id: 11,
                      station_id: 99,
                      food: {
                        id: 20,
                        name: 'Allergen Friendly Rice Bowl',
                        ingredients: 'Rice, salt',
                        rounded_nutrition_info: {
                          calories: 100,
                        },
                        icons: {
                          food_icons: [
                            { slug: 'top-9-free' },
                            { slug: 'no-gluten' },
                            { slug: 'gluten-friendly' },
                            { slug: 'meatless' },
                            { slug: 'low-carbon-footprint' },
                            { slug: 'jain' },
                          ],
                        },
                        tags: [{ slug: 'climate-friendly' }, { slug: '9-in-mind' }],
                      },
                    },
                  ],
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('unexpected request', { status: 500 });
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-30',
      locationId: 'test-college',
      meal: 'lunch',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const item = result.data.locations[0]?.periods[0]?.stations[0]?.items[0];
    expect(item?.dietaryTags).toEqual([
      'made_without_gluten',
      'vegetarian',
      'low_carbon',
      'other',
    ]);
    expect(item?.allergens.filter((allergen) => allergen.status === 'made_without').map((allergen) => allergen.key)).toEqual([
      'milk',
      'egg',
      'fish',
      'crustacean_shellfish',
      'tree_nut',
      'peanut',
      'wheat',
      'soy',
      'sesame',
      'gluten',
    ]);
  });

  it('normalizes Berkeley menu AJAX details with nutrition, ingredients, and allergens', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'uc-berkeley');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const params = new URLSearchParams(String(init?.body ?? ''));
        const action = params.get('action');

        if (action === 'cald_filter_xml') {
          return new Response(
            `
              <ul class="cafe-location">
                <li class="location-name Clark Kerr Campus 20260629">
                  <div class="location-title">
                    <span class="cafe-title">Clark Kerr</span>
                    <span class="status Now Closed">Now Closed</span>
                  </div>
                  <div class="status-period-wrap">
                    <div class="cafe-status">
                      <div class="times"><span>7:30 a.m. - 10:00 a.m.</span></div>
                      <span class="serve-date">Mon, Jun 29</span>
                    </div>
                    <ul class="meal-period">
                      <li class="preiod-name Summer - Breakfast">
                        <span>Summer - Breakfast <span class="accordion-icon"></span></span>
                        <div class="recipes-main-wrap">
                          <div class="cat-name">
                            <span>Breakfast</span>
                            <ul class="recipe-name">
                              <li class="recip egg vegetarian-option"
                                data-location="encoded-menu"
                                data-id="556"
                                data-menuid="333">
                                <span>Scrambled Eggs</span>
                                <span class="icons-wrap">
                                  <span class="food-icon"><img alt="Egg" /><span class="allg-tooltip">Egg</span></span>
                                  <span class="food-icon"><img alt="Vegetarian Option" /><span class="allg-tooltip">Vegetarian Option</span></span>
                                  <span class="food-icon"><img alt="co2" /><span class="allg-tooltip">Low Carbon Footprint</span></span>
                                </span>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </li>
                    </ul>
                  </div>
                </li>
              </ul>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (action === 'get_recipe_details') {
          return new Response(
            `
              <div class="title sec">
                <h5>Scrambled Eggs</h5>
                <span class="serving-size">Serving Size: 3.93 oz</span>
              </div>
              <div class="nutration-details sec">
                <h4>Nutrition Facts</h4>
                <ul>
                  <li><span>Calories (kcal):</span>184.98</li>
                  <li><span>Total Lipid/Fat (g):</span>12.88</li>
                  <li><span>Sodium (mg):</span>167.04</li>
                  <li><span>Sugar (g):</span>0</li>
                </ul>
              </div>
              <div class="ingredients sec">
                <h4>Ingredients</h4>
                <span class="content">Egg Liquid (Cage Free Whole Eggs, Citric Acid);Oil Cooking Blend;Spice Salt Kosher;</span>
              </div>
              <div class="allergens sec">
                <h4>Allergens:</h4>
                <span>Egg</span>
              </div>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        return new Response('unexpected request', { status: 500 });
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'clark',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const item = result.data.locations[0]?.periods[0]?.stations[0]?.items[0];
    expect(item?.name).toBe('Scrambled Eggs');
    expect(item?.servingSizeText).toBe('3.93 oz');
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(184.98);
    expect(item?.nutrition.find((fact) => fact.key === 'total_fat')?.amount).toBe(12.88);
    expect(item?.nutrition.find((fact) => fact.key === 'total_sugars')?.amount).toBe(0);
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Egg Liquid (Cage Free Whole Eggs, Citric Acid)',
      'Oil Cooking Blend',
      'Spice Salt Kosher',
    ]);
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual(['egg']);
    expect(item?.dietaryTags).toEqual(['vegetarian', 'low_carbon']);
  });

  it('normalizes UC Davis dining commons HTML with nutrition, ingredients, allergens, and icons', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'uc-davis');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe('https://housing.ucdavis.edu/dining/dining-commons/tercero/');

        return new Response(
          `
            <div id="monday" class="tab-pane fade active in">
              <h2 class="stickyMealHeader">Breakfast</h2>
              <div class="row">
                <div class="col-xs-12 col-lg-2 yellow">
                  <h3>Yellow Zone</h3>
                  <a class="collapsed nutrition-panel" href="#collapse1">Build Your Own Omelette</a>
                  <div id="collapse1">
                    <div class="mealDetails">
                      <p class="underline">Eggs with Assorted Meats and Vegetables</p>
                      <img alt="Vegetarian" src="/img/vegetarian.png" />
                      <p class="underline"><strong>Contains</strong>: Dairy, Egg, Soybean Oil.</p>
                      <p class="underline"><strong>Serving Size</strong>: 100 g</p>
                      <p class="underline"><strong>Calories</strong>: 86.47</p>
                      <p class="underline"><strong>Fat (g)</strong>: 4.71</p>
                      <p class="underline"><strong>Carbohydrates (g)</strong>: 4.89</p>
                      <p class="underline"><strong>Sugar</strong>: 2.69</p>
                      <p class="underline"><strong>Protein (g)</strong>: 6.95</p>
                      <p class="underline"><strong>Ingredients</strong>: Salsa Verde (Tomatillos, Onion), Canola Salad Oil</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `,
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'tercero',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const location = result.data.locations[0];
    const period = location?.periods[0];
    const station = period?.stations[0];
    const item = station?.items[0];

    expect(location?.name).toBe('Tercero DC');
    expect(period?.name).toBe('Breakfast');
    expect(station?.name).toBe('Yellow Zone');
    expect(item?.name).toBe('Build Your Own Omelette');
    expect(item?.description).toBe('Eggs with Assorted Meats and Vegetables');
    expect(item?.servingSizeText).toBe('100 g');
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(86.47);
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.unit).toBe('kcal');
    expect(item?.nutrition.find((fact) => fact.key === 'total_fat')?.amount).toBe(4.71);
    expect(item?.nutrition.find((fact) => fact.key === 'total_fat')?.unit).toBe('g');
    expect(item?.nutrition.find((fact) => fact.key === 'total_carbohydrate')?.amount).toBe(4.89);
    expect(item?.nutrition.find((fact) => fact.key === 'total_sugars')?.amount).toBe(2.69);
    expect(item?.nutrition.find((fact) => fact.key === 'protein')?.amount).toBe(6.95);
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Salsa Verde (Tomatillos, Onion)',
      'Canola Salad Oil',
    ]);
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual(['milk', 'egg', 'soy']);
    expect(item?.dietaryTags).toEqual(['vegetarian']);
  });

  it('normalizes Caltech published Google Sheets meal plan menus', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'caltech');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === 'https://dining.caltech.edu/student-meal-plan') {
          return new Response(
            `<a href="https://caltechdining.my.canva.site/meal-plan-menus">Meal Plan Menus</a>`,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url === 'https://caltechdining.my.canva.site/meal-plan-menus') {
          return new Response(
            `<a href="https://caltechdining.my.canva.site/mealplanmenu">This Week</a>`,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url === 'https://caltechdining.my.canva.site/mealplanmenu') {
          return new Response(
            `
              <script>
                window.page = {
                  embed: "https://docs.google.com/spreadsheets/d/e/test-sheet/pubhtml?gid=111&single=true&widget=true&headers=false"
                };
              </script>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url === 'https://caltechdining.my.canva.site/next-week-meal-plan') {
          return new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
        }

        if (url === 'https://docs.google.com/spreadsheets/d/e/test-sheet/pub?gid=111&single=true&output=csv') {
          return new Response(
            [
              'Monday,,6/29/2026',
              'Entree One,,Pasta',
              'Allergens: ,,"Milk, Wheat"',
              'Vegetarian Entree,,Pasta Sauce Two',
              'Allergens: ,,Soy',
              'Vegan Entree,,Soup of the Day',
              'Allergens: ,,',
            ].join('\r\n'),
            { status: 200, headers: { 'content-type': 'text/csv' } }
          );
        }

        return new Response(`unexpected request: ${url}`, { status: 500 });
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const location = result.data.locations[0];
    const period = location?.periods[0];
    const items = period?.stations[0]?.items ?? [];

    expect(location?.name).toBe('Caltech Meal Plan');
    expect(period?.name).toBe('Meal Plan');
    expect(items.map((item) => item.name)).toEqual(['Pasta', 'Pasta Sauce Two', 'Soup of the Day']);
    expect(items[0]?.allergens.map((allergen) => allergen.key)).toEqual(['milk', 'wheat']);
    expect(items[1]?.dietaryTags).toEqual(['vegetarian']);
    expect(items[1]?.allergens.map((allergen) => allergen.key)).toEqual(['soy']);
    expect(items[2]?.dietaryTags).toEqual(['vegan']);
    expect(items[0]?.nutrition).toEqual([]);
    expect(items[0]?.ingredients).toEqual([]);
  });

  it('normalizes Michigan MaizeMeals Supabase menu events with nutrition and dietary tags', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'michigan');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === 'https://www.maizemeals.com/') {
          return new Response('<script src="/_next/static/chunks/app.js"></script>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        }

        if (url === 'https://www.maizemeals.com/_next/static/chunks/app.js') {
          return new Response(
            'const supabaseUrl="https://test.supabase.co";const anon="eyJabc.eyJdef.signature";',
            { status: 200, headers: { 'content-type': 'application/javascript' } }
          );
        }

        if (url.startsWith('https://test.supabase.co/rest/v1/menu_events?')) {
          expect((init?.headers as Record<string, string>).apikey).toBe('eyJabc.eyJdef.signature');
          return new Response(
            JSON.stringify([
              {
                id: 'event-1',
                item_id: 'item-1',
                dining_hall_id: 'hall-1',
                meal: 'Lunch',
                date: '2026-09-02',
                start_time: '10:30:00',
                end_time: '16:30:00',
                items: {
                  id: 'item-1',
                  name: 'Cinnamon Swirl Bread',
                  normalized_name: 'cinnamon swirl bread',
                  macronutrients: {
                    Calories: 190,
                    Protein: 5,
                    'Total Carbohydrate': 35,
                    'Total Fat': 3,
                    Sodium: 224,
                  },
                  dietary_tags: ['carbonlow', 'vegetarian'],
                  station: 'Toast',
                  serving_size: 'Slice',
                  item_type: 'food',
                  is_mhealthy: true,
                  updated_at: '2026-04-12T22:12:47.696461+00:00',
                },
                dining_halls: {
                  id: 'hall-1',
                  name: 'East Quad Dining Hall',
                  slug: 'east-quad',
                  official_id: 10001,
                  address: '701 East University Ave, Ann Arbor, MI',
                },
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response(`unexpected request: ${url}`, { status: 500 });
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-09-02',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const location = result.data.locations[0];
    const period = location?.periods[0];
    const station = period?.stations[0];
    const item = station?.items[0];

    expect(result.data.providerKind).toBe('student_api');
    expect(location?.name).toBe('East Quad Dining Hall');
    expect(location?.address).toBe('701 East University Ave, Ann Arbor, MI');
    expect(period?.name).toBe('Lunch');
    expect(station?.name).toBe('Toast');
    expect(item?.name).toBe('Cinnamon Swirl Bread');
    expect(item?.servingSizeText).toBe('Slice');
    expect(item?.dietaryTags).toEqual(['low_carbon', 'vegetarian', 'other']);
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(190);
    expect(item?.nutrition.find((fact) => fact.key === 'protein')?.unit).toBe('g');
    expect(item?.ingredients).toEqual([]);
    expect(item?.allergens).toEqual([]);
  });

  it('parses CMU static menu PDF text into conservative priced menu items', () => {
    const items = parseCmuStaticMenuText(`
      BOWLS STARTING AT $12.15
      Avocado: $3.09
      Corned Beef $8.40
      Turkey $ 8 .0 5
      with Small 8 oz. Soup $8.40
      Tempeh Wrap $8.00
      Entrée of the Day $9.05
    `);

    expect(items.map((item) => item.name)).toEqual([
      'Corned Beef',
      'Turkey',
      'Tempeh Wrap',
      'Entrée of the Day',
    ]);
    expect(items.find((item) => item.name === 'Turkey')?.price).toBe(8.05);
  });

  it('parses Northwestern Flik weekly PDF text into conservative station items', () => {
    const items = parseNorthwesternFlikPdfText(`
      M
      T
      Before placing your order, please inform your server
      Comfort:
      Slow Roasted Porchetta, Salsa Verde, Lemon, Parsley, Capers
      Charred Asparagus, Pesto Risotto, Broiled Cherry Tomatoes, Herbs
      Vegetarian Option:
      Creamy Polenta, Mushroom Ragout
      Soup   Avocado, Roasted Corn, Gaspacho / Asparagus, Leek, Potato FIT
      Deli      Roasted Red Pepper Hummus, Artichokes, Spinach, Mayo, on Thin Bread
      Grill      Pulled Pork Sloppy Joe, Cheddar, Tabasco Frizzled Onions
      Action      Closed
      Pizza      Mushroom, Spinach, Fontina ,Pizza
      Monday - Friday
      Breakfast Hours:
      8:00AM - 10:30AM
    `);

    expect(items.map((item) => `${item.stationName}:${item.name}`)).toEqual([
      'Comfort:Slow Roasted Porchetta, Salsa Verde, Lemon, Parsley, Capers',
      'Comfort:Charred Asparagus, Pesto Risotto, Broiled Cherry Tomatoes, Herbs',
      'Vegetarian Option:Creamy Polenta, Mushroom Ragout',
      'Soup:Avocado, Roasted Corn, Gaspacho',
      'Soup:Asparagus, Leek, Potato',
      'Deli:Roasted Red Pepper Hummus, Artichokes, Spinach, Mayo, on Thin Bread',
      'Grill:Pulled Pork Sloppy Joe, Cheddar, Tabasco Frizzled Onions',
      'Pizza:Mushroom, Spinach, Fontina Pizza',
    ]);
  });

  it('normalizes Columbia official menu_data into periods, stations, dietary tags, and allergens', () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'columbia');
    expect(school).toBeDefined();

    const menu = normalizeColumbiaMenuFromPageData(
      school!,
      { date: '2026-06-29' },
      {
        sourceUrl: school!.sourceUrl,
        diningNodes: JSON.stringify({
          locations: [
            {
              nid: '10',
              title: 'John Jay Dining Hall',
              path: '/content/john-jay-dining-hall',
              address: '<p>519 W 114th St, New York, NY 10027</p>',
            },
          ],
        }),
        diningTerms: JSON.stringify({
          types: {
            '6': { name: 'Breakfast', tid: '6' },
            '7': { name: 'Lunch', tid: '7' },
          },
          stations: {
            '24': { name: 'Main Line', tid: '24' },
            '29': { name: 'Vegan Station', tid: '29' },
          },
        }),
        menuData: JSON.stringify([
          {
            nid: '17169',
            title: 'Summer John Jay Week 1 Monday 6/29/26',
            locations: ['10'],
            date_range_fields: [
              {
                date_from: '2026-06-29T09:00:00',
                date_to: '2026-06-29T14:59:00',
                menu_type: ['6'],
                stations: [
                  {
                    station: ['24'],
                    meals_paragraph: [
                      {
                        title: 'Scrambled Eggs',
                        prefs: ['Gluten Free', 'Halal', 'Vegetarian'],
                        allergens: ['Eggs'],
                      },
                    ],
                  },
                  {
                    station: ['29'],
                    meals_paragraph: [
                      {
                        title: 'Tofu Scramble',
                        prefs: ['Gluten Free', 'Halal', 'Vegan'],
                        allergens: ['Soy'],
                      },
                    ],
                  },
                ],
              },
              {
                date_from: '2026-06-29T15:00:00',
                date_to: '2026-06-29T20:59:00',
                menu_type: ['7'],
                stations: [
                  {
                    station: ['24'],
                    meals_paragraph: [
                      {
                        title: 'Marry Me Chicken',
                        prefs: ['Gluten Free', 'Halal'],
                        allergens: ['Dairy'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]),
      },
      '2026-06-29T12:00:00.000Z'
    );

    expect(menu.locations[0]?.name).toBe('John Jay Dining Hall');
    expect(menu.locations[0]?.address).toBe('519 W 114th St, New York, NY 10027');
    expect(menu.locations[0]?.periods.map((period) => period.name)).toEqual(['Breakfast', 'Lunch']);

    const breakfastItems = menu.locations[0]?.periods[0]?.stations.flatMap((station) => station.items);
    expect(breakfastItems?.map((item) => item.name)).toEqual(['Scrambled Eggs', 'Tofu Scramble']);
    expect(breakfastItems?.[0]?.dietaryTags).toEqual(['gluten_free', 'halal', 'vegetarian']);
    expect(breakfastItems?.[0]?.allergens.map((allergen) => allergen.key)).toEqual(['egg']);
    expect(breakfastItems?.[1]?.dietaryTags).toEqual(['gluten_free', 'halal', 'vegan']);
    expect(breakfastItems?.[1]?.allergens.map((allergen) => allergen.key)).toEqual(['soy']);
  });

  it('normalizes Duke NetNutrition menus with nutrition labels, ingredients, allergens, and icons', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'duke');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === 'https://netnutrition.cbord.com/nn-prod/duke' && !init?.method) {
          return new Response('', {
            status: 302,
            headers: {
              location: '/nn-prod/Duke',
              'set-cookie': 'ASP.NET_SessionId=test-session; path=/; HttpOnly',
            },
          });
        }

        if (url.endsWith('/Unit/SelectUnitFromSideBar')) {
          expect(String(init?.body)).toBe('unitOid=3');
          return new Response(
            JSON.stringify({
              success: true,
              panels: [
                {
                  id: 'menuPanel',
                  html: `
                    <section class="card mb-3 h4">
                      <div class="card-block">
                        <header class="card-title h4">Monday, June 29, 2026</header>
                        <a class="cbo_nn_menuLink" href="#" onclick="javascript:NetNutrition.UI.menuListSelectMenu(123);">Breakfast</a>
                      </div>
                    </section>
                  `,
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (url.endsWith('/Menu/SelectMenu')) {
          expect(String(init?.body)).toBe('menuOid=123');
          return new Response(
            JSON.stringify({
              success: true,
              panels: [
                {
                  id: 'itemPanel',
                  html: `
                    <table>
                      <tr class="cbo_nn_itemGroupRow" data-categoryid="253">
                        <td colspan="5"><div role="button">1892 Grille<i></i></div></td>
                      </tr>
                      <tr data-categoryid="253" class="cbo_nn_itemPrimaryRow">
                        <td></td>
                        <td>
                          <a id="showNutrition_900" class="cbo_nn_itemHover"
                            onkeyup="javascript:NetNutrition.UI.getItemNutritionLabelFromKeyUp(event,900);">
                            Scrambled Eggs
                            <span><img alt="Egg" /></span>
                            <span><img alt="Vegetarian" /></span>
                          </a>
                        </td>
                        <td class="align-middle">4 Ounce Serving</td>
                        <td></td>
                      </tr>
                    </table>
                  `,
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (url.endsWith('/NutritionDetail/ShowItemNutritionLabel')) {
          expect(String(init?.body)).toBe('detailOid=900');
          return new Response(
            `
              <div id="nutritionLabel">
                <table>
                  <tr><td class="cbo_nn_LabelHeader">Scrambled Eggs</td></tr>
                  <tr><td><div class="cbo_nn_LabelBottomBorderLabel">
                    <span>1&nbsp;Servings per container</span>
                    <div><div class="bold-text inline-div-left">Serving Size</div><div class="bold-text inline-div-right">4 Ounce Serving&nbsp;(113g)</div></div>
                  </div></td></tr>
                  <tr><td class="cbo_nn_LabelSubHeader">
                    <div class="inline-div-left bold-text">Amount Per Serving<br/><span class="font-16">Calories</span></div>
                    <div class="inline-div-right bold-text font-22">140</div>
                  </td></tr>
                  <tr><td><div class="cbo_nn_LabelBorderedSubHeader">
                    <div class="inline-div-left"><span class="bold-text">Total Fat</span><span>&nbsp;9g</span></div>
                    <div class="inline-div-right bold-text">12%</div>
                  </div></td></tr>
                  <tr><td><div class="cbo_nn_LabelBorderedSubHeader">
                    <div class="inline-div-left"><span class="bold-text">Sodium</span><span>&nbsp;310mg</span></div>
                    <div class="inline-div-right bold-text">13%</div>
                  </div></td></tr>
                  <tr><td><div class="cbo_nn_LabelBorderedSubHeader">
                    <div class="inline-div-left"><span class="bold-text">Protein</span><span>&nbsp;11g</span></div>
                    <div class="inline-div-right bold-text"></div>
                  </div></td></tr>
                  <tr><td>
                    <span class="cbo_nn_LabelIngredientsBold">Ingredients:</span>
                    <span class="cbo_nn_LabelIngredients">Liquid Eggs (Whole Eggs, Citric Acid),&nbsp;Canola Oil</span>
                  </td></tr>
                  <tr><td>
                    <span class="cbo_nn_LabelAllergensBold">Contains:</span>
                    <span class="cbo_nn_LabelAllergens">Egg</span>
                  </td></tr>
                </table>
              </div>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        return new Response(`unexpected request: ${url}`, { status: 500 });
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'marketplace',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const item = result.data.locations[0]?.periods[0]?.stations[0]?.items[0];
    expect(result.data.locations[0]?.name).toBe('Marketplace');
    expect(result.data.locations[0]?.sourceLocationId).toBe('3');
    expect(result.data.locations[0]?.periods[0]?.name).toBe('Breakfast');
    expect(result.data.locations[0]?.periods[0]?.stations[0]?.name).toBe('1892 Grille');
    expect(item?.name).toBe('Scrambled Eggs');
    expect(item?.servingSizeText).toBe('4 Ounce Serving (113g)');
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(140);
    expect(item?.nutrition.find((fact) => fact.key === 'total_fat')?.unit).toBe('g');
    expect(item?.nutrition.find((fact) => fact.key === 'sodium')?.unit).toBe('mg');
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Liquid Eggs (Whole Eggs, Citric Acid)',
      'Canola Oil',
    ]);
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual(['egg']);
    expect(item?.dietaryTags).toEqual(['vegetarian']);
  });

  it('normalizes UW NetNutrition child-unit menus with nutrition labels and ingredients', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'washington');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === 'https://nutrition.hfs.uw.edu/NetNutrition/1' && !init?.method) {
          return new Response('', {
            status: 302,
            headers: {
              location: '/NetNutrition/1',
              'set-cookie': 'ASP.NET_SessionId=test-session; path=/; HttpOnly',
            },
          });
        }

        if (url.endsWith('/Unit/SelectUnitFromSideBar')) {
          expect(String(init?.body)).toBe('unitOid=10');
          return new Response(
            JSON.stringify({
              success: true,
              panels: [
                {
                  id: 'menuPanel',
                  html: `
                    <section class="card mb-3 h4">
                      <div class="card-block">
                        <header class="card-title h4">Monday, June 29, 2026</header>
                        <a class="cbo_nn_menuLink" href="#" onclick="javascript:NetNutrition.UI.menuListSelectMenu(360043);">Lunch</a>
                      </div>
                    </section>
                  `,
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (url.endsWith('/Menu/SelectMenu')) {
          expect(String(init?.body)).toBe('menuOid=360043');
          return new Response(
            JSON.stringify({
              success: true,
              panels: [
                {
                  id: 'itemPanel',
                  html: `
                    <table>
                      <tr tabindex="0" role="treegrid" aria-expanded="false"
                        class="cbo_nn_itemGroupRow bg-faded"
                        onclick="NetNutrition.UI.toggleCourseItems(this, 38);">
                        <td role="gridcell" colspan="5"><div role="button">Sides<i class="fa fa-caret-right"></i></div></td>
                      </tr>
                      <tr style="display:none" data-categoryid="38" class="cbo_nn_itemPrimaryRow">
                        <td></td>
                        <td>
                          <a id="showNutrition_47272753" title="Open the nutrition label for this item"
                            onclick="javascript:NetNutrition.UI.getItemNutritionLabelOnClick(event,47272753);"
                            class="cbo_nn_itemHover">
                            Barbeque Baked Beans
                            <span><img title="Vegetarian" alt="Vegetarian image" /></span>
                          </a>
                        </td>
                        <td class="align-middle">1/2 Cup</td>
                        <td></td>
                      </tr>
                    </table>
                  `,
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (url.endsWith('/NutritionDetail/ShowItemNutritionLabel')) {
          expect(String(init?.body)).toBe('detailOid=47272753');
          return new Response(
            `
              <div id="nutritionLabel">
                <table>
                  <tr><td class="cbo_nn_LabelHeader">Barbeque Baked Beans</td></tr>
                  <tr><td><div class="cbo_nn_LabelBottomBorderLabel">
                    <span>1&nbsp;Servings per container</span>
                    <div><div class="bold-text inline-div-left">Serving Size</div><div class="bold-text inline-div-right">1/2 Cup&nbsp;(140g)</div></div>
                  </div></td></tr>
                  <tr><td class="cbo_nn_LabelSubHeader">
                    <div class="inline-div-left bold-text">Amount Per Serving<br/><span class="font-16">Calories</span></div>
                    <div class="inline-div-right bold-text font-22">180</div>
                  </td></tr>
                  <tr><td><div class="cbo_nn_LabelBorderedSubHeader">
                    <div class="inline-div-left"><span class="bold-text">Total Fat</span><span>&nbsp;3g</span></div>
                    <div class="inline-div-right bold-text">4%</div>
                  </div></td></tr>
                  <tr><td><div class="cbo_nn_LabelBorderedSubHeader">
                    <div class="inline-div-left"><span class="bold-text">Sodium</span><span>&nbsp;790mg</span></div>
                    <div class="inline-div-right bold-text">34%</div>
                  </div></td></tr>
                  <tr><td>
                    <span class="cbo_nn_LabelIngredientsBold">Ingredients:</span>
                    <span class="cbo_nn_LabelIngredients">Canned Vegetarian Baked Beans(PREPARED NAVY BEANS, WATER), Yellow Onions, Yellow Mustard(DISTILLED VINEGAR, WATER)</span>
                  </td></tr>
                </table>
              </div>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        return new Response(`unexpected request: ${url}`, { status: 500 });
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'center-table-plate',
      meal: 'lunch',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const location = result.data.locations[0];
    const period = location?.periods[0];
    const station = period?.stations[0];
    const item = station?.items[0];

    expect(location?.name).toBe('Center Table - Plate');
    expect(location?.sourceLocationId).toBe('10');
    expect(period?.name).toBe('Lunch');
    expect(station?.name).toBe('Sides');
    expect(item?.name).toBe('Barbeque Baked Beans');
    expect(item?.servingSizeText).toBe('1/2 Cup (140g)');
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(180);
    expect(item?.nutrition.find((fact) => fact.key === 'sodium')?.amount).toBe(790);
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Canned Vegetarian Baked Beans(PREPARED NAVY BEANS, WATER)',
      'Yellow Onions',
      'Yellow Mustard(DISTILLED VINEGAR, WATER)',
    ]);
    expect(item?.dietaryTags).toEqual(['vegetarian']);
  });

  it('normalizes Stanford WebForms dining hall menu HTML', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'stanford');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const body = new URLSearchParams(String(init.body));
          expect(body.get('ctl00$MainContent$lstLocations')).toBe('FlorenceMoore');
          expect(body.get('ctl00$MainContent$lstDay')).toBe('6/29/2026');
          expect(body.get('ctl00$MainContent$lstMealType')).toBe('Lunch');

          return new Response(
            `
              <span class="clsMenuHeader">Monday 6/29/2026 Lunch at Florence Moore Dining</span>
              <ul>
                <li class="clsMenuItem clsV_Row clsDietCombo_V">
                  <h3 class="clsLabel_Name">Garlic Bread</h3>
                  <span class="clsLabel_Description">Toasted baguette</span>
                  <span class="clsLabel_Ingredients"><span>Ingredients:</span> french baguette, unsalted butter, garlic, parsley</span>
                  <span class="clsLabel_Allergens"><span>Allergens:</span> MILK, WHEAT</span>
                  <span class="clsLabel_TraceAllergens"><span>Made on shared equipment with </span> EGG, SOY, SHELLFISH, TREENUTS</span>
                </li>
                <li class="clsMenuItem clsGF_Row clsVGN_Row clsHALAL_Row clsDietCombo_GFVGN">
                  <h3 class="clsLabel_Name">Seasonal Steamed Vegetables</h3>
                  <span class="clsLabel_Ingredients"><span>Ingredients:</span> seasonal vegetables, salt</span>
                  <span class="clsLabel_Allergens"><span>Allergens:</span></span>
                  <span class="clsLabel_TraceAllergens"><span>Made on shared equipment with </span></span>
                </li>
              </ul>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        return new Response(
          `
            <form>
              <input type="hidden" name="__VIEWSTATE" value="state" />
              <input type="hidden" name="__EVENTVALIDATION" value="event" />
              <select id="MainContent_lstLocations" name="ctl00$MainContent$lstLocations">
                <option value=""></option>
                <option value="FlorenceMoore">Florence Moore Dining</option>
              </select>
              <select id="MainContent_lstDay" name="ctl00$MainContent$lstDay">
                <option value="6/29/2026">6/29/2026 - Monday</option>
              </select>
              <select id="MainContent_lstMealType" name="ctl00$MainContent$lstMealType">
                <option value="Lunch">Lunch</option>
              </select>
            </form>
          `,
          {
            status: 200,
            headers: {
              'content-type': 'text/html',
              'set-cookie': 'ASP.NET_SessionId=test; path=/',
            },
          }
        );
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'florence',
      meal: 'lunch',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const location = result.data.locations[0];
    const period = location?.periods[0];
    const station = period?.stations[0];
    const items = station?.items ?? [];

    expect(location?.name).toBe('Florence Moore Dining');
    expect(period?.name).toBe('Lunch');
    expect(station?.name).toBe('Menu');
    expect(items.map((item) => item.name)).toEqual([
      'Garlic Bread',
      'Seasonal Steamed Vegetables',
    ]);
    expect(items[0]?.description).toBe('Toasted baguette');
    expect(items[0]?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'french baguette',
      'unsalted butter',
      'garlic',
      'parsley',
    ]);
    expect(items[0]?.allergens.map((allergen) => `${allergen.status}:${allergen.key}`)).toEqual([
      'contains:milk',
      'contains:wheat',
      'may_contain:egg',
      'may_contain:soy',
      'may_contain:crustacean_shellfish',
      'may_contain:tree_nut',
    ]);
    expect(items[0]?.dietaryTags).toEqual(['vegetarian']);
    expect(items[1]?.dietaryTags).toEqual(['gluten_free', 'vegan', 'halal']);
    expect(items[1]?.nutrition).toEqual([]);
  });

  it('normalizes Rice server-rendered servery menus with icon labels', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'rice');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          `
            <div id="block-daylunch">
              <div class="views-element-container">
                <div class="featured-container">
                  <h2>Lunch</h2>
                  <a>Seibel Servery</a>
                  <h3>Chef Geoff</h3>
                  <div class="menu-items">
                    <a class="mitem">
                      <div class="mname">Taho Tofu</div>
                      <div class="micons">
                        <span data-content="Vegan"></span>
                        <span data-content="Soy"></span>
                      </div>
                    </a>
                  </div>
                  <div class="menu-items">
                    <a class="mitem">
                      <div class="mname">Cod with Sun Dried Tomato Pesto</div>
                      <div class="micons">
                        <span data-content="Fish"></span>
                        <span data-content="Dairy"></span>
                      </div>
                    </a>
                  </div>
                  <a>West Servery</a>
                  <h3>Chef Christian</h3>
                  <div class="menu-items">
                    <a class="mitem">
                      <div class="mname">Lentil Sloppy Joe's on Whole Wheat Bun</div>
                      <div class="micons">
                        <span data-content="Vegetarian"></span>
                        <span data-content="Gluten"></span>
                      </div>
                    </a>
                  </div>
                </div>
              </div>
            </div>
            <div id="block-daydinner">
              <div class="views-element-container">
                <div class="featured-container">
                  <h2>Dinner</h2>
                </div>
              </div>
            </div>
          `,
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      meal: 'lunch',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const period = result.data.locations[0]?.periods[0];
    const stations = period?.stations ?? [];
    const items = stations.flatMap((station) => station.items);

    expect(result.data.locations[0]?.name).toBe('Rice Dining');
    expect(period?.name).toBe('Lunch');
    expect(stations.map((station) => station.name)).toEqual([
      'Seibel Servery - Chef Geoff',
      'West Servery - Chef Christian',
    ]);
    expect(items.map((item) => item.name)).toEqual([
      'Taho Tofu',
      'Cod with Sun Dried Tomato Pesto',
      "Lentil Sloppy Joe's on Whole Wheat Bun",
    ]);
    expect(items[0]?.dietaryTags).toEqual(['vegan']);
    expect(items[0]?.allergens.map((allergen) => allergen.key)).toEqual(['soy']);
    expect(items[1]?.allergens.map((allergen) => allergen.key)).toEqual(['fish', 'milk']);
    expect(items[2]?.dietaryTags).toEqual(['vegetarian']);
    expect(items[2]?.allergens.map((allergen) => allergen.key)).toEqual(['gluten']);
  });

  it('normalizes USC WordPress REST dining hall menus', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'usc');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain('/wp-json/hsp-api/v1/get-res-dining-menus/evk');
        expect(url).toContain('y=2026');
        expect(url).toContain('m=06');
        expect(url).toContain('d=29');

        return new Response(
          JSON.stringify({
            meals: [
              {
                name: 'Lunch',
                stations: [
                  {
                    station: 'Expo',
                    subtitle: '',
                    menu: [
                      {
                        item: 'Baked Pasta Primavera',
                        dietary_preferences: ['Dairy', 'Wheat / Gluten', 'Vegetarian'],
                        allergens: ['dairy', 'gluten'],
                        preferences: ['vegetarian'],
                      },
                      {
                        item: 'Lemon Herb Tofu',
                        dietary_preferences: ['Soy', 'Vegan', 'Halal Ingredients'],
                        allergens: ['soy'],
                        preferences: ['vegan', 'halal-ingredients'],
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'evk',
      meal: 'lunch',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const period = result.data.locations[0]?.periods[0];
    const items = period?.stations.flatMap((station) => station.items) ?? [];

    expect(result.data.locations[0]?.name).toBe("Everybody's Kitchen");
    expect(period?.name).toBe('Lunch');
    expect(items.map((item) => item.name)).toEqual([
      'Baked Pasta Primavera',
      'Lemon Herb Tofu',
    ]);
    expect(items[0]?.dietaryTags).toEqual(['vegetarian']);
    expect(items[0]?.allergens.map((allergen) => allergen.key)).toEqual(['milk', 'wheat', 'gluten']);
    expect(items[1]?.dietaryTags).toEqual(['vegan', 'halal']);
    expect(items[1]?.allergens.map((allergen) => allergen.key)).toEqual(['soy']);
    expect(items[1]?.nutrition).toEqual([]);
  });

  it('normalizes UCSD venue menus with Nutritionfacts detail pages', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'ucsd');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/dining/apps/diningservices')) {
          return new Response(
            `
              <div class="station">
                <h3>64 Degrees</h3>
                <a class="info-link" href="/dining/apps/diningservices/Restaurants/Venue_V3?locId=64&subLocNum=00&locDetID=18&dayNum=0">Today's Menu</a>
              </div>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url.includes('/Restaurants/Venue_V3')) {
          return new Response(
            `
              <h1 id="station-title">64 Degrees</h1>
              <div id="Breakfast" class="meal-category">
                <div class="menu-category-section">
                  <div class="panel-heading menu-cat-secondary">
                    <a class="sublocs">Breakfast a la Carte</a>
                  </div>
                  <div class="station-list station_TritonGrill">
                    <div class="menU-item-row row">
                      <a class="sublocsitem" href="/dining/apps/diningservices/Nutrition/Nutritionfacts2?id=100064&recId=940820">Flour Tortilla 6in</a>
                      <div class="nutrition-icons">
                        <img title="Vegan" />
                        <img title="Contains Soy" />
                        <img title="Contains Wheat" />
                        <img title="Contains Gluten" />
                      </div>
                      <a class="info-link" href="/dining/apps/diningservices/Nutrition/Nutritionfacts2?id=100064&recId=940820" title="Nutrition/Allergen Info"></a>
                      <span class="item-price">$2.50</span>
                    </div>
                  </div>
                </div>
              </div>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url.includes('/Nutrition/Nutritionfacts2')) {
          return new Response(
            `
              <h1>Flour Tortilla 6in</h1>
              <p>Serving Size 1.0 oz</p>
              <table summary="Amount per serving">
                <tbody>
                  <tr><th scope="row">Calories</th><td>84</td></tr>
                </tbody>
              </table>
              <table summary="Nutrition Values per serving size">
                <tbody>
                  <tr><th>Amount/Serving</th><th>%DV*</th><th>Amount/Serving</th><th>%DV*</th></tr>
                  <tr><td>Total Fat&nbsp;1.9 g</td><td>2%</td><td>Tot. Carb. 14.9 g</td><td>5%</td></tr>
                  <tr><td>Sodium 177.2 mg</td><td>8%</td><td>Protein 1.9 g</td><td>4%</td></tr>
                </tbody>
              </table>
              <h2>Ingredients</h2>
              <p>Tortilla, Flour 6&quot; (Gluten, Soy, Wheat)</p>
              <h2>Allergens</h2>
              <div id="allergens">
                <div class="card"><div class="card-footer"><span>Contains Soy</span></div></div>
                <div class="card"><div class="card-footer"><span>Contains Wheat</span></div></div>
                <div class="card"><div class="card-footer"><span>Contains Gluten</span></div></div>
              </div>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        return new Response('unexpected request', { status: 500 });
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: '18',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const item = result.data.locations[0]?.periods[0]?.stations[0]?.items[0];
    expect(result.data.locations[0]?.name).toBe('64 Degrees');
    expect(result.data.locations[0]?.periods[0]?.name).toBe('Breakfast');
    expect(result.data.locations[0]?.periods[0]?.stations[0]?.name).toBe('Breakfast a la Carte');
    expect(item?.name).toBe('Flour Tortilla 6in');
    expect(item?.price).toEqual({ amount: 2.5, currency: 'USD', displayText: '$2.50' });
    expect(item?.servingSizeText).toBe('Serving Size 1.0 oz');
    expect(item?.dietaryTags).toEqual(['vegan']);
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual(['soy', 'wheat', 'gluten']);
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Tortilla',
      'Flour 6" (Gluten, Soy, Wheat)',
    ]);
    expect(item?.nutrition.map((fact) => `${fact.key}:${fact.amount}:${fact.unit ?? ''}`)).toEqual([
      'calories:84:kcal',
      'total_fat:1.9:g',
      'total_carbohydrate:14.9:g',
      'sodium:177.2:mg',
      'protein:1.9:g',
    ]);
  });

  it('normalizes Boston College public menu JSON with nutrition, ingredients, and allergens', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'boston-college');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain('todayMenu_PROD.json');

        return new Response(
          JSON.stringify([
            {
              ID: '0001',
              Serve_Date: '06/29/2026',
              Meal_Number: '2',
              Meal_Name: 'LUNCH',
              Location_Number: '121',
              Location_Name: 'Addies',
              Menu_Category_Number: '87',
              Menu_Category_Name: 'Loft Entrees',
              Recipe_Number: '257400',
              Recipe_Name: 'Greek Bowl',
              Recipe_Print_As_Name: 'Greek Bowl',
              Ingredient_List:
                "Greek Bowl (&lt;span class='sub-ingredients'&gt;Shrimp, Cucumber&lt;/span&gt;), Tahini Sauce (&lt;span class='sub-ingredients'&gt;Sesame Seeds&lt;/span&gt;)",
              Allergens: 'Milk, Shellfish, Wheat, Soybeans, Gluten, Sesame',
              Selling_Price: '14.75',
              Recipe_Web_Codes: 'GF VGT VGN',
              Serving_Size: '1 Each',
              Calories: '538',
              Total_Fat: '201.5g',
              Total_Fat_DV: '262',
              Sat_Fat: '32.2g',
              Sat_Fat_DV: '147',
              Trans_Fat: '0g',
              Cholesterol: '83mg',
              Sodium: '1529.3mg',
              Sodium_DV: '66',
              Total_Carb: '62.3g',
              Total_Carb_DV: '23',
              Dietary_Fiber: '4.2g',
              Sugars: '4.4g',
              Added_Sugar: '0.3g',
              Protein: '26g',
              Protein_DV: '35',
              Vitamin_D: '0mcg',
              Calcium: '140.9mg',
              Iron: '4.6mg',
              Potassium: '541.4mg',
              Servings_Per_Container: '1',
              web_codes_fullnames: 'Gluten Friendly,Vegetarian,Vegan Friendly',
              web_codes_display_2: 'GF,VG,VN',
              web_codes_display_3: 'GF,VGT,VGN',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'addies',
      meal: 'lunch',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const location = result.data.locations[0];
    const item = location?.periods[0]?.stations[0]?.items[0];

    expect(location?.name).toBe('Addies');
    expect(location?.periods[0]?.name).toBe('Lunch');
    expect(location?.periods[0]?.stations[0]?.name).toBe('Loft Entrees');
    expect(item?.name).toBe('Greek Bowl');
    expect(item?.price).toEqual({ amount: 14.75, currency: 'USD', displayText: '$14.75' });
    expect(item?.servingSizeText).toBe('1 Each');
    expect(item?.dietaryTags).toEqual(['made_without_gluten', 'vegetarian', 'vegan']);
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual([
      'milk',
      'crustacean_shellfish',
      'wheat',
      'soy',
      'gluten',
      'sesame',
    ]);
    expect(item?.ingredientStatement).toBe('Greek Bowl (Shrimp, Cucumber), Tahini Sauce (Sesame Seeds)');
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Greek Bowl (Shrimp, Cucumber)',
      'Tahini Sauce (Sesame Seeds)',
    ]);
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(538);
    expect(item?.nutrition.find((fact) => fact.key === 'total_fat')?.unit).toBe('g');
    expect(item?.nutrition.find((fact) => fact.key === 'total_fat')?.dailyValuePercent).toBe(262);
    expect(item?.nutrition.find((fact) => fact.key === 'sodium')?.amount).toBe(1529.3);
    expect(item?.nutrition.find((fact) => fact.key === 'vitamin_d')?.unit).toBe('mcg');
  });

  it('normalizes Boston University dining pages with embedded nutrition facts', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'boston-university');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain('/dining/location/marciano/');

        return new Response(
          `
            <ol class="js-menu-bydate menu-area" data-menudate="2026-06-29">
              <li id="2026-06-29-breakfast" class="js-meal-period-breakfast menu-meal-period">
                <h4 class="menu-meal-period-title">
                  <span class="js-meal-period-name" data-meal-period-slug="breakfast">Breakfast</span>
                  <span class="js-meal-period-times">7:00 AM - 9:00 AM</span>
                </h4>
                <ol class="menu-dishes">
                  <li class="menu-item menu-main">
                    <div class="menu-item-wrapper main-with-nutrition" data-menu-id="cornbread-1">
                      <h4 class="js-nutrition-open-alias menu-item-title">Cornbread</h4>
                      <span class="menu-station">at the <strong class="js-sortby-station">Bakery</strong>
                        <ul class="menu-item-dietary-restriction">
                          <li class="vegetarian">Vegetarian</li>
                          <li class="halal">Halal</li>
                        </ul>
                      </span>
                      <p class="menu-description">Freshly baked cornbread squares</p>
                    </div>
                    <section class="nutrition-facts nutrition-main">
                      <h4 class="nutrition-serving-size">Serving size 1 piece</h4>
                      <table class="nutrition-label">
                        <tbody>
                          <tr class="nutrition-label-calories">
                            <td class="nutrition-label-nutrient">Calories</td>
                            <td class="nutrition-label-amount">145</td>
                            <td class="nutrition-label-percentage"></td>
                          </tr>
                          <tr>
                            <td class="nutrition-label-nutrient">Total Fat</td>
                            <td class="nutrition-label-amount">7g</td>
                            <td class="nutrition-label-percentage">9%</td>
                          </tr>
                          <tr>
                            <td class="nutrition-label-nutrient">Sodium</td>
                            <td class="nutrition-label-amount">310mg</td>
                            <td class="nutrition-label-percentage">13%</td>
                          </tr>
                        </tbody>
                      </table>
                      <table class="nutrition-vitamins">
                        <tbody>
                          <tr>
                            <td class="nutrition-label-nutrient">Vitamin D</td>
                            <td class="nutrition-label-percentage">0%</td>
                          </tr>
                          <tr>
                            <td class="nutrition-label-nutrient">Iron</td>
                            <td class="nutrition-label-percentage">5%</td>
                          </tr>
                        </tbody>
                      </table>
                      <aside class="nutrition-facts-ingredients">
                        <strong>Ingredients:</strong> Corn Muffin Mix (wheat flour, sugar), Water
                      </aside>
                      <ul class="nutrition-facts-allergens">
                        <li>Egg</li>
                        <li>Milk</li>
                        <li>Soy</li>
                        <li>Wheat</li>
                      </ul>
                    </section>
                  </li>
                </ol>
              </li>
            </ol>
          `,
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'marciano',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const period = result.data.locations[0]?.periods[0];
    const item = period?.stations[0]?.items[0];

    expect(result.data.locations[0]?.name).toBe('The Fresh Food Co. at Marciano Commons');
    expect(period?.name).toBe('Breakfast');
    expect(period?.startTime).toBe('07:00');
    expect(period?.endTime).toBe('09:00');
    expect(item?.name).toBe('Cornbread');
    expect(item?.description).toBe('Freshly baked cornbread squares');
    expect(item?.servingSizeText).toBe('1 piece');
    expect(item?.dietaryTags).toEqual(['vegetarian', 'halal']);
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual(['egg', 'milk', 'soy', 'wheat']);
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Corn Muffin Mix (wheat flour, sugar)',
      'Water',
    ]);
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(145);
    expect(item?.nutrition.find((fact) => fact.key === 'total_fat')?.unit).toBe('g');
    expect(item?.nutrition.find((fact) => fact.key === 'sodium')?.dailyValuePercent).toBe(13);
    expect(item?.nutrition.find((fact) => fact.key === 'vitamin_d')?.dailyValuePercent).toBe(0);
  });

  it('normalizes UCLA at-a-glance menus with recipe detail nutrition and ingredients', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'ucla');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/menu-item/?recipe=2066')) {
          return new Response(
            `
              <main>
                <article class="menu-container">
                  <h2 class="single-name">Bruin Scramble (Ham & Cheddar)</h2>
                  <p class="single-description">Egg scramble with ham and cheddar.</p>
                  <div class="single-metadata-item-wrapper">
                    <img alt="Contains dairy" /> Contains Dairy
                  </div>
                  <div class="single-metadata-item-wrapper">
                    <img alt="Contains egg" /> Contains Eggs
                  </div>
                  <div id="nutrition" class="single-tab-content">
                    <strong>Serving Size:</strong> 4.52oz
                    <p class="single-calories"><span>Calories</span>222</p>
                    <table class="nutritive-table">
                      <tbody>
                        <tr><td><span>Total Fat</span>17.29g</td><td>22%</td></tr>
                        <tr><td><span>Saturated Fat</span>4.07g</td><td>20%</td></tr>
                        <tr><td><span>Sodium</span>376.22mg</td><td>16%</td></tr>
                        <tr><td><span>Includes Added Sugars</span>0g</td><td>0%</td></tr>
                      </tbody>
                    </table>
                    <table class="nutritive-table nutritive-table-two-column">
                      <tbody>
                        <tr><td><span>Calcium</span>79.24mg</td><td>6%</td><td><span>Vitamin D</span>2.05µg</td><td>10%</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div id="ingredient_list" class="single-tab-content">
                    <p><strong>Ingredients:</strong></p>
                    <ul class="nolispace">
                      <li>Egg Liquid <strong>(Eggs)</strong></li>
                      <li>Cheddar Cheese (Contains: Milk) <strong>(Dairy)</strong></li>
                    </ul>
                    <strong>Allergens*:</strong> Dairy, Eggs
                  </div>
                </article>
              </main>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        return new Response(
          `
            <div class="at-a-glance-menu" id="breakfastmenu">
              <h2>BREAKFAST MENU FOR TODAY, JUNE 29, 2026</h2>
              <div class="wp-block-columns">
                <div class="at-a-glance-menu__dining-location">
                  <h3>Sproul Dining</h3>
                  <a href="/sproul-dining">Detailed Menu</a>
                  <div class="at-a-glance-menu__meal-station">
                    <h4>Freshly Bowled</h4>
                    <ul>
                      <li>
                        <a href="/menu-item/?recipe=2066">Bruin Scramble (Ham &amp; Cheddar)</a>
                        <img class="meal-station__allergen-icon" alt="Vegetarian" />
                        <img class="meal-station__allergen-icon" alt="Dairy" />
                        <img class="meal-station__allergen-icon" alt="Eggs" />
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          `,
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'sproul-dining',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const location = result.data.locations[0];
    const period = location?.periods[0];
    const item = period?.stations[0]?.items[0];

    expect(location?.name).toBe('Sproul Dining');
    expect(period?.name).toBe('Breakfast');
    expect(period?.stations[0]?.name).toBe('Freshly Bowled');
    expect(item?.name).toBe('Bruin Scramble (Ham & Cheddar)');
    expect(item?.description).toBe('Egg scramble with ham and cheddar.');
    expect(item?.servingSizeText).toBe('4.52oz');
    expect(item?.dietaryTags).toEqual(['vegetarian']);
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual(['milk', 'egg']);
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Egg Liquid (Eggs)',
      'Cheddar Cheese (Contains: Milk) (Dairy)',
    ]);
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(222);
    expect(item?.nutrition.find((fact) => fact.key === 'saturated_fat')?.dailyValuePercent).toBe(20);
    expect(item?.nutrition.find((fact) => fact.key === 'vitamin_d')?.unit).toBe('mcg');
    expect(item?.nutrition.find((fact) => fact.key === 'added_sugars')?.amount).toBe(0);
  });

  it('normalizes UNC NMC Dining pages with recipe nutrition details', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'unc');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/menu-hours/')) {
          return new Response(
            `
              <a href="https://dining.unc.edu/locations/chase/?date=2026-06-29" class="open-now-location-link">Chase</a>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url.includes('/locations/chase/')) {
          return new Response(
            `
              <h1>Chase</h1>
              <button type="button" aria-controls="tabinfo-1">Breakfast (7am-9am)</button>
              <div id="tabinfo-1" class="c-tab">
                <div class="menu-station">
                  <button class="toggle-menu-station-data">The Kitchen Table</button>
                  <li class="menu-item-li" data-searchable="scrambled eggs liquid egg [whole eggs, citric acid], milk">
                    <a href="#" class="show-nutrition allergen-has_egg allergen-has_milk prop-vegetarian prop-made_without_gluten" data-recipe="9680">Scrambled Eggs</a>
                  </li>
                </div>
              </div>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url.includes('/ajax-content/recipe.php?recipe=9680')) {
          return new Response(
            JSON.stringify({
              success: true,
              html: `
                <h2>Scrambled Eggs</h2>
                <div id="nutrition-info-header">
                  <div class="recipe-icon-wrap"><svg><title>Vegetarian</title></svg></div>
                  <div class="recipe-icon-wrap"><svg><title>Made Without Gluten</title></svg></div>
                </div>
                <p>Allergens Egg, Milk</p>
                <table class="nutrition-facts-table">
                  <tr><td>Amount Per Serving 0.5 cup</td></tr>
                  <tr><td>Calories 200</td></tr>
                  <tr><td>Total Fat 13 g 20%</td></tr>
                  <tr><td>Sodium 180 mg 8%</td></tr>
                  <tr><td>Protein 17 g</td></tr>
                  <tr><td>Vitamin D 2.81 mcg 0%</td></tr>
                </table>
                <p>Ingredients: LIQUID EGG [WHOLE EGGS, CITRIC ACID], EGGS LIQUID BREAKFAST BLEND CAGE FREE WITH MILK [CONTAINS: Egg, Milk] 2,000 calories a day is used for general nutrition advice.</p>
              `,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('unexpected request', { status: 500 });
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'chase',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const period = result.data.locations[0]?.periods[0];
    const item = period?.stations[0]?.items[0];

    expect(result.data.locations[0]?.name).toBe('Chase');
    expect(period?.name).toBe('Breakfast');
    expect(period?.startTime).toBe('07:00');
    expect(period?.endTime).toBe('09:00');
    expect(period?.stations[0]?.name).toBe('The Kitchen Table');
    expect(item?.name).toBe('Scrambled Eggs');
    expect(item?.servingSizeText).toBe('0.5 cup');
    expect(item?.dietaryTags).toEqual(['vegetarian', 'made_without_gluten']);
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual(['egg', 'milk']);
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'LIQUID EGG [WHOLE EGGS, CITRIC ACID]',
      'EGGS LIQUID BREAKFAST BLEND CAGE FREE WITH MILK [CONTAINS: Egg, Milk]',
    ]);
    expect(item?.nutrition.map((fact) => `${fact.key}:${fact.amount ?? ''}:${fact.unit ?? ''}`)).toEqual([
      'serving_size::',
      'calories:200:kcal',
      'total_fat:13:g',
      'sodium:180:mg',
      'protein:17:g',
      'vitamin_d:2.81:mcg',
    ]);
  });

  it('normalizes Georgetown NMC Dining pages with recipe nutrition details', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'georgetown');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/menu-hours/')) {
          return new Response(
            `
              <a href="https://www.hoyaeats.com/locations/fresh-food-company/?date=2026-06-29" class="open-now-location-link">The Table at Leo's</a>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url.includes('/locations/fresh-food-company/')) {
          return new Response(
            `
              <h1>The Table at Leo’s</h1>
              <button type="button" aria-controls="tabinfo-1">Breakfast (7am-9:30am)</button>
              <div id="tabinfo-1" class="c-tab">
                <div class="menu-station">
                  <button class="toggle-menu-station-data">Grill</button>
                  <li class="menu-item-li" data-searchable="scrambled eggs liquid egg contains egg milk">
                    <a href="#" class="show-nutrition allergen-has_egg allergen-has_milk prop-vegetarian prop-made_without_gluten prop-halal" data-recipe="6774">Scrambled Eggs</a>
                  </li>
                </div>
              </div>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url.includes('/ajax-content/recipe.php?recipe=6774')) {
          return new Response(
            JSON.stringify({
              success: true,
              html: `
                <h2>Scrambled Eggs</h2>
                <p>Halal Allergens Egg, Milk</p>
                <table class="nutrition-facts-table">
                  <tr><td>Amount Per Serving 0.5 cup</td></tr>
                  <tr><td>Calories 200</td></tr>
                  <tr><td>Cholesterol 480 mg 160%</td></tr>
                </table>
                <p>Ingredients: LIQUID EGG [CONTAINS: Egg], EGGS LIQUID BREAKFAST BLEND CAGE FREE WITH MILK [CONTAINS: Egg, Milk] Additional information is available upon request.</p>
              `,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('unexpected request', { status: 500 });
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'fresh-food-company',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const item = result.data.locations[0]?.periods[0]?.stations[0]?.items[0];
    expect(result.data.locations[0]?.name).toBe('The Table at Leo’s');
    expect(item?.name).toBe('Scrambled Eggs');
    expect(item?.dietaryTags).toEqual(['vegetarian', 'made_without_gluten', 'halal']);
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual(['egg', 'milk']);
    expect(item?.nutrition.find((fact) => fact.key === 'cholesterol')?.dailyValuePercent).toBe(160);
  });

  it('normalizes Bon Appetit embedded menu JSON with nutrition and ingredients', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'mit');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          `
            <script>
              Bamco = {};
              Bamco.menu_items = {
                "101": {
                  "id": "101",
                  "label": "scrambled eggs",
                  "description": "cage-free eggs",
                  "ordered_cor_icon": {
                    "0001-0001": {"id": "1", "label": "Vegetarian"},
                    "0001-0002": {"id": "2", "label": "Made without Gluten-Containing Ingredients"},
                    "0285-0259": {"id": "259", "label": "Egg"},
                    "0286-0260": {"id": "260", "label": "Soy"}
                  },
                  "nutrition_details": {
                    "calories": {"label": "Calories", "value": "180", "unit": ""},
                    "servingSize": {"label": "Serving Size", "value": "4.3", "unit": "oz"},
                    "fatContent": {"label": "Total Fat", "value": "12", "unit": "g"},
                    "sodiumContent": {"label": "Sodium", "value": "280", "unit": "mg"},
                    "proteinContent": {"label": "Protein", "value": "15", "unit": "g"}
                  },
                  "ingredients": "cage-free egg, salt, pepper, cooking spray",
                  "station_id": "24151",
                  "station": "<strong>@breakfast</strong>",
                  "price": ""
                }
              };
            </script>
            <script>
              Bamco = Bamco || {};
              Bamco.dayparts = Bamco.dayparts || {};
              Bamco.dayparts['1'] = {
                "id": "1",
                "label": "Breakfast",
                "starttime": "08:00",
                "endtime": "10:00",
                "stations": [
                  {"id": 848, "label": "Maseeh", "items": ["101"]}
                ]
              };
            </script>
          `,
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'maseeh',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const item = result.data.locations[0]?.periods[0]?.stations[0]?.items[0];
    expect(item?.name).toBe('scrambled eggs');
    expect(item?.servingSizeText).toBe('4.3 oz');
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(180);
    expect(item?.nutrition.find((fact) => fact.key === 'total_fat')?.unit).toBe('g');
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'cage-free egg',
      'salt',
      'pepper',
      'cooking spray',
    ]);
    expect(item?.allergens.map((allergen) => `${allergen.status}:${allergen.key}`)).toEqual([
      'made_without:gluten',
      'contains:egg',
      'contains:soy',
    ]);
    expect(item?.dietaryTags).toEqual(['vegetarian', 'made_without_gluten']);
  });

  it('normalizes Brown official menu and nutrition APIs', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'brown');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/services/oit/sys/brown-dining/v1/menus')) {
          return new Response(
            JSON.stringify([
              {
                name: 'Blue Room',
                locationId: 'BR',
                locationAddress: '75 Waterman St.',
                meals: {
                  '2026-06-29': [
                    {
                      meal: 'All Day',
                      menu: {
                        date: '2026-06-29',
                        hours: {
                          start: '2026-06-29T07:30:00-04:00',
                          end: '2026-06-29T15:00:00-04:00',
                        },
                        stations: [
                          {
                            stationId: 45,
                            name: 'Lunch Hot Sandwich 11a-3p',
                            items: [
                              {
                                itemId: 3227,
                                item: 'Hot Caprese',
                                icons: ['VGTN', 'HL'],
                                allergens: ['WHEAT/GLUTEN', 'DAIRY'],
                                description: '',
                                itemType: 'recipe',
                              },
                            ],
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (url.includes('/api/get_nutrition')) {
          return new Response(
            JSON.stringify({
              name: 'Hot Caprese',
              description: 'Focaccia sandwich',
              icons: ['VGTN', 'HL'],
              allergens: ['WHEAT/GLUTEN', 'DAIRY', 'EGG'],
              ingredients: 'Bread Herb Focaccia (Durum wheat flour, water), Egg, Cheese <strong>(DAIRY)</strong>',
              itemPortionSize: 13.5,
              itemPortionSizeUnit: 'oz',
              baseValues: {
                calories: { amount: 172.98 },
                fat: { amount: '9.11g', percent: 12 },
                sodium: { amount: '144.3mg', percent: 6 },
              },
              portionValues: {
                calories: { amount: 662.03 },
                fat: { amount: '34.87g', percent: 45 },
                sodium: { amount: '552.26mg', percent: 24 },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('unexpected request', { status: 500 });
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'blue-room',
      meal: 'all day',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const item = result.data.locations[0]?.periods[0]?.stations[0]?.items[0];
    expect(item?.name).toBe('Hot Caprese');
    expect(item?.stationName).toBe('Lunch Hot Sandwich 11a-3p');
    expect(item?.servingSizeText).toBe('13.5 oz');
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(662.03);
    expect(item?.nutrition.find((fact) => fact.key === 'total_fat')?.amount).toBe(34.87);
    expect(item?.nutrition.find((fact) => fact.key === 'sodium')?.unit).toBe('mg');
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Bread Herb Focaccia (Durum wheat flour, water)',
      'Egg',
      'Cheese (DAIRY)',
    ]);
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual(['wheat', 'milk', 'egg']);
    expect(item?.dietaryTags).toEqual(['vegetarian', 'halal']);
  });

  it('normalizes Cornell official dated dining menus', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'cornell');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            status: 'success',
            data: {
              eateries: [
                {
                  id: 43,
                  slug: 'Morrison-Dining',
                  name: 'Morrison Dining',
                  location: '18 Sisson Place',
                  operatingHours: [
                    {
                      date: '2026-06-29',
                      events: [
                        {
                          descr: 'Breakfast',
                          start: '7:00am',
                          end: '10:30am',
                          menu: [
                            {
                              category: 'Global',
                              sortIdx: 1,
                              items: [
                                { item: 'Scrambled Eggs', healthy: false, sortIdx: 1 },
                                { item: 'Hard Boiled Eggs', healthy: false, sortIdx: 2 },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'morrison',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const location = result.data.locations[0];
    const period = location?.periods[0];
    const station = period?.stations[0];
    const item = station?.items[0];

    expect(location?.name).toBe('Morrison Dining');
    expect(period?.name).toBe('Breakfast');
    expect(station?.name).toBe('Global');
    expect(item?.name).toBe('Scrambled Eggs');
    expect(item?.nutrition).toEqual([]);
    expect(item?.ingredients).toEqual([]);
  });

  it('normalizes UCSB server-rendered daily dining menus', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'ucsb');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          `
            <div id="menu-row" class="row">
              <div class="col-sm-6">
                <h3>Carrillo</h3>
                <div id="carrillo-body" class="collapse in">
                  <div class="panel panel-default list-panel">
                    <div class="panel-heading">
                      <h5>Lunch <small class="text-nowrap disclaimer">11:45 AM - 1:45 PM</small></h5>
                    </div>
                    <div class="panel-body">
                      <dl>
                        <dt>Deli</dt>
                        <dd>Sliced Turkey</dd>
                        <dd>Sliced Provolone Cheese (v)</dd>
                      </dl>
                      <dl>
                        <dt>Mongolian Grill</dt>
                        <dd>Sticky Rice (vgn)</dd>
                        <dd>Oatmeal Walnut Bar (w/nuts) (v)</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `,
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'carrillo',
      meal: 'lunch',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const location = result.data.locations[0];
    const period = location?.periods[0];
    const stations = period?.stations ?? [];
    const items = stations.flatMap((station) => station.items);

    expect(location?.name).toBe('Carrillo');
    expect(period?.name).toBe('Lunch');
    expect(period?.startTime).toBe('11:45 AM');
    expect(period?.endTime).toBe('1:45 PM');
    expect(stations.map((station) => station.name)).toEqual(['Deli', 'Mongolian Grill']);
    expect(items.map((item) => item.name)).toEqual([
      'Sliced Turkey',
      'Sliced Provolone Cheese',
      'Sticky Rice',
      'Oatmeal Walnut Bar',
    ]);
    expect(items[1]?.dietaryTags).toEqual(['vegetarian']);
    expect(items[2]?.dietaryTags).toEqual(['vegan']);
    expect(items[3]?.allergens.map((allergen) => allergen.key)).toEqual(['tree_nut']);
  });

  it('normalizes UIUC public dining menu JSON by location and meal', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'uiuc');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/DiningMenus/api/DiningMenu/GetOption/')) {
          expect(init?.method).toBe('POST');
          expect(init?.headers).toMatchObject({
            'content-type': 'application/json; charset=utf-8',
          });
          expect(JSON.parse(String(init?.body))).toEqual({
            DiningOptionID: '1',
            mealDate: '2026-06-29',
          });

          return new Response(
            JSON.stringify([
              {
                EventDate: '2026-06-29T00:00:00',
                DiningMenuID: 39137,
                ServingUnit: 'Gregory Drive Diner',
                Course: 'Breads',
                CourseSort: 2,
                FormalName: 'Waffles',
                Meal: 'Breakfast',
                Traits: 'Corn,Eggs,Gluten,Milk,Soy,Vegetarian,Wheat,',
                DiningOptionID: 1,
                ScheduleID: 39,
                ItemID: 15573,
                Category: 'Gregory Drive Diner',
                EventDateGMT: 1782709200,
              },
              {
                EventDate: '2026-06-29T00:00:00',
                DiningMenuID: 39307,
                ServingUnit: 'Gregory Drive Diner',
                Course: 'Entrees',
                CourseSort: 100,
                FormalName: 'Jain Tofu Scramble',
                Meal: 'Breakfast',
                Traits: 'Corn,Gluten,Jain,Soy,Vegan,Vegetarian,Wheat,',
                DiningOptionID: 1,
                ScheduleID: 39,
                ItemID: 23494,
                Category: 'Gregory Drive Diner',
                EventDateGMT: 1782709200,
              },
            ]),
            { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }
          );
        }

        return new Response(
          `
            <select id="dineop">
              <option id="0" value="0">(Select Location)</option>
              <option id="1" value="Ikenberry Dining Center">Ikenberry Dining Center</option>
            </select>
            <table id="sTable">
              <tbody>
                <tr>
                  <td>1</td>
                  <td>2026-06-29</td>
                  <td>Monday</td>
                  <td>Breakfast</td>
                  <td>7:00</td>
                  <td>8:30</td>
                  <td>7:00 AM</td>
                  <td>8:30 AM</td>
                </tr>
              </tbody>
            </table>
          `,
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'ikenberry',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const location = result.data.locations[0];
    const period = location?.periods[0];
    const station = period?.stations[0];
    const items = station?.items ?? [];

    expect(location?.name).toBe('Ikenberry Dining Center');
    expect(period?.name).toBe('Breakfast');
    expect(period?.startTime).toBe('7:00 AM');
    expect(period?.endTime).toBe('8:30 AM');
    expect(station?.name).toBe('Gregory Drive Diner');
    expect(items.map((item) => item.name)).toEqual(['Waffles', 'Jain Tofu Scramble']);
    expect(items[0]?.allergens.map((allergen) => allergen.key)).toEqual([
      'other',
      'egg',
      'gluten',
      'milk',
      'soy',
      'wheat',
    ]);
    expect(items[0]?.dietaryTags).toEqual(['vegetarian']);
    expect(items[1]?.dietaryTags).toEqual(['other', 'vegan', 'vegetarian']);
    expect(items[1]?.nutrition).toEqual([]);
    expect(items[1]?.ingredients).toEqual([]);
  });

  it(
    'fetches and normalizes Rochester Nutrislice menus with item details',
    async () => {
      const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'rochester');
      expect(school).toBeDefined();

      const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
        date: '2026-06-29',
        locationId: 'douglass-dining-center',
        meal: 'breakfast',
      });

      expect(result.state).toBe('adapter_ready');
      if (result.state !== 'adapter_ready') return;

      const items = result.data.locations.flatMap((location) =>
        location.periods.flatMap((period) => period.stations.flatMap((station) => station.items))
      );
      const sample = items.find((item) => item.nutrition.length > 0 && item.ingredients.length > 0);

      expect(items.length).toBeGreaterThan(0);
      expect(sample?.nutrition.find((fact) => fact.key === 'calories')?.unit).toBe('kcal');
      expect(sample?.ingredients.length).toBeGreaterThan(0);
      expect(items.some((item) => item.allergens.length > 0)).toBe(true);
    },
    15000
  );

  it(
    'fetches and normalizes Yale Hospitality Nutrislice menus',
    async () => {
      const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'yale');
      expect(school).toBeDefined();

      const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
        date: '2026-06-29',
        locationId: 'benjamin-franklin-college',
        meal: 'breakfast',
      });

      expect(result.state).toBe('adapter_ready');
      if (result.state !== 'adapter_ready') return;

      const items = result.data.locations.flatMap((location) =>
        location.periods.flatMap((period) => period.stations.flatMap((station) => station.items))
      );
      const sample = items.find((item) => item.nutrition.length > 0 && item.ingredients.length > 0);

      expect(result.data.locations[0]?.name).toBe('Benjamin Franklin College');
      expect(items.length).toBeGreaterThan(0);
      expect(sample?.nutrition.find((fact) => fact.key === 'calories')?.unit).toBe('kcal');
      expect(sample?.ingredients.length).toBeGreaterThan(0);
      expect(items.some((item) => item.allergens.length > 0)).toBe(true);
      expect(items.some((item) => item.dietaryTags.length > 0)).toBe(true);
    },
    15000
  );

  it('normalizes SodexoMyWay embedded menu metadata and dated menu API items', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'washu');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === school!.sourceUrl) {
          return new Response(
            `
              <script>
                window.__PRELOADED_STATE__ = {
                  "tenant": "washudining",
                  "composition": {
                    "subject": {
                      "regions": [{
                        "fragments": [{
                          "content": {
                            "main": {
                              "slug": "duc-dining",
                              "name": "DUC Dining",
                              "address": {
                                "street": "6475 Forsyth Blvd",
                                "city": "St. Louis",
                                "state": "MO",
                                "postalCode": "63105"
                              },
                              "menus": [{
                                "type": "Menu",
                                "content": {
                                  "metadata": {
                                    "locationId": "56412002",
                                    "menuId": "38064"
                                  }
                                }
                              }]
                            }
                          }
                        }]
                      }]
                    }
                  }
                };
              </script>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (
          url ===
          'https://api-prd.sodexomyway.net/v0.2/data/menu/56412002/38064?date=2026-06-29'
        ) {
          return new Response(
            JSON.stringify([
              {
                name: 'BREAKFAST',
                groups: [
                  {
                    name: 'MISCELLANEOUS',
                    sortOrder: 0,
                    items: [
                      {
                        course: 'MISCELLANEOUS',
                        meal: 'BREAKFAST',
                        menuItemId: 7256693875,
                        formalName: 'Have A Nice Day',
                        description: 'Breakfast cookie',
                        price: 0,
                        ingredients: 'Oats, Milk Chocolate Chips (sugar, milk), Soybean Oil',
                        allergens: [
                          { allergen: 'MILK', name: 'Milk', contains: 'true', child: '' },
                          { allergen: 'SO', name: 'Soy', contains: 'true', child: '' },
                          { allergen: 'WHEAT', name: 'Wheat', contains: 'false', child: '' },
                        ],
                        isVegan: false,
                        isVegetarian: true,
                        isPlantBased: false,
                        calories: '210',
                        fat: '6g',
                        saturatedFat: '2g',
                        transFat: '0g',
                        cholesterol: '0mg',
                        sodium: '120mg',
                        carbohydrates: '34g',
                        dietaryFiber: '4g',
                        sugar: '12g',
                        protein: '5g',
                        potassium: '90mg',
                        iron: '1mg',
                        calcium: '20mg',
                        vitaminD: '0mcg',
                        portionSize: '1 each',
                      },
                    ],
                  },
                ],
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('unexpected request', { status: 500 });
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'duc-dining',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const location = result.data.locations[0];
    const period = location?.periods[0];
    const station = period?.stations[0];
    const item = station?.items[0];

    expect(location?.name).toBe('DUC Dining');
    expect(location?.address).toBe('6475 Forsyth Blvd, St. Louis, MO, 63105');
    expect(period?.name).toBe('BREAKFAST');
    expect(station?.name).toBe('MISCELLANEOUS');
    expect(item?.name).toBe('Have A Nice Day');
    expect(item?.servingSizeText).toBe('1 each');
    expect(item?.dietaryTags).toEqual(['vegetarian']);
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual(['milk', 'soy']);
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Oats',
      'Milk Chocolate Chips (sugar, milk)',
      'Soybean Oil',
    ]);
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(210);
    expect(item?.nutrition.find((fact) => fact.key === 'sodium')?.unit).toBe('mg');
  });

  it('normalizes Maryland direct FoodPro menu pages with label nutrition', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'maryland');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('label.aspx')) {
          return new Response(
            `
              <html>
                <body>
                  <div class="nutfactsservsize">Serving size</div>
                  <div class="nutfactsservsize">1 sandwich</div>
                  <div class="nutfactstopnutrient">Calories 120kcal</div>
                  <div class="nutfactstopnutrient">Total Fat 4g</div>
                  <div class="nutfactstopnutrient">Sodium 300mg</div>
                  <div class="labelingredientsvalue">Wheat Bun (Wheat Flour, Water), Soy Patty</div>
                  <div class="labelallergensvalue">Wheat, Soy</div>
                </body>
              </html>
            `,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        return new Response(
          `
            <html>
              <body>
                <h1>Nutrition</h1>
                <div class="card">
                  <h3 class="card-title">Grill Works</h3>
                  <div class="row menu-item-row">
                    <div class="col-md-8">
                      <a class="menu-item-name" href="label.aspx?RecNumAndPort=123*1">Veggie Burger</a>
                    </div>
                  </div>
                </div>
              </body>
            </html>
          `,
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const item = result.data.locations[0]?.periods[0]?.stations[0]?.items[0];
    expect(item?.name).toBe('Veggie Burger');
    expect(item?.stationName).toBe('Grill Works');
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(120);
    expect(item?.ingredients[0]?.name).toBe('Wheat Bun (Wheat Flour, Water)');
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual(['wheat', 'soy']);
  });

  it(
    'fetches and normalizes Purdue GraphQL menus with item nutrition details',
    async () => {
      const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'purdue');
      expect(school).toBeDefined();

      const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
        date: '2026-06-29',
        locationId: 'earhart',
        meal: 'breakfast',
      });

      expect(result.state).toBe('adapter_ready');
      if (result.state !== 'adapter_ready') return;

      const items = result.data.locations.flatMap((location) =>
        location.periods.flatMap((period) => period.stations.flatMap((station) => station.items))
      );
      const sample = items.find((item) => item.nutrition.length > 0 && item.ingredients.length > 0);

      expect(items.length).toBeGreaterThan(0);
      expect(sample?.nutrition.find((fact) => fact.key === 'calories')?.unit).toBe('kcal');
      expect(sample?.ingredients.length).toBeGreaterThan(0);
      expect(items.some((item) => item.allergens.length > 0)).toBe(true);
    },
    25000
  );

  it('normalizes MyDiningHub GraphQL menus with nutrition, ingredients, allergens, and preferences', async () => {
    const school = TOP_50_SCHOOLS.find((candidate) => candidate.id === 'uva');
    expect(school).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const operationName = url.searchParams.get('operationName');

        if (operationName === 'StoreConfig') {
          return new Response(
            JSON.stringify({
              data: {
                Commerce_storeConfig: {
                  allergens_intolerances: [
                    { is_active: '1', label: 'Eggs', value: '39' },
                    { is_active: '1', label: 'Milk', value: '45' },
                    { is_active: '1', label: 'Wheat', value: '63' },
                  ],
                  menu_preferences: [
                    { is_active: '1', label: 'Gluten Free', title: 'Made Without Gluten', value: '78' },
                    { is_active: '1', label: 'Vegan', title: 'Vegan', value: '96' },
                    { is_active: '1', label: 'Vegetarian', title: 'Vegetarian', value: '99' },
                    { is_active: '1', label: 'Halal', title: 'Halal Friendly', value: '133' },
                    { is_active: '1', label: 'Coolfood Meal', title: 'Coolfood Meal', value: '609' },
                  ],
                  nutrition_information_attributes: [
                    { label: 'Calories', value: 'calories' },
                    { label: 'Total Fat', value: 'total_fat' },
                    { label: 'Sodium', value: 'sodium' },
                  ],
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (operationName === 'getLocations') {
          return new Response(
            JSON.stringify({
              data: {
                getLocations: [
                  {
                    commerceAttributes: {
                      uid: '100536',
                      url_key: 'observatory-hill-dining-room',
                      timezone: 'America/New_York',
                    },
                    aemAttributes: {
                      name: 'Observatory Hill Dining Room',
                    },
                  },
                ],
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (operationName === 'getLocation') {
          return new Response(
            JSON.stringify({
              data: {
                getLocation: {
                  commerceAttributes: {
                    uid: '100536',
                    url_key: 'observatory-hill-dining-room',
                    timezone: 'America/New_York',
                    hasActiveMenus: true,
                    children: [{ id: 227493, name: 'Hearth', position: 1 }],
                    meal_periods: [{ id: 10, name: 'Breakfast', position: 1 }],
                  },
                  aemAttributes: {
                    name: 'Observatory Hill Dining Room',
                  },
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (operationName === 'getLocationRecipes') {
          return new Response(
            JSON.stringify({
              data: {
                getLocationRecipes: {
                  locationRecipesMap: {
                    dateSkuMap: [
                      {
                        date: '2026-06-29',
                        stations: [
                          {
                            id: 227493,
                            skus: {
                              simple: ['217918_100536_M859_1_25416'],
                              configurable: [
                                {
                                  sku: '217918_100536_M21491_1',
                                  variants: ['217918_100536_M21491_1_19224'],
                                },
                              ],
                            },
                          },
                        ],
                      },
                    ],
                  },
                  products: {
                    items: [
                      {
                        id: '1',
                        name: 'Scrambled Eggs',
                        sku: '217918_100536_M859_1_25416',
                        images: [{ url: 'https://example.test/scrambled-eggs.jpg' }],
                        attributes: [
                          { name: 'allergen_statement', value: 'Contains: Milk, Eggs' },
                          { name: 'allergens_intolerances', value: ['45', '39'] },
                          { name: 'calories', value: '142.126000' },
                          { name: 'total_fat', value: '9.385000' },
                          { name: 'sodium', value: '315.208000' },
                          { name: 'serving_fraction', value: '1/2' },
                          { name: 'serving_size', value: 'N/A' },
                          { name: 'serving_unit', value: 'cup' },
                          { name: 'recipe_attributes', value: ['78', '96', '99', '133', '609'] },
                          {
                            name: 'recipe_ingredients',
                            value: 'Egg Blend (Whole Eggs, Water), Milk, Salt',
                          },
                          { name: 'recipe_id', value: 'M859' },
                        ],
                      },
                      {
                        id: '2',
                        name: 'Greek Yogurt',
                        sku: '217918_100536_M21491_1',
                        attributes: [
                          { name: 'recipe_attributes', value: ['99'] },
                          { name: 'allergen_statement', value: 'Contains: Milk' },
                        ],
                        options: [
                          {
                            title: 'Serving',
                            values: [
                              {
                                id: '19224',
                                title: '1 each',
                                product: {
                                  name: 'Nonfat Greek Yogurt',
                                  sku: '217918_100536_M21491_1_19224',
                                  attributes: [
                                    { name: 'allergen_statement', value: 'Contains: Milk' },
                                    { name: 'allergens_intolerances', value: ['45'] },
                                    { name: 'calories', value: '90.000000' },
                                    { name: 'total_fat', value: '0.000000' },
                                    { name: 'sodium', value: '55.000000' },
                                    { name: 'serving_size', value: '1' },
                                    { name: 'serving_unit', value: 'each' },
                                    { name: 'recipe_attributes', value: ['99'] },
                                    {
                                      name: 'recipe_ingredients',
                                      value: 'Cultured Pasteurized Nonfat Milk',
                                    },
                                    { name: 'recipe_id', value: 'M21491' },
                                  ],
                                },
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('unexpected request', { status: 500 });
      })
    );

    const result = await getProviderAdapter(school!.providerKind).fetchMenu(school!, {
      date: '2026-06-29',
      locationId: 'observatory',
      meal: 'breakfast',
    });

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    const item = result.data.locations[0]?.periods[0]?.stations[0]?.items[0];
    expect(item?.name).toBe('Scrambled Eggs');
    expect(item?.stationName).toBe('Hearth');
    expect(item?.servingSizeText).toBe('1/2 cup');
    expect(item?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(142.126);
    expect(item?.nutrition.find((fact) => fact.key === 'total_fat')?.unit).toBe('g');
    expect(item?.nutrition.find((fact) => fact.key === 'sodium')?.unit).toBe('mg');
    expect(item?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Egg Blend (Whole Eggs, Water)',
      'Milk',
      'Salt',
    ]);
    expect(item?.allergens.map((allergen) => allergen.key)).toEqual(['milk', 'egg']);
    expect(item?.dietaryTags).toEqual([
      'made_without_gluten',
      'vegan',
      'vegetarian',
      'halal',
      'low_carbon',
    ]);

    const items = result.data.locations.flatMap((location) =>
      location.periods.flatMap((period) => period.stations.flatMap((station) => station.items))
    );
    const configurableVariant = items.find((candidate) => candidate.name === 'Nonfat Greek Yogurt');
    expect(configurableVariant?.nutrition.find((fact) => fact.key === 'calories')?.amount).toBe(90);
    expect(configurableVariant?.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Cultured Pasteurized Nonfat Milk',
    ]);
    expect(configurableVariant?.allergens.map((allergen) => allergen.key)).toEqual(['milk']);
  });
});
