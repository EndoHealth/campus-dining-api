import { disconnectPrisma, getPrisma } from '../src/db/client.js';
import { upsertSchoolCatalog } from '../src/db/persistence.js';
import { TOP_50_SCHOOLS } from '../src/data/top50-schools.js';

async function main() {
  const result = await upsertSchoolCatalog(TOP_50_SCHOOLS, getPrisma());
  console.log(`Seeded ${result.schools} schools and primary data sources.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
