import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { disconnectPrisma, getPrisma } from '../src/db/client.js';
import { persistMenuPayload, upsertSchoolCatalog } from '../src/db/persistence.js';
import type { ProviderFetchResult } from '../src/providers/types.js';
import type { MenuResponsePayload } from '../src/cache/menu-cache.js';
import type { MenuQuery, NormalizedMenu, SchoolCoverage } from '../src/types/dining.js';

type CollectionResult = {
  school: SchoolCoverage;
  state: string;
  providerKind: SchoolCoverage['providerKind'];
  sourceUrl: string;
  query: MenuQuery;
  fetchedAt?: string;
  data?: NormalizedMenu;
};

type CollectionFile = {
  generatedAt: string;
  date: string;
  mode: string;
  scope: string;
  results: CollectionResult[];
};

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: npm run db:import-collection -- data/collections/top50-live-menus-YYYY-MM-DD.json');
  }

  const filePath = resolve(inputPath);
  const collection = JSON.parse(await readFile(filePath, 'utf8')) as CollectionFile;
  const prisma = getPrisma();
  const schools = collection.results.map((result) => result.school).filter(Boolean);

  await upsertSchoolCatalog(schools, prisma);

  let readyResults = 0;
  let importedItems = 0;

  for (const result of collection.results) {
    if (result.state !== 'adapter_ready' || !result.data) continue;

    const providerResult: ProviderFetchResult = {
      state: 'adapter_ready',
      provider: result.providerKind,
      fetchedAt: result.fetchedAt ?? collection.generatedAt,
      sourceUrl: result.sourceUrl,
      data: result.data,
    };
    const payload: MenuResponsePayload = {
      school: result.school,
      query: result.query,
      result: providerResult,
    };
    const stats = await persistMenuPayload(payload, prisma);
    readyResults += 1;
    importedItems += stats.items;
    console.log(`Imported ${result.school.id}: ${stats.items} items`);
  }

  console.log(
    `Imported ${readyResults} adapter-ready school results from ${collection.scope}/${collection.mode} ${collection.date}; ${importedItems} items total.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
