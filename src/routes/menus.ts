import { Hono } from 'hono';
import { z } from 'zod';
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

  const adapter = getProviderAdapter(school.providerKind);
  const result = await adapter.fetchMenu(school, parsed.data);
  const status =
    result.state === 'adapter_pending' || result.state === 'poc_required'
      ? 501
      : result.state === 'provider_error'
        ? 502
        : 200;

  return c.json(
    {
      school,
      query: parsed.data,
      result,
    },
    status
  );
});

export default menusRouter;
