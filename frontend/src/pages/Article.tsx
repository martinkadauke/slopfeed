import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { Loader2, ChevronLeft, MessageCircle } from 'lucide-react';
import { api } from '../lib/api';

interface ArticleFull {
  id: number;
  slug: string;
  headline: string | null;
  hero: string | null;
  body: string | null;
  sources: { title?: string; url: string }[];
  reddit_url: string | null;
  reddit_title: string | null;
  published_at: string;
  topic: { slug: string; name: string } | null;
  author: { name: string; emoji: string | null; tagline: string | null } | null;
}

export default function Article(): JSX.Element {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['article', slug, i18n.language],
    queryFn: () => api<{ article: ArticleFull }>(`/articles/${slug}`),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }
  if (isError || !data) {
    return <p className="py-20 text-center text-white/40">{t('article.notFound')}</p>;
  }

  const a = data.article;
  return (
    <article>
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-white/50 hover:text-white">
        <ChevronLeft size={18} /> {t('article.back')}
      </Link>

      <div className="mb-3 flex items-center gap-2 text-xs text-white/40">
        {a.topic && <span className="chip">{a.topic.name}</span>}
        <span>{new Date(a.published_at).toLocaleDateString(i18n.language)}</span>
      </div>

      <h1 className="font-display text-2xl font-bold leading-tight text-white">{a.headline}</h1>
      {a.hero && a.hero !== a.headline && (
        <p className="mt-2 text-base text-white/60">{a.hero}</p>
      )}

      {a.author && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/5 p-3">
          <span className="text-2xl">{a.author.emoji}</span>
          <div>
            <div className="text-sm font-semibold text-white">{a.author.name}</div>
            {a.author.tagline && <div className="text-xs text-white/40">{a.author.tagline}</div>}
          </div>
        </div>
      )}

      <div className="prose-slop mt-5">
        <ReactMarkdown>{a.body ?? ''}</ReactMarkdown>
      </div>

      {a.reddit_url && (
        <a
          href={a.reddit_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center gap-3 rounded-2xl border border-[#ff4500]/30 bg-[#ff4500]/10 p-3 transition active:scale-[0.99]"
        >
          <MessageCircle size={20} className="shrink-0 text-[#ff4500]" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">{t('article.reddit')}</div>
            {a.reddit_title && <div className="truncate text-xs text-white/50">{a.reddit_title}</div>}
          </div>
        </a>
      )}

      {a.sources?.length > 0 && (
        <div className="mt-8 border-t border-white/10 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-white/60">{t('article.sources')}</h3>
          <ul className="space-y-1 text-sm">
            {a.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent-soft underline underline-offset-2">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
