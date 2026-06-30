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

type BonAppetitMenuItem = {
  id: string;
  label: string;
  description?: string;
  ordered_cor_icon?: Record<string, { id?: string; label?: string }>;
  cor_icon?: Record<string, string>;
  nutrition_details?: Record<string, BonAppetitNutritionDetail>;
  ingredients?: string;
  station_id?: string;
  station?: string;
  sub_station_id?: string;
  sub_station?: string;
  price?: string;
  options?: unknown;
};

type BonAppetitNutritionDetail = {
  label?: string;
  value?: string | number | null;
  unit?: string | null;
};

type BonAppetitDaypart = {
  id: string;
  label: string;
  starttime?: string;
  endtime?: string;
  stations?: Array<{
    id: number | string;
    label: string;
    items?: string[];
  }>;
};

const BON_APPETIT_HOSTS: Record<string, string> = {
  mit: 'https://mit.cafebonappetit.com',
  upenn: 'https://university-of-pennsylvania.cafebonappetit.com',
  emory: 'https://emoryatlanta.cafebonappetit.com',
};

export class BonAppetitProvider implements DiningProviderAdapter {
  readonly provider = 'vendor_bonappetit' as const;

  async fetchMenu(school: SchoolCoverage, query: MenuQuery): Promise<ProviderFetchResult> {
    const host = BON_APPETIT_HOSTS[school.id];
    if (!host) {
      return {
        state: 'adapter_pending',
        provider: this.provider,
        sourceUrl: school.sourceUrl,
        reason: 'Bon Appetit source is cataloged, but this school host is not mapped yet.',
      };
    }

    const fetchedAt = new Date().toISOString();
    const date = query.date ?? fetchedAt.slice(0, 10);
    const sourceUrl = `${host}/cafe/${date}/`;

    try {
      const html = await fetchText(sourceUrl, 25000);
      const menuItems = extractAssignedJson<Record<string, BonAppetitMenuItem>>(
        html,
        'Bamco.menu_items'
      );
      const dayparts = extractDayparts(html);
      const menu: NormalizedMenu = {
        schoolId: school.id,
        providerKind: this.provider,
        sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations: normalizeBonAppetitLocations({
          sourceUrl,
          date,
          menuItems,
          dayparts,
          meal: query.meal,
          locationId: query.locationId,
        }),
      };

      return {
        state: 'adapter_ready',
        provider: this.provider,
        fetchedAt,
        sourceUrl,
        data: menu,
      };
    } catch (error) {
      return {
        state: 'provider_error',
        provider: this.provider,
        sourceUrl,
        reason: 'Bon Appetit menu page fetch or parse failed.',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function normalizeBonAppetitLocations(context: {
  sourceUrl: string;
  date: string;
  menuItems: Record<string, BonAppetitMenuItem>;
  dayparts: BonAppetitDaypart[];
  meal?: string;
  locationId?: string;
}): NormalizedMenu['locations'] {
  const locationMap = new Map<string, NormalizedMenu['locations'][number]>();
  const mealNeedle = context.meal?.toLowerCase();
  const locationNeedle = context.locationId?.toLowerCase();

  for (const daypart of context.dayparts) {
    const periodName = normalizeWhitespace(daypart.label) ?? 'Menu';
    if (mealNeedle && !periodName.toLowerCase().includes(mealNeedle)) continue;

    for (const sourceStation of daypart.stations ?? []) {
      const locationName = normalizeWhitespace(sourceStation.label) ?? 'Bon Appetit Menu';
      const locationId = slugify(locationName) || String(sourceStation.id);
      if (
        locationNeedle &&
        locationId !== locationNeedle &&
        !locationId.includes(locationNeedle) &&
        !locationName.toLowerCase().includes(locationNeedle)
      ) {
        continue;
      }

      const location = ensureLocation(locationMap, locationId, locationName, context.date);
      const period = ensurePeriod(location, periodName, daypart);
      const station = ensureStation(period, 'Menu');

      for (const itemId of sourceStation.items ?? []) {
        const sourceItem = context.menuItems[itemId];
        if (!sourceItem?.label) continue;

        station.items.push(
          normalizeBonAppetitItem(sourceItem, {
            sourceUrl: context.sourceUrl,
            date: context.date,
            locationId,
            periodId: period.id,
            stationId: station.id,
            stationName: station.name,
            startTime: daypart.starttime,
            endTime: daypart.endtime,
          })
        );
      }
    }
  }

  return [...locationMap.values()]
    .map((location) => ({
      ...location,
      periods: location.periods
        .map((period) => ({
          ...period,
          stations: period.stations.filter((station) => station.items.length > 0),
        }))
        .filter((period) => period.stations.length > 0),
    }))
    .filter((location) => location.periods.length > 0);
}

function normalizeBonAppetitItem(
  sourceItem: BonAppetitMenuItem,
  context: {
    sourceUrl: string;
    date: string;
    locationId: string;
    periodId: string;
    stationId: string;
    stationName: string;
    startTime?: string;
    endTime?: string;
  }
): NormalizedMenuItem {
  const iconLabels = getIconLabels(sourceItem);
  const ingredientStatement = normalizeIngredientStatement(sourceItem.ingredients);
  const nutrition = normalizeNutrition(sourceItem.nutrition_details ?? {});

  return {
    id: `bonappetit-${context.locationId}-${context.date}-${context.periodId}-${sourceItem.id}`,
    sourceItemId: sourceItem.id,
    name: sourceItem.label.trim(),
    normalizedName: sourceItem.label.trim().toLowerCase(),
    description: normalizeWhitespace(sourceItem.description),
    category: cleanHtml(sourceItem.sub_station) ?? cleanHtml(sourceItem.station),
    stationId: context.stationId,
    stationName: context.stationName,
    servingSizeText: servingSizeFromNutrition(sourceItem.nutrition_details ?? {}),
    price: normalizePrice(sourceItem.price),
    availability: {
      status: 'planned',
      startTime: context.startTime,
      endTime: context.endTime,
    },
    dietaryTags: normalizeDietaryTags(iconLabels),
    allergens: normalizeAllergens(iconLabels),
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    nutrition,
    sourceUrl: context.sourceUrl,
    raw: {
      orderedCorIcon: sourceItem.ordered_cor_icon,
      stationId: sourceItem.station_id,
      station: sourceItem.station,
      subStationId: sourceItem.sub_station_id,
      subStation: sourceItem.sub_station,
      options: sourceItem.options,
    },
  };
}

function extractDayparts(html: string): BonAppetitDaypart[] {
  const dayparts: BonAppetitDaypart[] = [];
  const pattern = /Bamco\.dayparts\[['"]([^'"]+)['"]\]\s*=/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    const objectStart = html.indexOf('{', pattern.lastIndex);
    if (objectStart < 0) continue;
    const json = extractJsonObjectAt(html, objectStart);
    dayparts.push(JSON.parse(json) as BonAppetitDaypart);
    pattern.lastIndex = objectStart + json.length;
  }

  return dayparts;
}

function extractAssignedJson<T>(html: string, variableName: string): T {
  const assignmentIndex = html.indexOf(`${variableName} =`);
  if (assignmentIndex < 0) {
    throw new Error(`Could not find ${variableName} assignment.`);
  }
  const objectStart = html.indexOf('{', assignmentIndex);
  if (objectStart < 0) {
    throw new Error(`Could not find ${variableName} JSON object.`);
  }
  return JSON.parse(extractJsonObjectAt(html, objectStart)) as T;
}

function extractJsonObjectAt(source: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error('Unterminated JSON object in Bon Appetit page.');
}

function ensureLocation(
  locationMap: Map<string, NormalizedMenu['locations'][number]>,
  locationId: string,
  locationName: string,
  date: string
) {
  const existing = locationMap.get(locationId);
  if (existing) return existing;

  const location = {
    id: locationId,
    name: locationName,
    sourceLocationId: locationId,
    date,
    periods: [],
  };
  locationMap.set(locationId, location);
  return location;
}

function ensurePeriod(
  location: NormalizedMenu['locations'][number],
  periodName: string,
  daypart: BonAppetitDaypart
) {
  const id = slugify(periodName) || 'menu';
  const existing = location.periods.find((period) => period.id === id);
  if (existing) return existing;

  const period = {
    id,
    name: periodName,
    sourcePeriodId: daypart.id,
    startTime: daypart.starttime,
    endTime: daypart.endtime,
    stations: [],
  };
  location.periods.push(period);
  return period;
}

function ensureStation(
  period: NormalizedMenu['locations'][number]['periods'][number],
  stationName: string
) {
  const id = slugify(stationName) || 'menu';
  const existing = period.stations.find((station) => station.id === id);
  if (existing) return existing;

  const station = {
    id,
    name: stationName,
    sourceStationId: stationName,
    items: [],
  };
  period.stations.push(station);
  return station;
}

function normalizeNutrition(details: Record<string, BonAppetitNutritionDetail>): NutritionFact[] {
  const facts: NutritionFact[] = [];

  for (const [sourceKey, detail] of Object.entries(details)) {
    const label = normalizeWhitespace(detail.label);
    if (!label) continue;

    const value = detail.value == null ? undefined : String(detail.value);
    facts.push({
      key: mapNutritionKey(sourceKey, label),
      label,
      amount: parseNutritionAmount(value),
      unit: mapNutritionUnit(detail.unit) ?? (sourceKey === 'calories' ? 'kcal' : undefined),
      sourceText: `${label}: ${value ?? ''}${detail.unit ?? ''}`.trim(),
    });
  }

  return facts;
}

function servingSizeFromNutrition(details: Record<string, BonAppetitNutritionDetail>) {
  const servingSize = details.servingSize;
  if (!servingSize?.value) return undefined;
  return [servingSize.value, servingSize.unit].filter(Boolean).join(' ');
}

function mapNutritionKey(sourceKey: string, label: string): NutritionKey {
  const normalized = `${sourceKey} ${label}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (normalized.includes('servingsize')) return 'serving_size';
  if (normalized.includes('calories')) return 'calories';
  if (normalized.includes('saturatedfat')) return 'saturated_fat';
  if (normalized.includes('transfat')) return 'trans_fat';
  if (normalized.includes('cholesterol')) return 'cholesterol';
  if (normalized.includes('sodium')) return 'sodium';
  if (normalized.includes('carbohydrate')) return 'total_carbohydrate';
  if (normalized.includes('fiber')) return 'dietary_fiber';
  if (normalized.includes('sugar')) return 'total_sugars';
  if (normalized.includes('protein')) return 'protein';
  if (normalized.includes('fat')) return 'total_fat';
  return 'other';
}

function mapNutritionUnit(unit?: string | null): NutritionUnit | undefined {
  const normalized = unit?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'g') return 'g';
  if (normalized === 'mg') return 'mg';
  if (normalized === 'mcg') return 'mcg';
  if (normalized === 'kcal') return 'kcal';
  if (normalized === 'oz' || normalized === 'fl oz') return 'other';
  return 'other';
}

function parseNutritionAmount(value?: string) {
  if (!value || /^<|less than/i.test(value.trim())) return undefined;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const amount = Number(match[0]);
  return Number.isFinite(amount) ? amount : undefined;
}

function getIconLabels(item: BonAppetitMenuItem) {
  const labels = new Set<string>();
  for (const icon of Object.values(item.ordered_cor_icon ?? {})) {
    const label = normalizeWhitespace(icon.label);
    if (label) labels.add(label);
  }
  for (const label of Object.values(item.cor_icon ?? {})) {
    const normalized = normalizeWhitespace(label);
    if (normalized) labels.add(normalized);
  }
  return [...labels];
}

function normalizeDietaryTags(labels: string[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const label of labels) {
    const value = label.toLowerCase();
    if (value.includes('vegan')) tags.add('vegan');
    else if (value.includes('vegetarian')) tags.add('vegetarian');
    else if (value.includes('halal')) tags.add('halal');
    else if (value.includes('kosher')) tags.add('kosher');
    else if (value.includes('made without gluten')) tags.add('made_without_gluten');
    else if (value.includes('gluten-free') || value.includes('gluten free')) tags.add('gluten_free');
  }
  return [...tags];
}

function normalizeAllergens(labels: string[]): AllergenFact[] {
  const facts: AllergenFact[] = [];

  for (const label of labels) {
    const keys = mapAllergenKeys(label);
    const status = mapAllergenStatus(label);
    for (const key of keys) {
      facts.push({
        key,
        label,
        status,
        sourceText: label,
      });
    }
  }

  return mergeAllergens(facts);
}

function mapAllergenStatus(label: string): AllergenFact['status'] {
  const value = label.toLowerCase();
  if (value.includes('may contain')) return 'may_contain';
  if (
    value.includes('made without') ||
    value.includes('without gluten-containing') ||
    value.includes('gluten-free') ||
    value.includes('gluten free')
  ) {
    return 'made_without';
  }
  return 'contains';
}

function mapAllergenKeys(label: string): AllergenKey[] {
  const value = label.toLowerCase();
  const keys = new Set<AllergenKey>();

  if (value.includes('milk') || value.includes('dairy')) keys.add('milk');
  if (value.includes('egg')) keys.add('egg');
  if (value.includes('fish')) keys.add('fish');
  if (value.includes('shellfish') || value.includes('shrimp') || value.includes('crab')) {
    keys.add('crustacean_shellfish');
  }
  if (value.includes('tree nut') || value.includes('almond') || value.includes('walnut')) {
    keys.add('tree_nut');
  }
  if (value.includes('peanut')) keys.add('peanut');
  if (value.includes('wheat')) keys.add('wheat');
  if (value.includes('soy')) keys.add('soy');
  if (value.includes('sesame')) keys.add('sesame');
  if (value.includes('gluten')) keys.add('gluten');

  return [...keys];
}

function mergeAllergens(allergens: AllergenFact[]) {
  const deduped = new Map<string, AllergenFact>();
  for (const allergen of allergens) {
    deduped.set(`${allergen.key}:${allergen.label.toLowerCase()}:${allergen.status}`, allergen);
  }
  return [...deduped.values()];
}

function normalizeIngredientStatement(value?: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized || normalized.toLowerCase() === 'not available') return undefined;
  return normalized;
}

function splitIngredients(statement?: string): IngredientFact[] {
  if (!statement) return [];

  return splitIngredientNames(statement)
    .map((ingredient) => normalizeWhitespace(ingredient))
    .filter((ingredient): ingredient is string => Boolean(ingredient))
    .map((name) => ({
      name,
      normalizedName: name.toLowerCase(),
      containsAllergenKeys: allergenKeysInIngredientText(name),
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

function normalizePrice(value?: string) {
  const displayText = normalizeWhitespace(value);
  if (!displayText) return undefined;

  const amount = Number(displayText.replace(/[^0-9.]/g, ''));
  return {
    amount: Number.isFinite(amount) ? amount : undefined,
    currency: 'USD' as const,
    displayText,
  };
}

function cleanHtml(value?: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return undefined;
  return normalizeWhitespace(load(`<div>${normalized}</div>`)('div').text());
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
