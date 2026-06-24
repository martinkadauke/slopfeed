-- Optional link to a relevant Reddit discussion thread for an article.
ALTER TABLE article ADD COLUMN IF NOT EXISTS reddit_url   TEXT;
ALTER TABLE article ADD COLUMN IF NOT EXISTS reddit_title TEXT;
