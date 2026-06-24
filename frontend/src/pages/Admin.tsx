import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Copy, Check, Bot, Hash, Settings, Mail, Users, Play, Sparkles } from 'lucide-react';
import { api } from '../lib/api';

type Tab = 'authors' | 'topics' | 'ai' | 'invites' | 'users';

export default function Admin(): JSX.Element {
  const [tab, setTab] = useState<Tab>('authors');
  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'authors', label: 'Autoren', icon: <Bot size={16} /> },
    { id: 'topics', label: 'Themen', icon: <Hash size={16} /> },
    { id: 'ai', label: 'AI', icon: <Settings size={16} /> },
    { id: 'invites', label: 'Invites', icon: <Mail size={16} /> },
    { id: 'users', label: 'Users', icon: <Users size={16} /> },
  ];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Admin</h1>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition ${
              tab === tb.id ? 'accent-gradient text-ink-950' : 'border border-white/10 text-white/60'
            }`}>
            {tb.icon}{tb.label}
          </button>
        ))}
      </div>
      {tab === 'authors' && <AuthorsTab />}
      {tab === 'topics' && <TopicsTab />}
      {tab === 'ai' && <AiTab />}
      {tab === 'invites' && <InvitesTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  );
}

function Spinner(): JSX.Element {
  return <Loader2 className="mx-auto my-10 animate-spin text-accent" />;
}

// ── Authors ────────────────────────────────────────────────────────────────
interface Author {
  id: number; slug: string; name: string; emoji: string | null;
  tagline_de: string | null; tagline_en: string | null; persona: string;
  active: boolean; sort_order: number;
}
function AuthorsTab(): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'authors'], queryFn: () => api<{ authors: Author[] }>('/admin/authors') });
  const reload = () => qc.invalidateQueries({ queryKey: ['admin', 'authors'] });
  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      {(data?.authors ?? []).map(a => <AuthorCard key={a.id} author={a} onChange={reload} />)}
      <button onClick={async () => { await api('/admin/authors', { method: 'POST', body: { name: 'Neuer Autor', persona: 'Beschreibe hier die Persönlichkeit …' } }); reload(); }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-3 text-sm text-white/60">
        <Plus size={16} /> Autor hinzufügen
      </button>
    </div>
  );
}
function AuthorCard({ author, onChange }: { author: Author; onChange: () => void }): JSX.Element {
  const [a, setA] = useState(author);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof Author, v: unknown) => setA(p => ({ ...p, [k]: v }));
  const save = async () => {
    await api(`/admin/authors/${a.id}`, { method: 'PATCH', body: { name: a.name, emoji: a.emoji, tagline_de: a.tagline_de, tagline_en: a.tagline_en, persona: a.persona, active: a.active } });
    setSaved(true); setTimeout(() => setSaved(false), 1500); onChange();
  };
  return (
    <div className="glass rounded-3xl p-4">
      <div className="mb-2 flex gap-2">
        <input className="input w-16 text-center" value={a.emoji ?? ''} onChange={e => set('emoji', e.target.value)} placeholder="🙂" />
        <input className="input flex-1" value={a.name} onChange={e => set('name', e.target.value)} placeholder="Name" />
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input className="input" value={a.tagline_de ?? ''} onChange={e => set('tagline_de', e.target.value)} placeholder="Tagline (de)" />
        <input className="input" value={a.tagline_en ?? ''} onChange={e => set('tagline_en', e.target.value)} placeholder="Tagline (en)" />
      </div>
      <label className="mb-1 block text-xs text-white/40">Persönlichkeit (Prompt-Stimme)</label>
      <textarea className="input min-h-[120px] resize-y" value={a.persona} onChange={e => set('persona', e.target.value)} />
      <div className="mt-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-white/60">
          <input type="checkbox" checked={a.active} onChange={e => set('active', e.target.checked)} /> aktiv
        </label>
        <div className="flex gap-2">
          <button onClick={async () => { if (confirm('Autor löschen?')) { await api(`/admin/authors/${a.id}`, { method: 'DELETE' }); onChange(); } }}
            className="rounded-xl p-2 text-white/40 hover:text-red-400"><Trash2 size={18} /></button>
          <button onClick={save} className="btn-accent px-4 py-2 text-sm">{saved ? <Check size={16} /> : 'Speichern'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Topics ─────────────────────────────────────────────────────────────────
interface Topic { id: number; slug: string; name: string; search_terms: string | null; enabled: boolean; sort_order: number; article_count: number }
function TopicsTab(): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'topics'], queryFn: () => api<{ topics: Topic[] }>('/admin/topics') });
  const [name, setName] = useState('');
  const [terms, setTerms] = useState('');
  const reload = () => qc.invalidateQueries({ queryKey: ['admin', 'topics'] });
  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      {(data?.topics ?? []).map(t => <TopicRow key={t.id} topic={t} onChange={reload} />)}
      <div className="glass rounded-3xl p-4">
        <div className="mb-2 text-sm font-semibold text-white/80">Neues Thema</div>
        <input className="input mb-2" value={name} onChange={e => setName(e.target.value)} placeholder="Name (z.B. Mistral AI)" />
        <input className="input mb-3" value={terms} onChange={e => setTerms(e.target.value)} placeholder="Suchbegriffe (für SearXNG)" />
        <button disabled={!name} onClick={async () => { await api('/admin/topics', { method: 'POST', body: { name, search_terms: terms } }); setName(''); setTerms(''); reload(); }}
          className="btn-accent w-full disabled:opacity-40"><Plus size={16} className="inline" /> Thema anlegen</button>
      </div>
    </div>
  );
}
function TopicRow({ topic, onChange }: { topic: Topic; onChange: () => void }): JSX.Element {
  const [t, setT] = useState(topic);
  const save = async (patch: Partial<Topic>) => { const next = { ...t, ...patch }; setT(next); await api(`/admin/topics/${t.id}`, { method: 'PATCH', body: patch }); onChange(); };
  return (
    <div className="glass rounded-3xl p-4">
      <div className="flex items-center gap-2">
        <input className="input flex-1" value={t.name} onChange={e => setT({ ...t, name: e.target.value })} onBlur={() => save({ name: t.name })} />
        <label className="flex items-center gap-1 text-xs text-white/50"><input type="checkbox" checked={t.enabled} onChange={e => save({ enabled: e.target.checked })} /> an</label>
        <button onClick={async () => { if (confirm('Thema löschen?')) { await api(`/admin/topics/${t.id}`, { method: 'DELETE' }); onChange(); } }} className="rounded-xl p-2 text-white/40 hover:text-red-400"><Trash2 size={16} /></button>
      </div>
      <input className="input mt-2 text-sm" value={t.search_terms ?? ''} onChange={e => setT({ ...t, search_terms: e.target.value })} onBlur={() => save({ search_terms: t.search_terms })} placeholder="Suchbegriffe" />
      <div className="mt-1 text-xs text-white/30">{t.article_count} Artikel · /{t.slug}</div>
    </div>
  );
}

// ── AI settings ──────────────────────────────────────────────────────────────
function AiTab(): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'config'], queryFn: () => api<{ config: Record<string, unknown>; secrets_set: Record<string, boolean> }>('/admin/config') });
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(false);
  if (isLoading || !data) return <Spinner />;
  const cfg = (k: string) => (k in form ? form[k] : data.config[k]) as string;
  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));
  const providers = ['anthropic', 'deepseek', 'ollama'];
  const tasks: { key: string; label: string }[] = [
    { key: 'curate', label: 'Kuratieren (News auswählen)' },
    { key: 'write', label: 'Schreiben (Blogpost)' },
    { key: 'translate', label: 'Übersetzen (de↔en)' },
  ];
  const save = async () => { await api('/admin/config', { method: 'PATCH', body: form }); setForm({}); setSaved(true); setTimeout(() => setSaved(false), 1500); qc.invalidateQueries({ queryKey: ['admin', 'config'] }); };

  // Plain render fn (NOT a component) so the inputs don't remount + lose focus
  // on every keystroke.
  const field = (k: string, label: string, type = 'text') => (
    <div className="mb-2" key={k}>
      <label className="mb-1 block text-xs text-white/40">{label}</label>
      <input className="input" type={type} value={cfg(k) ?? ''} onChange={e => set(k, e.target.value)}
        placeholder={data.secrets_set[k] ? '•••••• (gesetzt)' : ''} />
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-4">
        <h2 className="mb-3 font-display font-semibold">Provider & Keys</h2>
        {field('anthropic.api_key', 'Anthropic API-Key', 'password')}
        {field('deepseek.api_key', 'DeepSeek API-Key', 'password')}
        {field('ollama.url', 'Ollama URL')}
        {field('searxng.url', 'SearXNG URL')}
      </section>

      <section className="glass rounded-3xl p-4">
        <h2 className="mb-3 font-display font-semibold">Modelle pro Aufgabe</h2>
        {tasks.map(tk => (
          <div key={tk.key} className="mb-3">
            <label className="mb-1 block text-xs text-white/40">{tk.label}</label>
            <div className="flex gap-2">
              <select className="input w-36" value={cfg(`ai.${tk.key}.provider`)} onChange={e => set(`ai.${tk.key}.provider`, e.target.value)}>
                {providers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input className="input flex-1" value={cfg(`ai.${tk.key}.model`) ?? ''} onChange={e => set(`ai.${tk.key}.model`, e.target.value)} placeholder="Modell-ID" />
            </div>
          </div>
        ))}
      </section>

      <section className="glass rounded-3xl p-4">
        <h2 className="mb-3 font-display font-semibold">News-Pipeline</h2>
        <label className="mb-2 flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={Boolean(cfg('news.enabled'))} onChange={e => set('news.enabled', e.target.checked)} /> täglich automatisch laufen
        </label>
        {field('news.cron', 'Cron (z.B. 0 6 * * *)')}
        <div className="mb-2">
          <label className="mb-1 block text-xs text-white/40">Max. Artikel pro Thema/Lauf</label>
          <input className="input" type="number" value={Number(cfg('news.max_per_topic') ?? 1)} onChange={e => set('news.max_per_topic', Number(e.target.value))} />
        </div>
      </section>

      <button onClick={save} className="btn-accent w-full">{saved ? <Check size={18} className="inline" /> : 'Alles speichern'}</button>

      <NewsRunner />
    </div>
  );
}

interface NewsStatus { running: boolean; lastRun: { at: string; created: number; skipped: number; errors: number } | null }
function NewsRunner(): JSX.Element {
  const qc = useQueryClient();
  const [status, setStatus] = useState<NewsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { try { setStatus(await api<NewsStatus>('/admin/news/status')); } catch { /* ignore */ } };
  useEffect(() => { void load(); }, []);

  const run = async () => {
    setBusy(true);
    try { await api('/admin/news/run', { method: 'POST' }); } catch { /* maybe already running */ }
    const iv = setInterval(async () => {
      const s = await api<NewsStatus>('/admin/news/status').catch(() => null);
      if (s) setStatus(s);
      if (s && !s.running) { clearInterval(iv); setBusy(false); void qc.invalidateQueries({ queryKey: ['articles'] }); }
    }, 3000);
  };

  const lr = status?.lastRun;
  return (
    <section className="glass rounded-3xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={18} className="text-accent-soft" />
        <h2 className="font-display font-semibold">News jetzt generieren</h2>
      </div>
      <p className="mb-3 text-xs text-white/40">Läuft einmalig über alle aktiven Themen. Braucht einen konfigurierten LLM-Key + erreichbares SearXNG.</p>
      <button onClick={run} disabled={busy || status?.running} className="btn-accent w-full disabled:opacity-50">
        {busy || status?.running ? <><Loader2 size={16} className="inline animate-spin" /> läuft …</> : <><Play size={16} className="inline" /> Lauf starten</>}
      </button>
      {lr && (
        <p className="mt-3 text-xs text-white/50">
          Letzter Lauf: {new Date(lr.at).toLocaleString('de')} — {lr.created} erstellt, {lr.skipped} übersprungen, {lr.errors} Fehler
        </p>
      )}
    </section>
  );
}

// ── Invites ────────────────────────────────────────────────────────────────
interface Invite { id: number; token: string; email: string | null; used_at: string | null; used_by_email: string | null; expires_at: string | null; created_at: string }
function InvitesTab(): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'invites'], queryFn: () => api<{ invites: Invite[]; base_url: string }>('/admin/invites') });
  const [email, setEmail] = useState('');
  const [lastLink, setLastLink] = useState('');
  const [copied, setCopied] = useState('');
  const reload = () => qc.invalidateQueries({ queryKey: ['admin', 'invites'] });
  if (isLoading || !data) return <Spinner />;
  const linkFor = (token: string) => `${data.base_url}/invite?token=${token}`;
  const copy = (link: string) => { void navigator.clipboard.writeText(link); setCopied(link); setTimeout(() => setCopied(''), 1500); };
  return (
    <div className="space-y-3">
      <div className="glass rounded-3xl p-4">
        <div className="mb-2 text-sm font-semibold text-white/80">Freund einladen</div>
        <input className="input mb-2" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-Mail (optional, nur Vorbelegung)" />
        <button onClick={async () => { const r = await api<{ link: string }>('/admin/invites', { method: 'POST', body: { email: email || undefined } }); setLastLink(r.link); setEmail(''); reload(); }}
          className="btn-accent w-full"><Plus size={16} className="inline" /> Invite-Link erstellen</button>
        {lastLink && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-accent/10 p-2">
            <span className="flex-1 truncate text-xs text-accent-soft">{lastLink}</span>
            <button onClick={() => copy(lastLink)} className="rounded-lg p-1.5 text-accent-soft">{copied === lastLink ? <Check size={16} /> : <Copy size={16} />}</button>
          </div>
        )}
      </div>
      {(data.invites ?? []).map(inv => (
        <div key={inv.id} className="glass flex items-center gap-2 rounded-2xl p-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white/80">{inv.email ?? '(offen)'}</div>
            <div className="text-xs text-white/40">
              {inv.used_at ? `eingelöst von ${inv.used_by_email}` : 'noch nicht eingelöst'}
            </div>
          </div>
          {!inv.used_at && (
            <>
              <button onClick={() => copy(linkFor(inv.token))} className="rounded-lg p-2 text-white/50">{copied === linkFor(inv.token) ? <Check size={16} /> : <Copy size={16} />}</button>
              <button onClick={async () => { await api(`/admin/invites/${inv.id}`, { method: 'DELETE' }); reload(); }} className="rounded-lg p-2 text-white/40 hover:text-red-400"><Trash2 size={16} /></button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Users ────────────────────────────────────────────────────────────────────
interface UserRow { id: number; email: string; display_name: string | null; is_admin: boolean; preferred_lang: string; timezone: string; created_at: string }
function UsersTab(): JSX.Element {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<{ users: UserRow[] }>('/admin/users') });
  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-2">
      {(data?.users ?? []).map(u => (
        <div key={u.id} className="glass flex items-center justify-between rounded-2xl p-3">
          <div>
            <div className="text-sm text-white/80">{u.display_name || u.email}</div>
            <div className="text-xs text-white/40">{u.email} · {u.preferred_lang} · {u.timezone}</div>
          </div>
          {u.is_admin && <span className="chip">admin</span>}
        </div>
      ))}
    </div>
  );
}
