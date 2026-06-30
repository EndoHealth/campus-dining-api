import { mkdir, writeFile } from 'node:fs/promises';
import { TOP_50_SCHOOLS } from '../src/data/top50-schools.js';
import { getProviderAdapter } from '../src/providers/registry.js';
import type { ProviderFetchResult } from '../src/providers/types.js';
import type { MenuQuery, NormalizedMenu, ProviderKind, SchoolCoverage } from '../src/types/dining.js';

type MenuCounts = {
  locationsCount: number;
  periodsCount: number;
  stationsCount: number;
  itemsCount: number;
  itemsWithNutritionCount: number;
  itemsWithIngredientsCount: number;
  itemsWithAllergensCount: number;
  itemsWithDietaryTagsCount: number;
};

type LiveMenuCollectionResult = {
  school: SchoolCoverage;
  state: 'adapter_ready' | 'adapter_pending' | 'poc_required' | 'unsupported' | 'provider_error';
  providerKind: ProviderKind;
  sourceUrl: string;
  query: {
    date: string;
    usedDate?: string;
  };
  dateFallback?: {
    requestedDate: string;
    usedDate: string;
    offsetDays: number;
    reason: string;
  };
  counts: MenuCounts;
  fetchedAt?: string;
  data?: NormalizedMenu;
  reason?: string;
  error?: string;
};

type LiveMenuCollection = {
  generatedAt: string;
  date: string;
  mode: 'live' | 'best_available';
  scope: 'top50';
  dateFallbackDays: number;
  summary: {
    totalSchools: number;
    adapterReadySchools: number;
    adapterReadySchoolsWithItems: number;
    dateFallbackSchools: number;
    totalLocations: number;
    totalPeriods: number;
    totalStations: number;
    totalItems: number;
    itemsWithNutrition: number;
    itemsWithIngredients: number;
    itemsWithAllergens: number;
    itemsWithDietaryTags: number;
    adapterReadyByProvider: Record<string, number>;
  };
  results: LiveMenuCollectionResult[];
};

const date = process.env.PROBE_DATE ?? new Date().toISOString().slice(0, 10);
const fetchAttempts = Number(process.env.FETCH_ATTEMPTS ?? 3);
const dateFallbackDays = Number(process.env.DATE_FALLBACK_DAYS ?? 0);

function emptyCounts(): MenuCounts {
  return {
    locationsCount: 0,
    periodsCount: 0,
    stationsCount: 0,
    itemsCount: 0,
    itemsWithNutritionCount: 0,
    itemsWithIngredientsCount: 0,
    itemsWithAllergensCount: 0,
    itemsWithDietaryTagsCount: 0,
  };
}

