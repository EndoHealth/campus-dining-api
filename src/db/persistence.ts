import { createHash } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { getPrisma } from './client.js';
import type { MenuResponsePayload } from '../cache/menu-cache.js';
import type {
  AllergenFact,
  IngredientFact,
  NormalizedMenu,
  NormalizedMenuItem,
  NutritionFact,
  ProviderKind,
  SchoolCoverage,
} from '../types/dining.js';

type PersistStats = {
  menus: number;
  periods: number;
  stations: number;
  items: number;
  nutritionFacts: number;
  ingredientFacts: number;
  allergenFacts: number;
};

type PersistOptions = {
  crawlRunId?: string;
};

export const emptyStats = (): PersistStats => ({
  menus: 0,
  periods: 0,
  stations: 0,
  items: 0,
  nutritionFacts: 0,
  ingredientFacts: 0,
  allergenFacts: 0,
});

export async function upsertSchoolCatalog(
  schools: SchoolCoverage[],
  prisma: PrismaClient = getPrisma()
) {
  for (const school of schools) {
    await prisma.school.upsert({
      where: { id: school.id },
      update: schoolData(school),
      create: schoolData(school),
    });

    await prisma.dataSource.upsert({
      where: { id: primaryDataSourceId(school.id) },
      update: {
        kind: sourceKindForProvider(school.providerKind),
        providerKind: school.providerKind,
        name: `${school.name} primary dining source`,
        sourceUrl: school.sourceUrl,
        active: true,
        notes: school.notes,
      },
      create: {
        id: primaryDataSourceId(school.id),
        schoolId: school.id,
        kind: sourceKindForProvider(school.providerKind),
        providerKind: school.providerKind,
        name: `${school.name} primary dining source`,
        sourceUrl: school.sourceUrl,
        notes: school.notes,
      },
    });
  }

  return { schools: schools.length };
}

export async function persistMenuPayloadIfEnabled(payload: MenuResponsePayload) {
  if (process.env.PERSIST_MENUS_TO_DB !== 'true') return undefined;
  return persistMenuPayload(payload);
}

export async function persistMenuPayload(
  payload: MenuResponsePayload,
  prisma: PrismaClient = getPrisma(),
  options: PersistOptions = {}
) {
  if (payload.result.state !== 'adapter_ready') return emptyStats();

  await upsertSchoolCatalog([payload.school], prisma);
  return persistNormalizedMenu(payload.school, payload.result.data, payload.query.meal, prisma, options);
}

export async function persistNormalizedMenu(
  school: SchoolCoverage,
  menu: NormalizedMenu,
  requestedMeal: string | undefined,
  prisma: PrismaClient = getPrisma(),
  options: PersistOptions = {}
) {
  const stats = emptyStats();

  for (const location of menu.locations) {
    const date = parseDateOnly(location.date);
    const dbLocationId = locationDbId(menu.schoolId, location.id);
    const meal = requestedMeal ?? 'all';
    const dbMenuId = menuDbId(menu.schoolId, location.id, location.date, meal);

    await prisma.location.upsert({
      where: { id: dbLocationId },
      update: {
        sourceLocationId: location.sourceLocationId ?? location.id,
        type: 'dining_hall',
        name: location.name,
        address: location.address,
        timezone: location.timezone,
        sourceUrl: menu.sourceUrl,
        active: true,
      },
      create: {
        id: dbLocationId,
        schoolId: menu.schoolId,
        sourceLocationId: location.sourceLocationId ?? location.id,
        type: 'dining_hall',
        name: location.name,
        address: location.address,
        timezone: location.timezone,
        sourceUrl: menu.sourceUrl,
      },
    });

    await prisma.$transaction(
      async (tx) => {
        await tx.menu.deleteMany({ where: { id: dbMenuId } });
        await tx.menu.create({
          data: {
            id: dbMenuId,
            schoolId: menu.schoolId,
            locationId: dbLocationId,
            crawlRunId: options.crawlRunId,
            providerKind: menu.providerKind,
            date,
            meal,
            sourceUrl: menu.sourceUrl,
            fetchedAt: parseDateTime(menu.fetchedAt) ?? new Date(),
            sourceUpdatedAt: parseDateTime(menu.sourceUpdatedAt),
            freshnessMinutes: menu.freshnessMinutes,
            metadata: {
              sourceLocationId: location.id,
              schoolRank: school.rank,
            },
          },
        });
        stats.menus += 1;

        for (const [periodIndex, period] of location.periods.entries()) {
          const dbPeriodId = periodDbId(dbMenuId, period.id, periodIndex);
          await tx.menuPeriod.create({
            data: {
              id: dbPeriodId,
              menuId: dbMenuId,
              sourcePeriodId: period.sourcePeriodId ?? period.id,
              name: period.name,
              startTime: period.startTime,
              endTime: period.endTime,
              sortOrder: periodIndex,
            },
          });
          stats.periods += 1;

          for (const [stationIndex, station] of period.stations.entries()) {
            const dbStationId = stationDbId(dbPeriodId, station.id, stationIndex);
            await tx.station.create({
              data: {
                id: dbStationId,
                menuId: dbMenuId,
                periodId: dbPeriodId,
                sourceStationId: station.sourceStationId ?? station.id,
                name: station.name,
                sortOrder: stationIndex,
              },
            });
            stats.stations += 1;

            for (const [itemIndex, item] of station.items.entries()) {
              await createMenuItem(tx, {
                schoolId: menu.schoolId,
                menuId: dbMenuId,
                periodId: dbPeriodId,
                stationId: dbStationId,
                item,
                itemIndex,
              });
              stats.items += 1;
              stats.nutritionFacts += item.nutrition.length;
              stats.ingredientFacts += item.ingredients.length;
              stats.allergenFacts += item.allergens.length;
            }
          }
        }
      },
      { timeout: 60_000 }
    );
  }

  return stats;
}

