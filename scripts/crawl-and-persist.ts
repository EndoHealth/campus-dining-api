import { createHash } from 'node:crypto';
import { envFlag, envList, envNumber } from '../src/config.js';
import { TOP_50_SCHOOLS } from '../src/data/top50-schools.js';
import { disconnectPrisma, getPrisma } from '../src/db/client.js';
import { persistMenuPayload, primaryDataSourceId, upsertSchoolCatalog } from '../src/db/persistence.js';
import { getProviderAdapter } from '../src/providers/registry.js';
import type { ProviderFetchResult } from '../src/providers/types.js';
import type { MenuQuery, NormalizedMenu, SchoolCoverage } from '../src/types/dining.js';

type MenuCounts = {
  locations: number;
  periods: number;
  stations: number;
  items: number;
};

type CrawlResult = {
  schoolId: string;
  state: ProviderFetchResult['state'] | 'skipped' | 'threw';
  status: 'success' | 'partial' | 'failed' | 'skipped';
  counts: MenuCounts;
  error?: string;
};

const date = process.env.CRAWL_DATE ?? process.env.PROBE_DATE ?? new Date().toISOString().slice(0, 10);
const meal = process.env.CRAWL_MEAL;
const fetchAttempts = envNumber('FETCH_ATTEMPTS', 3, { min: 1, max: 6 });
const concurrency = envNumber('CRAWL_CONCURRENCY', 2, { min: 1, max: 6 });
const includePending = envFlag('CRAWL_INCLUDE_PENDING', false);
const selectedSchoolIds = new Set(envList('CRAWL_SCHOOLS'));
const maxFailures = envNumber('CRAWL_MAX_FAILURES', 8, { min: 0 });

async function main() {
  const prisma = getPrisma();
  await upsertSchoolCatalog(TOP_50_SCHOOLS, prisma);

  const schools = TOP_50_SCHOOLS.filter((school) => {
    if (selectedSchoolIds.size > 0 && !selectedSchoolIds.has(school.id)) return false;
    if (!includePending && school.integrationStatus !== 'adapter_ready') return false;
    return true;
  });

  const results = await runWithConcurrency(schools, concurrency, crawlSchool);
  const failed = results.filter((result) => result.status === 'failed');
  const partial = results.filter((result) => result.status === 'partial');
  const success = results.filter((result) => result.status === 'success');
  const totalItems = results.reduce((total, result) => total + result.counts.items, 0);

  console.log(
    JSON.stringify(
      {
        date,
        meal: meal ?? 'all',
        schools: results.length,
        success: success.length,
        partial: partial.length,
        failed: failed.length,
        totalItems,
      },
      null,
      2
    )
  );

  if (failed.length > maxFailures) {
    process.exitCode = 1;
  }
}

async function crawlSchool(school: SchoolCoverage): Promise<CrawlResult> {
  const prisma = getPrisma();
  const query: MenuQuery = meal ? { date, meal } : { date };
  const dataSourceId = primaryDataSourceId(school.id);
  const crawlRun = await prisma.crawlRun.create({
    data: {
      schoolId: school.id,
      dataSourceId,
      status: 'running',
      requestedDate: parseDateOnly(date),
      usedDate: parseDateOnly(date),
      mode: 'scheduled-menu',
      metadata: {
        query,
        providerKind: school.providerKind,
      },
    },
  });

  try {
    if (school.integrationStatus !== 'adapter_ready') {
      await prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: {
          status: 'partial',
          completedAt: new Date(),
          errorCode: school.integrationStatus,
          errorMessage: 'School does not have an adapter-ready provider yet.',
        },
      });
      return {
        schoolId: school.id,
        state: 'skipped',
        status: 'skipped',
        counts: emptyCounts(),
      };
    }

    console.log(`Crawling ${school.rank}. ${school.name} (${school.id})`);
    const result = await fetchMenuWithRetries(school, query);
    const counts = result.state === 'adapter_ready' ? countMenu(result.data) : emptyCounts();

    if (result.state === 'adapter_ready') {
      const stats = await persistMenuPayload(
        {
          school,
          query,
          result,
        },
        prisma,
        { crawlRunId: crawlRun.id }
      );
      const status = counts.items > 0 ? 'success' : 'partial';
      await prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: {
          status,
          completedAt: new Date(),
          snapshotHash: hashJson({
            schoolId: school.id,
            date,
            counts,
            fetchedAt: result.fetchedAt,
          }),
          metadata: {
            counts,
            stats,
          },
        },
      });
      console.log(`Persisted ${school.id}: ${stats.items} items`);
      return { schoolId: school.id, state: result.state, status, counts };
    }

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
      schoolId: school.id,
      state: result.state,
      status: 'failed',
      counts,
      error: result.error ?? result.reason,
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
      schoolId: school.id,
      state: 'threw',
      status: 'failed',
      counts: emptyCounts(),
      error: errorMessage,
    };
  }
}

async function fetchMenuWithRetries(school: SchoolCoverage, query: MenuQuery): Promise<ProviderFetchResult> {
  const adapter = getProviderAdapter(school.providerKind);
  let lastResult: ProviderFetchResult | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= fetchAttempts; attempt += 1) {
    try {
      const result = await adapter.fetchMenu(school, query);
      if (
        result.state === 'adapter_ready' &&
        countMenu(result.data).items === 0 &&
        attempt < fetchAttempts
      ) {
        lastResult = result;
        console.warn(`Retrying ${school.id} after empty adapter_ready result (${attempt}/${fetchAttempts})`);
        await delay(1000 * attempt);
        continue;
      }

      if (result.state !== 'provider_error' || attempt === fetchAttempts) {
        return result;
      }

      lastResult = result;
      console.warn(
        `Retrying ${school.id} after provider_error (${attempt}/${fetchAttempts}): ${
          result.error ?? result.reason
        }`
      );
    } catch (error) {
      lastError = error;
      if (attempt === fetchAttempts) throw error;
      console.warn(
        `Retrying ${school.id} after thrown error (${attempt}/${fetchAttempts}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    await delay(1000 * attempt);
  }

  if (lastResult) return lastResult;
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function runWithConcurrency<T, R>(
  inputs: T[],
  limit: number,
  worker: (input: T) => Promise<R>
) {
  const results: R[] = [];
  let index = 0;

  async function runWorker() {
    while (index < inputs.length) {
      const current = inputs[index];
      index += 1;
      results.push(await worker(current));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, runWorker));
  return results;
}

function countMenu(menu: NormalizedMenu): MenuCounts {
  const periods = menu.locations.flatMap((location) => location.periods);
  const stations = periods.flatMap((period) => period.stations);
  const items = stations.flatMap((station) => station.items);

  return {
    locations: menu.locations.length,
    periods: periods.length,
    stations: stations.length,
    items: items.length,
  };
}

function emptyCounts(): MenuCounts {
  return {
    locations: 0,
    periods: 0,
    stations: 0,
    items: 0,
  };
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
