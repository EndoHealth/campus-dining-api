import type { Prisma } from '../generated/prisma/client.js';
import type {
  LocationType,
  NormalizedServiceWindow,
  SchoolCoverage,
  ServiceWindowQuery,
} from '../types/dining.js';
import { getPrisma } from './client.js';

type ServiceWindowWithRelations = Prisma.ServiceWindowGetPayload<{
  include: {
    location: true;
    vendor: true;
    menus: {
      include: {
        _count: {
          select: {
            items: true;
          };
        };
      };
    };
  };
}>;

export async function getStoredServiceWindows(school: SchoolCoverage, query: Required<Pick<ServiceWindowQuery, 'date'>> & ServiceWindowQuery) {
  const locationType = query.type ?? 'food_truck';
  const rows = await getPrisma().serviceWindow.findMany({
    where: {
      schoolId: school.id,
      date: parseDateOnly(query.date),
      location: {
        is: {
          type: locationType,
        },
      },
    },
    include: {
      location: true,
      vendor: true,
      menus: {
        include: {
          _count: {
            select: {
              items: true,
            },
          },
        },
      },
    },
    orderBy: [{ startTime: 'asc' }, { endTime: 'asc' }, { createdAt: 'asc' }],
  });

  return rows.map(toNormalizedServiceWindow);
}

function toNormalizedServiceWindow(row: ServiceWindowWithRelations): NormalizedServiceWindow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    date: dateOnly(row.date),
    meal: row.meal ?? undefined,
    startTime: row.startTime ?? undefined,
    endTime: row.endTime ?? undefined,
    status: row.status,
    location: {
      id: row.location.sourceLocationId ?? row.location.id,
      name: row.location.name,
      type: row.location.type as LocationType,
      address: row.location.address ?? undefined,
    },
    vendor: row.vendor
      ? {
          id: row.vendor.sourceVendorId ?? row.vendor.id,
          name: row.vendor.name,
          websiteUrl: row.vendor.websiteUrl ?? undefined,
        }
      : undefined,
    menuCount: row.menus.length,
    itemCount: row.menus.reduce((total, menu) => total + menu._count.items, 0),
    sourceUrl: row.sourceUrl,
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString(),
    confidence: row.confidence,
    isEstimated: row.isEstimated,
  };
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}