function countMenu(menu: NormalizedMenu): MenuCounts {
  const periods = menu.locations.flatMap((location) => location.periods);
  const stations = periods.flatMap((period) => period.stations);
  const items = stations.flatMap((station) => station.items);

  return {
    locationsCount: menu.locations.length,
    periodsCount: periods.length,
    stationsCount: stations.length,
    itemsCount: items.length,
    itemsWithNutritionCount: items.filter((item) => item.nutrition.length > 0).length,
    itemsWithIngredientsCount: items.filter((item) => item.ingredients.length > 0).length,
    itemsWithAllergensCount: items.filter((item) => item.allergens.length > 0).length,
    itemsWithDietaryTagsCount: items.filter((item) => item.dietaryTags.length > 0).length,
  };
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const results: LiveMenuCollectionResult[] = [];

  for (const school of TOP_50_SCHOOLS) {
    console.log(`Collecting ${school.rank}. ${school.name}`);

    try {
      const result = await fetchMenuWithRetries(school, { date });
      const resolved = await resolveFallbackIfEmpty(school, result, date);

      if (resolved.result.state === 'adapter_ready') {
        results.push({
          school,
          state: resolved.result.state,
          providerKind: school.providerKind,
          sourceUrl: resolved.result.sourceUrl,
          query: {
            date,
            usedDate: resolved.usedDate === date ? undefined : resolved.usedDate,
          },
          dateFallback: resolved.dateFallback,
          counts: countMenu(resolved.result.data),
          fetchedAt: resolved.result.fetchedAt,
          data: resolved.result.data,
        });
        continue;
      }

      results.push({
        school,
        state: resolved.result.state,
        providerKind: school.providerKind,
        sourceUrl: resolved.result.sourceUrl,
        query: { date },
        counts: emptyCounts(),
        reason: resolved.result.reason,
        error: resolved.result.error,
      });
    } catch (error) {
      results.push({
        school,
        state: 'provider_error',
        providerKind: school.providerKind,
        sourceUrl: school.sourceUrl,
        query: { date },
        counts: emptyCounts(),
        reason: 'Provider adapter threw during full live collection.',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const ready = results.filter((result) => result.state === 'adapter_ready');
  const readyWithItems = ready.filter((result) => result.counts.itemsCount > 0);
  const sum = (field: keyof MenuCounts) =>
    ready.reduce((total, result) => total + result.counts[field], 0);

  const collection: LiveMenuCollection = {
    generatedAt: new Date().toISOString(),
    date,
    mode: dateFallbackDays > 0 ? 'best_available' : 'live',
    scope: 'top50',
    dateFallbackDays,
    summary: {
      totalSchools: results.length,
      adapterReadySchools: ready.length,
      adapterReadySchoolsWithItems: readyWithItems.length,
      dateFallbackSchools: results.filter((result) => result.dateFallback).length,
      totalLocations: sum('locationsCount'),
      totalPeriods: sum('periodsCount'),
      totalStations: sum('stationsCount'),
      totalItems: sum('itemsCount'),
      itemsWithNutrition: sum('itemsWithNutritionCount'),
      itemsWithIngredients: sum('itemsWithIngredientsCount'),
      itemsWithAllergens: sum('itemsWithAllergensCount'),
      itemsWithDietaryTags: sum('itemsWithDietaryTagsCount'),
      adapterReadyByProvider: countBy(ready.map((result) => result.providerKind)),
    },
    results,
  };

  await mkdir('data/collections', { recursive: true });
  const outputPrefix = dateFallbackDays > 0 ? 'top50-best-available-menus' : 'top50-live-menus';
  const outputPath = `data/collections/${outputPrefix}-${date}.json`;
  await writeFile(outputPath, `${JSON.stringify(collection, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
  console.log(JSON.stringify(collection.summary, null, 2));
}

async function resolveFallbackIfEmpty(
  school: SchoolCoverage,
  result: ProviderFetchResult,
  requestedDate: string
): Promise<{
  result: ProviderFetchResult;
  usedDate: string;
  dateFallback?: LiveMenuCollectionResult['dateFallback'];
}> {
  if (dateFallbackDays <= 0 || result.state !== 'adapter_ready' || countMenu(result.data).itemsCount > 0) {
    return { result, usedDate: requestedDate };
  }

  console.warn(
    `Searching fallback dates for ${school.id} after empty ${requestedDate} result (window=${dateFallbackDays} days)`
  );

  const fallback = await findNearestNonEmptyMenu(school, requestedDate, dateFallbackDays);
  if (!fallback) {
    return { result, usedDate: requestedDate };
  }

  console.warn(`Using ${school.id} fallback date ${fallback.date} (${fallback.offsetDays} days)`);

  return {
    result: fallback.result,
    usedDate: fallback.date,
    dateFallback: {
      requestedDate,
      usedDate: fallback.date,
      offsetDays: fallback.offsetDays,
      reason: 'Requested date returned an adapter-ready menu with zero items.',
    },
  };
}

async function findNearestNonEmptyMenu(
  school: SchoolCoverage,
  requestedDate: string,
  fallbackDays: number
): Promise<{ result: ProviderFetchResult & { state: 'adapter_ready' }; date: string; offsetDays: number } | undefined> {
  const adapter = getProviderAdapter(school.providerKind);

  for (let offset = 1; offset <= fallbackDays; offset += 1) {
    for (const signedOffset of [offset, -offset]) {
      const candidateDate = shiftIsoDate(requestedDate, signedOffset);
      try {
        const result = await adapter.fetchMenu(school, { date: candidateDate });
        if (result.state === 'adapter_ready' && countMenu(result.data).itemsCount > 0) {
          return { result, date: candidateDate, offsetDays: signedOffset };
        }
      } catch {
        // Fallback probing is opportunistic; the exact-date result remains authoritative.
      }
    }
  }

  return undefined;
}

async function fetchMenuWithRetries(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const adapter = getProviderAdapter(school.providerKind);
  let lastResult: ProviderFetchResult | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= fetchAttempts; attempt += 1) {
    try {
      const result = await adapter.fetchMenu(school, query);
      if (
        result.state === 'adapter_ready' &&
        countMenu(result.data).itemsCount === 0 &&
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
        `Retrying ${school.id} after provider_error (${attempt}/${fetchAttempts}): ${result.error ?? result.reason}`
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shiftIsoDate(isoDate: string, offsetDays: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

await main();
