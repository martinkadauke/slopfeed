# slopfeed — Deployment

slopfeed runs as an **additional stack** on the existing 3-node Docker Swarm.
Single environment (prod). `main` → build image (ghcr) → `docker stack deploy`
the `slopfeed` stack, published on **port 1111**, fronted by NPM at
`slopfeed.giziko.online`.

## One-time setup

1. **Postgres** (on 192.168.1.238): create the database + role
   ```sql
   CREATE DATABASE slopfeed;
   -- (reuse an existing role, or create a dedicated one)
   ```
   → `DATABASE_URL = postgres://<user>:<pass>@192.168.1.238:5432/slopfeed`

2. **GitHub secrets** (repo `martinkadauke/slopfeed`):
   - `DATABASE_URL`     — the URL from step 1
   - `JWT_SECRET`       — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `INTERNAL_SECRET`  — `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`

3. **GitHub Actions runner** (second instance on vds-1, repo-scoped):
   ```bash
   RUNNER_TOKEN=$(gh api -X POST repos/martinkadauke/slopfeed/actions/runners/registration-token -q .token)
   RUNNER_TOKEN="$RUNNER_TOKEN" bash install-runner.sh
   ```

4. **NPM proxy host**: `slopfeed.giziko.online` → `192.168.1.250:1111` (TLS).

5. **DNS**: `slopfeed.giziko.online` → (same target as the other *.giziko.online).

## Deploy / verify

Push to `main` (or `gh workflow run cicd.yml --ref main`). Then verify — a green
CI run does **not** prove the container booted; if it crash-loops, Swarm silently
keeps the old image (the workflow's Verify step dumps the failed task's logs):

```bash
curl -s https://slopfeed.giziko.online/api/version   # sha/started_at must change
curl -s https://slopfeed.giziko.online/api/health    # 200 {"ok":true}
```

Initial admin login: `admin@slopfeed.local` / `slopfeed-start-2026`
(override via `ADMIN_EMAIL` / `ADMIN_PASSWORD`; `ADMIN_RESET=true` to reset).
