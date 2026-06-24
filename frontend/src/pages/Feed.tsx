import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { api } from '../lib/api';

export interface ArticleCard {
  id: number;
  slug: string;
  headline: string | null;
  hero: string | null;
  published_at: string;
  topic: { slug: string; name: string } | null;
  author: { name: string; emoji: string | null; tagline: string | null } | null;
}

function timeAgo(iso: string, lang: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return lang === 'de' ? 'gerade eben' : 'just now';
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}${lang === 'de' ? 'd' : 'd'}`;
}

export default function Feed(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['articles', i18n.language],
    queryFn: () => api<{ articles: ArticleCard[] }>('/articles'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  const articles = data?.articles ?? [];
  if (!articles.length) {
    return <p className="py-20 text-center text-white/40">{t('feed.empty')}</p>;
  }

  return (
    <div className="space-y-4">
      {articles.map(a => (
        <Link key={a.id} to={`/a/${a.slug}`} className="card block">
          <div className="mb-2 flex items-center gap-2 text-xs text-white/40">
            {a.topic && <span className="chip">{a.topic.name}</span>}
            <span>·</span>
            <span>{timeAgo(a.published_at, i18n.language)}</span>
          </div>
          {/* tweet-like 140-char hero — the headline of the card */}
          <p className="font-display text-lg font-semibold leading-snug text-white">{a.hero}</p>
          {a.headline && a.headline !== a.hero && (
            <p className="mt-1 text-sm text-white/50">{a.headline}</p>
          )}
          {a.author && (
            <div className="mt-3 flex items-center gap-2 text-sm text-white/50">
              <span className="text-base">{a.author.emoji}</span>
              <span>
                {t('feed.by')} <span className="text-white/70">{a.author.name}</span>
              </span>
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
