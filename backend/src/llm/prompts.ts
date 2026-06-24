import type { SearchHit } from './searxng.js';

/** Tolerant JSON extraction from an LLM response (strips code fences / prose). */
export function parseLlmJson<T = unknown>(text: string): T {
  let s = text.trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  return JSON.parse(s) as T;
}

const LANG_NAME: Record<string, string> = { de: 'German', en: 'English' };

// ── Curate: pick the single most important NEW story for a topic ───────────
export interface CurateResult {
  found: boolean;
  summary?: string;
  angle?: string;
  dedupe_key?: string;
  search_title?: string;
  sources?: string[];
}

export function curatePrompt(topic: string, hits: SearchHit[], recentHeadlines: string[]): { system: string; user: string } {
  const system =
    'You are a sharp, well-informed AI-news editor. From the web search results, pick the SINGLE most important and genuinely NEW development about the given topic. ' +
    'Skip anything already covered by the RECENT headlines, anything older than ~10 days, listicles, and pure marketing. ' +
    'If nothing is both new and noteworthy, return {"found": false}. ' +
    'Respond ONLY with a JSON object: {"found": true, "summary": "2-4 sentence factual summary of the development", "angle": "why it matters in one line", "dedupe_key": "a short stable lowercase slug identifying this specific story", "search_title": "a short PLAIN search phrase of 2-6 words — the key company/product/event names only, no styling, no quotes (e.g. \'Mistral OCR 4\' or \'CTERA n8n integration\') — used to find a discussion about THIS exact story", "sources": ["url", "..."]}.';
  const results = hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.content}\n${h.url}`).join('\n\n');
  const recent = recentHeadlines.length ? recentHeadlines.map(h => `- ${h}`).join('\n') : '(none yet)';
  const user = `TOPIC: ${topic}\n\nRECENT (already covered, do NOT repeat):\n${recent}\n\nSEARCH RESULTS:\n${results}`;
  return { system, user };
}

// ── Write: author writes the blog post in one language ─────────────────────
export interface WriteResult {
  headline: string;
  hero: string;
  body: string;
}

export function writePrompt(
  persona: string,
  topic: string,
  summary: string,
  sources: string[],
  lang: string,
): { system: string; user: string } {
  const langName = LANG_NAME[lang] ?? 'German';
  const system =
    `You write for slopfeed, an AI-news blog. Adopt THIS author's voice and personality completely:\n${persona}\n\n` +
    `Write entirely in ${langName}. Produce a short, well-researched blog post about the development below.\n` +
    'Respond ONLY with a JSON object: {"headline": "a catchy headline", "hero": "a punchy tweet-like teaser, MAXIMUM 140 characters", "body": "the post in Markdown: 3-5 short paragraphs, optionally an H2; informative, opinionated in the author voice, factually grounded"}. ' +
    'The hero MUST be <= 140 characters. Do not invent facts beyond the summary.';
  const user = `TOPIC: ${topic}\n\nDEVELOPMENT:\n${summary}\n\nSOURCES:\n${sources.join('\n')}`;
  return { system, user };
}

// ── Translate the three fields to the other language ───────────────────────
export function translatePrompt(fields: WriteResult, from: string, to: string): { system: string; user: string } {
  const system =
    `Translate the JSON fields from ${LANG_NAME[from] ?? from} to ${LANG_NAME[to] ?? to}, preserving the author's voice, tone and Markdown. ` +
    'Keep the hero <= 140 characters. Respond ONLY with JSON: {"headline": "...", "hero": "...", "body": "..."}.';
  const user = JSON.stringify(fields);
  return { system, user };
}
