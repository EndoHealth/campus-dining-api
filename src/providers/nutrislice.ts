import { allergenKeysInIngredientText } from './allergen-text.js';
import { fetchJson } from './http.js';
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

type NutrisliceSchool = {
  id: number;
  name: string;
  slug: string;
  address?: string;
  timezone?: string | null;
  active_menu_types?: NutrisliceMenuType[];
};

type NutrisliceMenuType = {
  id: number;
  name: string;
  slug: string;
  urls?: {
    full_menu_by_date_api_url_template?: string;
  };
};

type NutrisliceWeekMenu = {
  start_date?: string;
  last_updated?: string;
  days?: NutrisliceDay[];
};

type NutrisliceDay = {
  date?: string;
  menu_items?: NutrisliceMenuRow[];
};

type NutrisliceMenuRow = {
  id: number;
  text?: string;
  is_section_title?: boolean;
  is_station_header?: boolean;
  station_id?: number | null;
  price?: number | null;
  serving_size_amount?: number | string | null;
  serving_size_unit?: string | null;
  food?: NutrisliceFood | null;
};

type NutrisliceFood = {
  id: number;
  name: string;
  description?: string;
  subtext?: string;
  image_url?: string | null;
  hoverpic_url?: string | null;
  price?: number | null;
  ingredients?: string | null;
  food_category?: string;
  rounded_nutrition_info?: Record<string, number | string | null>;
  serving_size_info?: {
    serving_size_amount?: string | number | null;
    serving_size_unit?: string | null;
  } | null;
  icons?: {
    food_icons?: NutrisliceIcon[];
  };
  tags?: Array<{ name?: string; slug?: string }>;
  synced_id?: string | null;
};

type NutrisliceIcon = {
  name?: string;
  slug?: string;
  synced_name?: string;
  help_text?: string;
};

type StationAccumulator = {
  id: string;
  name: string;
  sourceStationId?: string;
  items: NormalizedMenuItem[];
};

const NUTRITION_MAP: Record<
  string,
  { key: NutritionKey; label: string; unit: NutritionUnit }
