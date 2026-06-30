import { load } from 'cheerio';
import { allergenKeysInIngredientText } from './allergen-text.js';
import { fetchJson, fetchText } from './http.js';
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

type HarvardMenuRow = {
  category: number;
  date: string;
  location: number[];
  meal: number;
  recipe: number;
};

type HarvardRecipe = {
  allergens?: string[];
  calories?: number | null;
  cholesterol?: HarvardNutritionAmount;
  dietary_fiber?: HarvardNutritionAmount;
  id: number;
  information?: string | null;
  ingredients?: string | null;
  name: string;
  protein?: HarvardNutritionAmount;
  sat_fat?: HarvardNutritionAmount;
  serving_size?: string | null;
  sodium?: HarvardNutritionAmount;
  sugars?: HarvardNutritionAmount;
  total_carb?: HarvardNutritionAmount;
  total_fat?: HarvardNutritionAmount;
  trans_fat?: HarvardNutritionAmount;
  vegan?: boolean;
  vegetarian?: boolean;
};

type HarvardNutritionAmount = {
  amount?: string | number;
  percent?: number;
};

type HarvardLookup = {
  id: number;
  name: string;
};

type HarvardReferenceData = {
  recipes: Map<number, HarvardRecipe>;
  categories: Map<number, string>;
  meals: Map<number, string>;
  locations: Map<number, string>;
};

type PrincetonLocationLink = {
  id: string;
  name: string;
};

type BrownLocation = {
  name: string;
  locationId: string;
  locationAddress?: string;
  meals?: Record<string, BrownMeal[]>;
};

type BrownMeal = {
  name?: string;
  meal: string;
  menu?: {
    date?: string;
    hours?: {
      start?: string;
      end?: string;
    };
    stations?: BrownStation[];
  };
};

type BrownStation = {
  stationId?: string | number;
  name: string;
  items?: BrownMenuItem[];
};

type BrownMenuItem = {
  itemId?: string | number;
  item?: string;
  icons?: string[];
  allergens?: string[];
  description?: string;
  itemType?: string;
};

type BrownNutritionValue = {
  amount?: string | number | null;
  percent?: number | null;
};

type BrownNutritionDetail = {
  name?: string;
  description?: string;
  icons?: string[];
  allergens?: string[];
  ingredients?: string;
  itemPortionSize?: string | number | null;
  itemPortionSizeUnit?: string | null;
  baseValues?: Record<string, BrownNutritionValue>;
  portionValues?: Record<string, BrownNutritionValue> | null;
};

type CornellDiningResponse = {
  status?: string;
  data?: {
    eateries?: CornellEatery[];
  };
};

type CornellEatery = {
  id: number;
  slug: string;
  name: string;
  nameshort?: string;
  location?: string;
  campusArea?: {
    descr?: string;
  };
  operatingHours?: CornellOperatingDay[];
};

type CornellOperatingDay = {
  date?: string;
  events?: CornellEvent[];
};

type CornellEvent = {
  descr?: string;
  start?: string;
  end?: string;
  calSummary?: string;
  menu?: CornellMenuCategory[];
};

type CornellMenuCategory = {
  category?: string;
  sortIdx?: number;
  items?: CornellMenuItem[];
};

type CornellMenuItem = {
  item?: string;
  healthy?: boolean;
  sortIdx?: number;
};

type CheerioElement = NonNullable<Parameters<ReturnType<typeof load>>[0]>;

let harvardReferenceCache:
  | {
      loadedAt: number;
      data: HarvardReferenceData;
    }
  | undefined;

const HARVARD_API_BASE = 'https://api.cs50.io/dining';
const PRINCETON_MENU_BASE = 'https://menus.princeton.edu/dining/_Foodpro/online-menu';
const BROWN_MENUS_URL = 'https://esb-level1.brown.edu/services/oit/sys/brown-dining/v1/menus';
const BROWN_NUTRITION_BASE = 'https://menus.dining.brown.edu/api/get_nutrition';
const CORNELL_EATERIES_URL = 'https://admin-now.dining.cornell.edu/api/1.0/dining/eateries.json';
const UCSB_DAY_MENU_URL = 'https://apps.dining.ucsb.edu/menu/day';
const REFERENCE_CACHE_MS = 60 * 60 * 1000;
const BROWN_DETAIL_CONCURRENCY = 8;

const BROWN_NUTRITION_MAP: Record<
  string,
  { key: NutritionKey; label: string; unit: NutritionUnit }
