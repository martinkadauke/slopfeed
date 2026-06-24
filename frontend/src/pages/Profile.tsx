import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, Globe, Clock, Loader2, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, type User } from '../lib/auth';
import { setLanguage } from '../i18n';
import { pushSupported, pushStatus, enablePush, disablePush } from '../lib/push';

interface Topic { id: number; slug: string; name: string; subscribed: boolean }

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const TIMEZONES: string[] = (() => {
  const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  try {
    if (f) return f('timeZone');
  } catch {
    /* fall through */
  }
  return ['Europe/Berlin', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'UTC'];
})();

function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-accent-soft">{icon}</span>
        <h2 className="font-display text-base font-semibold">{title}</h2>
      </div>
      {hint && <p className="mb-3 text-xs text-white/40">{hint}</p>}
      {children}
    </section>
  );
}

export default function Profile(): JSX.Element {
  const { user, setUser } = useAuth();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  // push state
  const [pushOn, setPushOn] = useState(false);
  const [pushErr, setPushErr] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => { void pushStatus().then(setPushOn); }, []);

  // password
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  const { data: topicsData } = useQuery({
    queryKey: ['topics'],
    queryFn: () => api<{ topics: Topic[] }>('/topics'),
  });

  if (!user) return <Loader2 className="mx-auto my-20 animate-spin text-accent" />;

  async function patch(body: Partial<User>): Promise<void> {
    setSaving(true);
    try {
      const { user: fresh } = await api<{ user: User }>('/me', { method: 'PATCH', body });
      setUser(fresh);
      if (body.preferred_lang) setLanguage(body.preferred_lang);
    } finally {
      setSaving(false);
    }
  }

  async function togglePush(): Promise<void> {
    setPushErr('');
    setPushBusy(true);
    try {
      if (pushOn) { await disablePush(); setPushOn(false); }
      else { await enablePush(); setPushOn(true); }
    } catch (e) {
      const m = (e as Error).message;
      setPushErr(m === 'denied' ? t('profile.pushDenied') : m === 'unsupported' ? t('profile.pushUnsupported') : m);
    } finally {
      setPushBusy(false);
    }
  }

  async function toggleTopic(topic: Topic): Promise<void> {
    const topics = topicsData?.topics ?? [];
    const next = topics.map(x => (x.id === topic.id ? { ...x, subscribed: !x.subscribed } : x));
    qc.setQueryData(['topics'], { topics: next });
    await api('/me/topics', { method: 'PUT', body: { topic_ids: next.filter(x => x.subscribed).map(x => x.id) } });
  }

  async function changePassword(): Promise<void> {
    setPwMsg('');
    try {
      await api('/me', { method: 'PATCH', body: { old_password: oldPw, password: newPw } });
      setPwMsg(t('profile.passwordChanged'));
      setOldPw(''); setNewPw('');
    } catch (e) {
      setPwMsg((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{t('profile.title')}</h1>
        {saving && <Loader2 className="animate-spin text-accent" size={18} />}
      </div>
      <p className="text-sm text-white/40">{user.email}</p>

      {/* language */}
      <Section icon={<Globe size={18} />} title={t('profile.language')}>
        <div className="flex gap-2">
          {(['de', 'en'] as const).map(l => (
            <button
              key={l}
              onClick={() => patch({ preferred_lang: l })}
              className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                i18n.language === l ? 'accent-gradient text-ink-950 border-transparent' : 'border-white/10 text-white/70'
              }`}
            >
              {l === 'de' ? 'Deutsch' : 'English'}
            </button>
          ))}
        </div>
      </Section>

      {/* timezone */}
      <Section icon={<Clock size={18} />} title={t('profile.timezone')}>
        <select className="input" value={user.timezone} onChange={e => patch({ timezone: e.target.value })}>
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </Section>

      {/* quiet hours */}
      <Section icon={<BellOff size={18} />} title={t('profile.quietHours')} hint={t('profile.quietHint')}>
        <div className="flex items-center gap-3">
          <label className="text-sm text-white/50">{t('profile.quietFrom')}</label>
          <select className="input flex-1" value={user.quiet_start} onChange={e => patch({ quiet_start: Number(e.target.value) })}>
            {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
          <label className="text-sm text-white/50">{t('profile.quietTo')}</label>
          <select className="input flex-1" value={user.quiet_end} onChange={e => patch({ quiet_end: Number(e.target.value) })}>
            {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </div>
      </Section>

      {/* push */}
      <Section icon={pushOn ? <Bell size={18} /> : <BellOff size={18} />} title={t('profile.push')}>
        {!pushSupported() ? (
          <p className="text-sm text-white/50">{t('profile.pushUnsupported')} {t('profile.pushIosHint')}</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-white/70">{pushOn ? t('profile.pushOn') : t('profile.pushOff')}</span>
              <button onClick={togglePush} disabled={pushBusy}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold ${pushOn ? 'border border-white/15 text-white/80' : 'accent-gradient text-ink-950'}`}>
                {pushBusy ? <Loader2 className="animate-spin" size={16} /> : pushOn ? t('profile.pushDisable') : t('profile.pushEnable')}
              </button>
            </div>
            {pushOn && (
              <button onClick={() => api('/push/test', { method: 'POST' })} className="text-xs text-accent-soft underline underline-offset-2">
                {t('profile.pushTest')}
              </button>
            )}
            {pushErr && <p className="mt-2 text-sm text-red-400">{pushErr}</p>}
          </>
        )}
      </Section>

      {/* topic checkboxes */}
      <Section icon={<Bell size={18} />} title={t('profile.topics')} hint={t('profile.topicsHint')}>
        <div className="grid grid-cols-2 gap-2">
          {(topicsData?.topics ?? []).map(topic => (
            <button key={topic.id} onClick={() => toggleTopic(topic)}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-sm transition ${
                topic.subscribed ? 'border-accent/50 bg-accent/10 text-white' : 'border-white/10 text-white/60'
              }`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${topic.subscribed ? 'accent-gradient border-transparent' : 'border-white/20'}`}>
                {topic.subscribed && <Check size={14} className="text-ink-950" />}
              </span>
              {topic.name}
            </button>
          ))}
        </div>
      </Section>

      {/* password */}
      <Section icon={<Globe size={18} />} title={t('profile.password')}>
        <input className="input mb-2" type="password" placeholder={t('profile.oldPassword')} value={oldPw} onChange={e => setOldPw(e.target.value)} autoComplete="current-password" />
        <input className="input mb-3" type="password" placeholder={t('profile.newPassword')} value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" minLength={8} />
        <button onClick={changePassword} disabled={!oldPw || newPw.length < 8} className="btn-accent w-full disabled:opacity-40">
          {t('profile.changePassword')}
        </button>
        {pwMsg && <p className="mt-2 text-sm text-white/60">{pwMsg}</p>}
      </Section>
    </div>
  );
}
