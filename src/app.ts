import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { findSchoolById } from './data/coverage.js';
import coverageRouter from './routes/coverage.js';
import healthRouter from './routes/health.js';
import menusRouter from './routes/menus.js';
import schoolsRouter from './routes/schools.js';
import { getSiteSnapshot, renderHomePage, renderSchoolCalendarPage } from './site.js';

export function createApp() {
  const app = new Hono();

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'internal_server_error' }, 500);
  });

  app.use('*', cors());
  app.use('*', compress({ threshold: 2048 }));
  app.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('X-Frame-Options', 'DENY');
    c.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' data: https://images.unsplash.com",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join('; ')
    );
    if (c.req.path === '/health') {
      return next();
    }
    return logger()(c, next);
  });

  app.get('/', (c) => {
    return c.html(renderHomePage());
  });

  app.get('/favicon.ico', (c) => c.body(null, 204));

  app.get('/v1/demo-summary', (c) => {
    return c.json(getSiteSnapshot());
  });

  app.get('/schools/:schoolId', (c) => {
    const school = findSchoolById(c.req.param('schoolId'));

    if (!school) {
      return c.html('<!doctype html><title>School not found</title><h1>School not found</h1>', 404);
    }

    return c.html(renderSchoolCalendarPage(school));
  });

  app.route('/health', healthRouter);
  app.route('/v1/coverage', coverageRouter);
  app.route('/v1/schools', schoolsRouter);
  app.route('/v1/schools', menusRouter);

  return app;
}
