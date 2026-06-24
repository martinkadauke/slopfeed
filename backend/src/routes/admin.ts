import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import sql from '../db.js';
import { requireAdmin } from '../auth/plugin.js';
import { getAllConfig, setConfig, getConfig } from '../config.js';
import { healthForProvider, listModelsForProvider, type ProviderName } from '../llm/provider.js';
import { runNews, isNewsRunning, newsStatus } from '../news/pipeline.js';
import { rescheduleNews } from '../news/scheduler.js';

// Config values never echoed back in clear text (only whether they're set).
const SECRET_KEYS = ['anthropic.api_key', 'deepseek.api_key', 'smtp.pass', 'push.vapid_private'];

export function adminRoutes(app: FastifyInstance): void {
  // ── app config ──────────────────────────────────────────────────────────
  app.get('/api/admin/config', { preHandler: requireAdmin }, async () => {
    const cfg = await getAllConfig();
    const secrets_set: Record<string, boolean> = {};
    for (const k of SECRET_KEYS) {
      secrets_set[k] = Boolean(cfg[k]);
      cfg[k] = ''; // never leak the value
    }
    return { config: cfg, secrets_set };
  });

  app.patch('/api/admin/config', { preHandler: requireAdmin }, async (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId = req.user!.id;
    for (const [key, value] of Object.entries(body)) {
      // For secret keys, an empty string means "leave unchanged".
      if (SECRET_KEYS.includes(key) && (value === '' || value == null)) continue;
      await setConfig(key, value, userId);
    }
    // Apply any change to the news schedule immediately.
    await rescheduleNews();
    return { ok: true };
  });

  // ── news pipeline (manual run + status) ───────────────────────────────────
  app.post('/api/admin/news/run', { preHandler: requireAdmin }, async (_req, reply) => {
    if (isNewsRunning()) return reply.code(409).send({ error: 'already running' });
    void runNews('manual'); // fire-and-forget; poll /news/status for progress
    return { started: true };
  });

  app.get('/api/admin/news/status', { preHandler: requireAdmin }, async () => newsStatus());

  // ── AI helpers (model lists + health) ────────────────────────────────────
  app.get('/api/admin/ai/models', { preHandler: requireAdmin }, async (req, reply) => {
    const provider = (req.query as { provider?: string }).provider as ProviderName;
    if (!provider) return reply.code(400).send({ error: 'provider required' });
    try {
      return { models: await listModelsForProvider(provider) };
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
  });

  app.get('/api/admin/ai/health', { preHandler: requireAdmin }, async (req) => {
    const provider = (req.query as { provider?: string }).provider as ProviderName;
    return healthForProvider(provider);
  });

  // ── authors ───────────────────────────────────────────────────────────────
  app.get('/api/admin/authors', { preHandler: requireAdmin }, async () => {
    const authors = await sql`SELECT * FROM author ORDER BY sort_order, id`;
    return { authors };
  });

  app.post('/api/admin/authors', { preHandler: requireAdmin }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!b.name || !b.persona) return reply.code(400).send({ error: 'name and persona required' });
    const slug = String(b.slug || b.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const [row] = await sql`
      INSERT INTO author (slug, name, emoji, tagline_de, tagline_en, persona, active, sort_order)
      VALUES (${slug}, ${b.name as string}, ${(b.emoji as string) ?? null},
              ${(b.tagline_de as string) ?? null}, ${(b.tagline_en as string) ?? null},
              ${b.persona as string}, ${b.active !== false}, ${(b.sort_order as number) ?? 0})
      RETURNING *`;
    return { author: row };
  });

  app.patch('/api/admin/authors/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const allowed = ['name', 'emoji', 'tagline_de', 'tagline_en', 'persona', 'active', 'sort_order'];
    const updates: Record<string, unknown> = {};
    for (const k of allowed) if (k in b) updates[k] = b[k];
    if (!Object.keys(updates).length) return reply.code(400).send({ error: 'nothing to update' });
    const [row] = await sql`UPDATE author SET ${sql(updates)} WHERE id = ${id} RETURNING *`;
    if (!row) return reply.code(404).send({ error: 'not found' });
    return { author: row };
  });

  app.delete('/api/admin/authors/:id', { preHandler: requireAdmin }, async (req) => {
    const id = Number((req.params as { id: string }).id);
    await sql`DELETE FROM author WHERE id = ${id}`;
    return { ok: true };
  });

  // ── topics ─────────────────────────────────────────────────────────────────
  app.get('/api/admin/topics', { preHandler: requireAdmin }, async () => {
    const topics = await sql`
      SELECT t.*, (SELECT COUNT(*)::int FROM article a WHERE a.topic_id = t.id) AS article_count
      FROM topic t ORDER BY t.sort_order, t.id`;
    return { topics };
  });

  app.post('/api/admin/topics', { preHandler: requireAdmin }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!b.name) return reply.code(400).send({ error: 'name required' });
    const slug = String(b.slug || b.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const [row] = await sql`
      INSERT INTO topic (slug, name, search_terms, enabled, sort_order)
      VALUES (${slug}, ${b.name as string}, ${(b.search_terms as string) ?? null},
              ${b.enabled !== false}, ${(b.sort_order as number) ?? 0})
      ON CONFLICT (slug) DO NOTHING
      RETURNING *`;
    if (!row) return reply.code(409).send({ error: 'topic slug already exists' });
    return { topic: row };
  });

  app.patch('/api/admin/topics/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const allowed = ['name', 'search_terms', 'enabled', 'sort_order'];
    const updates: Record<string, unknown> = {};
    for (const k of allowed) if (k in b) updates[k] = b[k];
    if (!Object.keys(updates).length) return reply.code(400).send({ error: 'nothing to update' });
    const [row] = await sql`UPDATE topic SET ${sql(updates)} WHERE id = ${id} RETURNING *`;
    if (!row) return reply.code(404).send({ error: 'not found' });
    return { topic: row };
  });

  app.delete('/api/admin/topics/:id', { preHandler: requireAdmin }, async (req) => {
    const id = Number((req.params as { id: string }).id);
    await sql`DELETE FROM topic WHERE id = ${id}`;
    return { ok: true };
  });

  // ── invites ────────────────────────────────────────────────────────────────
  app.get('/api/admin/invites', { preHandler: requireAdmin }, async () => {
    const invites = await sql`
      SELECT i.id, i.token, i.email, i.used_at, i.expires_at, i.created_at,
             u.email AS used_by_email
      FROM invite i LEFT JOIN users u ON u.id = i.used_by
      ORDER BY i.created_at DESC`;
    const base = await getConfig('app.base_url');
    return { invites, base_url: base };
  });

  app.post('/api/admin/invites', { preHandler: requireAdmin }, async (req) => {
    const b = (req.body ?? {}) as { email?: string; expires_days?: number };
    const token = crypto.randomBytes(18).toString('base64url');
    const expires = b.expires_days
      ? sql`NOW() + (${b.expires_days} || ' days')::interval`
      : sql`NULL`;
    const [row] = await sql`
      INSERT INTO invite (token, email, created_by, expires_at)
      VALUES (${token}, ${b.email ?? null}, ${req.user!.id}, ${expires})
      RETURNING id, token, email, expires_at, created_at`;
    const base = await getConfig('app.base_url');
    return { invite: row, link: `${base}/invite?token=${token}` };
  });

  app.delete('/api/admin/invites/:id', { preHandler: requireAdmin }, async (req) => {
    const id = Number((req.params as { id: string }).id);
    await sql`DELETE FROM invite WHERE id = ${id} AND used_at IS NULL`;
    return { ok: true };
  });

  // ── users ────────────────────────────────────────────────────────────────
  app.get('/api/admin/users', { preHandler: requireAdmin }, async () => {
    const users = await sql`
      SELECT id, email, display_name, is_admin, preferred_lang, timezone, created_at
      FROM users ORDER BY created_at`;
    return { users };
  });
}
