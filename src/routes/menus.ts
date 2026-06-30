import { Hono } from 'hono';
import { z } from 'zod';
import { createMenuCacheKey, getCachedMenuPayload } from '../cache/menu-cache.js';
import { findSchoolById } from '../data/coverage.js';
import {
  getFreshStoredMenuPayloadIfEnabled,
  getStaleStoredMenuPayloadIfEnabled,
} from '../db/menu-store.js';
import { persistMenuPayloadIfEnabled } from '../db/persistence.js';
import { getStoredServiceWindows } from '../db/service-windows.js';
import { getProviderAdapter } from '../providers/registry.js';

const menuQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  meal: z.string().min(1).max(40).optional(),
  locationId: z.string().min(1).max(120).optional(),
});

const serviceWindowQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  type: z
    .enum(['dining_hall', 'cafe', 'market', 'retail', 'food_truck', 'popup', 'unknown'])
    .optional(),
});

const menusRouter = new Hono();

menusRouter.get('/:schoolId/locations', async (c) => {
  const school = findSchoolById(c.req.param('schoolId'));

  if (!school) {
    return c.json({ error: 'school_not_found' }, 404);
  }

  const adapter = getProviderAdapter(school.providerKind);

  if (!adapter.fetchLocations) {
    c.header('Cache-Control', 'public, max-age=300');
    return c.json(
      {
        school,
        result: {
          state: 'poc_required',
          provider: school.providerKind,
          sourceUrl: school.sourceUrl,
          reason: 'This provider does not expose a lightweight cafeteria location list yet.',
        },
      },
      501
    );
  }

  const result = await adapter.fetchLocations(school);
  const status =
    result.state === 'adapter_pending' || result.state === 'poc_required'
      ? 501
      : result.state === 'provider_error'
        ? 502
        : 200;

  c.header(
    'Cache-Control',
    result.state === 'provider_error' ? 'public, max-age=300' : 'public, max-age=1800'
  );

  return c.json(
    {
      school,
      result,
    },
    status
  );
});

menusRouter.get('/:schoolId/service-windows', async (c) => {
  const school = findSchoolById(c.req.param('schoolId'));

  if (!school) {
    return c.json({ error: 'school_not_found' }, 404);
  }

  const parsed = serviceWindowQuerySchema.safeParse({
    date: c.req.query('date'),
    type: c.req.query('type'),
  });

  if (!parsed.success) {
    return c.json(
      {
        error: 'invalid_service_window_query',
        details: parsed.error.flatten().fieldErrors,
      },
      400
    );
  }

  const query = {
    ...parsed.data,
    date: parsed.data.date ?? new Date().toISOString().slice(0, 10),
    type: parsed.data.type ?? 'food_truck',
  };

  try {
    const serviceWindows = await getStoredServiceWindows(school, query);
    const fetchedAt = new Date().toISOString();

    c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=300');

    return c.json({
      school,
      query,
      result: {
        state: 'adapter_ready',
        source: 'database',
        fetchedAt,
        sourceUrl: school.sourceUrl,
        serviceWindows,
        summary: {
          serviceWindows: serviceWindows.length,
          vendors: new Set(serviceWindows.map((window) => window.vendor?.id).filter(Boolean)).size,
          locations: new Set(serviceWindows.map((window) => window.location.id)).size,
          estimated: serviceWindows.filter((window) => window.isEstimated).length,
          items: serviceWindows.reduce((total, window) => total + window.itemCount, 0),
        },
      },
    });
  } catch (error) {
    console.error('service_windows_read_failed', error);
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(
      {
        school,
        query,
        result: {
          state: 'provider_error',
          source: 'database',
          sourceUrl: school.sourceUrl,
          reason: 'Stored service-window data could not be read.',
          error: error instanceof Error ? error.message : String(error),
        },
      },
      502
    );
  }
});

menusRouter.get('/:schoolId/menus', async (c) => {
  const school = findSchoolById(c.req.param('schoolId'));

  if (!school) {
    return c.json({ error: 'school_not_found' }, 404);
  }

  const parsed = menuQuerySchema.safeParse({
    date: c.req.query('date'),
    meal: c.req.query('meal'),
    locationId: c.req.query('locationId'),
  });

  if (!parsed.success) {
    return c.json(
      {
        error: 'invalid_menu_query',
        details: parsed.error.flatten().fieldErrors,
      },
      400
    );
  }

  const normalizedQuery = {
    ...parsed.data,
    date: parsed.data.date ?? new Date().toISOString().slice(0, 10),
  };
  const adapter = getProviderAdapter(school.providerKind);
  const cacheKey = createMenuCacheKey(school, normalizedQuery);
  const { payload, cacheStatus, ageSeconds } = await getCachedMenuPayload(cacheKey, async () => {
    const stored = await getFreshStoredMenuPayloadIfEnabled(school, normalizedQuery).catch((error) => {
      console.error('menu_db_fresh_read_failed', error);
      return undefined;
    });
    if (stored) return stored;

    const result = await adapter.fetchMenu(school, normalizedQuery);
    if (result.state === 'provider_error') {
      const stale = await getStaleStoredMenuPayloadIfEnabled(
        school,
        normalizedQuery,
        `Provider fetch failed; served same-date stored menu. Provider error: ${result.error ?? result.reason}`
      ).catch((error) => {
        console.error('menu_db_stale_read_failed', error);
        return undefined;
      });
      if (stale) return stale;
    }

    return {
      school,
      query: normalizedQuery,
      result,
    };
  });
  const result = payload.result;
  if (cacheStatus === 'MISS' && result.state === 'adapter_ready' && !result.servedFrom) {
    void persistMenuPayloadIfEnabled(payload).catch((error) => {
      console.error('menu_persist_failed', error);
    });
  }
  const status =
    result.state === 'adapter_pending' || result.state === 'poc_required'
      ? 501
      : result.state === 'provider_error'
        ? 502
        : 200;

  c.header('X-Campus-Cache', cacheStatus);
  c.header('X-Campus-Cache-Age', String(ageSeconds));
  if (result.state === 'adapter_ready' && result.servedFrom) {
    c.header('X-Campus-Store', result.servedFrom);
  }
  c.header(
    'Cache-Control',
    result.state === 'provider_error'
      ? 'public, max-age=300'
      : 'public, max-age=1800, stale-while-revalidate=300'
  );

  return c.json(payload, status);
});

export default menusRouter;