> = {
  calories: { key: 'calories', label: 'Calories', unit: 'kcal' },
  fat: { key: 'total_fat', label: 'Total Fat', unit: 'g' },
  saturatedFat: { key: 'saturated_fat', label: 'Saturated Fat', unit: 'g' },
  transFat: { key: 'trans_fat', label: 'Trans Fat', unit: 'g' },
  cholesterol: { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
  sodium: { key: 'sodium', label: 'Sodium', unit: 'mg' },
  carbohydrates: { key: 'total_carbohydrate', label: 'Total Carbohydrate', unit: 'g' },
  fiber: { key: 'dietary_fiber', label: 'Dietary Fiber', unit: 'g' },
  sugars: { key: 'total_sugars', label: 'Total Sugars', unit: 'g' },
  addedSugar: { key: 'added_sugars', label: 'Added Sugars', unit: 'g' },
  protein: { key: 'protein', label: 'Protein', unit: 'g' },
  vitaminD: { key: 'vitamin_d', label: 'Vitamin D', unit: 'mcg' },
  calcium: { key: 'calcium', label: 'Calcium', unit: 'mg' },
  iron: { key: 'iron', label: 'Iron', unit: 'mg' },
  potassium: { key: 'potassium', label: 'Potassium', unit: 'mg' },
};

export class OfficialApiProvider implements DiningProviderAdapter {
  readonly provider = 'official_api' as const;

  async fetchMenu(school: SchoolCoverage, query: MenuQuery): Promise<ProviderFetchResult> {
    if (school.id === 'harvard') {
      return fetchHarvardMenu(school, query);
    }

    if (school.id === 'princeton') {
      return fetchPrincetonMenu(school, query);
    }

    if (school.id === 'brown') {
      return fetchBrownMenu(school, query);
    }

    if (school.id === 'cornell') {
      return fetchCornellMenu(school, query);
    }

    if (school.id === 'ucsb') {
      return fetchUcsbMenu(school, query);
    }

    return {
      state: 'adapter_pending',
      provider: this.provider,
      sourceUrl: school.sourceUrl,
      reason: 'Official API source is cataloged, but this school-specific adapter is not implemented yet.',
    };
  }
}

async function fetchPrincetonMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const locations = await getPrincetonLocations(query.locationId);
    const locationMenus = await Promise.all(
      locations.map((location) => fetchPrincetonLocationMenu(location, date, query.meal))
    );

    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'official_api',
      sourceUrl: school.sourceUrl,
      fetchedAt,
      freshnessMinutes: 0,
      locations: locationMenus.filter((location) => location.periods.length > 0),
    };

    return {
      state: 'adapter_ready',
      provider: 'official_api',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_api',
      sourceUrl: school.sourceUrl,
      reason: 'Princeton FoodPro menu fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getPrincetonLocations(locationId?: string): Promise<PrincetonLocationLink[]> {
  const html = await fetchText(`${PRINCETON_MENU_BASE}/default.asp`);
  const $ = load(html);
  const locations = new Map<string, PrincetonLocationLink>();

  $('a[href*="menuDetails.asp"]').each((_index, element) => {
    const href = $(element).attr('href');
    if (!href) return;

    const url = new URL(href, `${PRINCETON_MENU_BASE}/`);
    const id = normalizeWhitespace(url.searchParams.get('locationNum')) ?? '';
    const name = normalizeWhitespace(url.searchParams.get('locationName')) ?? '';
    if (!id || !name || locations.has(id)) return;

    locations.set(id, { id, name });
  });

  const values = [...locations.values()];
  if (!locationId) return values;

  const needle = locationId.toLowerCase();
  return values.filter(
    (location) => location.id === needle || slugify(location.name).includes(needle)
  );
}

async function fetchPrincetonLocationMenu(
  location: PrincetonLocationLink,
  date: string,
  meal?: string
): Promise<NormalizedMenu['locations'][number]> {
  const url = buildPrincetonMenuUrl(location, date);
  const html = await fetchText(url);
  const $ = load(html);
  const locationName = normalizeWhitespace($('h1').first().text()) ?? location.name;
  const mealNeedle = meal?.toLowerCase();
  const periods: NormalizedMenu['locations'][number]['periods'] = [];

  $('.mealCard').each((_cardIndex, cardElement) => {
    const header = $(cardElement).find('> .card-header').clone();
    header.find('*').remove();
    const mealName = normalizeWhitespace(header.text()) ?? 'Menu';
    if (mealNeedle && !mealName.toLowerCase().includes(mealNeedle)) return;

    const items: NormalizedMenuItem[] = [];
    $(cardElement)
      .find('.accordion-item')
      .each((itemIndex, itemElement) => {
        const item = normalizePrincetonItem($, itemElement, {
          date,
          itemIndex,
          mealName,
          location,
          sourceUrl: url,
        });

        if (item) {
          items.push(item);
        }
      });

    if (items.length === 0) return;

    const periodId = slugify(mealName);
    periods.push({
      id: `${location.id}-${periodId}`,
      name: mealName,
      sourcePeriodId: mealName,
      stations: [
        {
          id: `${location.id}-${periodId}-menu`,
          name: 'Menu',
          items,
        },
      ],
    });
  });

  return {
    id: location.id,
    name: locationName,
    sourceLocationId: location.id,
    date,
    periods,
  };
}

function buildPrincetonMenuUrl(location: PrincetonLocationLink, date: string) {
  const url = new URL(`${PRINCETON_MENU_BASE}/menuDetails.asp`);
  url.searchParams.set('myaction', 'read');
  url.searchParams.set('sName', 'Princeton University Campus Dining');
  url.searchParams.set('dtdate', toFoodProDate(date));
  url.searchParams.set('locationNum', location.id);
  url.searchParams.set('locationName', location.name);
  url.searchParams.set('naFlag', '1');
  return url.toString();
}

function toFoodProDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return `${month}/${day}/${year}`;
}

