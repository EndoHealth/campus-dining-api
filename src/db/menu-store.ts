import { envFlag, envNumber } from '../config.js';
import type { MenuResponsePayload } from '../cache/menu-cache.js';
import type { ProviderFetchResult } from '../providers/types.js';
import type {
  AllergenFact,
  IngredientFact,
  MenuQuery,
  NormalizedMenu,
  NormalizedMenuItem,
  NutritionFact,
  SchoolCoverage,
} from '../types/dining.js';
import { getPrisma } from './client.js';

type StoredMenuOptions = {
  maxAgeMinutes?: number;
  stale?: boolean;
  warning?: string;
};

type StoredMenu = Awaited<ReturnType<typeof findStoredMenus>>[number];
type StoredPeriod = StoredMenu['periods'][number];
type StoredStation = StoredPeriod['stations'][number];
type StoredItem = StoredStation['items'][number];

export async function getFreshStoredMenuPayloadIfEnabled(
  school: SchoolCoverage,
  query: Required<Pick<MenuQuery, 'date'>> & MenuQuery
) {
  if (!envFlag('READ_MENUS_FROM_DB', false)) return undefined;

  return getStoredMenuPayload(school, query, {
    maxAgeMinutes: envNumber('MENU_DB_FRESH_MAX_MINUTES', 30, { min: 1 }),
  });
}

export async function getStaleStoredMenuPayloadIfEnabled(
  school: SchoolCoverage,
  query: Required<Pick<MenuQuery, 'date'>> & MenuQuery,
  warning: string
) {
  if (!envFlag('FALLBACK_TO_STALE_DB_ON_PROVIDER_ERROR', true)) return undefined;

  return getStoredMenuPayload(school, query, {
    maxAgeMinutes: envNumber('MENU_DB_STALE_MAX_MINUTES', 7 * 24 * 60, { min: 1 }),
    stale: true,
    warning,
  });
}

export async function getStoredMenuPayload(
  school: SchoolCoverage,
  query: Required<Pick<MenuQuery, 'date'>> & MenuQuery,
  options: StoredMenuOptions = {}
): Promise<MenuResponsePayload | undefined> {
  const menus = await findStoredMenus(school.id, query);
  if (!menus.length) return undefined;

  const latestFetchedAt = menus.reduce<Date | undefined>((latest, menu) => {
    if (!latest || menu.fetchedAt > latest) return menu.fetchedAt;
    return latest;
  }, undefined);
  const ageMinutes = latestFetchedAt
    ? Math.floor((Date.now() - latestFetchedAt.getTime()) / 60_000)
    : undefined;

  if (
    options.maxAgeMinutes !== undefined &&
    ageMinutes !== undefined &&
    ageMinutes > options.maxAgeMinutes
  ) {
    return undefined;
  }

  const result: ProviderFetchResult = {
    state: 'adapter_ready',
    provider: menus[0].providerKind,
    fetchedAt: latestFetchedAt?.toISOString() ?? new Date().toISOString(),
    sourceUrl: menus[0].sourceUrl,
    servedFrom: options.stale ? 'database_stale' : 'database',
    isStale: options.stale ?? false,
    warnings: options.warning ? [options.warning] : undefined,
    data: toNormalizedMenu(school, menus),
  };

  return {
    school,
    query,
    result,
  };
}

