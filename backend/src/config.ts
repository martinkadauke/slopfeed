import sql from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
export const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? 'dev-internal-secret';
export const PORT = parseInt(process.env.PORT ?? '3000', 10);
export const APP_ENV = process.env.APP_ENV ?? 'dev';

export interface AppConfig {
  // LLM providers (same shape as the VDS setup)
  'ollama.url': string;
  'ollama.model': string;
  'deepseek.url': string;
  'deepseek.api_key': string;
  'anthropic.url': string;
  'anthropic.api_key': string;
  // Per-task provider/model. 'write' = author the blog post; 'translate' = de<->en.
  'ai.write.provider': string;
  'ai.write.model': string;
  'ai.curate.provider': string;
  'ai.curate.model': string;
  'ai.translate.provider': string;
  'ai.translate.model': string;
  // Web search
  'searxng.url': string;
  // News aggregation pipeline
  'news.enabled': boolean;
  'news.cron': string;            // when to run the daily aggregation
  'news.max_per_topic': number;   // max new articles per topic per run
  'news.languages': string[];     // which langs to generate ['de','en']
  // App
  'app.default_lang': string;
  'app.base_url': string;
  // Web push (VAPID keypair, generated + stored on first use)
  'push.vapid_public': string;
  'push.vapid_private': string;
  'push.vapid_subject': string;
  // SMTP (optional — for invite emails)
  'smtp.host': string;
  'smtp.port': number;
  'smtp.secure': boolean;
  'smtp.user': string;
  'smtp.pass': string;
  'smtp.from': string;
}

const DEFAULTS: AppConfig = {
  'ollama.url': 'http://192.168.1.238:11434',
  'ollama.model': 'qwen2.5:14b',
  'deepseek.url': 'https://api.deepseek.com',
  'deepseek.api_key': '',
  'anthropic.url': 'https://api.anthropic.com',
  'anthropic.api_key': '',
  // Writing the blog post is the quality-critical step → default to Claude.
  'ai.write.provider': 'anthropic',
  'ai.write.model': 'claude-sonnet-4-5',
  'ai.curate.provider': 'anthropic',
  'ai.curate.model': 'claude-sonnet-4-5',
  // Translation is cheaper → default to a local model.
  'ai.translate.provider': 'ollama',
  'ai.translate.model': 'qwen2.5:14b',
  'searxng.url': 'http://192.168.1.238:8089',
  'news.enabled': true,
  'news.cron': '0 6 * * *',       // 06:00 daily
  'news.max_per_topic': 1,
  'news.languages': ['de', 'en'],
  'app.default_lang': 'en',
  'app.base_url': 'https://slopfeed.giziko.online',
  'push.vapid_public': '',
  'push.vapid_private': '',
  'push.vapid_subject': '',
  'smtp.host': '',
  'smtp.port': 587,
  'smtp.secure': false,
  'smtp.user': '',
  'smtp.pass': '',
  'smtp.from': 'slopfeed <slopfeed@localhost>',
};

export async function getConfig<K extends keyof AppConfig>(key: K): Promise<AppConfig[K]> {
  const rows = await sql`SELECT value FROM app_config WHERE key = ${key}`;
  if (!rows.length) return DEFAULTS[key];
  return rows[0].value as AppConfig[K];
}

export async function getAllConfig(): Promise<Record<string, unknown>> {
  const rows = await sql`SELECT key, value FROM app_config ORDER BY key`;
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const r of rows) out[r.key as string] = r.value;
  return out;
}

export async function setConfig(key: string, value: unknown, userId?: number): Promise<void> {
  await sql`
    INSERT INTO app_config (key, value, updated_at, updated_by)
    VALUES (${key}, ${sql.json(value as never)}, NOW(), ${userId ?? null})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by
  `;
}
