import i18n from '../i18n';

export const TOKEN_KEY = 'slopfeed_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Fetch wrapper: injects the bearer token + current language, parses JSON,
 *  throws ApiError on non-2xx. */
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;

  // Append language so the backend can localize bilingual content.
  const sep = path.includes('?') ? '&' : '?';
  const url = `/api${path}${path.startsWith('/auth') ? '' : `${sep}lang=${i18n.language}`}`;

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && opts.auth !== false) {
    setToken(null);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || res.statusText);
  return data as T;
}
