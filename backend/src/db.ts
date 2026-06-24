import postgres from 'postgres';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

// .trim() strips any accidental leading BOM / surrounding whitespace from the
// injected secret — a U+FEFF BOM makes postgres.js's new URL() throw, which
// crash-loops the container on boot (JS trim() removes U+FEFF too).
const DATABASE_URL = (
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/slopfeed'
).trim();

const sql = postgres(DATABASE_URL, {
  onnotice: () => {},
  transform: { undefined: null },
});

export default sql;

/** Apply backend/migrations/*.sql in filename order, tracked in schema_migrations. */
export async function migrate(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT NOW()
  )`;
  const dir = path.join(process.cwd(), 'migrations');
  if (!existsSync(dir)) {
    console.warn(`[migrate] no migrations directory at ${dir}, skipping`);
    return;
  }
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const applied = new Set(
    (await sql`SELECT filename FROM schema_migrations`).map(r => r.filename as string),
  );
  for (const file of files) {
    if (applied.has(file)) continue;
    const content = readFileSync(path.join(dir, file), 'utf8');
    console.log(`[migrate] applying ${file}`);
    await sql.begin(async tx => {
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    });
  }
}

/** Seed/repair the admin user.
 *  - Creates the admin (ADMIN_EMAIL, default admin@slopfeed.local) if no admin exists.
 *  - ADMIN_RESET=true forces a password reset (recovery switch).
 *  - ADMIN_PASSWORD overrides the default initial password. */
export async function ensureAdmin(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@slopfeed.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'slopfeed-start-2026';
  const force = process.env.ADMIN_RESET === 'true';

  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length) {
    if (force) {
      const hash = await bcrypt.hash(password, 12);
      await sql`UPDATE users SET password_hash = ${hash}, is_admin = TRUE WHERE email = ${email}`;
      console.log(`[seed] ADMIN_RESET: password for "${email}" has been reset`);
    } else {
      console.log(`[seed] admin user "${email}" exists`);
    }
    return;
  }

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users WHERE is_admin = TRUE`;
  if (count > 0 && !force) {
    console.log(`[seed] ${count} admin user(s) exist, not seeding "${email}"`);
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await sql`
    INSERT INTO users (email, display_name, password_hash, is_admin)
    VALUES (${email}, 'Admin', ${hash}, TRUE)
  `;
  console.log(`[seed] created admin user "${email}"`);
}

/** Seed the 3 default authors, default topics, and a welcome article — only if
 *  those tables are empty. Idempotent: admin edits are never overwritten. */
export async function ensureSeed(): Promise<void> {
  const [{ count: authorCount }] = await sql`SELECT COUNT(*)::int AS count FROM author`;
  if (authorCount === 0) {
    for (const a of DEFAULT_AUTHORS) {
      await sql`
        INSERT INTO author (slug, name, emoji, tagline_de, tagline_en, persona, sort_order)
        VALUES (${a.slug}, ${a.name}, ${a.emoji}, ${a.tagline_de}, ${a.tagline_en}, ${a.persona}, ${a.sort_order})
        ON CONFLICT (slug) DO NOTHING
      `;
    }
    console.log(`[seed] inserted ${DEFAULT_AUTHORS.length} authors`);
  }

  const [{ count: topicCount }] = await sql`SELECT COUNT(*)::int AS count FROM topic`;
  if (topicCount === 0) {
    let i = 0;
    for (const t of DEFAULT_TOPICS) {
      await sql`
        INSERT INTO topic (slug, name, search_terms, sort_order)
        VALUES (${t.slug}, ${t.name}, ${t.search_terms}, ${i++})
        ON CONFLICT (slug) DO NOTHING
      `;
    }
    console.log(`[seed] inserted ${DEFAULT_TOPICS.length} topics`);
  }

  const [{ count: articleCount }] = await sql`SELECT COUNT(*)::int AS count FROM article`;
  if (articleCount === 0) {
    const [author] = await sql`SELECT id FROM author ORDER BY sort_order LIMIT 1`;
    await sql`
      INSERT INTO article (slug, author_id, headline_de, headline_en, hero_de, hero_en, body_de, body_en, status)
      VALUES (
        'willkommen-bei-slopfeed',
        ${author?.id ?? null},
        'Willkommen bei slopfeed',
        'Welcome to slopfeed',
        'slopfeed ist online. Bald gibt es hier täglich die wichtigsten KI-News — kurz, scharf, mit Haltung.',
        'slopfeed is live. Soon: the AI news that actually matter — short, sharp, with attitude.',
        E'## Es geht los\n\nslopfeed aggregiert bald täglich die wirklich wichtigen KI-News und verpackt sie in kurze, gut recherchierte Blogposts.',
        E'## Here we go\n\nslopfeed will soon aggregate the AI news that actually matter, every day, as short well-researched blog posts.',
        'published'
      )
      ON CONFLICT (slug) DO NOTHING
    `;
    console.log('[seed] inserted welcome article');
  }
}

