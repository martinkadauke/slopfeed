import './env.js';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { existsSync } from 'node:fs';
import './types.js';
import sql, { migrate, ensureAdmin, ensureSeed } from './db.js';
import { PORT, APP_ENV } from './config.js';
import { registerAuth } from './auth/plugin.js';
import { authRoutes } from './auth/routes.js';
import { articleRoutes } from './routes/articles.js';
import { meRoutes } from './routes/me.js';
import { pushRoutes } from './routes/push.js';
import { topicRoutes } from './routes/topics.js';
import { adminRoutes } from './routes/admin.js';
import { rescheduleNews } from './news/scheduler.js';

async function main(): Promise<void> {
  await migrate();
  await ensureAdmin();
  await ensureSeed();

  const app = Fastify({ logger: { level: 'info' } });

  registerAuth(app);

  // Liveness only — the process responds. DB connectivity is validated at boot by
  // migrate(); we don't want every replica to die simultaneously if the DB is
  // briefly slow. /api/ready is the DB-backed readiness probe.
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/ready', async () => {
    const [row] = await sql`SELECT 1 AS ok`;
    return { ok: row.ok === 1 };
  });
  app.get('/api/version', async () => ({
    sha: process.env.GIT_SHA ?? 'unknown',
    ref: process.env.GIT_REF ?? 'unknown',
    env: APP_ENV,
    node: process.version,
    started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  }));

  authRoutes(app);
  articleRoutes(app);
  meRoutes(app);
  pushRoutes(app);
  topicRoutes(app);
  adminRoutes(app);

  // Static SPA. Vite emits content-hashed assets under /assets/* (cache forever),
  // but index.html points at the current hashes and MUST always be revalidated —
  // otherwise a browser keeps loading an old bundle after a deploy.
  const publicDir = path.join(process.cwd(), 'public');
  if (existsSync(publicDir)) {
    await app.register(fastifyStatic, {
      root: publicDir,
      wildcard: false,
      cacheControl: false,
      setHeaders(res, filePath) {
        res.setHeader(
          'Cache-Control',
          filePath.endsWith('index.html')
            ? 'no-cache, must-revalidate'
            : 'public, max-age=31536000, immutable',
        );
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        void reply.header('Cache-Control', 'no-cache, must-revalidate');
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not found' });
    });
  } else {
    app.log.warn(`no public dir at ${publicDir} — running API-only (dev mode)`);
  }

  await rescheduleNews();

  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`slopfeed listening on :${PORT} (env=${APP_ENV})`);
}

main().catch(err => {
  console.error('fatal:', err);
  process.exit(1);
});