async function findStoredMenus(schoolId: string, query: Required<Pick<MenuQuery, 'date'>> & MenuQuery) {
  const meal = query.meal ?? 'all';
  const locationFilter = query.locationId
    ? {
        OR: [
          { id: query.locationId },
          { sourceLocationId: query.locationId },
          { sourceLocationId: null, id: query.locationId },
        ],
      }
    : undefined;

  const menus = await getPrisma().menu.findMany({
    where: {
      schoolId,
      date: parseDateOnly(query.date),
      meal,
      location: locationFilter ? { is: locationFilter } : undefined,
    },
    include: {
      location: true,
      periods: {
        orderBy: { sortOrder: 'asc' },
        include: {
          stations: {
            orderBy: { sortOrder: 'asc' },
            include: {
              items: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  nutrition: true,
                  ingredients: true,
                  allergens: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return menus.sort((a, b) => a.location.name.localeCompare(b.location.name));
}

function toNormalizedMenu(school: SchoolCoverage, menus: StoredMenu[]): NormalizedMenu {
  const latestFetchedAt = menus.reduce<Date | undefined>((latest, menu) => {
    if (!latest || menu.fetchedAt > latest) return menu.fetchedAt;
    return latest;
  }, undefined);

  return {
    schoolId: school.id,
    providerKind: menus[0].providerKind,
    sourceUrl: menus[0].sourceUrl,
    fetchedAt: latestFetchedAt?.toISOString() ?? new Date().toISOString(),
    sourceUpdatedAt: latestDate(menus.map((menu) => menu.sourceUpdatedAt))?.toISOString(),
    locations: menus.map((menu) => ({
      id: menu.location.sourceLocationId ?? menu.location.id,
      name: menu.location.name,
      type: menu.location.type,
      sourceLocationId: menu.location.sourceLocationId ?? undefined,
      address: menu.location.address ?? undefined,
      timezone: menu.location.timezone ?? undefined,
      date: dateOnly(menu.date),
      periods: menu.periods.map((period) => periodToNormalized(period)),
    })),
  };
}

function periodToNormalized(period: StoredPeriod) {
  return {
    id: period.sourcePeriodId ?? period.id,
    name: period.name,
    sourcePeriodId: period.sourcePeriodId ?? undefined,
    startTime: period.startTime ?? undefined,
    endTime: period.endTime ?? undefined,
    stations: period.stations.map((station) => stationToNormalized(station)),
  };
}

function stationToNormalized(station: StoredStation) {
  return {
    id: station.sourceStationId ?? station.id,
    name: station.name,
    sourceStationId: station.sourceStationId ?? undefined,
    items: station.items.map((item) => itemToNormalized(item, station)),
  };
}

function itemToNormalized(item: StoredItem, station: StoredStation): NormalizedMenuItem {
  return {
    id: item.id,
    sourceItemId: item.sourceItemId ?? undefined,
    name: item.name,
    normalizedName: item.normalizedName ?? undefined,
    description: item.description ?? undefined,
    category: item.category ?? undefined,
    cuisine: item.cuisine ?? undefined,
    stationId: station.sourceStationId ?? station.id,
    stationName: station.name,
    servingSizeText: item.servingSizeText ?? undefined,
    portionText: item.portionText ?? undefined,
    price: priceToNormalized(item),
    availability: {
      status: item.availabilityStatus,
      startTime: item.availabilityStartTime ?? undefined,
      endTime: item.availabilityEndTime ?? undefined,
      sourceText: item.availabilitySourceText ?? undefined,
    },
    dietaryTags: item.dietaryTags,
    allergens: item.allergens.map(allergenToNormalized),
    ingredients: item.ingredients.map(ingredientToNormalized),
    ingredientStatement: item.ingredientStatement ?? undefined,
    nutrition: item.nutrition.map(nutritionToNormalized),
    nutritionSource: item.nutritionSource,
    ingredientSource: item.ingredientSource,
    allergenSource: item.allergenSource,
    isEstimated: item.isEstimated,
    estimateLabel: item.estimateLabel ?? undefined,
    disclaimer: item.disclaimer ?? undefined,
    imageUrl: item.imageUrl ?? undefined,
    itemUrl: item.itemUrl ?? undefined,
    sourceUrl: item.sourceUrl,
    sourceUpdatedAt: item.sourceUpdatedAt?.toISOString(),
    raw: item.raw ?? undefined,
  };
}

function priceToNormalized(item: StoredItem) {
  if (!item.priceAmount && !item.priceCurrency && !item.priceDisplayText) return undefined;
  const currency: 'USD' | undefined = item.priceCurrency === 'USD' ? 'USD' : undefined;

  return {
    amount: item.priceAmount === null ? undefined : Number(item.priceAmount),
    currency,
    displayText: item.priceDisplayText ?? undefined,
  };
}

function nutritionToNormalized(fact: StoredItem['nutrition'][number]): NutritionFact {
  return {
    key: fact.key,
    label: fact.label,
    amount: fact.amount ?? undefined,
    unit: fact.unit ?? undefined,
    dailyValuePercent: fact.dailyValuePercent ?? undefined,
    sourceText: fact.sourceText ?? undefined,
  };
}

function ingredientToNormalized(fact: StoredItem['ingredients'][number]): IngredientFact {
  return {
    name: fact.name,
    normalizedName: fact.normalizedName ?? undefined,
    containsAllergenKeys: fact.containsAllergenKeys,
    sourceText: fact.sourceText ?? undefined,
  };
}

function allergenToNormalized(fact: StoredItem['allergens'][number]): AllergenFact {
  return {
    key: fact.key,
    label: fact.label,
    status: fact.status,
    sourceText: fact.sourceText ?? undefined,
  };
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function latestDate(values: Array<Date | null>) {
  return values.reduce<Date | undefined>((latest, value) => {
    if (!value) return latest;
    if (!latest || value > latest) return value;
    return latest;
  }, undefined);
}
