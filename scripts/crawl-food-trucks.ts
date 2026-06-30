import { createHash } from 'node:crypto';
import { envList, envNumber } from '../src/config.js';
import { TOP_50_SCHOOLS } from '../src/data/top50-schools.js';
import { disconnectPrisma, getPrisma } from '../src/db/client.js';
import {
  foodTruckDataSourceId,
  persistFoodTruckServiceWindows,
  upsertFoodTruckDataSource,
} from '../src/db/service-window-persistence.js';
import { upsertSchoolCatalog } from '../src/db/persistence.js';
import { addDays, parseDateOnly } from '../src/food-trucks/date-utils.js';
import {
  foodTruckAdapterSchoolIds,
  getFoodTruckAdaptersForSchool,
} from '../src/food-trucks/adapters.js';
import type { FoodTruckFetchResult } from '../src/food-trucks/types.js';
import type { SchoolCoverage } from '../src/types/dining.js';

type CrawlTask = {
  school: SchoolCoverage;
  date: string;
};

type CrawlResult = {
  schoolId: string;
  date: string;
  state: FoodTruckFetchResult['state'] | 'skipped' | 'threw';
  status: 'success' | 'partial' | 'failed' | 'skipped';
  serviceWindows: number;
  vendors: number;
  locations: number;
  error?: string;
};

const startDate = process.env.FOOD_TRUCK_CRAWL_DATE ?? process.env.CRAWL_DATE ?? new Date().toISOString().slice(0, 10);
const daysAhead = envNumber('FOOD_TRUCK_DAYS_AHEAD', 7, { min: 0, max: 30 });
const concurrency = envNumber('FOOD_TRUCK_CRAWL_CONCURRENCY', 2, { min: 1, max: 6 });
const selectedSchools = envList('FOOD_TRUCK_CRAWL_SCHOOLS');
const selectedSchoolIds = new Set(selectedSchools.length > 0 ? selectedSchools : envList('CRAWL_SCHOOLS'));
const maxFailures = envNumber('FOOD_TRUCK_CRAWL_MAX_FAILURES', 4, { min: 0 });

async function main() {
  const prisma = getPrisma();
  await upsertSchoolCatalog(TOP_50_SCHOOLS, prisma);

  const adapterSchoolIds = foodTruckAdapterSchoolIds();
  const schools = TOP_50_SCHOOLS.filter((school) => {
    if (!adapterSchoolIds.has(school.id)) return false;
    if (selectedSchoolIds.size > 0 && !selectedSchoolIds.has(school.id)) return false;
    return true;
  });
  const dates = Array.from({ length: daysAhead + 1 }, (_, offset) => addDays(startDate, offset));
  const tasks = schools.flatMap((school) => dates.map((date) => ({ school, date })));

  const results = await runWithConcurrency(tasks, concurrency, crawlFoodTruckTask);
  const failed = results.filter((result) => result.status === 'failed');
  const partial = results.filter((result) => result.status === 'partial');
  const success = results.filter((result) => result.status === 'success');
  const serviceWindows = results.reduce((total, result) => total + result.serviceWindows, 0);

  console.log(
    JSON.stringify(
      {
        startDate,
        daysAhead,
        schools: schools.length,
        tasks: tasks.length,
        success: success.length,
        partial: partial.length,
        failed: failed.length,
        serviceWindows,
        coveredSchools: [...new Set(results.filter((result) => result.serviceWindows > 0).map((result) => result.schoolId))],
      },
      null,
      2
    )
  );

  if (failed.length > maxFailures) {
    process.exitCode = 1;
  }
}

async function crawlFoodTruckTask(task: CrawlTask): Promise<CrawlResult> {
  const prisma = getPrisma();
  const adapters = getFoodTruckAdaptersForSchool(task.school.id);
  const adapter = adapters[0];

  if (!adapter) {
    return {
      schoolId: task.school.id,
      date: task.date,
      state: 'skipped',
      status: 'skipped',
      serviceWindows: 0,
      vendors: 0,
      locations: 0,
    };
  }

  await upsertFoodTruckDataSource(task.school, adapter.sourceUrl, prisma);
  const dataSourceId = foodTruckDataSourceId(task.school.id);
  const crawlRun = await prisma.crawlRun.create({
    data: {
      schoolId: task.school.id,
      dataSourceId,
      status: 'running',
      requestedDate: parseDateOnly(task.date),
      usedDate: parseDateOnly(task.date),
      mode: 'scheduled-food-trucks',
      metadata: {
        sourceUrl: adapter.sourceUrl,
      },
    },
  });

  try {
    console.log(`Crawling food trucks ${task.school.rank}. ${task.school.name} (${task.school.id}) ${task.date}`);
    const result = await adapter.fetch(task.date, task.school.id);

    if (result.state !== 'adapter_ready') {
      await prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorCode: result.state,
          errorMessage: result.error ?? result.reason,
        },
      });
      return {
        schoolId: task.school.id,
        date: task.date,
        state: result.state,
        status: 'failed',
        serviceWindows: 0,
        vendors: 0,
        locations: 0,
        error: result.error ?? result.reason,
      };
    }

    const stats = await persistFoodTruckServiceWindows(
      {
        school: task.school,
        date: task.date,
        result,
      },
      prisma,
      { crawlRunId: crawlRun.id }
    );
    const status = result.serviceWindows.length > 0 ? 'success' : 'partial';

    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: {
        status,
        completedAt: new Date(),
        snapshotHash: hashJson({
          schoolId: task.school.id,
          date: task.date,
          serviceWindows: result.serviceWindows.length,
          fetchedAt: result.fetchedAt,
        }),
        metadata: {
          sourceUrl: result.sourceUrl,
          warnings: result.warnings ?? [],
          stats,
        },
      },
    });

    console.log(`Persisted food trucks ${task.school.id} ${task.date}: ${stats.serviceWindows} service windows`);
    return {
      schoolId: task.school.id,
      date: task.date,
      state: result.state,
      status,
      serviceWindows: stats.serviceWindows,
      vendors: stats.vendors,
      locations: stats.locations,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorCode: 'thrown_error',
        errorMessage,
      },
    });
    return {
      schoolId: task.school.id,
      date: task.date,
      state: 'threw',
      status: 'failed',
      serviceWindows: 0,
      vendors: 0,
      locations: 0,
      error: errorMessage,
    };
  }
}

async function runWithConcurrency<T, R>(
  inputs: T[],
  limit: number,
  worker: (input: T) => Promise<R>
) {
  const results: R[] = [];
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < inputs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(inputs[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, inputs.length) }, () => runWorker())
  );
  return results;
}

function hashJson(value: unknown) {
  return createHash('sha1').update(JSON.stringify(value)).digest('hex');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
