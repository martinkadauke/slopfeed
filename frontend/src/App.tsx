import { Routes, Route, Navigate, Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, LogOut, Languages } from 'lucide-react';
import { useAuth } from './lib/auth';
import { setLanguage } from './i18n';
import Login from './pages/Login';
import AcceptInvite from './pages/AcceptInvite';
import Feed from './pages/Feed';
import Article from './pages/Article';

function Brand(): JSX.Element {
  return (
    <Link to="/" className="font-display text-xl font-bold tracking-tight">
      slop<span className="accent-text">feed</span>
    </Link>
  );
}

function TopBar(): JSX.Element {
  const { user, logout } = useAuth();
  const { i18n } = useTranslation();
  const toggleLang = (): void => setLanguage(i18n.language === 'de' ? 'en' : 'de');
  return (
    <header className="sticky top-0 z-20 glass border-b border-white/5">
      <div
        className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <Brand />
        <div className="flex items-center gap-1">
          <button
            onClick={toggleLang}
            className="flex items-center gap-1 rounded-xl px-2 py-2 text-white/60 hover:bg-white/5 hover:text-white"
            aria-label="language"
          >
            <Languages size={18} />
            <span className="text-xs font-semibold uppercase">{i18n.language}</span>
          </button>
          {user && (
            <button
              onClick={logout}
              className="rounded-xl p-2 text-white/60 hover:bg-white/5 hover:text-white"
              aria-label="logout"
            >
              <LogOut size={20} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function FullscreenLoader(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="animate-spin text-accent" size={28} />
    </div>
  );
}

function ProtectedShell(): JSX.Element {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullscreenLoader />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return (
    <div className="mx-auto max-w-2xl">
      <TopBar />
      <main
        className="px-4 pt-4"
        style={{ paddingBottom: 'max(6rem, env(safe-area-inset-bottom))' }}
      >
        <Outlet />
      </main>
    </div>
  );
}

export default function App(): JSX.Element {
  const { loading } = useAuth();
  if (loading) return <FullscreenLoader />;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/invite" element={<AcceptInvite />} />
      <Route element={<ProtectedShell />}>
        <Route path="/" element={<Feed />} />
        <Route path="/a/:slug" element={<Article />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
