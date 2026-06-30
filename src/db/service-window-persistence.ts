import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { SchoolCoverage } from '../types/dining.js';
import { parseDateOnly } from '../food-trucks/date-utils.js';
import type { FoodTruckFetchResult, FoodTruckServiceWindowInput } from '../food-trucks/types.js';
import { getPrisma } from './client.js';
import { upsertSchoolCatalog } from './persistence.js';

type PersistServiceWindowStats = {
  serviceWindows: number;
  locations: number;
  vendors: number;
};

type PersistServiceWindowOptions = {
  crawlRunId?: string;
};

export const emptyServiceWindowStats = (): PersistServiceWindowStats => ({
  serviceWindows: 0,
  locations: 0,
  vendors: 0,
});

export async function persistFoodTruckServiceWindows(
  input: {
    school: SchoolCoverage;
    date: string;
    result: FoodTruckFetchResult;
  },
  prisma: PrismaClient = getPrisma(),
  options: PersistServiceWindowOptions = {}
) {
  if (input.result.state !== 'adapter_ready') return emptyServiceWindowStats();

  const result = input.result;
  await upsertSchoolCatalog([input.school], prisma);

  const stats = emptyServiceWindowStats();
  const date = parseDateOnly(input.date);

  await prisma.$transaction(
    async (tx) => {
      await tx.serviceWindow.deleteMany({
        where: {
          schoolId: input.school.id,
          date,
          location: {
            is: {
              type: 'food_truck',
            },
          },
        },
      });

      for (const serviceWindow of result.serviceWindows) {
        const dbLocationId = locationDbId(input.school.id, serviceWindow.location.id);
        await tx.location.upsert({
          where: { id: dbLocationId },
          update: {
            sourceLocationId: serviceWindow.location.id,
            type: serviceWindow.location.type ?? 'food_truck',
            name: serviceWindow.location.name,
            address: serviceWindow.location.address,
            latitude: serviceWindow.location.latitude,
            longitude: serviceWindow.location.longitude,
            sourceUrl: serviceWindow.location.sourceUrl ?? serviceWindow.sourceUrl,
            active: true,
            metadata: cleanJson(serviceWindow.location.metadata),
          },
          create: {
            id: dbLocationId,
            schoolId: input.school.id,
            sourceLocationId: serviceWindow.location.id,
            type: serviceWindow.location.type ?? 'food_truck',
            name: serviceWindow.location.name,
            address: serviceWindow.location.address,
            latitude: serviceWindow.location.latitude,
            longitude: serviceWindow.location.longitude,
            sourceUrl: serviceWindow.location.sourceUrl ?? serviceWindow.sourceUrl,
            metadata: cleanJson(serviceWindow.location.metadata),
          },
        });
        stats.locations += 1;

        const dbVendorId = serviceWindow.vendor
          ? vendorDbId(input.school.id, serviceWindow.vendor.id)
          : undefined;
        if (serviceWindow.vendor && dbVendorId) {
          await tx.vendor.upsert({
            where: { id: dbVendorId },
            update: {
              schoolId: input.school.id,
              sourceVendorId: serviceWindow.vendor.id,
              name: serviceWindow.vendor.name,
              websiteUrl: serviceWindow.vendor.websiteUrl,
              sourceUrl: serviceWindow.vendor.sourceUrl ?? serviceWindow.sourceUrl,
              metadata: cleanJson(serviceWindow.vendor.metadata),
            },
            create: {
              id: dbVendorId,
              schoolId: input.school.id,
              sourceVendorId: serviceWindow.vendor.id,
              name: serviceWindow.vendor.name,
              websiteUrl: serviceWindow.vendor.websiteUrl,
              sourceUrl: serviceWindow.vendor.sourceUrl ?? serviceWindow.sourceUrl,
              metadata: cleanJson(serviceWindow.vendor.metadata),
            },
          });
          stats.vendors += 1;
        }

        await tx.serviceWindow.create({
          data: serviceWindowData({
            school: input.school,
            serviceWindow,
            locationId: dbLocationId,
            vendorId: dbVendorId,
            crawlRunId: options.crawlRunId,
          }),
        });
        stats.serviceWindows += 1;
      }
    },
    { timeout: 60_000 }
  );

  return stats;
}

export function foodTruckDataSourceId(schoolId: string) {
  return stableId('source', schoolId, 'food-trucks');
}

export async function upsertFoodTruckDataSource(
  school: SchoolCoverage,
  sourceUrl: string,
  prisma: PrismaClient = getPrisma()
) {
  await prisma.dataSource.upsert({
    where: { id: foodTruckDataSourceId(school.id) },
    update: {
      schoolId: school.id,
      kind: sourceUrl.includes('arcgis') || sourceUrl.includes('boston.gov') ? 'official_api' : 'official_html',
      providerKind: school.providerKind,
      name: `${school.name} food truck source`,
      sourceUrl,
      active: true,
      notes: 'Public food truck service-window source.',
    },
    create: {
      id: foodTruckDataSourceId(school.id),
      schoolId: school.id,
      kind: sourceUrl.includes('arcgis') || sourceUrl.includes('boston.gov') ? 'official_api' : 'official_html',
      providerKind: school.providerKind,
      name: `${school.name} food truck source`,
      sourceUrl,
      notes: 'Public food truck service-window source.',
    },
  });
}

function serviceWindowData(input: {
  school: SchoolCoverage;
  serviceWindow: FoodTruckServiceWindowInput;
  locationId: string;
  vendorId?: string;
  crawlRunId?: string;
}) {
  const { school, serviceWindow, locationId, vendorId, crawlRunId } = input;
  return {
    id: serviceWindowDbId(school.id, serviceWindow),
    schoolId: school.id,
    locationId,
    vendorId,
    crawlRunId,
    date: parseDateOnly(serviceWindow.date),
    meal: serviceWindow.meal,
    startTime: serviceWindow.startTime,
    endTime: serviceWindow.endTime,
    status: serviceWindow.status,
    sourceUrl: serviceWindow.sourceUrl,
    sourceUpdatedAt: parseDateTime(serviceWindow.sourceUpdatedAt),
    confidence: serviceWindow.confidence,
    isEstimated: serviceWindow.isEstimated,
    metadata: cleanJson({
      sourceWindowId: serviceWindow.id,
      ...serviceWindow.metadata,
    }),
  };
}

function locationDbId(schoolId: string, sourceLocationId: string) {
  return stableId('location', schoolId, 'food-truck', sourceLocationId);
}

function vendorDbId(schoolId: string, sourceVendorId: string) {
  return stableId('vendor', schoolId, sourceVendorId);
}

function serviceWindowDbId(schoolId: string, serviceWindow: FoodTruckServiceWindowInput) {
  return stableId(
    'service-window',
    schoolId,
    serviceWindow.date,
    serviceWindow.location.id,
    serviceWindow.vendor?.id ?? 'no-vendor',
    serviceWindow.startTime ?? '',
    serviceWindow.endTime ?? '',
    serviceWindow.sourceUrl
  );
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

function parseDateTime(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function cleanJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanJson(item))
      .filter((item): item is Prisma.InputJsonValue => item !== undefined);
  }
  if (typeof value === 'object') {
    const result: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const cleaned = cleanJson(item);
      if (cleaned !== undefined) result[key] = cleaned;
    }
    return result;
  }
  return String(value);
}
