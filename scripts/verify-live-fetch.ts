import { mkdir, writeFile } from 'node:fs/promises';
import { TOP_50_SCHOOLS } from '../src/data/top50-schools.js';
import { getProviderAdapter } from '../src/providers/registry.js';
import type { ProviderFetchResult } from '../src/providers/types.js';
import type { MenuQuery, NormalizedMenu, ProviderKind, SchoolCoverage } from '../src/types/dining.js';

type LiveFetchSchoolResult = {
  schoolId: string;
  rank: number;
  name: string;
  providerKind: ProviderKind;
  state: string;
  sourceUrl: string;
  locationsCount: number;
  periodsCount: number;
  stationsCount: number;
  itemsCount: number;
  itemsWithNutritionCount: number;
  itemsWithIngredientsCount: number;
  itemsWithAllergensCount: number;
  itemsWithDietaryTagsCount: number;
  sampleItem?: {
    name: string;
    stationName?: string;
    ingredientsCount: number;
    nutritionCount: number;
    allergensCount: number;
    dietaryTags: string[];
  };
  reason?: string;
  error?: string;
};

type LiveFetchReport = {
  generatedAt: string;
  date: string;
  scope: 'top50';
  summary: {
    totalSchools: number;
    adapterReadySchools: number;
    totalItems: number;
    itemsWithNutrition: number;
    itemsWithIngredients: number;
    itemsWithAllergens: number;
    itemsWithDietaryTags: number;
    adapterReadyByProvider: Record<string, number>;
  };
  results: LiveFetchSchoolResult[];
};

const date = process.env.PROBE_DATE ?? new Date().toISOString().slice(0, 10);
const fetchAttempts = Number(process.env.FETCH_ATTEMPTS ?? 3);

function countMenu(menu: NormalizedMenu) {
  const periods = menu.locations.flatMap((location) => location.periods);
  const stations = periods.flatMap((period) => period.stations);
  const items = stations.flatMap((station) => station.items);
  const sample =
    items.find((item) => item.ingredients.length > 0 && item.nutrition.length > 0) ?? items[0];

  return {
    locationsCount: menu.locations.length,
    periodsCount: periods.length,
    stationsCount: stations.length,
    itemsCount: items.length,
    itemsWithNutritionCount: items.filter((item) => item.nutrition.length > 0).length,
    itemsWithIngredientsCount: items.filter((item) => item.ingredients.length > 0).length,
    itemsWithAllergensCount: items.filter((item) => item.allergens.length > 0).length,
    itemsWithDietaryTagsCount: items.filter((item) => item.dietaryTags.length > 0).length,
    sampleItem: sample
      ? {
          name: sample.name,
          stationName: sample.stationName,
          ingredientsCount: sample.ingredients.length,
          nutritionCount: sample.nutrition.length,
          allergensCount: sample.allergens.length,
          dietaryTags: sample.dietaryTags,
        }
      : undefined,
  };
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const results: LiveFetchSchoolResult[] = [];

  for (const school of TOP_50_SCHOOLS) {
    console.log(`Fetching ${school.rank}. ${school.name}`);
    const result = await fetchMenuWithRetries(school, { date });

    if (result.state === 'adapter_ready') {
      results.push({
        schoolId: school.id,
        rank: school.rank,
        name: school.name,
        providerKind: school.providerKind,
        state: result.state,
        sourceUrl: result.sourceUrl,
        ...countMenu(result.data),
      });
      continue;
    }

    results.push({
      schoolId: school.id,
      rank: school.rank,
      name: school.name,
      providerKind: school.providerKind,
      state: result.state,
      sourceUrl: result.sourceUrl,
      locationsCount: 0,
      periodsCount: 0,
      stationsCount: 0,
      itemsCount: 0,
      itemsWithNutritionCount: 0,
      itemsWithIngredientsCount: 0,
      itemsWithAllergensCount: 0,
      itemsWithDietaryTagsCount: 0,
      reason: result.reason,
      error: result.error,
    });
  }

  const ready = results.filter((result) => result.state === 'adapter_ready');
  const report: LiveFetchReport = {
    generatedAt: new Date().toISOString(),
    date,
    scope: 'top50',
    summary: {
      totalSchools: results.length,
      adapterReadySchools: ready.length,
      totalItems: ready.reduce((sum, result) => sum + result.itemsCount, 0),
      itemsWithNutrition: ready.reduce((sum, result) => sum + result.itemsWithNutritionCount, 0),
      itemsWithIngredients: ready.reduce((sum, result) => sum + result.itemsWithIngredientsCount, 0),
      itemsWithAllergens: ready.reduce((sum, result) => sum + result.itemsWithAllergensCount, 0),
      itemsWithDietaryTags: ready.reduce((sum, result) => sum + result.itemsWithDietaryTagsCount, 0),
      adapterReadyByProvider: countBy(ready.map((result) => result.providerKind)),
    },
    results,
  };

  await mkdir('data/probes', { recursive: true });
  const outputPath = `data/probes/top50-live-fetch-${date}.json`;
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
  console.log(JSON.stringify(report.summary, null, 2));
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

await main();
