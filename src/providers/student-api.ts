import { createRequire } from 'node:module';
import { fetchJson, fetchText } from './http.js';
import type { DiningProviderAdapter, ProviderFetchResult } from './types.js';
import type {
  DietaryTag,
  MenuQuery,
  NormalizedMenu,
  NormalizedMenuItem,
  NutritionFact,
  NutritionKey,
  NutritionUnit,
  SchoolCoverage,
} from '../types/dining.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  data: Buffer
) => Promise<{ text: string; numpages: number; info?: { CreationDate?: string; ModDate?: string } }>;

type MaizeMealsConfig = {
  restBaseUrl: string;
  anonKey: string;
};

type MaizeMealsMenuEvent = {
  id: string;
  item_id: string;
  dining_hall_id: string;
  meal: string;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  items?: MaizeMealsItem | null;
  dining_halls?: MaizeMealsDiningHall | null;
};

type MaizeMealsItem = {
  id: string;
  name: string;
  normalized_name?: string | null;
  macronutrients?: Record<string, string | number | null> | null;
  dietary_tags?: string[] | null;
  station?: string | null;
  serving_size?: string | null;
  item_type?: string | null;
  is_mhealthy?: boolean | null;
  updated_at?: string | null;
};

type MaizeMealsDiningHall = {
  id: string;
  name: string;
  slug?: string | null;
  official_id?: number | string | null;
  address?: string | null;
};

type CmuEatsLocation = {
  id: string;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  url?: string | null;
  menu?: string | null;
  location?: string | null;
  coordinateLat?: number | null;
  coordinateLng?: number | null;
  times?: Array<{
    start: number;
    end: number;
  }> | null;
  conceptId?: string | null;
};

type CmuStaticMenuItem = {
  name: string;
  price: number;
  sourceText: string;
};

let maizeMealsConfigCache: MaizeMealsConfig | undefined;

const MAIZE_MEALS_HOME = 'https://www.maizemeals.com/';
const CMUEATS_LOCATIONS_URL = 'https://api.cmueats.com/v2/locations';
const SUPABASE_URL_PATTERN = /https:\/\/[a-z0-9]+\.supabase\.co/g;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

const MAIZE_NUTRITION_MAP: Record<
  string,
  { key: NutritionKey; label: string; unit: NutritionUnit }
