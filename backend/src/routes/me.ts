import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import sql from '../db.js';

const VALID_TZ = (tz: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export function meRoutes(app: FastifyInstance): void {
  // Update own profile: language, timezone, quiet hours, dark mode, password.
  app.patch('/api/me', async (req, reply) => {
    const userId = req.user!.id;
    const b = (req.body ?? {}) as {
      preferred_lang?: string;
      timezone?: string;
      quiet_start?: number;
      quiet_end?: number;
      prefers_dark?: boolean;
      display_name?: string;
      password?: string;
      old_password?: string;
    };
    const updates: Record<string, unknown> = {};

    if (b.preferred_lang !== undefined) {
      if (!['de', 'en'].includes(b.preferred_lang)) return reply.code(400).send({ error: 'lang must be de or en' });
      updates.preferred_lang = b.preferred_lang;
    }
    if (b.timezone !== undefined) {
      if (!VALID_TZ(b.timezone)) return reply.code(400).send({ error: 'invalid timezone' });
      updates.timezone = b.timezone;
    }
    if (b.quiet_start !== undefined) {
      if (!Number.isInteger(b.quiet_start) || b.quiet_start < 0 || b.quiet_start > 23) {
        return reply.code(400).send({ error: 'quiet_start must be 0..23' });
      }
      updates.quiet_start = b.quiet_start;
    }
    if (b.quiet_end !== undefined) {
      if (!Number.isInteger(b.quiet_end) || b.quiet_end < 0 || b.quiet_end > 23) {
        return reply.code(400).send({ error: 'quiet_end must be 0..23' });
      }
      updates.quiet_end = b.quiet_end;
    }
    if (b.prefers_dark !== undefined) updates.prefers_dark = b.prefers_dark;
    if (b.display_name !== undefined) updates.display_name = b.display_name;

    if (b.password !== undefined) {
      if (b.password.length < 8) return reply.code(400).send({ error: 'password too short (min 8)' });
      const [row] = await sql`SELECT password_hash FROM users WHERE id = ${userId}`;
      const ok = b.old_password && (await bcrypt.compare(b.old_password, row.password_hash as string));
      if (!ok) return reply.code(403).send({ error: 'old password incorrect' });
      updates.password_hash = await bcrypt.hash(b.password, 12);
    }

    if (Object.keys(updates).length) {
      await sql`UPDATE users SET ${sql(updates)} WHERE id = ${userId}`;
    }
    const [fresh] = await sql`
      SELECT id, email, display_name, is_admin, preferred_lang, timezone, quiet_start, quiet_end, prefers_dark
      FROM users WHERE id = ${userId}
    `;
    return { user: fresh };
  });
}
