import { Hono } from 'hono';
import { buildCoverageSummary } from '../data/coverage.js';
import { TOP_50_SCHOOLS } from '../data/top50-schools.js';

const coverageRouter = new Hono();

coverageRouter.get('/', (c) => {
  const status = c.req.query('status');
  const provider = c.req.query('provider');

  const schools = TOP_50_SCHOOLS.filter((school) => {
    if (status && school.supportStatus !== status) return false;
    if (provider && school.providerKind !== provider) return false;
    return true;
  });

  return c.json({
    summary: buildCoverageSummary(),
    schools,
  });
});

export default coverageRouter;
