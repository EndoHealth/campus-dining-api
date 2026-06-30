import { Hono } from 'hono';
import { z } from 'zod';
import { createMenuCacheKey, getCachedMenuPayload } from '../cache/menu-cache.js';
import { findSchoolById } from '../data/coverage.js';
import { getProviderAdapter } from '../providers/registry.js';

const menuQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  meal: z.string().min(1).max(40).optional(),
  locationId: z.string().min(1).max(120).optional(),
});

const menusRouter = new Hono();

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
    const result = await adapter.fetchMenu(school, normalizedQuery);
    return {
      school,
      query: normalizedQuery,
      result,
    };
  });
  const result = payload.result;
  const status =
    result.state === 'adapter_pending' || result.state === 'poc_required'
      ? 501
      : result.state === 'provider_error'
        ? 502
        : 200;

  c.header('X-Campus-Cache', cacheStatus);
  c.header('X-Campus-Cache-Age', String(ageSeconds));
  c.header(
    'Cache-Control',
    result.state === 'provider_error'
      ? 'public, max-age=300'
      : 'public, max-age=1800, stale-while-revalidate=300'
  );

  return c.json(payload, status);
});

export default menusRouter;
