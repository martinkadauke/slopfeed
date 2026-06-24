import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { api, setToken } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function AcceptInvite(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { setUser } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();

  const [valid, setValid] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    api<{ email: string | null; valid: boolean }>(`/auth/invite-info?token=${encodeURIComponent(token)}`, { auth: false })
      .then(info => {
        setValid(true);
        if (info.email) setEmail(info.email);
      })
      .catch(() => setValid(false));
  }, [token]);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token: jwt, user } = await api<{ token: string; user: Parameters<typeof setUser>[0] }>(
        '/auth/accept-invite',
        { method: 'POST', auth: false, body: { token, email, password, display_name: name } },
      );
      setToken(jwt);
      setUser(user);
      nav('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-3xl font-bold">
          slop<span className="accent-text">feed</span>
        </h1>
        {valid === null && (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-accent" size={24} />
          </div>
        )}
        {valid === false && (
          <p className="glass rounded-3xl p-6 text-center text-white/60">
            {t('login.inviteOnly')}
          </p>
        )}
        {valid === true && (
          <form onSubmit={submit} className="glass rounded-3xl p-6 shadow-glow">
            <label className="mb-1 block text-xs text-white/50">{t('login.email')}</label>
            <input className="input mb-3" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <label className="mb-1 block text-xs text-white/50">Name</label>
            <input className="input mb-3" value={name} onChange={e => setName(e.target.value)} />
            <label className="mb-1 block text-xs text-white/50">{t('login.password')}</label>
            <input className="input mb-4" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
            <button type="submit" className="btn-accent w-full" disabled={busy}>
              {busy ? <Loader2 className="mx-auto animate-spin" size={20} /> : t('login.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
