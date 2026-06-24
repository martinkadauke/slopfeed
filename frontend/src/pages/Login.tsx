import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';

export default function Login(): JSX.Element {
  const { login, user } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    nav('/', { replace: true });
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      nav('/', { replace: true });
    } catch {
      setError(t('login.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight">
            slop<span className="accent-text">feed</span>
          </h1>
          <p className="mt-2 text-sm text-white/50">{t('app.tagline')}</p>
        </div>

        <form onSubmit={submit} className="glass rounded-3xl p-6 shadow-glow">
          <h2 className="mb-4 font-display text-lg font-semibold">{t('login.title')}</h2>
          <label className="mb-1 block text-xs text-white/50">{t('login.email')}</label>
          <input
            className="input mb-3"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <label className="mb-1 block text-xs text-white/50">{t('login.password')}</label>
          <input
            className="input mb-4"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-accent w-full" disabled={busy}>
            {busy ? <Loader2 className="mx-auto animate-spin" size={20} /> : t('login.submit')}
          </button>
          <p className="mt-4 text-center text-xs text-white/30">{t('login.inviteOnly')}</p>
        </form>
      </div>
    </div>
  );
}
