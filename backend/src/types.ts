import 'fastify';

export interface User {
  id: number;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  preferred_lang: string;
  timezone: string;
  quiet_start: number;
  quiet_end: number;
  prefers_dark: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}