function schoolData(school: SchoolCoverage) {
  return {
    id: school.id,
    rank: school.rank,
    name: school.name,
    aliases: school.aliases,
    city: school.city,
    state: school.state,
    providerKind: school.providerKind,
    supportStatus: school.supportStatus,
    integrationStatus: school.integrationStatus,
    confidence: school.confidence,
    sourceUrl: school.sourceUrl,
    notes: school.notes,
  };
}

export function primaryDataSourceId(schoolId: string) {
  return stableId('source', schoolId, 'primary-menu');
}

function sourceKindForProvider(providerKind: ProviderKind) {
  if (providerKind === 'official_api') return 'official_api';
  if (providerKind === 'official_html') return 'official_html';
  if (providerKind === 'student_api') return 'partner_api';
  return 'vendor_api';
}

function locationDbId(schoolId: string, sourceLocationId: string) {
  return stableId('location', schoolId, sourceLocationId);
}

function menuDbId(schoolId: string, sourceLocationId: string, date: string, meal: string) {
  return stableId('menu', schoolId, sourceLocationId, date, meal);
}

function periodDbId(menuId: string, sourcePeriodId: string, sortOrder: number) {
  return stableId('period', menuId, sourcePeriodId, String(sortOrder));
}

function stationDbId(periodId: string, sourceStationId: string, sortOrder: number) {
  return stableId('station', periodId, sourceStationId, String(sortOrder));
}

function menuItemDbId(menuId: string, item: NormalizedMenuItem, sortOrder: number) {
  return stableId('item', menuId, item.id, item.sourceItemId ?? '', item.name, String(sortOrder));
}

function stableId(prefix: string, ...parts: string[]) {
  const raw = parts.join('|');
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const digest = createHash('sha1').update(raw).digest('hex').slice(0, 14);
  return `${prefix}_${slug || 'row'}_${digest}`;
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseDateTime(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function finiteNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

async function createMenuItem(
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  input: {
    schoolId: string;
    menuId: string;
    periodId: string;
    stationId: string;
    item: NormalizedMenuItem;
    itemIndex: number;
  }
) {
  const { schoolId, menuId, periodId, stationId, item, itemIndex } = input;
  const dbItemId = menuItemDbId(menuId, item, itemIndex);
  const factSource = item.isEstimated ? 'llm_estimated' : 'official';

  await tx.menuItem.create({
    data: {
      id: dbItemId,
      schoolId,
      menuId,
      periodId,
      stationId,
      sourceItemId: item.sourceItemId,
      name: item.name,
      normalizedName: item.normalizedName,
      description: item.description,
      category: item.category,
      cuisine: item.cuisine,
      servingSizeText: item.servingSizeText,
      portionText: item.portionText,
      priceAmount: item.price?.amount,
      priceCurrency: item.price?.currency,
      priceDisplayText: item.price?.displayText,
      availabilityStatus: item.availability.status,
      availabilityStartTime: item.availability.startTime,
      availabilityEndTime: item.availability.endTime,
      availabilitySourceText: item.availability.sourceText,
      sortOrder: itemIndex,
      dietaryTags: item.dietaryTags,
      ingredientStatement: item.ingredientStatement,
      nutritionSource: item.nutrition.length ? factSource : 'unavailable',
      ingredientSource: item.ingredients.length || item.ingredientStatement ? factSource : 'unavailable',
      allergenSource: item.allergens.length ? factSource : 'unavailable',
      isEstimated: item.isEstimated ?? false,
      estimateLabel: item.estimateLabel,
      disclaimer: item.disclaimer,
      imageUrl: item.imageUrl,
      itemUrl: item.itemUrl,
      sourceUrl: item.sourceUrl,
      sourceUpdatedAt: parseDateTime(item.sourceUpdatedAt),
      raw: item.raw === undefined ? undefined : (item.raw as object),
      nutrition: {
        create: item.nutrition.map((fact) => nutritionFactData(fact, factSource)),
      },
      ingredients: {
        create: item.ingredients.map((fact) => ingredientFactData(fact, factSource)),
      },
      allergens: {
        create: item.allergens.map((fact) => allergenFactData(fact, factSource)),
      },
    },
  });
}

function nutritionFactData(fact: NutritionFact, sourceKind: 'official' | 'llm_estimated') {
  return {
    key: fact.key,
    label: fact.label,
    amount: finiteNumber(fact.amount),
    unit: fact.unit,
    dailyValuePercent: finiteNumber(fact.dailyValuePercent),
    sourceText: fact.sourceText,
    sourceKind,
    isEstimated: sourceKind === 'llm_estimated',
    estimatedByModel: sourceKind === 'llm_estimated' ? 'gemini-flash-lite' : undefined,
  };
}

function ingredientFactData(fact: IngredientFact, sourceKind: 'official' | 'llm_estimated') {
  return {
    name: fact.name,
    normalizedName: fact.normalizedName,
    containsAllergenKeys: fact.containsAllergenKeys ?? [],
    sourceText: fact.sourceText,
    sourceKind,
    isEstimated: sourceKind === 'llm_estimated',
    estimatedByModel: sourceKind === 'llm_estimated' ? 'gemini-flash-lite' : undefined,
  };
}

function allergenFactData(fact: AllergenFact, sourceKind: 'official' | 'llm_estimated') {
  return {
    key: fact.key,
    label: fact.label,
    status: fact.status,
    sourceText: fact.sourceText,
    sourceKind,
    isEstimated: sourceKind === 'llm_estimated',
    estimatedByModel: sourceKind === 'llm_estimated' ? 'gemini-flash-lite' : undefined,
  };
}