function normalizePrincetonItem(
  $: ReturnType<typeof load>,
  itemElement: CheerioElement,
  context: {
    date: string;
    itemIndex: number;
    mealName: string;
    location: PrincetonLocationLink;
    sourceUrl: string;
  }
): NormalizedMenuItem | undefined {
  const buttonText = $(itemElement).find('.btn-text').first();
  const name = normalizeWhitespace(buttonText.text());
  if (!name) return undefined;

  const recipeId = normalizeWhitespace(buttonText.attr('data-recipeid'));
  const factLines = extractPrincetonFactLines($, itemElement);
  const factMap = factLines.reduce<Record<string, string>>((acc, line) => {
    const pair = splitLabelValue(line);
    if (!pair) return acc;
    acc[pair.label] = pair.value;
    return acc;
  }, {});
  const ingredientStatement = normalizeWhitespace(factMap.Ingredients);
  const allergenLabels = splitList(factMap.Allergens);
  const labelHref = $(itemElement).find('.tour-nutrition-link').first().attr('href');
  const itemUrl = labelHref ? new URL(labelHref, `${PRINCETON_MENU_BASE}/`).toString() : undefined;

  return {
    id: `princeton-${context.location.id}-${context.date}-${slugify(context.mealName)}-${
      recipeId ?? context.itemIndex
    }`,
    sourceItemId: recipeId,
    name,
    normalizedName: name.toLowerCase(),
    stationId: `${context.location.id}-${slugify(context.mealName)}-menu`,
    stationName: 'Menu',
    servingSizeText: normalizeWhitespace(factMap['Serving Size']),
    availability: {
      status: 'planned',
    },
    dietaryTags: [],
    allergens: normalizeAllergens(allergenLabels),
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    nutrition: normalizePrincetonNutrition(factMap),
    itemUrl,
    sourceUrl: context.sourceUrl,
    raw: {
      recipeId,
      factLines,
    },
  };
}

function extractPrincetonFactLines($: ReturnType<typeof load>, itemElement: CheerioElement) {
  const factHtml = $(itemElement).find('.nutritionFact').first().html();
  if (!factHtml) return [];

  const text = load(`<body>${factHtml.replace(/<br\s*\/?\s*>/gi, '\n')}</body>`).text();
  return text
    .split('\n')
    .map((line) => normalizeWhitespace(line.replace(/\u00a0/g, ' ')))
    .filter((line): line is string => Boolean(line))
    .filter((line) => line !== 'Open Nutrition Label')
    .filter((line) => !line.startsWith('Nutritional Information is not available'));
}

function splitLabelValue(line: string) {
  const separatorIndex = line.indexOf(':');
  if (separatorIndex === -1) return undefined;

  const label = normalizeWhitespace(line.slice(0, separatorIndex));
  const value = normalizeWhitespace(line.slice(separatorIndex + 1));
  if (!label || !value) return undefined;

  return { label, value };
}

function splitList(value?: string) {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => normalizeWhitespace(part))
    .filter((part): part is string => Boolean(part));
}

function normalizePrincetonNutrition(factMap: Record<string, string>): NutritionFact[] {
  const facts: NutritionFact[] = [];
  const mappings: Array<{
    label: string;
    key: NutritionKey;
    defaultUnit?: NutritionUnit;
  }> = [
    { label: 'Serving Size', key: 'serving_size' },
    { label: 'Calories', key: 'calories', defaultUnit: 'kcal' },
    { label: 'Total Fat', key: 'total_fat', defaultUnit: 'g' },
    { label: 'Saturated Fat', key: 'saturated_fat', defaultUnit: 'g' },
    { label: 'Trans Fat', key: 'trans_fat', defaultUnit: 'g' },
    { label: 'Total Carbohydrates', key: 'total_carbohydrate', defaultUnit: 'g' },
    { label: 'Dietary Fiber', key: 'dietary_fiber', defaultUnit: 'g' },
    { label: 'Sugars', key: 'total_sugars', defaultUnit: 'g' },
    { label: 'Cholesterol', key: 'cholesterol', defaultUnit: 'mg' },
    { label: 'Protein', key: 'protein', defaultUnit: 'g' },
    { label: 'Sodium', key: 'sodium', defaultUnit: 'mg' },
  ];

  for (const mapping of mappings) {
    const value = factMap[mapping.label];
    if (!value) continue;

    if (mapping.key === 'serving_size') {
      facts.push({
        key: mapping.key,
        label: mapping.label,
        sourceText: `${mapping.label}: ${value}`,
      });
      continue;
    }

    const dailyValuePercent = parseDailyValuePercent(value);
    const parsed = parseAmount(value.replace(/\([^)]*RDV\)/gi, '').replace(/-/g, '').trim());
    facts.push({
      key: mapping.key,
      label: mapping.label,
      amount: parsed.amount,
      unit: parsed.unit ?? mapping.defaultUnit,
      dailyValuePercent,
      sourceText: `${mapping.label}: ${value}`,
    });
  }

  return facts;
}

function parseDailyValuePercent(value: string) {
  const match = value.match(/\(([\d.]+)%\s*RDV\)/i);
  return match ? Number(match[1]) : undefined;
}

async function fetchBrownMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const locations = await fetchJson<BrownLocation[]>(BROWN_MENUS_URL, 30000);
    const detailCache = new Map<string, Promise<BrownNutritionDetail | undefined>>();
    const locationMenus = await Promise.all(
      filterBrownLocations(locations, query.locationId).map((location) =>
        fetchBrownLocationMenu(school, location, date, query.meal, detailCache)
      )
    );

    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'official_api',
      sourceUrl: school.sourceUrl,
      fetchedAt,
      freshnessMinutes: 0,
      locations: locationMenus.filter((location) => location.periods.length > 0),
    };

    return {
      state: 'adapter_ready',
      provider: 'official_api',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_api',
      sourceUrl: school.sourceUrl,
      reason: 'Brown dining menu API fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function filterBrownLocations(locations: BrownLocation[], locationId?: string) {
  if (!locationId) return locations;

  const needle = locationId.toLowerCase();
  return locations.filter(
    (location) =>
      location.locationId.toLowerCase() === needle ||
      slugify(location.name) === needle ||
      slugify(location.name).includes(needle)
  );
}

