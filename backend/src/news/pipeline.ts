import crypto from 'node:crypto';
import sql from '../db.js';
import { getConfig } from '../config.js';
import { providerForTask } from '../llm/provider.js';
import type { SearchHit } from '../llm/searxng.js';
import { curatePrompt, writePrompt, translatePrompt, parseLlmJson, type CurateResult, type WriteResult } from '../llm/prompts.js';
import { enqueueTopicNotifications } from '../notify.js';

let running = false;
let lastRun: { at: string; created: number; skipped: number; errors: number } | null = null;

export function isNewsRunning(): boolean {
  return running;
}
export function newsStatus(): { running: boolean; lastRun: typeof lastRun } {
  return { running, lastRun };
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'post';
}
function shortHash(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
}

/** Recent news search via SearXNG (news+general, last week). */
async function searchNews(query: string): Promise<SearchHit[]> {
  const base = await getConfig('searxng.url');
  const params = new URLSearchParams({ q: query, format: 'json', categories: 'news,general', time_range: 'week' });
  const res = await fetch(`${base}/search?${params}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
  const data = (await res.json()) as { results?: { title?: string; content?: string; url?: string }[] };
  return (data.results ?? []).slice(0, 8).map(r => ({ title: r.title ?? '', content: r.content ?? '', url: r.url ?? '' }));
}

/** Round-robin author: the active author with the fewest articles. */
async function pickAuthor(): Promise<{ id: number; persona: string } | null> {
  const [a] = await sql`
    SELECT au.id, au.persona
    FROM author au WHERE au.active = TRUE
    ORDER BY (SELECT COUNT(*) FROM article ar WHERE ar.author_id = au.id) ASC, RANDOM()
    LIMIT 1`;
  return a ? { id: a.id as number, persona: a.persona as string } : null;
}

/** Run the daily aggregation: one fresh article per enabled topic (if found). */
export async function runNews(trigger: string): Promise<{ created: number; skipped: number; errors: number }> {
  if (running) return { created: 0, skipped: 0, errors: 0 };
  running = true;
  let created = 0, skipped = 0, errors = 0;
  try {
    const topics = await sql`SELECT id, name, search_terms FROM topic WHERE enabled = TRUE ORDER BY sort_order, id`;
    const langs = (await getConfig('news.languages')) as string[];
    const primary = await getConfig('app.default_lang');
    const other = primary === 'de' ? 'en' : 'de';
    console.log(`[news] run start (${trigger}); ${topics.length} topics`);

    for (const topic of topics) {
      try {
        const hits = await searchNews((topic.search_terms as string) || (topic.name as string));
        if (!hits.length) { skipped++; continue; }

        const recent = await sql`
          SELECT headline_de, headline_en, dedupe_key FROM article
          WHERE topic_id = ${topic.id as number} ORDER BY published_at DESC LIMIT 25`;
        const recentHeadlines = recent.map(r => (r.headline_de || r.headline_en) as string).filter(Boolean);

        // 1) curate
        const curator = await providerForTask('curate');
        const cp = curatePrompt(topic.name as string, hits, recentHeadlines);
        const curated = parseLlmJson<CurateResult>(await curator.chat({ system: cp.system, user: cp.user, json: true }));
        if (!curated.found || !curated.summary) { skipped++; continue; }

        const dedupe = (curated.dedupe_key || shortHash(curated.summary)).toLowerCase();
        const [dup] = await sql`SELECT 1 FROM article WHERE dedupe_key = ${dedupe} LIMIT 1`;
        if (dup) { skipped++; continue; }

        // 2) write in the primary language
        const author = await pickAuthor();
        const writer = await providerForTask('write');
        const wp = writePrompt(author?.persona ?? 'A neutral, factual tech writer.', topic.name as string, curated.summary, curated.sources ?? [], primary);
        const written = parseLlmJson<WriteResult>(await writer.chat({ system: wp.system, user: wp.user, json: true }));
        written.hero = (written.hero || '').slice(0, 140);

        // 3) translate to the other language
        let trans: WriteResult | null = null;
        if (langs.includes(other)) {
          try {
            const tr = await providerForTask('translate');
            const tp = translatePrompt(written, primary, other);
            trans = parseLlmJson<WriteResult>(await tr.chat({ system: tp.system, user: tp.user, json: true }));
            trans.hero = (trans.hero || '').slice(0, 140);
          } catch (e) {
            console.error('[news] translate failed:', (e as Error).message);
          }
        }

        const de = primary === 'de' ? written : trans;
        const en = primary === 'en' ? written : trans;
        const slug = `${slugify(written.headline)}-${shortHash(dedupe)}`;
        const sources = (curated.sources ?? []).map(u => ({ url: u }));

        const [art] = await sql`
          INSERT INTO article (slug, topic_id, author_id, headline_de, headline_en, hero_de, hero_en, body_de, body_en, sources, dedupe_key, status)
          VALUES (${slug}, ${topic.id as number}, ${author?.id ?? null},
                  ${de?.headline ?? null}, ${en?.headline ?? null},
                  ${de?.hero ?? null}, ${en?.hero ?? null},
                  ${de?.body ?? null}, ${en?.body ?? null},
                  ${sql.json(sources)}, ${dedupe}, 'published')
          ON CONFLICT (slug) DO NOTHING
          RETURNING id`;
        if (!art) { skipped++; continue; }
        created++;

        // 4) enqueue push for subscribers (quiet-hours aware)
        await enqueueTopicNotifications(topic.id as number, art.id as number, {
          title: `${topic.name}`,
          body: written.hero,
          url: `/a/${slug}`,
        });
      } catch (e) {
        errors++;
        console.error(`[news] topic "${topic.name}" failed:`, (e as Error).message);
      }
    }
  } finally {
    running = false;
    lastRun = { at: new Date().toISOString(), created, skipped, errors };
    console.log(`[news] run done: created=${created} skipped=${skipped} errors=${errors}`);
  }
  return { created, skipped, errors };
}
