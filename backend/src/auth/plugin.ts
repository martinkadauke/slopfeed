import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import sql from '../db.js';
import { JWT_SECRET, INTERNAL_SECRET } from '../config.js';
import type { User } from '../types.js';

const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/ready',
  '/api/version',
  '/api/auth/login',
  '/api/auth/accept-invite',
  '/api/auth/invite-info',
]);

/** Global auth gate: every /api/* route except the public ones requires a valid JWT. */
export function registerAuth(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/api/')) return;
    if (PUBLIC_PATHS.has(url)) return;

    // Service-to-service calls (e.g. internal triggers) use a shared secret.
    if (url.startsWith('/api/internal/')) {
      if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      return;
    }

    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return reply.code(401).send({ error: 'unauthorized' });
    try {
      const payload = jwt.verify(token, JWT_SECRET) as unknown as { sub: number };
      const rows = await sql`
        SELECT id, email, display_name, is_admin, preferred_lang, timezone,
               quiet_start, quiet_end, prefers_dark
        FROM users WHERE id = ${payload.sub}
      `;
      if (!rows.length) return reply.code(401).send({ error: 'unauthorized' });
      req.user = rows[0] as unknown as User;
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user?.is_admin) {
    return reply.code(403).send({ error: 'forbidden' });
  }
}

export function signToken(userId: number): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' });
}