const DEFAULT_AUTHORS = [
  {
    slug: 'claudia-sloppenschmalz',
    name: 'Claudia von Sloppenschmalz',
    emoji: '💅',
    tagline_de: 'Hype-Seismografin & Edelfeder',
    tagline_en: 'Hype seismographer & elegant pen',
    sort_order: 0,
    persona:
      'Claudia von Sloppenschmalz ist eine elegante, leicht spöttische Tech-Kolumnistin mit aristokratischem Ton. Sie liebt große Bögen, pointierte Metaphern und durchschaut Marketing-Hype sofort. Sie schreibt geistreich, ein bisschen divenhaft, aber immer faktenfest. Sie nimmt Hype auseinander, ohne zynisch zu werden.',
  },
  {
    slug: 'klaus-siefschlonz',
    name: 'Klaus Siefschlonz',
    emoji: '🔧',
    tagline_de: 'Bodenständiger Ingenieur-Erklärbär',
    tagline_en: 'Down-to-earth engineering explainer',
    sort_order: 1,
    persona:
      'Klaus Siefschlonz ist ein nüchterner, bodenständiger Ingenieur-Typ. Er erklärt komplexe KI-Themen klar und ohne Schnörkel, mit trockenem Humor und gelegentlich einem handfesten Vergleich aus der Werkstatt. Er misstraut Buzzwords und fragt immer: "Was macht das konkret besser?" Verständlich, geerdet, technisch korrekt.',
  },
  {
    slug: 'c-lauderdale',
    name: 'C. Lauderdale',
    emoji: '🕶️',
    tagline_de: 'Cooler Insider mit Silicon-Valley-Vibe',
    tagline_en: 'Cool insider with Silicon Valley vibe',
    sort_order: 2,
    persona:
      'C. Lauderdale ist ein lässiger, gut vernetzter Insider mit Silicon-Valley-Attitüde. Schreibt schnell, scharf, mit englischen Fachbegriffen und einem Gespür für das, was als Nächstes groß wird. Etwas geheimnisvoll, name-dropt gern Labs und Forscher, bleibt aber pointiert und informativ. Trend-Radar an, Bullshit-Detektor an.',
  },
];

const DEFAULT_TOPICS = [
  { slug: 'anthropic', name: 'Anthropic', search_terms: 'Anthropic Claude AI news' },
  { slug: 'openai', name: 'OpenAI', search_terms: 'OpenAI GPT news' },
  { slug: 'google-deepmind', name: 'Google DeepMind', search_terms: 'Google DeepMind Gemini news' },
  { slug: 'xai', name: 'x.AI', search_terms: 'xAI Grok Elon Musk AI news' },
  { slug: 'deepseek', name: 'DeepSeek', search_terms: 'DeepSeek AI model news' },
  { slug: 'ollama', name: 'Ollama', search_terms: 'Ollama local LLM news' },
  { slug: 'n8n', name: 'n8n', search_terms: 'n8n automation workflow AI news' },
  { slug: 'meta-ai', name: 'Meta AI', search_terms: 'Meta Llama AI news' },
  { slug: 'mistral', name: 'Mistral AI', search_terms: 'Mistral AI model news' },
];
