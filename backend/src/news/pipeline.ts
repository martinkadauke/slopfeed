import crypto from 'node:crypto';
import sql from '../db.js';
import { getConfig } from '../config.js';
import { providerForTask } from '../llm/provider.js';
import type { SearchHit } from '../llm/searxng.js';
import { curatePrompt, writePrompt, translatePrompt, parseLlmJson, type CurateResult, type WriteResult } from '../llm/prompts.js';
import { enqueueTopicNotifications } from '../notify.js';

export interface LastRun { at: string | null; created: number; skipped: number; errors: number; trigger: string }

/** Is a run currently active anywhere (DB-backed → replica-safe)? */
export async function isNewsRunning(): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM news_run WHERE status = 'running' AND started_at > NOW() - INTERVAL '20 minutes' LIMIT 1`;
  return Boolean(row);
}

/** Run status read from the DB (works regardless of which replica answers). */
export async function newsStatus(): Promise<{ running: boolean; lastRun: LastRun | null }> {
  const running = await isNewsRunning();
  const [last] = await sql`
    SELECT trigger, created, skipped, errors, finished_at
    FROM news_run WHERE status IN ('done', 'failed')
    ORDER BY started_at DESC LIMIT 1`;
  return {
    running,
    lastRun: last
      ? { at: last.finished_at as string, created: last.created as number, skipped: last.skipped as number, errors: last.errors as number, trigger: last.trigger as string }
      : null,
  };
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
  const res = await fetch(`${base}/search?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
  const text = await res.text();
  let data: { results?: { title?: string; content?: string; url?: string }[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`SearXNG returned non-JSON (is "json" in search.formats?): ${text.slice(0, 80)}`);
  }
  return (data.results ?? []).slice(0, 8).map(r => ({ title: r.title ?? '', content: r.content ?? '', url: r.url ?? '' }));
}

/** Story-distinguishing terms of a query: words >=3 chars, minus the topic name
 *  and a few stopwords. A reddit thread must mention >=1 of these to count as
 *  "about THIS story" (not just the topic in general — e.g. not "What is n8n"). */
function specificTerms(query: string, topicName: string): string[] {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'from', 'site', 'reddit', 'com', 'new', 'ai',
    ...topicName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
  ]);
  return [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !stop.has(w)))];
}

/** Find a Reddit thread about THIS specific story. Searches site:reddit.com for
 *  the plain phrase and keeps only threads whose title contains a story-specific
 *  term (best overlap wins) — so generic topic threads are rejected. */
