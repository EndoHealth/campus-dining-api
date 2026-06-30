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

type SodexoPreloadedState = {
  tenant?: string;
};

type SodexoLocationCandidate = {
  id: string;
  name: string;
  slug?: string;
  address?: string;
  locationId: string;
  menuId: string;
};

type SodexoMenuSection = {
  name?: string;
  groups?: SodexoMenuGroup[];
};

type SodexoMenuGroup = {
  name?: string;
  sortOrder?: number;
  items?: SodexoMenuItem[];
};

type SodexoMenuItem = {
  course?: string;
  courseSortOrder?: number;
  meal?: string;
  menuItemId?: number | string;
  formalName?: string;
  description?: string | null;
  price?: number | null;
  ingredients?: string | null;
  allergens?: SodexoAllergen[];
  isVegan?: boolean;
  isVegetarian?: boolean;
  isPlantBased?: boolean;
  isMindful?: boolean;
  isSwell?: boolean;
  calories?: string | number | null;
  caloriesFromFat?: string | number | null;
  fat?: string | number | null;
  saturatedFat?: string | number | null;
  transFat?: string | number | null;
  cholesterol?: string | number | null;
  sodium?: string | number | null;
  carbohydrates?: string | number | null;
  dietaryFiber?: string | number | null;
  sugar?: string | number | null;
  addedSugar?: string | number | null;
  protein?: string | number | null;
  potassium?: string | number | null;
  iron?: string | number | null;
  calcium?: string | number | null;
  vitaminA?: string | number | null;
  vitaminC?: string | number | null;
  vitaminD?: string | number | null;
  portionSize?: string | null;
  portion?: string | null;
};

type SodexoAllergen = {
  allergen?: string;
  name?: string;
  contains?: string | boolean;
  child?: string;
  parentname?: string | null;
};

type StationAccumulator = {
  id: string;
  name: string;
  sourceStationId?: string;
  items: NormalizedMenuItem[];
};

const SODEXO_API_BASE_URL = 'https://api-prd.sodexomyway.net/v0.2';
const SODEXO_API_KEY = '68717828-b754-420d-9488-4c37cb7d7ef7';

const NUTRITION_FIELDS: Array<{
  sourceKey: keyof SodexoMenuItem;
  key: NutritionKey;
  label: string;
  defaultUnit: NutritionUnit;
}> = [
  { sourceKey: 'calories', key: 'calories', label: 'Calories', defaultUnit: 'kcal' },
  { sourceKey: 'fat', key: 'total_fat', label: 'Total Fat', defaultUnit: 'g' },
  { sourceKey: 'saturatedFat', key: 'saturated_fat', label: 'Saturated Fat', defaultUnit: 'g' },
  { sourceKey: 'transFat', key: 'trans_fat', label: 'Trans Fat', defaultUnit: 'g' },
  { sourceKey: 'cholesterol', key: 'cholesterol', label: 'Cholesterol', defaultUnit: 'mg' },
  { sourceKey: 'sodium', key: 'sodium', label: 'Sodium', defaultUnit: 'mg' },
  {
    sourceKey: 'carbohydrates',
    key: 'total_carbohydrate',
    label: 'Total Carbohydrate',
    defaultUnit: 'g',
  },
  { sourceKey: 'dietaryFiber', key: 'dietary_fiber', label: 'Dietary Fiber', defaultUnit: 'g' },
  { sourceKey: 'sugar', key: 'total_sugars', label: 'Total Sugars', defaultUnit: 'g' },
  { sourceKey: 'addedSugar', key: 'added_sugars', label: 'Added Sugars', defaultUnit: 'g' },
  { sourceKey: 'protein', key: 'protein', label: 'Protein', defaultUnit: 'g' },
  { sourceKey: 'potassium', key: 'potassium', label: 'Potassium', defaultUnit: 'mg' },
  { sourceKey: 'iron', key: 'iron', label: 'Iron', defaultUnit: 'mg' },
  { sourceKey: 'calcium', key: 'calcium', label: 'Calcium', defaultUnit: 'mg' },
  { sourceKey: 'vitaminD', key: 'vitamin_d', label: 'Vitamin D', defaultUnit: 'mcg' },
  { sourceKey: 'caloriesFromFat', key: 'other', label: 'Calories From Fat', defaultUnit: 'kcal' },
  { sourceKey: 'vitaminA', key: 'other', label: 'Vitamin A', defaultUnit: 'mcg' },
  { sourceKey: 'vitaminC', key: 'other', label: 'Vitamin C', defaultUnit: 'mcg' },
];