async function fetchBrownLocationMenu(
  school: SchoolCoverage,
  location: BrownLocation,
  date: string,
  meal?: string,
  detailCache?: Map<string, Promise<BrownNutritionDetail | undefined>>
): Promise<NormalizedMenu['locations'][number]> {
  const mealNeedle = meal?.toLowerCase();
  const sourceMeals = (location.meals?.[date] ?? []).filter(
    (sourceMeal) => !mealNeedle || sourceMeal.meal.toLowerCase().includes(mealNeedle)
  );
  const periods = await Promise.all(
    sourceMeals.map((sourceMeal) =>
      normalizeBrownPeriod(school, location, date, sourceMeal, detailCache ?? new Map())
    )
  );

  return {
    id: location.locationId,
    name: location.name,
    sourceLocationId: location.locationId,
    address: normalizeWhitespace(location.locationAddress),
    timezone: 'America/New_York',
    date,
    periods: periods.filter((period) => period.stations.some((station) => station.items.length > 0)),
  };
}

async function normalizeBrownPeriod(
  school: SchoolCoverage,
  location: BrownLocation,
  date: string,
  sourceMeal: BrownMeal,
  detailCache: Map<string, Promise<BrownNutritionDetail | undefined>>
): Promise<NormalizedMenu['locations'][number]['periods'][number]> {
  const stations = await Promise.all(
    (sourceMeal.menu?.stations ?? []).map(async (station) => {
      const stationId = `${location.locationId}-${slugify(sourceMeal.meal)}-${
        station.stationId ?? slugify(station.name)
      }`;
      const items = await mapWithConcurrency(
        station.items ?? [],
        BROWN_DETAIL_CONCURRENCY,
        async (item, index) => {
          const detail = await getBrownItemDetail(item, detailCache);
          return normalizeBrownItem(school, location, sourceMeal, station, item, detail, date, index);
        }
      );

      return {
        id: stationId,
        name: station.name,
        sourceStationId: station.stationId === undefined ? station.name : String(station.stationId),
        items,
      };
    })
  );

  return {
    id: `${location.locationId}-${slugify(sourceMeal.meal)}`,
    name: sourceMeal.meal,
    sourcePeriodId: sourceMeal.meal,
    startTime: sourceMeal.menu?.hours?.start,
    endTime: sourceMeal.menu?.hours?.end,
    stations: stations.filter((station) => station.items.length > 0),
  };
}

async function getBrownItemDetail(
  item: BrownMenuItem,
  cache: Map<string, Promise<BrownNutritionDetail | undefined>>
) {
  if (!item.itemId || !item.itemType) return undefined;

  const key = `${item.itemType}:${item.itemId}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = fetchBrownItemDetail(item).catch(() => undefined);
  cache.set(key, promise);
  return promise;
}

async function fetchBrownItemDetail(item: BrownMenuItem) {
  const url = new URL(BROWN_NUTRITION_BASE);
  url.searchParams.set('id', String(item.itemId));
  url.searchParams.set('type', String(item.itemType));
  return fetchJson<BrownNutritionDetail>(url.toString(), 30000);
}

function normalizeBrownItem(
  school: SchoolCoverage,
  location: BrownLocation,
  sourceMeal: BrownMeal,
  station: BrownStation,
  item: BrownMenuItem,
  detail: BrownNutritionDetail | undefined,
  date: string,
  index: number
): NormalizedMenuItem {
  const name = normalizeWhitespace(detail?.name) ?? normalizeWhitespace(item.item) ?? 'Menu Item';
  const stationId = `${location.locationId}-${slugify(sourceMeal.meal)}-${
    station.stationId ?? slugify(station.name)
  }`;
  const itemUrl =
    item.itemId && item.itemType
      ? `https://menus.dining.brown.edu/nutrition/${item.itemId}?type=${item.itemType}`
      : undefined;
  const ingredientStatement = normalizeBrownIngredientStatement(detail?.ingredients);
  const allergens = mergeAllergens([
    ...normalizeAllergens(item.allergens ?? []),
    ...normalizeAllergens(detail?.allergens ?? []),
  ]);

  return {
    id: `${school.id}-${location.locationId}-${date}-${slugify(sourceMeal.meal)}-${
      station.stationId ?? slugify(station.name)
    }-${item.itemId ?? index}`,
    sourceItemId: item.itemId === undefined ? undefined : String(item.itemId),
    name,
    normalizedName: name.toLowerCase(),
    description: normalizeWhitespace(detail?.description) ?? normalizeWhitespace(item.description),
    category: station.name,
    stationId,
    stationName: station.name,
    servingSizeText: normalizeBrownServingSize(detail),
    availability: {
      status: 'planned',
      startTime: sourceMeal.menu?.hours?.start,
      endTime: sourceMeal.menu?.hours?.end,
    },
    dietaryTags: normalizeBrownDietaryTags([...(item.icons ?? []), ...(detail?.icons ?? [])]),
    allergens,
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    nutrition: normalizeBrownNutrition(detail),
    itemUrl,
    sourceUrl: itemUrl ?? 'https://menus.dining.brown.edu/',
    raw: {
      item,
      detailAvailable: Boolean(detail),
      nutritionBasis: detail?.portionValues ? 'portion' : detail?.baseValues ? '100g' : undefined,
    },
  };
}