async function findRedditThread(query: string, topicName: string): Promise<{ url: string; title: string } | null> {
  const terms = specificTerms(query, topicName);
  if (!terms.length) return null;
  try {
    const base = await getConfig('searxng.url');
    const params = new URLSearchParams({ q: `${query} site:reddit.com`, format: 'json' });
    const res = await fetch(`${base}/search?${params}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { url?: string; title?: string }[] };
    let best: { url: string; title: string; score: number } | null = null;
    for (const r of data.results ?? []) {
      const url = r.url ?? '';
      if (!/reddit\.com\/r\/[^/]+\/comments\//i.test(url)) continue;
      const title = (r.title ?? '').toLowerCase();
      const score = terms.filter(t => title.includes(t)).length;
      if (score === 0) continue; // not specific enough → skip
      if (!best || score > best.score) best = { url, title: r.title ?? 'Reddit discussion', score };
    }
    return best ? { url: best.url, title: best.title } : null;
  } catch {
    return null;
  }
}

/** Derive a plain search phrase from an existing article (used by the backfill,
 *  where no curated search_title exists). */
async function extractSearchTitle(headline: string, hero: string, topicName: string): Promise<string> {
  try {
    const p = await providerForTask('curate');
    const out = await p.chat({
      system: 'Output ONLY a short plain search phrase of 2-6 words: the key company/product/event names of this AI-news story, no styling, no quotes, no extra punctuation. Example: "Mistral OCR 4" or "CTERA n8n integration".',
      user: `Topic: ${topicName}\nHeadline: ${headline}\nTeaser: ${hero}`,
    });
    const phrase = out.trim().split('\n')[0].replace(/^["']|["']$/g, '').slice(0, 80);
    return phrase || `${topicName} ${headline}`.slice(0, 80);
  } catch {
    return `${topicName} ${headline}`.slice(0, 80);
  }
}

/** (Re)compute reddit links for articles whose search_title isn't set yet.
 *  Overwrites old broad links — better no link than a wrong one. */
export async function backfillRedditLinks(limit = 100): Promise<{ processed: number; linked: number }> {
  const rows = await sql`
    SELECT a.id, a.headline_en, a.headline_de, a.hero_en, a.hero_de, t.name AS topic_name
    FROM article a LEFT JOIN topic t ON t.id = a.topic_id
    WHERE a.search_title IS NULL ORDER BY a.published_at DESC LIMIT ${limit}`;
  let linked = 0;
  for (const a of rows) {
    const topicName = (a.topic_name ?? '') as string;
    const headline = (a.headline_en || a.headline_de || '') as string;
    const hero = (a.hero_en || a.hero_de || '') as string;
    const searchTitle = await extractSearchTitle(headline, hero, topicName);
    const reddit = await findRedditThread(searchTitle, topicName);
    await sql`
      UPDATE article SET search_title = ${searchTitle}, reddit_url = ${reddit?.url ?? null}, reddit_title = ${reddit?.title ?? null}
      WHERE id = ${a.id as number}`;
    if (reddit) linked++;
  }
  console.log(`[news] reddit backfill: ${linked}/${rows.length} linked`);
  return { processed: rows.length, linked };
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

async function processTopic(topic: { id: number; name: string; search_terms: string | null }, primary: string, other: string, langs: string[]): Promise<'created' | 'skipped'> {
  const hits = await searchNews(topic.search_terms || topic.name);
  if (!hits.length) return 'skipped';

  const recent = await sql`
    SELECT headline_de, headline_en, dedupe_key FROM article
    WHERE topic_id = ${topic.id} ORDER BY published_at DESC LIMIT 25`;
  const recentHeadlines = recent.map(r => (r.headline_de || r.headline_en) as string).filter(Boolean);

  // 1) curate
  const curator = await providerForTask('curate');
  const cp = curatePrompt(topic.name, hits, recentHeadlines);
  const curated = parseLlmJson<CurateResult>(await curator.chat({ system: cp.system, user: cp.user, json: true }));
  if (!curated.found || !curated.summary) return 'skipped';

  const dedupe = (curated.dedupe_key || shortHash(curated.summary)).toLowerCase();
  const [dup] = await sql`SELECT 1 FROM article WHERE dedupe_key = ${dedupe} LIMIT 1`;
  if (dup) return 'skipped';

  // 2) write in the primary language
  const author = await pickAuthor();
  const writer = await providerForTask('write');
  const wp = writePrompt(author?.persona ?? 'A neutral, factual tech writer.', topic.name, curated.summary, curated.sources ?? [], primary);
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
  const searchTitle = (curated.search_title || topic.name).trim();
  const reddit = await findRedditThread(searchTitle, topic.name);

  const [art] = await sql`
    INSERT INTO article (slug, topic_id, author_id, headline_de, headline_en, hero_de, hero_en, body_de, body_en, sources, reddit_url, reddit_title, search_title, dedupe_key, status)
    VALUES (${slug}, ${topic.id}, ${author?.id ?? null},
            ${de?.headline ?? null}, ${en?.headline ?? null},
            ${de?.hero ?? null}, ${en?.hero ?? null},
            ${de?.body ?? null}, ${en?.body ?? null},
            ${sql.json(sources)}, ${reddit?.url ?? null}, ${reddit?.title ?? null}, ${searchTitle}, ${dedupe}, 'published')
    ON CONFLICT (slug) DO NOTHING
    RETURNING id`;
  if (!art) return 'skipped';

  await enqueueTopicNotifications(topic.id, art.id as number, { title: topic.name, body: written.hero, url: `/a/${slug}` });
  return 'created';
}

/** Run the daily aggregation — one fresh article per enabled topic (if found).
 *  Replica-safe: claims a single 'running' row; a concurrent attempt is rejected. */
export async function runNews(trigger: string): Promise<{ created: number; skipped: number; errors: number; claimed: boolean }> {
  // Supersede any stale run left behind by a crashed process.
  await sql`UPDATE news_run SET status = 'failed', finished_at = NOW() WHERE status = 'running' AND started_at < NOW() - INTERVAL '20 minutes'`;

  let runId: number;
  try {
    const [row] = await sql`INSERT INTO news_run (trigger, status) VALUES (${trigger}, 'running') RETURNING id`;
    runId = row.id as number;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      console.log(`[news] run skipped (${trigger}): another run is active`);
      return { created: 0, skipped: 0, errors: 0, claimed: false };
    }
    throw e;
  }

  let created = 0, skipped = 0, errors = 0;
  try {
    const topics = await sql`SELECT id, name, search_terms FROM topic WHERE enabled = TRUE ORDER BY sort_order, id`;
    const langs = (await getConfig('news.languages')) as string[];
    const primary = await getConfig('app.default_lang');
    const other = primary === 'de' ? 'en' : 'de';
    console.log(`[news] run start (${trigger}); ${topics.length} topics`);

    for (const topic of topics) {
      try {
        const r = await processTopic(
          { id: topic.id as number, name: topic.name as string, search_terms: topic.search_terms as string | null },
          primary, other, langs,
        );
        if (r === 'created') created++; else skipped++;
      } catch (e) {
        errors++;
        console.error(`[news] topic "${topic.name}" failed:`, (e as Error).message);
      }
    }
  } finally {
    await sql`UPDATE news_run SET status = 'done', created = ${created}, skipped = ${skipped}, errors = ${errors}, finished_at = NOW() WHERE id = ${runId}`;
    console.log(`[news] run done: created=${created} skipped=${skipped} errors=${errors}`);
  }
  return { created, skipped, errors, claimed: true };
}