> = {
  calories: { key: 'calories', label: 'Calories', unit: 'kcal' },
  protein: { key: 'protein', label: 'Protein', unit: 'g' },
  'total carbohydrate': { key: 'total_carbohydrate', label: 'Total Carbohydrate', unit: 'g' },
  carbs: { key: 'total_carbohydrate', label: 'Total Carbohydrate', unit: 'g' },
  'total fat': { key: 'total_fat', label: 'Total Fat', unit: 'g' },
  fat: { key: 'total_fat', label: 'Total Fat', unit: 'g' },
  'saturated fat': { key: 'saturated_fat', label: 'Saturated Fat', unit: 'g' },
  'trans fat': { key: 'trans_fat', label: 'Trans Fat', unit: 'g' },
  cholesterol: { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
  sodium: { key: 'sodium', label: 'Sodium', unit: 'mg' },
  'dietary fiber': { key: 'dietary_fiber', label: 'Dietary Fiber', unit: 'g' },
  fiber: { key: 'dietary_fiber', label: 'Dietary Fiber', unit: 'g' },
  sugars: { key: 'total_sugars', label: 'Total Sugars', unit: 'g' },
  calcium: { key: 'calcium', label: 'Calcium', unit: 'mg' },
  iron: { key: 'iron', label: 'Iron', unit: 'mg' },
};

export class StudentApiProvider implements DiningProviderAdapter {
  readonly provider = 'student_api' as const;

  async fetchMenu(school: SchoolCoverage, query: MenuQuery): Promise<ProviderFetchResult> {
    if (school.id === 'carnegie-mellon') {
      return fetchCarnegieMellonCmueatsMenu(school, query);
    }

    if (school.id === 'michigan') {
      return fetchMichiganMaizeMealsMenu(school, query);
    }

    return {
      state: 'adapter_pending',
      provider: this.provider,
      sourceUrl: school.sourceUrl,
      reason: 'Student API source is cataloged, but a normalized live adapter is not implemented for this school yet.',
    };
  }
}

async function fetchCarnegieMellonCmueatsMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);
  const sourceUrl = `${CMUEATS_LOCATIONS_URL}?date=${date}`;

  try {
    const sourceLocations = await fetchJson<CmuEatsLocation[]>(CMUEATS_LOCATIONS_URL);
    const locations = await normalizeCmuEatsLocations(sourceLocations, {
      date,
      meal: query.meal,
      locationId: query.locationId,
    });

    return {
      state: 'adapter_ready',
      provider: 'student_api',
      fetchedAt,
      sourceUrl,
      data: {
        schoolId: school.id,
        providerKind: 'student_api',
        sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations,
      },
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'student_api',
      sourceUrl,
      reason: 'CMUEats public location/menu PDF fetch or normalization failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function normalizeCmuEatsLocations(
  sourceLocations: CmuEatsLocation[],
  context: {
    date: string;
    meal?: string;
    locationId?: string;
  }
): Promise<NormalizedMenu['locations']> {
  const normalized: NormalizedMenu['locations'] = [];
  const mealNeedle = context.meal?.toLowerCase();
  const locationNeedle = context.locationId?.toLowerCase();

  for (const sourceLocation of sourceLocations) {
    if (!sourceLocation.menu?.toLowerCase().includes('.pdf')) continue;

    const locationId = slugify(sourceLocation.conceptId ?? sourceLocation.name);
    const locationName = normalizeWhitespace(sourceLocation.name);
    if (!locationName) continue;

    if (
      locationNeedle &&
      locationId !== locationNeedle &&
      !locationId.includes(locationNeedle) &&
      !locationName.toLowerCase().includes(locationNeedle)
    ) {
      continue;
    }

    if ((sourceLocation.times?.length ?? 0) === 0) continue;
    const activeRanges = operatingRangesForDate(sourceLocation.times ?? [], context.date);
    if (activeRanges.length === 0) continue;

    const pdf = await fetchAndParseCmuPdf(sourceLocation.menu);
    const parsedItems = parseCmuStaticMenuText(pdf.text);
    if (parsedItems.length === 0) continue;

    const periodName = mealNeedle ? titleCase(mealNeedle) : 'Static Menu';
    const startTime = activeRanges[0]?.start ? new Date(activeRanges[0].start).toISOString() : undefined;
    const endTime = activeRanges[0]?.end ? new Date(activeRanges[0].end).toISOString() : undefined;
    const stationId = `${locationId}-static-menu`;
    const sourceUrl = encodeURI(sourceLocation.menu);

    normalized.push({
      id: locationId,
      name: locationName,
      sourceLocationId: sourceLocation.conceptId ?? sourceLocation.id,
      address: normalizeWhitespace(sourceLocation.location),
      timezone: 'America/New_York',
      date: context.date,
      periods: [
        {
          id: `${locationId}-static-menu`,
          name: periodName,
          startTime,
          endTime,
          sourcePeriodId: 'static-menu-pdf',
          stations: [
            {
              id: stationId,
              name: 'Static Menu',
              sourceStationId: 'static-menu-pdf',
              items: parsedItems.map((item, index) =>
                normalizeCmuStaticMenuItem(item, {
                  index,
                  locationId,
                  stationId,
                  stationName: 'Static Menu',
                  sourceUrl,
                  startTime,
                  endTime,
                })
              ),
            },
          ],
        },
      ],
    });
  }

  return normalized.sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchAndParseCmuPdf(menuUrl: string) {
  const sourceUrl = encodeURI(menuUrl);
  const response = await fetch(sourceUrl, {
    headers: {
      accept: 'application/pdf,*/*;q=0.8',
      'user-agent': 'campus-dining-api/0.1 (+https://github.com/endo-ai/campus-dining-api)',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching CMU menu PDF ${sourceUrl}`);
  }

  return pdfParse(Buffer.from(await response.arrayBuffer()));
}

export function parseCmuStaticMenuText(text: string): CmuStaticMenuItem[] {
  const seen = new Set<string>();
  const items: CmuStaticMenuItem[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const sourceText = normalizePdfMenuLine(rawLine);
    if (!sourceText) continue;

    const priceLine = sourceText.replace(/\$\s*([0-9])\s*\.\s*([0-9])\s*([0-9])/g, '$$$1.$2$3');
    const match = priceLine.match(/^(.*?)\s+\$\s*([0-9]+(?:\.[0-9]{2})?)\b/);
    if (!match) continue;

    const name = normalizeCmuMenuItemName(match[1]);
    if (!isUsableCmuMenuItemName(name)) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      name,
      price: Number(match[2]),
      sourceText,
    });
  }

  return items;
}

function normalizeCmuStaticMenuItem(
  item: CmuStaticMenuItem,
  context: {
    index: number;
    locationId: string;
    stationId: string;
    stationName: string;
    sourceUrl: string;
    startTime?: string;
    endTime?: string;
  }
): NormalizedMenuItem {
  return {
    id: `cmu-${context.locationId}-${context.index}-${slugify(item.name)}`,
    sourceItemId: `${context.locationId}:${item.name}`,
    name: item.name,
    normalizedName: item.name.toLowerCase(),
    stationId: context.stationId,
    stationName: context.stationName,
    price: {
      amount: item.price,
      currency: 'USD',
      displayText: `$${item.price.toFixed(2)}`,
    },
    availability: {
      status: context.startTime || context.endTime ? 'planned' : 'unknown',
      startTime: context.startTime,
      endTime: context.endTime,
      sourceText: 'CMUEats static menu PDF with current location operating hours when available.',
    },
    dietaryTags: normalizeCmuDietaryTags(item.name),
    allergens: [],
    ingredients: [],
    nutrition: [],
    itemUrl: context.sourceUrl,
    sourceUrl: context.sourceUrl,
    raw: {
      sourceText: item.sourceText,
    },
  };
}

function operatingRangesForDate(times: Array<{ start: number; end: number }>, date: string) {
  const startOfDay = Date.parse(`${date}T00:00:00.000Z`);
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
  return times
    .filter((range) => range.start < endOfDay && range.end > startOfDay)
    .sort((a, b) => a.start - b.start);
}

function normalizePdfMenuLine(value: string) {
  return normalizeWhitespace(value.replace(/\t+/g, ' ').replace(/[|•]+/g, ' ')) ?? '';
}

function normalizeCmuMenuItemName(value?: string) {
  return (
    normalizeWhitespace(
      value
        ?.replace(/\s+/g, ' ')
        .replace(/\s+([,.)])/g, '$1')
        .replace(/[(]\s+/g, '(')
    ) ?? ''
  );
}

function isUsableCmuMenuItemName(name?: string): name is string {
  if (!name || name.length < 3 || name.length > 80) return false;
  const lower = name.toLowerCase();
  if (/^(with|or|and|add|extra|small|large|no protein)\b/.test(lower)) return false;
  if (lower === 'of the day') return false;
  if (name.endsWith(':')) return false;
  if (name === name.toUpperCase() && name.length > 8) return false;
  if (/[A-Z]{2}\s+[A-Z]{2}\s+[A-Z]{2}/.test(name)) return false;
  if (name.split(' ').length > 14) return false;
  return true;
}

function normalizeCmuDietaryTags(value: string): DietaryTag[] {
  const lower = value.toLowerCase();
  const tags = new Set<DietaryTag>();
  if (lower.includes('vegan')) tags.add('vegan');
  if (lower.includes('vegetarian')) tags.add('vegetarian');
  return [...tags];
}

async function fetchMichiganMaizeMealsMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);
  const sourceUrl = `${MAIZE_MEALS_HOME}?date=${date}`;

  try {
    const config = await discoverMaizeMealsConfig();
    const events = await fetchMaizeMealsEvents(config, date);
    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'student_api',
      sourceUrl,
      fetchedAt,
      sourceUpdatedAt: latestUpdatedAt(events),
      freshnessMinutes: 0,
      locations: normalizeMaizeMealsLocations(events, {
        date,
        sourceUrl,
        meal: query.meal,
        locationId: query.locationId,
      }),
    };

    return {
      state: 'adapter_ready',
      provider: 'student_api',
      fetchedAt,
      sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'student_api',
      sourceUrl,
      reason: 'MaizeMeals public Supabase menu fetch or normalization failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function discoverMaizeMealsConfig(): Promise<MaizeMealsConfig> {
  if (maizeMealsConfigCache) return maizeMealsConfigCache;

  const html = await fetchText(MAIZE_MEALS_HOME);
  const scriptUrls = [...html.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/g)]
    .map((match) => new URL(match[1], MAIZE_MEALS_HOME).toString())
    .filter((url, index, urls) => urls.indexOf(url) === index);

  for (const scriptUrl of scriptUrls) {
    const script = await fetchText(scriptUrl);
    const supabaseUrl = script.match(SUPABASE_URL_PATTERN)?.[0];
    const anonKey = script.match(JWT_PATTERN)?.[0];
    if (supabaseUrl && anonKey) {
      maizeMealsConfigCache = {
        restBaseUrl: `${supabaseUrl}/rest/v1`,
        anonKey,
      };
      return maizeMealsConfigCache;
    }
  }

  throw new Error('Unable to discover MaizeMeals Supabase config from public bundle.');
}

async function fetchMaizeMealsEvents(
  config: MaizeMealsConfig,
  date: string
): Promise<MaizeMealsMenuEvent[]> {
  const params = new URLSearchParams({
    select: '*,items(*),dining_halls(*)',
    date: `eq.${date}`,
    limit: '5000',
  });
  const url = `${config.restBaseUrl}/menu_events?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      apikey: config.anonKey,
      authorization: `Bearer ${config.anonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching MaizeMeals menu events`);
  }

  return (await response.json()) as MaizeMealsMenuEvent[];
}

function normalizeMaizeMealsLocations(
  events: MaizeMealsMenuEvent[],
  context: {
    date: string;
    sourceUrl: string;
    meal?: string;
    locationId?: string;
  }
): NormalizedMenu['locations'] {
  const mealNeedle = context.meal?.toLowerCase();
  const locationNeedle = context.locationId?.toLowerCase();
  const locationMap = new Map<string, NormalizedMenu['locations'][number]>();

  for (const event of events) {
    if (!event.items?.name || !event.dining_halls?.name) continue;
    if (mealNeedle && !event.meal.toLowerCase().includes(mealNeedle)) continue;

    const locationId = slugify(event.dining_halls.slug ?? event.dining_halls.name);
    if (
      locationNeedle &&
      locationId !== locationNeedle &&
      !locationId.includes(locationNeedle) &&
      !event.dining_halls.name.toLowerCase().includes(locationNeedle)
    ) {
      continue;
    }

    const location = ensureLocation(locationMap, locationId, event.dining_halls, context.date);
    const period = ensurePeriod(location, event);
    const stationName = normalizeWhitespace(event.items.station) ?? 'Menu';
    const station = ensureStation(period, stationName);
    station.items.push(normalizeMaizeMealsItem(event, context.sourceUrl, station.id, station.name));
  }

  return [...locationMap.values()].map((location) => ({
    ...location,
    periods: location.periods.map((period) => ({
      ...period,
      stations: period.stations.map((station) => ({
        ...station,
        items: station.items.sort((a, b) => a.name.localeCompare(b.name)),
      })),
    })),
  }));
}

function ensureLocation(
  locationMap: Map<string, NormalizedMenu['locations'][number]>,
  locationId: string,
  hall: MaizeMealsDiningHall,
  date: string
) {
  let location = locationMap.get(locationId);
  if (!location) {
    location = {
      id: locationId,
      name: hall.name,
      sourceLocationId: String(hall.official_id ?? hall.id),
      address: normalizeWhitespace(hall.address),
      timezone: 'America/Detroit',
      date,
      periods: [],
    };
    locationMap.set(locationId, location);
  }

  return location;
}

function ensurePeriod(location: NormalizedMenu['locations'][number], event: MaizeMealsMenuEvent) {
  const periodName = normalizeWhitespace(event.meal) ?? 'Menu';
  const periodId = `${slugify(periodName)}-${event.start_time ?? 'start'}-${event.end_time ?? 'end'}`;
  let period = location.periods.find((candidate) => candidate.id === periodId);
  if (!period) {
    period = {
      id: periodId,
      name: periodName,
      sourcePeriodId: event.meal,
      startTime: event.start_time ?? undefined,
      endTime: event.end_time ?? undefined,
      stations: [],
    };
    location.periods.push(period);
  }

  return period;
}

function ensureStation(
  period: NormalizedMenu['locations'][number]['periods'][number],
  stationName: string
) {
  const stationId = slugify(stationName);
  let station = period.stations.find((candidate) => candidate.id === stationId);
  if (!station) {
    station = {
      id: stationId,
      name: stationName,
      sourceStationId: stationName,
      items: [],
    };
    period.stations.push(station);
  }

  return station;
}

function normalizeMaizeMealsItem(
  event: MaizeMealsMenuEvent,
  sourceUrl: string,
  stationId: string,
  stationName: string
): NormalizedMenuItem {
  const item = event.items!;
  const itemUrl = new URL(MAIZE_MEALS_HOME);
  itemUrl.searchParams.set('item', item.id);

  return {
    id: `maizemeals-${event.id}`,
    sourceItemId: item.id,
    name: item.name.trim(),
    normalizedName: normalizeWhitespace(item.normalized_name) ?? item.name.trim().toLowerCase(),
    category: normalizeWhitespace(item.item_type),
    stationId,
    stationName,
    servingSizeText: normalizeWhitespace(item.serving_size),
    availability: {
      status: 'planned',
      startTime: event.start_time ?? undefined,
      endTime: event.end_time ?? undefined,
      sourceText: `${event.date} ${event.meal}`,
    },
    dietaryTags: normalizeDietaryTags(item),
    allergens: [],
    ingredients: [],
    nutrition: normalizeNutrition(item.macronutrients),
    itemUrl: itemUrl.toString(),
    sourceUrl,
    sourceUpdatedAt: item.updated_at ?? undefined,
    raw: {
      event,
      item,
      diningHall: event.dining_halls,
    },
  };
}

function normalizeNutrition(
  macronutrients?: Record<string, string | number | null> | null
): NutritionFact[] {
  if (!macronutrients) return [];

  const facts: NutritionFact[] = [];
  for (const [rawLabel, rawValue] of Object.entries(macronutrients)) {
    if (rawValue === null || rawValue === undefined || rawValue === '') continue;

    const normalizedLabel = rawLabel.trim().toLowerCase();
    const mapping = MAIZE_NUTRITION_MAP[normalizedLabel] ?? {
      key: 'other' as const,
      label: rawLabel,
      unit: 'other' as const,
    };
    const amount =
      typeof rawValue === 'number' ? rawValue : Number(String(rawValue).replace(/[^0-9.-]/g, ''));

    facts.push({
      key: mapping.key,
      label: mapping.label,
      amount: Number.isFinite(amount) ? amount : undefined,
      unit: mapping.unit,
      sourceText: `${rawLabel}: ${rawValue}`,
    });
  }

  return facts.sort((a, b) => a.label.localeCompare(b.label));
}

function normalizeDietaryTags(item: MaizeMealsItem): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const rawTag of item.dietary_tags ?? []) {
    const tag = rawTag.toLowerCase().replace(/[^a-z]/g, '');
    if (tag.includes('vegan')) tags.add('vegan');
    else if (tag.includes('vegetarian')) tags.add('vegetarian');
    else if (tag.includes('halal')) tags.add('halal');
    else if (tag.includes('kosher')) tags.add('kosher');
    else if (tag.includes('glutenfree')) tags.add('gluten_free');
    else if (tag.includes('madewithoutgluten')) tags.add('made_without_gluten');
    else if (tag.includes('dairyfree')) tags.add('dairy_free');
    else if (tag.includes('carbonlow') || tag.includes('lowcarbon')) tags.add('low_carbon');
    else if (tag.includes('organic')) tags.add('organic');
    else if (tag.includes('spicy')) tags.add('spicy');
  }

  if (item.is_mhealthy) tags.add('other');
  return [...tags];
}

function latestUpdatedAt(events: MaizeMealsMenuEvent[]) {
  const timestamps = events
    .map((event) => event.items?.updated_at)
    .filter((value): value is string => Boolean(value))
    .sort();
  return timestamps.at(-1);
}

function normalizeWhitespace(value?: string | null) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'menu'
  );
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
