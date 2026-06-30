import { load } from 'cheerio';
import { allergenKeysInIngredientText } from './allergen-text.js';
import { fetchText } from './http.js';
import type { DiningProviderAdapter, ProviderFetchResult } from './types.js';
import type {
  AllergenFact,
  AllergenKey,
  DietaryTag,
  IngredientFact,
  MenuQuery,
  NormalizedMenu,
  NormalizedMenuItem,
  NutritionFact,
  NutritionKey,
  NutritionUnit,
  SchoolCoverage,
} from '../types/dining.js';

type FoodProLocation = {
  id: string;
  name: string;
  shortMenuUrl: string;
};

type FoodProMealLink = {
  id: string;
  name: string;
  url: string;
};

type FoodProItemSeed = {
  name: string;
  category?: string;
  sourceItemId?: string;
  labelUrl: string;
  dietaryTags: DietaryTag[];
  allergens: AllergenFact[];
};

type CheerioElement = NonNullable<Parameters<ReturnType<typeof load>>[0]>;

const LABEL_FETCH_CONCURRENCY = 8;

export class FoodProProvider implements DiningProviderAdapter {
  readonly provider = 'vendor_foodpro' as const;

  async fetchMenu(school: SchoolCoverage, query: MenuQuery): Promise<ProviderFetchResult> {
    const fetchedAt = new Date().toISOString();
    const date = query.date ?? fetchedAt.slice(0, 10);

    try {
      const locations = await getLocations(school.sourceUrl, query.locationId);
      const locationMenus = await Promise.all(
        locations.map((location) => fetchLocationMenu(school, location, date, query.meal))
      );

      const menu: NormalizedMenu = {
        schoolId: school.id,
        providerKind: this.provider,
        sourceUrl: school.sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations: locationMenus.filter((location) => location.periods.length > 0),
      };

      return {
        state: 'adapter_ready',
        provider: this.provider,
        fetchedAt,
        sourceUrl: school.sourceUrl,
        data: menu,
      };
    } catch (error) {
      return {
        state: 'provider_error',
        provider: this.provider,
        sourceUrl: school.sourceUrl,
        reason: 'FoodPro provider fetch failed.',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

async function getLocations(sourceUrl: string, locationId?: string): Promise<FoodProLocation[]> {
  const html = await fetchText(sourceUrl);
  const $ = load(html);
  const baseUrl = new URL(sourceUrl);
  const locations = new Map<string, FoodProLocation>();

  $('a[href*="shortmenu.aspx"]').each((_index, element) => {
    const href = $(element).attr('href');
    if (!href) return;

    const url = new URL(href, baseUrl);
    const id = normalizeWhitespace(url.searchParams.get('locationNum')) ?? '';
    const name = normalizeWhitespace(url.searchParams.get('locationName')) ?? normalizeWhitespace($(element).text()) ?? '';
    if (!id || !name || locations.has(id)) return;

    locations.set(id, {
      id,
      name,
      shortMenuUrl: url.toString(),
    });
  });

  if (locations.size === 0 && $('a[href*="label.aspx"]').length > 0) {
    locations.set('menu', {
      id: 'menu',
      name: normalizeWhitespace($('h1').first().text()) ?? 'Dining Menu',
      shortMenuUrl: sourceUrl,
    });
  }

  const values = [...locations.values()];
  if (!locationId) return values;

  const needle = locationId.toLowerCase();
  return values.filter(
    (location) => location.id === needle || slugify(location.name).includes(needle)
  );
}

async function fetchLocationMenu(
  school: SchoolCoverage,
  location: FoodProLocation,
  date: string,
  meal?: string
): Promise<NormalizedMenu['locations'][number]> {
  const mealLinks = await getMealLinks(location, date, meal);
  const periods = await Promise.all(
    mealLinks.map((mealLink) => fetchMealPeriod(school, location, mealLink, date))
  );

  return {
    id: location.id,
    name: location.name,
    sourceLocationId: location.id,
    date,
    periods: periods.filter((period) => period.stations.some((station) => station.items.length > 0)),
  };
}

async function getMealLinks(location: FoodProLocation, date: string, meal?: string) {
  const shortMenuUrl = withDate(location.shortMenuUrl, date, 'shortmenu.aspx');
  const html = await fetchText(shortMenuUrl);
  const $ = load(html);
  const mealNeedle = meal?.toLowerCase();
  const links: FoodProMealLink[] = [];

  if ($('a[href*="label.aspx"]').length > 0) {
    return [
      {
        id: 'menu',
        name: 'Menu',
        url: shortMenuUrl,
      },
    ];
  }

  $('a[href*="longmenu.aspx"]').each((_index, element) => {
    const href = $(element).attr('href');
    if (!href) return;

    const url = new URL(href, shortMenuUrl);
    const name = normalizeWhitespace(url.searchParams.get('mealName')) ?? normalizeWhitespace($(element).attr('name')) ?? 'Menu';
    if (mealNeedle && !name.toLowerCase().includes(mealNeedle)) return;

    links.push({
      id: slugify(name),
      name,
      url: withDate(url.toString(), date, 'longmenu.aspx'),
    });
  });

  return dedupeBy(links, (link) => link.id);
}

async function fetchMealPeriod(
  school: SchoolCoverage,
  location: FoodProLocation,
  mealLink: FoodProMealLink,
  date: string
): Promise<NormalizedMenu['locations'][number]['periods'][number]> {
  const html = await fetchText(mealLink.url);
  const $ = load(html);
  const seeds = parseFoodProItemSeeds($, mealLink.url);
  const items = await mapWithConcurrency(seeds, LABEL_FETCH_CONCURRENCY, (seed, index) =>
    fetchLabelItem(seed, {
      date,
      index,
      mealName: mealLink.name,
      school,
      location,
    })
  );
  const stationMap = new Map<string, NormalizedMenu['locations'][number]['periods'][number]['stations'][number]>();

  for (const item of items.filter((item): item is NormalizedMenuItem => Boolean(item))) {
    const stationName = item.category ?? 'Menu';
    const stationId = slugify(stationName) || 'menu';
    const station =
      stationMap.get(stationId) ??
      {
        id: `${location.id}-${mealLink.id}-${stationId}`,
        name: stationName,
        sourceStationId: stationId,
        items: [],
      };
    station.items.push({
      ...item,
      stationId: station.id,
      stationName: station.name,
    });
    stationMap.set(stationId, station);
  }

  return {
    id: `${location.id}-${mealLink.id}`,
    name: mealLink.name,
    sourcePeriodId: mealLink.name,
    stations: [...stationMap.values()],
  };
}

function parseFoodProItemSeeds($: ReturnType<typeof load>, sourceUrl: string) {
  const seeds: FoodProItemSeed[] = [];
  let category: string | undefined;

  $('.longmenucolmenucat, .longmenucoldispname').each((_index, element) => {
    const categoryText = normalizeWhitespace($(element).find('.longmenucolmenucat').addBack('.longmenucolmenucat').text());
    if (categoryText) {
      category = categoryText.replace(/^--\s*/, '').replace(/\s*--$/, '');
      return;
    }

    const link = $(element).find('a[href*="label.aspx"]').first();
    const href = link.attr('href');
    const name = normalizeWhitespace(link.text());
    if (!href || !name) return;

    const labelUrl = new URL(href, sourceUrl).toString();
    const sourceItemId = normalizeWhitespace(new URL(labelUrl).searchParams.get('RecNumAndPort'));
    const iconLabels = $(element)
      .closest('tr')
      .find('img[alt]')
      .map((_iconIndex, icon) => normalizeWhitespace($(icon).attr('alt')))
      .get()
      .filter((label): label is string => Boolean(label));

    seeds.push({
      name,
      category,
      sourceItemId,
      labelUrl,
      dietaryTags: normalizeDietaryTags(iconLabels),
      allergens: normalizeAllergens(iconLabels),
    });
  });

  if (seeds.length === 0) {
    $('.card').each((_cardIndex, cardElement) => {
      const categoryText = normalizeWhitespace(
        $(cardElement).find('.card-title, h2, h3, h4').first().text()
      );

      $(cardElement)
        .find('a[href*="label.aspx"]')
        .each((_linkIndex, element) => {
          const href = $(element).attr('href');
          const name = normalizeWhitespace($(element).text());
          if (!href || !name) return;

          const labelUrl = new URL(href, sourceUrl).toString();
          const sourceItemId = normalizeWhitespace(new URL(labelUrl).searchParams.get('RecNumAndPort'));
          const row = $(element).closest('.menu-item-row, tr, li');
          const iconLabels = row
            .find('img[alt]')
            .map((_iconIndex, icon) => normalizeWhitespace($(icon).attr('alt')))
            .get()
            .filter((label): label is string => Boolean(label));

          seeds.push({
            name,
            category: categoryText,
            sourceItemId,
            labelUrl,
            dietaryTags: normalizeDietaryTags(iconLabels),
            allergens: normalizeAllergens(iconLabels),
          });
        });
    });
  }

  return seeds;
}

async function fetchLabelItem(
  seed: FoodProItemSeed,
  context: {
    date: string;
    index: number;
    mealName: string;
    school: SchoolCoverage;
    location: FoodProLocation;
  }
): Promise<NormalizedMenuItem | undefined> {
  const html = await fetchText(seed.labelUrl);
  const $ = load(html);
  const name = normalizeWhitespace($('.labelrecipe').first().text()) ?? seed.name;
  const ingredientStatement = normalizeWhitespace($('.labelingredientsvalue').first().text());
  const allergenLabels = splitList($('.labelallergensvalue').first().text());
  const servingSizeText = normalizeWhitespace($('.nutfactsservsize').last().text());
  const nutrition = normalizeNutrition($);
  const mergedAllergens = mergeAllergens([...seed.allergens, ...normalizeAllergens(allergenLabels)]);

  return {
    id: `${context.school.id}-${context.location.id}-${context.date}-${slugify(context.mealName)}-${
      seed.sourceItemId ? slugify(seed.sourceItemId) : context.index
    }`,
    sourceItemId: seed.sourceItemId,
    name,
    normalizedName: name.toLowerCase(),
    category: seed.category,
    servingSizeText,
    availability: {
      status: 'planned',
    },
    dietaryTags: seed.dietaryTags,
    allergens: mergedAllergens,
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    nutrition,
    itemUrl: seed.labelUrl,
    sourceUrl: seed.labelUrl,
    raw: {
      labelLines: $('.nutfactstopnutrient')
        .map((_index, element) => normalizeWhitespace($(element).text()))
        .get()
        .filter((line): line is string => Boolean(line)),
    },
  };
}

function normalizeNutrition($: ReturnType<typeof load>): NutritionFact[] {
  const facts = new Map<NutritionKey, NutritionFact>();
  const calories = Number(normalizeWhitespace($('.nutfactscaloriesval').first().text()));

  if (Number.isFinite(calories)) {
    facts.set('calories', {
      key: 'calories',
      label: 'Calories',
      amount: calories,
      unit: 'kcal',
      sourceText: `Calories: ${calories}`,
    });
  }

  $('.nutfactstopnutrient').each((_index, element) => {
    const sourceText = normalizeWhitespace($(element).text().replace(/\u00a0/g, ' '));
    if (!sourceText) return;

    const fact = parseNutritionLine(sourceText);
    if (!fact || facts.has(fact.key)) return;
    facts.set(fact.key, fact);
  });

  const servingSize = normalizeWhitespace($('.nutfactsservsize').last().text());
  if (servingSize) {
    facts.set('serving_size', {
      key: 'serving_size',
      label: 'Serving Size',
      sourceText: servingSize,
    });
  }

  return [...facts.values()];
}

function parseNutritionLine(sourceText: string): NutritionFact | undefined {
  const normalized = sourceText
    .replace(/^Includes\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const mappings: Array<{ pattern: RegExp; key: NutritionKey; label: string; defaultUnit?: NutritionUnit }> = [
    { pattern: /^Calories\s+(.+)/i, key: 'calories', label: 'Calories', defaultUnit: 'kcal' },
    { pattern: /^(Total Fat|Fat)\s+(.+)/i, key: 'total_fat', label: 'Total Fat', defaultUnit: 'g' },
    { pattern: /^Saturated Fat\s+(.+)/i, key: 'saturated_fat', label: 'Saturated Fat', defaultUnit: 'g' },
    { pattern: /^(Trans Fatty Acid|Trans Fat)\s+(.+)/i, key: 'trans_fat', label: 'Trans Fat', defaultUnit: 'g' },
    { pattern: /^Cholesterol\s+(.+)/i, key: 'cholesterol', label: 'Cholesterol', defaultUnit: 'mg' },
    { pattern: /^Sodium\s+(.+)/i, key: 'sodium', label: 'Sodium', defaultUnit: 'mg' },
    { pattern: /^(Total Carbohydrate\.?|Carbohydrates)\s+(.+)/i, key: 'total_carbohydrate', label: 'Total Carbohydrate', defaultUnit: 'g' },
    { pattern: /^Dietary Fiber\s+(.+)/i, key: 'dietary_fiber', label: 'Dietary Fiber', defaultUnit: 'g' },
    { pattern: /^Total Sugars\s+(.+)/i, key: 'total_sugars', label: 'Total Sugars', defaultUnit: 'g' },
    { pattern: /^Added Sugar[s]?\s+(.+)/i, key: 'added_sugars', label: 'Added Sugars', defaultUnit: 'g' },
    { pattern: /^Protein\s+(.+)/i, key: 'protein', label: 'Protein', defaultUnit: 'g' },
    { pattern: /^Vitamin D(?:\s*-\s*mcg)?\s+(.+)/i, key: 'vitamin_d', label: 'Vitamin D', defaultUnit: 'mcg' },
    { pattern: /^Calcium\s+(.+)/i, key: 'calcium', label: 'Calcium', defaultUnit: 'mg' },
    { pattern: /^Iron\s+(.+)/i, key: 'iron', label: 'Iron', defaultUnit: 'mg' },
    { pattern: /^Potassium\s+(.+)/i, key: 'potassium', label: 'Potassium', defaultUnit: 'mg' },
  ];

  for (const mapping of mappings) {
    const match = normalized.match(mapping.pattern);
    if (!match) continue;

    const amountText = (match[2] ?? match[1] ?? '').replace(/\s+\d+%$/, '');
    const parsed = parseAmount(amountText);
    return {
      key: mapping.key,
      label: mapping.label,
      amount: parsed.amount,
      unit: parsed.unit ?? mapping.defaultUnit,
      sourceText,
    };
  }

  return undefined;
}

function parseAmount(raw: string): { amount?: number; unit?: NutritionUnit } {
  const match = raw.match(/(-?[\d.]+)\s*([a-zA-Z]*)/);
  if (!match) return {};

  const unit = match[2]?.toLowerCase();
  return {
    amount: Number(match[1]),
    unit:
      unit === 'g'
        ? 'g'
        : unit === 'mg'
          ? 'mg'
          : unit === 'mcg'
            ? 'mcg'
            : unit === 'kcal'
              ? 'kcal'
              : unit === 'iu'
                ? 'iu'
                : undefined,
  };
}

function withDate(url: string, date: string, defaultPath: string) {
  const parsed = new URL(url);
  if (!parsed.pathname.endsWith(defaultPath)) {
    parsed.pathname = parsed.pathname.replace(/[^/]+$/, defaultPath);
  }
  parsed.searchParams.set('myaction', 'read');
  parsed.searchParams.set('dtdate', toFoodProDate(date));
  return parsed.toString();
}

function toFoodProDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return `${pad(month)}/${pad(day)}/${year}`;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as T, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );
  return results;
}

function dedupeBy<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function normalizeDietaryTags(labels: string[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const label of labels) {
    const value = label.toLowerCase();
    if (value.includes('vegan')) tags.add('vegan');
    else if (value.includes('vegetarian') || value.includes('veggie')) tags.add('vegetarian');
    else if (value.includes('halal')) tags.add('halal');
  }
  return [...tags];
}

function normalizeAllergens(labels: string[]): AllergenFact[] {
  return labels
    .map((label) => normalizeWhitespace(label.replace(/^contains\s+/i, '')))
    .filter((label): label is string => Boolean(label))
    .map((label) => ({
      key: mapAllergenKey(label),
      label,
      status: 'contains' as const,
      sourceText: label,
    }))
    .filter((fact) => fact.key !== 'other' || !normalizeDietaryTags([fact.label]).length);
}

function mergeAllergens(facts: AllergenFact[]) {
  const deduped = new Map<string, AllergenFact>();
  for (const fact of facts) {
    deduped.set(`${fact.key}:${fact.label.toLowerCase()}:${fact.status}`, fact);
  }
  return [...deduped.values()];
}

function splitIngredients(statement?: string): IngredientFact[] {
  if (!statement) return [];

  return splitIngredientNames(statement)
    .map((ingredient) => normalizeWhitespace(ingredient))
    .filter((ingredient): ingredient is string => Boolean(ingredient))
    .map((name) => ({
      name,
      normalizedName: name.toLowerCase(),
      containsAllergenKeys: ingredientAllergens(name),
      sourceText: name,
    }));
}

function splitIngredientNames(statement: string) {
  const ingredients: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of statement) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);

    if (char === ',' && depth === 0) {
      ingredients.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  ingredients.push(current);
  return ingredients;
}

function ingredientAllergens(name: string): AllergenKey[] {
  return allergenKeysInIngredientText(name);
}

function mapAllergenKey(label: string): AllergenKey {
  const value = label.toLowerCase();
  if (value.includes('milk') || value.includes('dairy')) return 'milk';
  if (value.includes('egg')) return 'egg';
  if (value.includes('fish')) return 'fish';
  if (value.includes('shellfish') || value.includes('shrimp') || value.includes('crab')) {
    return 'crustacean_shellfish';
  }
  if (value.includes('tree nut') || value.includes('almond') || value.includes('walnut')) {
    return 'tree_nut';
  }
  if (value.includes('peanut')) return 'peanut';
  if (value.includes('wheat')) return 'wheat';
  if (value.includes('soy')) return 'soy';
  if (value.includes('sesame')) return 'sesame';
  if (value.includes('gluten')) return 'gluten';
  return 'other';
}

function splitList(value?: string) {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => normalizeWhitespace(part))
    .filter((part): part is string => Boolean(part));
}

function normalizeWhitespace(value?: string | null) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