function normalizeBrownNutrition(detail?: BrownNutritionDetail): NutritionFact[] {
  if (!detail) return [];

  const facts: NutritionFact[] = [];
  const servingSizeText = normalizeBrownServingSize(detail);
  if (servingSizeText) {
    facts.push({
      key: 'serving_size',
      label: 'Serving Size',
      sourceText: servingSizeText,
    });
  }

  const values = detail.portionValues ?? detail.baseValues ?? {};
  for (const [sourceKey, mapping] of Object.entries(BROWN_NUTRITION_MAP)) {
    const value = values[sourceKey];
    if (!value?.amount && value?.amount !== 0) continue;

    const parsed = parseBrownAmount(value.amount);
    facts.push({
      key: mapping.key,
      label: mapping.label,
      amount: parsed.amount,
      unit: parsed.unit ?? mapping.unit,
      dailyValuePercent: value.percent ?? undefined,
      sourceText: `${mapping.label}: ${value.amount}`,
    });
  }

  return facts;
}

function normalizeBrownServingSize(detail?: BrownNutritionDetail) {
  const amount = detail?.itemPortionSize;
  const unit = normalizeWhitespace(detail?.itemPortionSizeUnit);
  if (amount === undefined || amount === null || amount === '') return undefined;
  return [String(amount), unit].filter(Boolean).join(' ');
}

function normalizeBrownIngredientStatement(value?: string) {
  const normalized = normalizeWhitespace(load(`<body>${value ?? ''}</body>`).text());
  return normalized?.replace(/\s+\)/g, ')');
}

function normalizeBrownDietaryTags(labels: string[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const label of labels) {
    const value = label.toLowerCase();
    if (value === 'vgn' || value.includes('vegan')) tags.add('vegan');
    else if (value === 'vgtn' || value.includes('vegetarian')) tags.add('vegetarian');
    if (value === 'hl' || value.includes('halal')) tags.add('halal');
    if (value === 'kshr' || value.includes('kosher')) tags.add('kosher');
    if (value === 'so' || value.includes('shared oil')) tags.add('other');
  }
  return [...tags];
}

function parseBrownAmount(raw: string | number | null | undefined): {
  amount?: number;
  unit?: NutritionUnit;
} {
  if (typeof raw === 'number') return { amount: raw };
  if (!raw) return {};

  const match = raw.match(/(-?[\d.]+)\s*([a-zA-Zµμ%]*)/);
  if (!match) return {};

  const unit = match[2]?.toLowerCase().replace(/[µμ]/g, 'm');
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
                : unit === '%'
                  ? 'percent_daily_value'
                  : undefined,
  };
}

async function fetchCornellMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const response = await fetchJson<CornellDiningResponse>(CORNELL_EATERIES_URL, 30000);
    const locations = filterCornellLocations(response.data?.eateries ?? [], query.locationId);
    const locationMenus = locations.map((location) =>
      normalizeCornellLocation(school, location, date, query.meal)
    );

    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'official_api',
      sourceUrl: school.sourceUrl,
      fetchedAt,
      freshnessMinutes: 0,
      locations: locationMenus.filter((location) => location.periods.length > 0),
    };

    return {
      state: 'adapter_ready',
      provider: 'official_api',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_api',
      sourceUrl: school.sourceUrl,
      reason: 'Cornell dining API fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function filterCornellLocations(locations: CornellEatery[], locationId?: string) {
  if (!locationId) return locations;

  const needle = locationId.toLowerCase();
  return locations.filter(
    (location) =>
      String(location.id) === needle ||
      location.slug.toLowerCase() === needle ||
      slugify(location.name) === needle ||
      slugify(location.name).includes(needle)
  );
}

function normalizeCornellLocation(
  school: SchoolCoverage,
  location: CornellEatery,
  date: string,
  meal?: string
): NormalizedMenu['locations'][number] {
  const mealNeedle = meal?.toLowerCase();
  const day = location.operatingHours?.find((candidate) => candidate.date === date);
  const periods = (day?.events ?? [])
    .filter((event) => (event.menu ?? []).length > 0)
    .filter((event) => !mealNeedle || normalizeWhitespace(event.descr)?.toLowerCase().includes(mealNeedle))
    .map((event, eventIndex) => normalizeCornellPeriod(school, location, date, event, eventIndex))
    .filter((period) => period.stations.some((station) => station.items.length > 0));

  return {
    id: location.slug,
    name: location.name,
    sourceLocationId: String(location.id),
    address: normalizeWhitespace(location.location),
    timezone: 'America/New_York',
    date,
    periods,
  };
}

function normalizeCornellPeriod(
  school: SchoolCoverage,
  location: CornellEatery,
  date: string,
  event: CornellEvent,
  eventIndex: number
): NormalizedMenu['locations'][number]['periods'][number] {
  const periodName = normalizeWhitespace(event.descr) ?? 'Menu';
  const periodId = `${location.slug}-${slugify(periodName) || eventIndex}`;
  const stations = (event.menu ?? [])
    .map((category, categoryIndex) => {
      const stationName = normalizeWhitespace(category.category) ?? 'Menu';
      const stationId = `${periodId}-${slugify(stationName) || categoryIndex}`;
      const items = (category.items ?? [])
        .map((item, itemIndex) =>
          normalizeCornellItem(school, location, date, periodName, stationId, stationName, item, itemIndex)
        )
        .filter((item): item is NormalizedMenuItem => Boolean(item));

      return {
        id: stationId,
        name: stationName,
        sourceStationId: stationName,
        items,
      };
    })
    .filter((station) => station.items.length > 0);

  return {
    id: periodId,
    name: periodName,
    sourcePeriodId: periodName,
    startTime: event.start,
    endTime: event.end,
    stations,
  };
}