export class SodexoProvider implements DiningProviderAdapter {
  readonly provider = 'vendor_sodexo' as const;

  async fetchMenu(school: SchoolCoverage, query: MenuQuery): Promise<ProviderFetchResult> {
    const fetchedAt = new Date().toISOString();
    const date = query.date ?? fetchedAt.slice(0, 10);

    try {
      const html = await fetchText(school.sourceUrl);
      const state = extractPreloadedState(html);
      const locations = filterLocations(collectMenuLocations(state), query.locationId);

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
        reason: 'SodexoMyWay provider fetch failed.',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function extractPreloadedState(html: string): SodexoPreloadedState {
  const marker = 'window.__PRELOADED_STATE__ = ';
  const start = html.indexOf(marker);
  if (start < 0) {
    throw new Error('Sodexo preloaded state was not found.');
  }

  const jsonStart = start + marker.length;
  const jsonEnd = findBalancedObjectEnd(html, jsonStart);
  return JSON.parse(html.slice(jsonStart, jsonEnd)) as SodexoPreloadedState;
}

function findBalancedObjectEnd(text: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }

  throw new Error('Sodexo preloaded state JSON did not terminate.');
}

function collectMenuLocations(state: unknown) {
  const locations: SodexoLocationCandidate[] = [];
  const seen = new Set<string>();

  function walk(value: unknown) {
    if (!value || typeof value !== 'object') return;

    const object = value as Record<string, unknown>;
    const menus = object.menus;
    const name = typeof object.name === 'string' ? object.name : undefined;

    if (name && Array.isArray(menus)) {
      for (const menu of menus) {
        if (!menu || typeof menu !== 'object') continue;
        const metadata = (menu as { content?: { metadata?: unknown } }).content?.metadata;
        if (!metadata || typeof metadata !== 'object') continue;

        const locationId = normalizeWhitespace(
          (metadata as { locationId?: unknown }).locationId
        );
        const menuId = normalizeWhitespace((metadata as { menuId?: unknown }).menuId);
        if (!locationId || !menuId) continue;

        const slug = normalizeWhitespace(object.slug);
        const key = `${locationId}:${menuId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        locations.push({
          id: slug || locationId,
          name,
          slug,
          address: formatAddress(object.address),
          locationId,
          menuId,
        });
      }
    }

    for (const child of Object.values(object)) {
      if (child && typeof child === 'object') walk(child);
    }
  }

  walk(state);
  return locations;
}

function filterLocations(locations: SodexoLocationCandidate[], locationId?: string) {
  if (!locationId) return locations;
  const needle = locationId.toLowerCase();

  return locations.filter((location) =>
    [location.id, location.slug, location.locationId, location.menuId, slugify(location.name)]
      .filter(Boolean)
      .some((value) => value?.toLowerCase() === needle)
  );
}

async function fetchLocationMenu(
  school: SchoolCoverage,
  location: SodexoLocationCandidate,
  date: string,
  meal?: string
): Promise<NormalizedMenu['locations'][number]> {
  const apiUrl = `${SODEXO_API_BASE_URL}/data/menu/${location.locationId}/${location.menuId}?date=${date}`;
  const sections = await fetchJsonWithHeaders<SodexoMenuSection[]>(apiUrl);
  const selectedSections = sections.filter((section) => shouldIncludeMeal(section, meal));

  return {
    id: location.id,
    name: location.name,
    sourceLocationId: location.locationId,
    address: location.address,
    date,
    periods: selectedSections
      .map((section, periodIndex) =>
        normalizePeriod(section, periodIndex, location, school.sourceUrl, date)
      )
      .filter((period) => period.stations.length > 0),
  };
}

async function fetchJsonWithHeaders<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'API-Key': SODEXO_API_KEY,
      authorization: 'Bearer ',
      'user-agent': 'campus-dining-api/0.1 (+https://github.com/endo-ai/campus-dining-api)',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  return response.json() as Promise<T>;
}

function shouldIncludeMeal(section: SodexoMenuSection, meal?: string) {
  if (!meal) return true;
  const needle = meal.toLowerCase();
  return section.name?.toLowerCase().includes(needle) ?? false;
}

function normalizePeriod(
  section: SodexoMenuSection,
  periodIndex: number,
  location: SodexoLocationCandidate,
  sourceUrl: string,
  date: string
): NormalizedMenu['locations'][number]['periods'][number] {
  const periodName = normalizeWhitespace(section.name) || `Meal ${periodIndex + 1}`;
  const stations = (section.groups ?? [])
    .map((group, groupIndex) => normalizeStation(group, groupIndex, location, periodName, sourceUrl, date))
    .filter((station) => station.items.length > 0);

  return {
    id: `${location.id}-${slugify(periodName)}`,
    name: periodName,
    sourcePeriodId: periodName,
    stations,
  };
}

function normalizeStation(
  group: SodexoMenuGroup,
  groupIndex: number,
  location: SodexoLocationCandidate,
  periodName: string,
  sourceUrl: string,
  date: string
): StationAccumulator {
  const stationName = normalizeWhitespace(group.name) || 'Menu';
  const stationId = `${location.id}-${slugify(periodName)}-${slugify(stationName)}-${groupIndex}`;

  return {
    id: stationId,
    name: stationName,
    sourceStationId: String(group.sortOrder ?? groupIndex),
    items: (group.items ?? [])
      .filter((item) => normalizeWhitespace(item.formalName))
      .map((item, itemIndex) => normalizeItem(item, itemIndex, stationId, stationName, sourceUrl, date)),
  };
}

function normalizeItem(
  item: SodexoMenuItem,
  itemIndex: number,
  stationId: string,
  stationName: string,
  sourceUrl: string,
  date: string
): NormalizedMenuItem {
  const name = normalizeWhitespace(item.formalName) as string;
  const ingredientStatement = normalizeWhitespace(item.ingredients);

  return {
    id: `sodexo-${date}-${stationId}-${item.menuItemId || itemIndex}-${slugify(name)}`,
    sourceItemId: item.menuItemId ? String(item.menuItemId) : undefined,
    name,
    normalizedName: name.toLowerCase(),
    description: normalizeWhitespace(item.description),
    category: normalizeWhitespace(item.course),
    stationId,
    stationName,
    servingSizeText: normalizeWhitespace(item.portionSize ?? item.portion),
    price: normalizePrice(item.price),
    availability: {
      status: 'planned',
    },
    dietaryTags: normalizeDietaryTags(item),
    allergens: normalizeAllergens(item.allergens ?? []),
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    nutrition: normalizeNutrition(item),
    sourceUrl,
    raw: item,
  };
}

function normalizePrice(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return undefined;
  return {
    amount: value,
    currency: 'USD' as const,
    displayText: `$${value.toFixed(2)}`,
  };
}

function normalizeDietaryTags(item: SodexoMenuItem): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  if (item.isVegan) tags.add('vegan');
  if (item.isVegetarian) tags.add('vegetarian');
  if (item.isPlantBased) tags.add('plant_forward');
  return [...tags];
}

function normalizeAllergens(allergens: SodexoAllergen[]): AllergenFact[] {
  const facts = new Map<string, AllergenFact>();

  for (const allergen of allergens) {
    if (String(allergen.contains).toLowerCase() !== 'true') continue;

    const label = normalizeWhitespace(allergen.name ?? allergen.allergen);
    if (!label) continue;

    const key = mapAllergenKey(label);
    const sourceText = normalizeWhitespace([label, allergen.child].filter(Boolean).join(': '));
    const fact = {
      key,
      label,
      status: 'contains' as const,
      sourceText,
    };
    facts.set(`${fact.key}:${fact.label}:${fact.status}`, fact);
  }

  return [...facts.values()];
}

function mapAllergenKey(value: string): AllergenKey {
  const normalized = value.toLowerCase();
  if (normalized.includes('milk') || normalized.includes('dairy')) return 'milk';
  if (normalized.includes('egg')) return 'egg';
  if (normalized.includes('fish') && !normalized.includes('shell')) return 'fish';
  if (normalized.includes('shellfish') || normalized.includes('crustacean')) {
    return 'crustacean_shellfish';
  }
  if (normalized.includes('tree nut')) return 'tree_nut';
  if (normalized.includes('peanut')) return 'peanut';
  if (normalized.includes('wheat')) return 'wheat';
  if (normalized.includes('soy')) return 'soy';
  if (normalized.includes('sesame')) return 'sesame';
  if (normalized.includes('gluten')) return 'gluten';
  return 'other';
}

function normalizeNutrition(item: SodexoMenuItem): NutritionFact[] {
  return NUTRITION_FIELDS.flatMap((field) => {
    const value = item[field.sourceKey];
    if (value === null || value === undefined || value === '') return [];

    const sourceText = String(value).trim();
    if (!sourceText) return [];

    const parsed = parseNutritionValue(sourceText, field.defaultUnit);
    return [
      {
        key: field.key,
        label: field.label,
        amount: parsed.amount,
        unit: parsed.unit,
        sourceText: `${field.label}: ${sourceText}`,
      },
    ];
  });
}

function parseNutritionValue(value: string, defaultUnit: NutritionUnit) {
  const amountMatch = /-?\d+(?:\.\d+)?/.exec(value);
  const unitMatch = /(kcal|cal|mg|mcg|g|iu|%)/i.exec(value);
  const amount = amountMatch ? Number(amountMatch[0]) : undefined;

  return {
    amount: amount !== undefined && Number.isFinite(amount) ? amount : undefined,
    unit: mapNutritionUnit(unitMatch?.[1], defaultUnit),
  };
}

function mapNutritionUnit(unit: string | undefined, defaultUnit: NutritionUnit): NutritionUnit {
  if (!unit) return defaultUnit;
  const normalized = unit.toLowerCase();
  if (normalized === 'cal' || normalized === 'kcal') return 'kcal';
  if (normalized === 'g') return 'g';
  if (normalized === 'mg') return 'mg';
  if (normalized === 'mcg') return 'mcg';
  if (normalized === 'iu') return 'iu';
  if (normalized === '%') return 'percent_daily_value';
  return 'other';
}

function splitIngredients(statement: string | undefined): IngredientFact[] {
  if (!statement) return [];

  return splitTopLevel(statement)
    .map((name) => normalizeWhitespace(name))
    .filter((name): name is string => Boolean(name))
    .map((name) => ({
      name,
      normalizedName: name.toLowerCase(),
      sourceText: name,
    }));
}

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of value) {
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1);

    if ((char === ',' || char === ';') && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

function formatAddress(value: unknown) {
  if (!value) return undefined;
  if (typeof value === 'string') return normalizeWhitespace(value);
  if (typeof value !== 'object') return undefined;

  const object = value as Record<string, unknown>;
  return normalizeWhitespace(
    [object.street, object.city, object.state, object.postalCode, object.country]
      .filter(Boolean)
      .join(', ')
  );
}

function normalizeWhitespace(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
