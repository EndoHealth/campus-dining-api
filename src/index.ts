import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { disconnectPrisma } from './db/client.js';

const port = Number(process.env.PORT ?? 3400);
const app = createApp();

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Campus Dining API running on http://localhost:${info.port}`);
  }
);

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down Campus Dining API`);

  const forceExit = setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    await disconnectPrisma();
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
