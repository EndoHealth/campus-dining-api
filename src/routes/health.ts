import { Hono } from 'hono';
import { checkDatabaseConnection, getPrisma } from '../db/client.js';

const healthRouter = new Hono();

healthRouter.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'campus-dining-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/db', async (c) => {
  try {
    const database = await checkDatabaseConnection();
    return c.json({
      status: 'ok',
      service: 'campus-dining-api',
      ...database,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    return c.json(
      {
        status: 'degraded',
        service: 'campus-dining-api',
        database: 'postgres',
        error: 'database_unavailable',
        timestamp: new Date().toISOString(),
      },
      503
    );
  }
});

healthRouter.get('/ready', async (c) => {
  try {
    const [database, schoolCount] = await Promise.all([
      checkDatabaseConnection(),
      getPrisma().school.count(),
    ]);

    if (schoolCount < 50) {
      return c.json(
        {
          status: 'degraded',
          service: 'campus-dining-api',
          database: 'postgres',
          error: 'school_catalog_not_seeded',
          schoolCount,
          timestamp: new Date().toISOString(),
        },
        503
      );
    }

    return c.json({
      status: 'ok',
      service: 'campus-dining-api',
      ...database,
      schoolCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    return c.json(
      {
        status: 'degraded',
        service: 'campus-dining-api',
        database: 'postgres',
        error: 'readiness_check_failed',
        timestamp: new Date().toISOString(),
      },
      503
    );
  }
});

export default healthRouter;
