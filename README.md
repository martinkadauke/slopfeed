# slopfeed

Eine sleeke, mobile-first Web-App, die täglich die wichtigsten KI-News
aggregiert und als kurze, gut recherchierte Blogposts aufbereitet — geschrieben
von drei KI-Autoren mit eigener Persönlichkeit. Invite-only.

- **Feed**: Tweet-artige 140-Zeichen-Heroes → Klick → vollständiger Blogpost
- **Themen**: Anthropic, OpenAI, Google DeepMind, x.AI, DeepSeek, Ollama, n8n … (im Admin erweiterbar)
- **Push**: Web Push (iOS/Android), pro Thema abonnierbar, mit Zeitzone & Ruhezeiten (kein Push nachts)
- **Mehrsprachig**: Deutsch / Englisch pro Profil
- **LLM/Suche**: DeepSeek, Anthropic, Ollama + SearXNG (konfigurierbar im Admin)

## Stack

- **Backend**: Node 20 · TypeScript · Fastify · PostgreSQL (`postgres.js`) · JWT · node-cron · web-push
- **Frontend**: React 18 · Vite · Tailwind · react-router · TanStack Query · i18next
- Single container: das Backend liefert das gebaute SPA aus `/public`, Migrations laufen beim Boot.

## Entwicklung

```bash
# Backend (Port 3000)
cd backend && cp .env.example .env && npm install && npm run dev
# Frontend (Port 5173, proxyt /api → :3000)
cd frontend && npm install && npm run dev
```

## Deployment

Siehe [deploy/README.md](deploy/README.md). CI/CD: `main` → ghcr-Image → Docker-Swarm-Stack `slopfeed` auf Port 1111, hinter `slopfeed.giziko.online`.
