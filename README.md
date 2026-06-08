# Cricket scorer

Small Next.js app: create a match, score on the **secret write URL**, share the **public read-only URL** (`/m/{public_id}`). After you mark the match complete, further edits require the scorer PIN again (stored as hash; unlock uses an HttpOnly cookie).

The **Sparta club website** (events, RSVPs, marketing, admin) lives in a separate project: `C:\Roop\Code\hobby\sparta-club-portal`.

## Setup

1. Copy [.env.example](.env.example) to `.env.local`.
2. In [Supabase](https://supabase.com/dashboard): Project Settings → API — set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (**server-only**, never expose to the browser bundle in client components).
3. Set `MATCH_UNLOCK_SECRET` to a long random string (e.g. `openssl rand -hex 32`).
4. Optional `NEXT_PUBLIC_SITE_URL` — used for nicer absolute links locally and in production ([Vercel](https://vercel.com) deploy URL).

### Database (Supabase)

**Project:** `cric-score` · ref `lojomuhczvxyouudassi` (must match `NEXT_PUBLIC_SUPABASE_URL`).

Full setup steps (MCP, SQL Editor, verify): **[supabase/README.md](supabase/README.md)**

**First-time migration (reusable, idempotent):** run  
[`supabase/migrations/001_cricket_scorer_initial.sql`](supabase/migrations/001_cricket_scorer_initial.sql)  
in the Supabase SQL Editor, or via Supabase MCP `apply_migration` with name `cricket_scorer_initial`.

After the project is **active** and migration is applied:

```bash
npm run db:verify
```

## UI mockups (HTML/CSS)

Static design previews — open in a browser (no build step):

- [`mockups/index.html`](mockups/index.html) — overview + side-by-side previews
- [`mockups/live-scorer.html`](mockups/live-scorer.html) — scoring pad + hero score
- [`mockups/create-match.html`](mockups/create-match.html) — setup form
- [`mockups/public-scorecard.html`](mockups/public-scorecard.html) — read-only view

Inspired by common live-score patterns (big score first, card layout, ball chips, thumb-friendly pad). Not wired to the app yet.

## Scripts

```bash
npm install
npm run dev
npm run build
```

## Hosting

[Vercel](https://vercel.com) pairs well with Next.js. Add the same env vars there. Remember the Supabase free tier may pause idle projects.

