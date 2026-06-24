-- Plain factual search phrase for a story (key company/product/event names, no
-- styling) — used to find a *specific* Reddit thread instead of the stylized
-- headline. NULL marks an article whose reddit link still needs (re)computing.
ALTER TABLE article ADD COLUMN IF NOT EXISTS search_title TEXT;