function normalizeCornellItem(
  school: SchoolCoverage,
  location: CornellEatery,
  date: string,
  periodName: string,
  stationId: string,
  stationName: string,
  item: CornellMenuItem,
  itemIndex: number
): NormalizedMenuItem | undefined {
  const name = normalizeWhitespace(item.item);
  if (!name) return undefined;

  return {
    id: `${school.id}-${location.slug}-${date}-${slugify(periodName)}-${slugify(stationName)}-${
      item.sortIdx ?? itemIndex
    }-${slugify(name)}`,
    name,
    normalizedName: name.toLowerCase(),
    category: stationName,
    stationId,
    stationName,
    availability: {
      status: 'planned',
    },
    dietaryTags: [],
    allergens: [],
    ingredients: [],
    nutrition: [],
    sourceUrl: 'https://now.dining.cornell.edu/',
    raw: item,
  };
}

async function fetchUcsbMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);
  const url = new URL(UCSB_DAY_MENU_URL);
  url.searchParams.set('d', date);

  try {
    const html = await fetchText(url.toString(), 30000);
    const $ = load(html);
    const locations = normalizeUcsbLocations($, school, date, query.meal, query.locationId, url.toString());

    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'official_api',
      sourceUrl: school.sourceUrl,
      fetchedAt,
      freshnessMinutes: 0,
      locations,
    };

    return {
      state: 'adapter_ready',
      provider: 'official_api',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_api',
      sourceUrl: school.sourceUrl,
      reason: 'UCSB daily dining menu HTML fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeUcsbLocations(
  $: ReturnType<typeof load>,
  school: SchoolCoverage,
  date: string,
  meal?: string,
  locationId?: string,
  sourceUrl?: string
): NormalizedMenu['locations'] {
  const mealNeedle = meal?.toLowerCase();
  const locationNeedle = locationId?.toLowerCase();
  const locations: NormalizedMenu['locations'] = [];

  $('#menu-row > div').each((_locationIndex, locationElement) => {
    const locationHeading = $(locationElement).find('h3, h4').first().clone();
    locationHeading.find('i, span, small').remove();
    const locationName = normalizeWhitespace(locationHeading.text());
    if (!locationName) return;

    const locationSlug = slugify(locationName);
    if (
      locationNeedle &&
      locationSlug !== locationNeedle &&
      !locationSlug.includes(locationNeedle) &&
      !locationName.toLowerCase().includes(locationNeedle)
    ) {
      return;
    }

    const periods: NormalizedMenu['locations'][number]['periods'] = [];
    $(locationElement)
      .find('.list-panel')
      .each((periodIndex, panelElement) => {
        const heading = $(panelElement).find('.panel-heading h5').first();
        const timeText = normalizeWhitespace(heading.find('small').first().text());
        const mealName =
          normalizeWhitespace(heading.clone().find('small').remove().end().text()) ?? 'Menu';
        if (mealNeedle && !mealName.toLowerCase().includes(mealNeedle)) return;

        const stations = normalizeUcsbStations(
          $,
          school,
          locationSlug,
          mealName,
          date,
          panelElement,
          sourceUrl ?? UCSB_DAY_MENU_URL
        );

        if (stations.length === 0) return;

        const times = parseUcsbTimeRange(timeText);
        periods.push({
          id: `${locationSlug}-${slugify(mealName) || periodIndex}`,
          name: mealName,
          sourcePeriodId: mealName,
          startTime: times.startTime,
          endTime: times.endTime,
          stations,
        });
      });

    if (periods.length === 0) return;

    locations.push({
      id: locationSlug,
      name: locationName,
      sourceLocationId: locationName,
      timezone: 'America/Los_Angeles',
      date,
      periods,
    });
  });

  return locations;
}

function normalizeUcsbStations(
  $: ReturnType<typeof load>,
  school: SchoolCoverage,
  locationSlug: string,
  mealName: string,
  date: string,
  panelElement: CheerioElement,
  sourceUrl: string
): NormalizedMenu['locations'][number]['periods'][number]['stations'] {
  const stations: NormalizedMenu['locations'][number]['periods'][number]['stations'] = [];

  $(panelElement)
    .find('.panel-body dl')
    .each((stationIndex, dlElement) => {
      const stationName = normalizeWhitespace($(dlElement).find('dt').first().text()) ?? 'Menu';
      const stationSlug = slugify(stationName) || String(stationIndex);
      const items: NormalizedMenuItem[] = [];

      $(dlElement)
        .find('dd')
        .each((itemIndex, itemElement) => {
          const rawName = normalizeWhitespace($(itemElement).text());
          const item = normalizeUcsbItem({
            school,
            locationSlug,
            mealName,
            stationName,
            stationSlug,
            date,
            rawName,
            itemIndex,
            sourceUrl,
          });

          if (item) items.push(item);
        });

      if (items.length === 0) return;

      const stationId = `${locationSlug}-${slugify(mealName)}-${stationSlug}`;
      stations.push({
        id: stationId,
        name: stationName,
        sourceStationId: stationName,
        items: items.map((item) => ({
          ...item,
          stationId,
          stationName,
        })),
      });
    });

  return stations;
}

