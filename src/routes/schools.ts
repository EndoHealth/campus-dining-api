import { Hono } from 'hono';
import { findSchoolById } from '../data/coverage.js';
import { TOP_50_SCHOOLS } from '../data/top50-schools.js';

const schoolsRouter = new Hono();

schoolsRouter.get('/', (c) => {
  const query = c.req.query('query')?.trim().toLowerCase();
  const status = c.req.query('status');
  const provider = c.req.query('provider');

  const schools = TOP_50_SCHOOLS.filter((school) => {
    const haystack = [school.name, school.id, ...school.aliases].join(' ').toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (status && school.supportStatus !== status) return false;
    if (provider && school.providerKind !== provider) return false;
    return true;
  });

  return c.json({ schools });
});

schoolsRouter.get('/:schoolId', (c) => {
  const school = findSchoolById(c.req.param('schoolId'));

  if (!school) {
    return c.json({ error: 'school_not_found' }, 404);
  }

  return c.json({ school });
});

export default schoolsRouter;
