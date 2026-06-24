-- slopfeed initial schema. Applied on boot in filename order (see db.ts).

-- ── users ────────────────────────────────────────────────────────────────
-- Invite-only: there is no open signup. Users are created via an invite token.
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  display_name   TEXT,
  password_hash  TEXT NOT NULL,
  is_admin       BOOLEAN NOT NULL DEFAULT FALSE,
  preferred_lang TEXT NOT NULL DEFAULT 'de',           -- 'de' | 'en'
  timezone       TEXT NOT NULL DEFAULT 'Europe/Berlin', -- IANA tz for quiet-hours
  quiet_start    INT NOT NULL DEFAULT 22,              -- local hour [0..23], quiet window start
  quiet_end      INT NOT NULL DEFAULT 8,               -- local hour, quiet window end
  prefers_dark   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── app_config (key/value, JSONB) — LLM providers, searxng, push VAPID, cron ─
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by INT
);

-- ── invites (invite-only signup) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite (
  id         SERIAL PRIMARY KEY,
  token      TEXT UNIQUE NOT NULL,
  email      TEXT,                                     -- optional pre-fill
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  used_by    INT REFERENCES users(id) ON DELETE SET NULL,
  used_at    TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── authors (3 seeded personas, admin-editable personality) ───────────────
CREATE TABLE IF NOT EXISTS author (
  id         SERIAL PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  emoji      TEXT,
  tagline_de TEXT,
  tagline_en TEXT,
  persona    TEXT NOT NULL,                            -- the editable voice / system prompt
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── topics (AI labs / themes; admin can add more) ─────────────────────────
CREATE TABLE IF NOT EXISTS topic (
  id           SERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  search_terms TEXT,                                   -- query hints for SearXNG
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── articles (bilingual: de + en) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS article (
  id           SERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  topic_id     INT REFERENCES topic(id) ON DELETE SET NULL,
  author_id    INT REFERENCES author(id) ON DELETE SET NULL,
  headline_de  TEXT, headline_en TEXT,
  hero_de      TEXT, hero_en TEXT,                     -- tweet-like, <= 140 chars
  body_de      TEXT, body_en TEXT,                     -- markdown
  sources      JSONB NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'published',      -- 'draft' | 'published'
  dedupe_key   TEXT,                                   -- avoid regenerating same story
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_article_published ON article(published_at DESC);
CREATE INDEX IF NOT EXISTS ix_article_dedupe ON article(dedupe_key);

-- ── per-user topic push opt-in (checkboxes) ───────────────────────────────
CREATE TABLE IF NOT EXISTS user_topic (
  user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id INT NOT NULL REFERENCES topic(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, topic_id)
);

-- ── web push subscriptions (one row per device/browser) ───────────────────
CREATE TABLE IF NOT EXISTS push_subscription (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_push_sub_user ON push_subscription(user_id);

-- ── pending notifications (timezone quiet-hours deferral queue) ───────────
-- A push for a user is enqueued with deliver_at = now (if outside quiet hours)
-- or the next allowed local morning. A frequent cron flushes due rows.
CREATE TABLE IF NOT EXISTS pending_notification (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INT REFERENCES article(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  url        TEXT,
  deliver_at TIMESTAMPTZ NOT NULL,
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_pending_due ON pending_notification(deliver_at) WHERE sent_at IS NULL;

-- ── AI usage logging (best-effort token accounting) ───────────────────────
CREATE TABLE IF NOT EXISTS ai_usage (
  id            SERIAL PRIMARY KEY,
  task          TEXT, provider TEXT, model TEXT,
  input_tokens  INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
