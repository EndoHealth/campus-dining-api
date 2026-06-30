import { Hono } from 'hono';

const healthRouter = new Hono();

healthRouter.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'campus-dining-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

export default healthRouter;
