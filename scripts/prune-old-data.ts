import { envFlag, envNumber } from '../src/config.js';
import { disconnectPrisma, getPrisma } from '../src/db/client.js';

const menuRetentionDays = envNumber('MENU_RETENTION_DAYS', 120, { min: 7 });
const crawlRunRetentionDays = envNumber('CRAWL_RUN_RETENTION_DAYS', 45, { min: 7 });
const dryRun = envFlag('PRUNE_DRY_RUN', false);

async function main() {
  const prisma = getPrisma();
  const menuCutoff = daysAgo(menuRetentionDays);
  const crawlRunCutoff = daysAgo(crawlRunRetentionDays);

  const staleMenus = await prisma.menu.count({
    where: {
      date: { lt: menuCutoff },
    },
  });
  const staleCrawlRuns = await prisma.crawlRun.count({
    where: {
      startedAt: { lt: crawlRunCutoff },
    },
  });
  const staleRawSnapshots = await prisma.rawSnapshot.count({
    where: {
      capturedAt: { lt: crawlRunCutoff },
    },
  });

  if (!dryRun) {
    await prisma.menu.deleteMany({
      where: {
        date: { lt: menuCutoff },
      },
    });
    await prisma.rawSnapshot.deleteMany({
      where: {
        capturedAt: { lt: crawlRunCutoff },
      },
    });
    await prisma.crawlRun.deleteMany({
      where: {
        startedAt: { lt: crawlRunCutoff },
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        menuRetentionDays,
        crawlRunRetentionDays,
        staleMenus,
        staleRawSnapshots,
        staleCrawlRuns,
      },
      null,
      2
    )
  );
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
