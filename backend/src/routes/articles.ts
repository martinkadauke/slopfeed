import type { FastifyInstance } from 'fastify';
import sql from '../db.js';

type Lang = 'de' | 'en';

function pickLang(req: { query: unknown; user?: { preferred_lang: string } }): Lang {
  const q = (req.query as { lang?: string }).lang;
  const lang = q ?? req.user?.preferred_lang ?? 'de';
  return lang === 'en' ? 'en' : 'de';
}

/** Collapse the bilingual columns down to the requested language, with a
 *  fallback to the other language if one side is missing. */
function localize(row: Record<string, unknown>, lang: Lang): Record<string, unknown> {
  const other: Lang = lang === 'de' ? 'en' : 'de';
  const pick = (base: string) => row[`${base}_${lang}`] ?? row[`${base}_${other}`] ?? null;
  return {
    id: row.id,
    slug: row.slug,
    headline: pick('headline'),
    hero: pick('hero'),
    body: pick('body'),
    sources: row.sources ?? [],
    reddit_url: row.reddit_url ?? null,
    reddit_title: row.reddit_title ?? null,
    status: row.status,
    published_at: row.published_at,
    topic: row.topic_id ? { id: row.topic_id, slug: row.topic_slug, name: row.topic_name } : null,
    author: row.author_id
      ? {
          id: row.author_id,
          slug: row.author_slug,
          name: row.author_name,
          emoji: row.author_emoji,
          tagline: row[`author_tagline_${lang}`] ?? row[`author_tagline_${other}`] ?? null,
        }
      : null,
  };
}

export function articleRoutes(app: FastifyInstance): void {
  // Feed: most recent published articles (headline + 140-char hero for the cards).
  app.get('/api/articles', async req => {
    const lang = pickLang(req);
    const q = req.query as { topic?: string; limit?: string };
    const limit = Math.min(parseInt(q.limit ?? '50', 10) || 50, 100);
    const rows = await sql`
      SELECT a.*,
             t.slug AS topic_slug, t.name AS topic_name,
             au.slug AS author_slug, au.name AS author_name, au.emoji AS author_emoji,
             au.tagline_de AS author_tagline_de, au.tagline_en AS author_tagline_en
      FROM article a
      LEFT JOIN topic t ON t.id = a.topic_id
      LEFT JOIN author au ON au.id = a.author_id
      WHERE a.status = 'published'
        ${q.topic ? sql`AND t.slug = ${q.topic}` : sql``}
      ORDER BY a.published_at DESC
      LIMIT ${limit}
    `;
    return { articles: rows.map(r => localize(r, lang)) };
  });

  app.get('/api/articles/:slug', async (req, reply) => {
    const lang = pickLang(req);
    const slug = (req.params as { slug: string }).slug;
    const [row] = await sql`
      SELECT a.*,
             t.slug AS topic_slug, t.name AS topic_name,
             au.slug AS author_slug, au.name AS author_name, au.emoji AS author_emoji,
             au.tagline_de AS author_tagline_de, au.tagline_en AS author_tagline_en
      FROM article a
      LEFT JOIN topic t ON t.id = a.topic_id
      LEFT JOIN author au ON au.id = a.author_id
      WHERE a.slug = ${slug} AND a.status = 'published'
    `;
    if (!row) return reply.code(404).send({ error: 'not found' });
    return { article: localize(row, lang) };
  });
}