> = {
  calories: { key: 'calories', label: 'Calories', unit: 'kcal' },
  g_fat: { key: 'total_fat', label: 'Total Fat', unit: 'g' },
  g_saturated_fat: { key: 'saturated_fat', label: 'Saturated Fat', unit: 'g' },
  g_trans_fat: { key: 'trans_fat', label: 'Trans Fat', unit: 'g' },
  mg_cholesterol: { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
  mg_sodium: { key: 'sodium', label: 'Sodium', unit: 'mg' },
  g_carbs: { key: 'total_carbohydrate', label: 'Total Carbohydrate', unit: 'g' },
  g_fiber: { key: 'dietary_fiber', label: 'Dietary Fiber', unit: 'g' },
  g_sugar: { key: 'total_sugars', label: 'Total Sugars', unit: 'g' },
  g_added_sugar: { key: 'added_sugars', label: 'Added Sugars', unit: 'g' },
  g_protein: { key: 'protein', label: 'Protein', unit: 'g' },
  mg_iron: { key: 'iron', label: 'Iron', unit: 'mg' },
  mg_calcium: { key: 'calcium', label: 'Calcium', unit: 'mg' },
  mg_potassium: { key: 'potassium', label: 'Potassium', unit: 'mg' },
  mg_vitamin_d: { key: 'vitamin_d', label: 'Vitamin D', unit: 'mg' },
  mcg_vitamin_d: { key: 'vitamin_d', label: 'Vitamin D', unit: 'mcg' },
};

const TOP_9_ALLERGEN_KEYS: AllergenKey[] = [
  'milk',
  'egg',
  'fish',
  'crustacean_shellfish',
  'tree_nut',
  'peanut',
  'wheat',
  'soy',
  'sesame',
];

export class NutrisliceProvider implements DiningProviderAdapter {
  readonly provider = 'vendor_nutrislice' as const;

  async fetchMenu(school: SchoolCoverage, query: MenuQuery): Promise<ProviderFetchResult> {
    const fetchedAt = new Date().toISOString();
    const date = query.date ?? fetchedAt.slice(0, 10);
    const district = getNutrisliceDistrict(school.sourceUrl);

    if (!district) {
      return {
        state: 'provider_error',
        provider: this.provider,
        sourceUrl: school.sourceUrl,
        reason: 'Nutrislice district slug was not found in source URL.',
      };
    }

    const apiBaseUrl = `https://${district}.api.nutrislice.com`;

    try {
      const schools = await fetchJson<NutrisliceSchool[]>(`${apiBaseUrl}/menu/api/schools/`);
      const selectedSchools = filterLocations(schools, query.locationId);
      const locationMenus = await Promise.all(
        selectedSchools.map((location) => fetchLocationMenu(apiBaseUrl, school, location, date, query.meal))
      );

      const menu: NormalizedMenu = {
        schoolId: school.id,
        providerKind: this.provider,
        sourceUrl: school.sourceUrl,
        fetchedAt,
        sourceUpdatedAt: newest(locationMenus.flatMap((location) => location.sourceUpdatedAt ?? [])),
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
        reason: 'Nutrislice provider fetch failed.',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function getNutrisliceDistrict(sourceUrl: string) {
  const host = new URL(sourceUrl).hostname;
  if (!host.endsWith('.nutrislice.com')) return undefined;
  return host.split('.')[0];
}

function filterLocations(schools: NutrisliceSchool[], locationId?: string) {
  if (!locationId) {
    return schools;
  }

  return schools.filter(
    (school) =>
      String(school.id) === locationId ||
      school.slug === locationId ||
      slugify(school.name) === locationId
  );
}

async function fetchLocationMenu(
  apiBaseUrl: string,
  school: SchoolCoverage,
  location: NutrisliceSchool,
  date: string,
  meal?: string
): Promise<NormalizedMenu['locations'][number] & { sourceUpdatedAt?: string }> {
  const activeMenuTypes = (location.active_menu_types ?? []).filter((menuType) =>
    shouldIncludeMeal(menuType, meal)
  );

  const periods = await Promise.all(
    activeMenuTypes.map(async (menuType) => {
      const template = menuType.urls?.full_menu_by_date_api_url_template;
      if (!template) return undefined;

      const menuUrl = `${apiBaseUrl}${fillTemplate(template, date)}`;
      const weekMenu = await fetchJson<NutrisliceWeekMenu>(menuUrl);
      const day = selectDay(weekMenu, date);
      const stations = normalizeStations(day?.menu_items ?? [], school.sourceUrl, weekMenu.last_updated);

      if (stations.length === 0) {
        return undefined;
      }

      return {
        id: `${location.id}-${menuType.id}`,
        name: menuType.name,
        sourcePeriodId: String(menuType.id),
        stations,
        sourceUpdatedAt: weekMenu.last_updated,
      };
    })
  );

  const compactPeriods = periods.filter((period): period is NonNullable<typeof period> =>
    Boolean(period)
  );

  return {
    id: String(location.id),
    name: location.name,
    sourceLocationId: String(location.id),
    address: location.address,
    timezone: location.timezone ?? undefined,
    date,
    periods: compactPeriods.map(({ sourceUpdatedAt: _sourceUpdatedAt, ...period }) => period),
    sourceUpdatedAt: newest(compactPeriods.flatMap((period) => period.sourceUpdatedAt ?? [])),
  };
}

function shouldIncludeMeal(menuType: NutrisliceMenuType, meal?: string) {
  if (!meal) return true;
  const needle = meal.toLowerCase();
  return (
    menuType.name.toLowerCase().includes(needle) ||
    menuType.slug.toLowerCase().includes(needle)
  );
}

function selectDay(weekMenu: NutrisliceWeekMenu, date: string) {
  return weekMenu.days?.find((day) => day.date === date) ?? weekMenu.days?.[0];
}

function normalizeStations(
  rows: NutrisliceMenuRow[],
  sourceUrl: string,
  sourceUpdatedAt?: string
) {
  const stationMap = new Map<string, StationAccumulator>();
  let currentStationId = 'default';
  let currentStationName = 'Menu';

  for (const row of rows) {
    if (row.is_station_header || (row.is_section_title && !row.food)) {
      currentStationId = row.station_id ? String(row.station_id) : slugify(row.text || currentStationName);
      currentStationName = row.text?.trim() || currentStationName;
      ensureStation(stationMap, currentStationId, currentStationName);
      continue;
    }

    if (!row.food?.name) continue;

    const stationId = row.station_id ? String(row.station_id) : currentStationId;
    const station = ensureStation(stationMap, stationId, currentStationName);
    station.items.push(normalizeItem(row, station, sourceUrl, sourceUpdatedAt));
  }

  return [...stationMap.values()].filter((station) => station.items.length > 0);
}

function ensureStation(stationMap: Map<string, StationAccumulator>, id: string, name: string) {
  const existing = stationMap.get(id);
  if (existing) return existing;

  const station = {
    id,
    name: name || 'Menu',
    sourceStationId: id === 'default' ? undefined : id,
    items: [],
  };
  stationMap.set(id, station);
  return station;
}

function normalizeItem(
  row: NutrisliceMenuRow,
  station: StationAccumulator,
  sourceUrl: string,
  sourceUpdatedAt?: string
): NormalizedMenuItem {
  const food = row.food as NutrisliceFood;
  const servingAmount =
    food.serving_size_info?.serving_size_amount ?? row.serving_size_amount ?? undefined;
  const servingUnit = food.serving_size_info?.serving_size_unit ?? row.serving_size_unit ?? undefined;
  const ingredientStatement = normalizeWhitespace(food.ingredients ?? undefined);

  return {
    id: `nutrislice-${food.id}-${row.id}`,
    sourceItemId: String(food.id),
    name: food.name.trim(),
    normalizedName: food.name.trim().toLowerCase(),
    description: normalizeWhitespace([food.description, food.subtext].filter(Boolean).join(' ')),
    category: normalizeWhitespace(food.food_category),
    stationId: station.id,
    stationName: station.name,
    servingSizeText:
      servingAmount || servingUnit ? `${servingAmount ?? ''} ${servingUnit ?? ''}`.trim() : undefined,
    price: normalizePrice(food.price ?? row.price),
    availability: {
      status: 'planned',
    },
    dietaryTags: normalizeDietaryTags(food.icons?.food_icons ?? [], food.tags ?? []),
    allergens: normalizeAllergens(food.icons?.food_icons ?? [], food.tags ?? []),
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    nutrition: normalizeNutrition(food.rounded_nutrition_info ?? {}),
    imageUrl: food.image_url ?? food.hoverpic_url ?? undefined,
    sourceUrl,
    sourceUpdatedAt,
    raw: row,
  };
}

function normalizePrice(value: number | null | undefined) {
  if (value === null || value === undefined) return undefined;

  return {
    amount: value,
    currency: 'USD' as const,
    displayText: value === 0 ? undefined : `$${value.toFixed(2)}`,
  };
}

function normalizeNutrition(info: Record<string, number | string | null>): NutritionFact[] {
  return Object.entries(info)
    .filter(([_key, value]) => value !== null && value !== '')
    .map(([sourceKey, value]) => {
      const mapped = NUTRITION_MAP[sourceKey] ?? {
        key: 'other' as const,
        label: labelize(sourceKey),
        unit: inferNutritionUnit(sourceKey),
      };
      const amount = typeof value === 'number' ? value : Number(value);

      return {
        key: mapped.key,
        label: mapped.label,
        amount: Number.isFinite(amount) ? amount : undefined,
        unit: mapped.unit,
        sourceText: `${mapped.label}: ${value}`,
      };
    });
}

function inferNutritionUnit(sourceKey: string): NutritionUnit {
  if (sourceKey.startsWith('g_')) return 'g';
  if (sourceKey.startsWith('mg_')) return 'mg';
  if (sourceKey.startsWith('mcg_')) return 'mcg';
  if (sourceKey.startsWith('iu_')) return 'iu';
  return 'other';
}

function normalizeDietaryTags(
  icons: NutrisliceIcon[],
  tags: Array<{ name?: string; slug?: string }>
): DietaryTag[] {
  const labels = [...icons.map(iconLabel), ...tags.map((tag) => tag.slug ?? tag.name ?? '')];
  const mapped = labels.map(mapDietaryTag).filter((tag): tag is DietaryTag => Boolean(tag));
  return [...new Set(mapped)];
}

function mapDietaryTag(label: string): DietaryTag | undefined {
  const value = label.toLowerCase();
  if (value.includes('vegan')) return 'vegan';
  if (value.includes('vegetarian') || value.includes('meatless')) return 'vegetarian';
  if (value.includes('halal')) return 'halal';
  if (value.includes('kosher')) return 'kosher';
  if (
    value.includes('made without gluten') ||
    value.includes('no-gluten') ||
    value.includes('gluten-friendly') ||
    value.includes('avoiding-gluten')
  ) {
    return 'made_without_gluten';
  }
  if (value.includes('gluten free') || value.includes('gluten-free')) return 'gluten_free';
  if (value.includes('dairy free') || value.includes('dairy-free')) return 'dairy_free';
  if (value.includes('low sodium')) return 'low_sodium';
  if (value.includes('low carbon') || value.includes('low-carbon') || value.includes('climate-friendly')) {
    return 'low_carbon';
  }
  if (value.includes('local')) return 'locally_sourced';
  if (value.includes('organic')) return 'organic';
  if (value.includes('plant')) return 'plant_forward';
  if (value.includes('spicy')) return 'spicy';
  if (value.includes('jain') || value.includes('9-in-mind')) return 'other';
  return undefined;
}

function normalizeAllergens(
  icons: NutrisliceIcon[],
  tags: Array<{ name?: string; slug?: string }>
): AllergenFact[] {
  const labels = [...icons.map(iconLabel), ...tags.map((tag) => tag.slug ?? tag.name ?? '')];
  const allergens = labels.flatMap(mapAllergenFacts);
  const deduped = new Map<string, AllergenFact>();

  for (const allergen of allergens) {
    if (!deduped.has(`${allergen.key}:${allergen.status}`)) {
      deduped.set(`${allergen.key}:${allergen.status}`, allergen);
    }
  }

  return [...deduped.values()];
}

function mapAllergenFacts(label: string): AllergenFact[] {
  const value = label.toLowerCase();
  if (value.includes('top-9-free')) {
    return TOP_9_ALLERGEN_KEYS.map((key) => ({
      key,
      label,
      status: 'made_without',
      sourceText: label,
    }));
  }

  const status = value.includes('may contain')
    ? 'may_contain'
    : value.includes('made without') ||
        value.includes('free') ||
        value.includes('no-gluten') ||
        value.includes('gluten-friendly') ||
        value.includes('avoiding-gluten')
      ? 'made_without'
      : 'contains';

  const keys: Array<[AllergenKey, string[]]> = [
    ['milk', ['milk', 'dairy']],
    ['egg', ['egg']],
    ['fish', ['fish']],
    ['crustacean_shellfish', ['shellfish', 'crustacean', 'shrimp', 'crab', 'lobster']],
    ['tree_nut', ['tree nut', 'almond', 'walnut', 'cashew', 'pecan']],
    ['peanut', ['peanut']],
    ['wheat', ['wheat']],
    ['soy', ['soy']],
    ['sesame', ['sesame']],
    ['gluten', ['gluten']],
  ];

  return keys
    .filter(([_key, needles]) => needles.some((needle) => value.includes(needle)))
    .map(([key]) => ({
      key,
      label,
      status,
      sourceText: label,
    }));
}

function splitIngredients(statement?: string): IngredientFact[] {
  if (!statement) return [];

  return statement
    .split(/[,;]\s*/)
    .map((ingredient) => ingredient.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      normalizedName: name.toLowerCase(),
      containsAllergenKeys: ingredientAllergens(name),
      sourceText: name,
    }));
}

function ingredientAllergens(name: string): AllergenKey[] {
  return allergenKeysInIngredientText(name);
}

function iconLabel(icon: NutrisliceIcon) {
  return icon.slug ?? icon.name ?? icon.synced_name ?? icon.help_text ?? '';
}

function fillTemplate(template: string, date: string) {
  const [year, month, day] = date.split('-');
  return template
    .replace('{year}', year ?? '')
    .replace('{month}', month ?? '')
    .replace('{day}', day ?? '');
}

function normalizeWhitespace(value?: string | null) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function newest(values: string[]) {
  return values.filter(Boolean).sort().at(-1);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function labelize(sourceKey: string) {
  return sourceKey
    .replace(/^(g|mg|mcg|iu)_/, '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