function normalizeUcsbItem(context: {
  school: SchoolCoverage;
  locationSlug: string;
  mealName: string;
  stationName: string;
  stationSlug: string;
  date: string;
  rawName?: string;
  itemIndex: number;
  sourceUrl: string;
}): NormalizedMenuItem | undefined {
  if (!context.rawName) return undefined;

  const dietaryTags = normalizeUcsbDietaryTags(context.rawName);
  const allergens = normalizeUcsbAllergens(context.rawName);
  const name = normalizeWhitespace(
    context.rawName
      .replace(/\((?:vgn|v|w\/nuts)\)/gi, '')
      .replace(/\s+/g, ' ')
  );
  if (!name) return undefined;

  return {
    id: `${context.school.id}-${context.locationSlug}-${context.date}-${slugify(context.mealName)}-${
      context.stationSlug
    }-${context.itemIndex}-${slugify(name)}`,
    name,
    normalizedName: name.toLowerCase(),
    category: context.stationName,
    availability: {
      status: 'planned',
    },
    dietaryTags,
    allergens,
    ingredients: [],
    nutrition: [],
    sourceUrl: context.sourceUrl,
    raw: {
      sourceText: context.rawName,
    },
  };
}

function normalizeUcsbDietaryTags(value: string): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  if (/\(vgn\)/i.test(value)) tags.add('vegan');
  else if (/\(v\)/i.test(value)) tags.add('vegetarian');
  return [...tags];
}

function normalizeUcsbAllergens(value: string): AllergenFact[] {
  if (!/\(w\/nuts\)/i.test(value)) return [];
  return [
    {
      key: 'tree_nut',
      label: 'Contains nuts',
      status: 'contains',
      sourceText: value,
    },
  ];
}

function parseUcsbTimeRange(value?: string) {
  const match = value?.match(/(.+?)\s*-\s*(.+)/);
  return {
    startTime: normalizeWhitespace(match?.[1]),
    endTime: normalizeWhitespace(match?.[2]),
  };
}

async function fetchHarvardMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const [reference, rows] = await Promise.all([
      getHarvardReferenceData(),
      fetchJson<HarvardMenuRow[]>(`${HARVARD_API_BASE}/menus?output=json&date=${date}`),
    ]);

    const mealNeedle = query.meal?.toLowerCase();
    const locationNeedle = query.locationId?.toLowerCase();
    const locationMap = new Map<string, NormalizedMenu['locations'][number]>();

    for (const row of rows) {
      const mealName = reference.meals.get(row.meal) ?? `Meal ${row.meal}`;
      if (mealNeedle && !mealName.toLowerCase().includes(mealNeedle)) {
        continue;
      }

      const recipe = reference.recipes.get(row.recipe);
      if (!recipe?.name) {
        continue;
      }

      for (const locationId of row.location) {
        const locationName = reference.locations.get(locationId) ?? `Location ${locationId}`;
        if (
          locationNeedle &&
          String(locationId) !== locationNeedle &&
          !slugify(locationName).includes(locationNeedle)
        ) {
          continue;
        }

        const location = ensureLocation(locationMap, locationId, locationName, date);
        const period = ensurePeriod(location, row.meal, mealName);
        const categoryName = reference.categories.get(row.category) ?? `Category ${row.category}`;
        const station = ensureStation(period, row.category, categoryName);
        station.items.push(normalizeHarvardItem(row, recipe, categoryName, school.sourceUrl));
      }
    }

    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'official_api',
      sourceUrl: school.sourceUrl,
      fetchedAt,
      freshnessMinutes: 0,
      locations: [...locationMap.values()].filter((location) => location.periods.length > 0),
    };

    return {
      state: 'adapter_ready',
      provider: 'official_api',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_api',
      sourceUrl: school.sourceUrl,
      reason: 'Harvard CS50 dining API fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getHarvardReferenceData(): Promise<HarvardReferenceData> {
  if (harvardReferenceCache && Date.now() - harvardReferenceCache.loadedAt < REFERENCE_CACHE_MS) {
    return harvardReferenceCache.data;
  }

  const [recipes, categories, meals, locations] = await Promise.all([
    fetchJson<HarvardRecipe[]>(`${HARVARD_API_BASE}/recipes?output=json`),
    fetchJson<HarvardLookup[]>(`${HARVARD_API_BASE}/categories?output=json`),
    fetchJson<HarvardLookup[]>(`${HARVARD_API_BASE}/meals?output=json`),
    fetchJson<HarvardLookup[]>(`${HARVARD_API_BASE}/locations?output=json`),
  ]);

  const data = {
    recipes: new Map(recipes.map((recipe) => [recipe.id, recipe])),
    categories: new Map(categories.map((category) => [category.id, category.name])),
    meals: new Map(meals.map((meal) => [meal.id, meal.name])),
    locations: new Map(locations.map((location) => [location.id, location.name])),
  };

  harvardReferenceCache = {
    loadedAt: Date.now(),
    data,
  };

  return data;
}

function ensureLocation(
  locationMap: Map<string, NormalizedMenu['locations'][number]>,
  locationId: number,
  locationName: string,
  date: string
) {
  const key = String(locationId);
  const existing = locationMap.get(key);
  if (existing) return existing;

  const location = {
    id: key,
    name: locationName,
    sourceLocationId: key,
    date,
    periods: [],
  };
  locationMap.set(key, location);
  return location;
}

