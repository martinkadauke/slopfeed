import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import sql from '../db.js';
import { signToken } from './plugin.js';
import type { User } from '../types.js';

function publicUser(u: Record<string, unknown>): User {
  return {
    id: u.id as number,
    email: u.email as string,
    display_name: (u.display_name as string) ?? null,
    is_admin: u.is_admin as boolean,
    preferred_lang: u.preferred_lang as string,
    timezone: u.timezone as string,
    quiet_start: u.quiet_start as number,
    quiet_end: u.quiet_end as number,
    prefers_dark: u.prefers_dark as boolean,
  };
}

export function authRoutes(app: FastifyInstance): void {
  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    if (!email || !password) return reply.code(400).send({ error: 'email and password required' });
    const rows = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase().trim()}`;
    if (!rows.length) return reply.code(401).send({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, rows[0].password_hash as string);
    if (!ok) return reply.code(401).send({ error: 'invalid credentials' });
    return { token: signToken(rows[0].id as number), user: publicUser(rows[0]) };
  });

  // Check whether an invite token is valid (used by the signup page before submit).
  app.get('/api/auth/invite-info', async (req, reply) => {
    const token = (req.query as { token?: string }).token;
    if (!token) return reply.code(400).send({ error: 'token required' });
    const [inv] = await sql`SELECT email, used_at, expires_at FROM invite WHERE token = ${token}`;
    if (!inv) return reply.code(404).send({ error: 'invalid invite' });
    if (inv.used_at) return reply.code(410).send({ error: 'invite already used' });
    if (inv.expires_at && new Date(inv.expires_at as string) < new Date()) {
      return reply.code(410).send({ error: 'invite expired' });
    }
    return { email: inv.email, valid: true };
  });

  // Accept an invite → create the user and log them in.
  app.post('/api/auth/accept-invite', async (req, reply) => {
    const { token, email, password, display_name } = (req.body ?? {}) as {
      token?: string; email?: string; password?: string; display_name?: string;
    };
    if (!token || !email || !password) {
      return reply.code(400).send({ error: 'token, email and password required' });
    }
    if (password.length < 8) return reply.code(400).send({ error: 'password too short (min 8)' });

    // Uniform result shape (code 0 = success) — avoids fragile union narrowing
    // through sql.begin's generic return type.
    const result = await sql.begin(async tx => {
      const [inv] = await tx`SELECT id, used_at, expires_at FROM invite WHERE token = ${token} FOR UPDATE`;
      if (!inv) return { code: 404, error: 'invalid invite', userId: 0 };
      if (inv.used_at) return { code: 410, error: 'invite already used', userId: 0 };
      if (inv.expires_at && new Date(inv.expires_at as string) < new Date()) {
        return { code: 410, error: 'invite expired', userId: 0 };
      }
      const mail = email.toLowerCase().trim();
      const [dupe] = await tx`SELECT id FROM users WHERE email = ${mail}`;
      if (dupe) return { code: 409, error: 'email already registered', userId: 0 };

      const hash = await bcrypt.hash(password, 12);
      const [user] = await tx`
        INSERT INTO users (email, display_name, password_hash)
        VALUES (${mail}, ${display_name ?? null}, ${hash})
        RETURNING id
      `;
      await tx`UPDATE invite SET used_by = ${user.id}, used_at = NOW() WHERE id = ${inv.id}`;
      return { code: 0, error: '', userId: user.id as number };
    });

    if (result.code !== 0) return reply.code(result.code).send({ error: result.error });
    const [fresh] = await sql`SELECT * FROM users WHERE id = ${result.userId}`;
    return { token: signToken(result.userId), user: publicUser(fresh) };
  });

  // Current user (used by the SPA on load to validate the stored token).
  app.get('/api/auth/me', async req => ({ user: req.user }));
}
