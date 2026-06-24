import type { FastifyInstance } from 'fastify';
import sql from '../db.js';

export function topicRoutes(app: FastifyInstance): void {
  // All enabled topics, each flagged with whether the current user wants push for it.
  app.get('/api/topics', async req => {
    const userId = req.user!.id;
    const rows = await sql`
      SELECT t.id, t.slug, t.name, t.sort_order,
             (ut.user_id IS NOT NULL) AS subscribed
      FROM topic t
      LEFT JOIN user_topic ut ON ut.topic_id = t.id AND ut.user_id = ${userId}
      WHERE t.enabled = TRUE
      ORDER BY t.sort_order, t.name
    `;
    return { topics: rows };
  });

  // Replace the current user's topic push opt-ins with the given set.
  app.put('/api/me/topics', async (req, reply) => {
    const userId = req.user!.id;
    const { topic_ids } = (req.body ?? {}) as { topic_ids?: number[] };
    if (!Array.isArray(topic_ids)) return reply.code(400).send({ error: 'topic_ids array required' });
    const ids = topic_ids.filter(n => Number.isInteger(n));
    await sql.begin(async tx => {
      await tx`DELETE FROM user_topic WHERE user_id = ${userId}`;
      if (ids.length) {
        await tx`
          INSERT INTO user_topic (user_id, topic_id)
          SELECT ${userId}, t.id FROM topic t WHERE t.id IN ${tx(ids)}
          ON CONFLICT DO NOTHING
        `;
      }
    });
    return { ok: true, count: ids.length };
  });
}