function ensurePeriod(location: NormalizedMenu['locations'][number], mealId: number, mealName: string) {
  const key = String(mealId);
  const existing = location.periods.find((period) => period.id === key);
  if (existing) return existing;

  const period = {
    id: key,
    name: mealName,
    sourcePeriodId: key,
    stations: [],
  };
  location.periods.push(period);
  return period;
}

function ensureStation(
  period: NormalizedMenu['locations'][number]['periods'][number],
  categoryId: number,
  categoryName: string
) {
  const key = String(categoryId);
  const existing = period.stations.find((station) => station.id === key);
  if (existing) return existing;

  const station = {
    id: key,
    name: categoryName,
    sourceStationId: key,
    items: [],
  };
  period.stations.push(station);
  return station;
}

function normalizeHarvardItem(
  row: HarvardMenuRow,
  recipe: HarvardRecipe,
  categoryName: string,
  sourceUrl: string
): NormalizedMenuItem {
  const ingredientStatement = normalizeWhitespace(recipe.ingredients ?? undefined);

  return {
    id: `harvard-${row.date}-${row.meal}-${row.category}-${row.recipe}`,
    sourceItemId: String(recipe.id),
    name: recipe.name.trim(),
    normalizedName: recipe.name.trim().toLowerCase(),
    description: normalizeWhitespace(recipe.information ?? undefined),
    category: categoryName,
    stationId: String(row.category),
    stationName: categoryName,
    servingSizeText: normalizeWhitespace(recipe.serving_size ?? undefined),
    availability: {
      status: 'planned',
    },
    dietaryTags: normalizeDietaryTags(recipe),
    allergens: normalizeAllergens(recipe.allergens ?? []),
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    nutrition: normalizeNutrition(recipe),
    sourceUrl,
    raw: {
      menu: row,
      recipe,
    },
  };
}

function normalizeDietaryTags(recipe: HarvardRecipe): DietaryTag[] {
  const tags: DietaryTag[] = [];
  if (recipe.vegan) tags.push('vegan');
  if (recipe.vegetarian) tags.push('vegetarian');
  return tags;
}

function normalizeAllergens(labels: string[]): AllergenFact[] {
  return labels.map((label) => ({
    key: mapAllergenKey(label),
    label,
    status: 'contains',
    sourceText: label,
  }));
}

function mergeAllergens(facts: AllergenFact[]) {
  const deduped = new Map<string, AllergenFact>();
  for (const fact of facts) {
    deduped.set(`${fact.key}:${fact.label.toLowerCase()}:${fact.status}`, fact);
  }
  return [...deduped.values()];
}

function normalizeNutrition(recipe: HarvardRecipe): NutritionFact[] {
  const facts: NutritionFact[] = [];

  if (typeof recipe.calories === 'number') {
    facts.push({
      key: 'calories',
      label: 'Calories',
      amount: recipe.calories,
      unit: 'kcal',
      sourceText: `Calories: ${recipe.calories}`,
    });
  }

  addAmount(facts, 'total_fat', 'Total Fat', recipe.total_fat);
  addAmount(facts, 'saturated_fat', 'Saturated Fat', recipe.sat_fat);
  addAmount(facts, 'trans_fat', 'Trans Fat', recipe.trans_fat);
  addAmount(facts, 'cholesterol', 'Cholesterol', recipe.cholesterol);
  addAmount(facts, 'sodium', 'Sodium', recipe.sodium);
  addAmount(facts, 'total_carbohydrate', 'Total Carbohydrate', recipe.total_carb);
  addAmount(facts, 'dietary_fiber', 'Dietary Fiber', recipe.dietary_fiber);
  addAmount(facts, 'total_sugars', 'Total Sugars', recipe.sugars);
  addAmount(facts, 'protein', 'Protein', recipe.protein);

  if (recipe.serving_size) {
    facts.push({
      key: 'serving_size',
      label: 'Serving Size',
      sourceText: recipe.serving_size,
    });
  }

  return facts;
}

function addAmount(
  facts: NutritionFact[],
  key: NutritionKey,
  label: string,
  value?: HarvardNutritionAmount
) {
  if (!value?.amount) return;

  const parsed = parseAmount(value.amount);
  facts.push({
    key,
    label,
    amount: parsed.amount,
    unit: parsed.unit,
    dailyValuePercent: value.percent,
    sourceText: `${label}: ${value.amount}`,
  });
}

function parseAmount(raw: string | number): { amount?: number; unit?: NutritionUnit } {
  if (typeof raw === 'number') return { amount: raw };
  const match = raw.match(/([\d.]+)\s*([a-zA-Z%]*)/);
  if (!match) return { sourceText: raw } as { amount?: number; unit?: NutritionUnit };

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
            : unit === 'iu'
              ? 'iu'
              : unit === '%'
                ? 'percent_daily_value'
                : undefined,
  };
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

    if ((char === ',' || char === ';') && depth === 0) {
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
  if (
    value.includes('tree nut') ||
    value.includes('almond') ||
    value.includes('walnut') ||
    value.includes('coconut')
  ) {
    return 'tree_nut';
  }
  if (value.includes('peanut')) return 'peanut';
  if (value.includes('wheat')) return 'wheat';
  if (value.includes('soy')) return 'soy';
  if (value.includes('sesame')) return 'sesame';
  if (value.includes('gluten')) return 'gluten';
  return 'other';
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
