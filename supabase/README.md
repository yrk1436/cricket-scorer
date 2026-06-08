# Cricket scorer — Supabase database

**Project:** `cric-score` · ref **`lojomuhczvxyouudassi`**  
Must match `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` (`https://lojomuhczvxyouudassi.supabase.co`).

## First-time setup (pick one)

### A. Supabase MCP (Cursor)

1. **Settings → MCP** → authenticate **user-supabase**.
2. If the project is paused: `restore_project` with `project_id: lojomuhczvxyouudassi`.
3. `apply_migration`:
   - **name:** `cricket_scorer_initial`
   - **query:** full contents of [`migrations/001_cricket_scorer_initial.sql`](migrations/001_cricket_scorer_initial.sql)
4. Verify: `list_tables` on `public` — expect `matches`, `players`, `innings`, `deliveries`.

### B. Supabase Dashboard (manual)

1. [Open project](https://supabase.com/dashboard/project/lojomuhczvxyouudassi) → **Resume** if inactive.
2. **SQL Editor** → New query → paste **`migrations/001_cricket_scorer_initial.sql`** → **Run**.
3. Success message: `Cricket scorer schema OK …`

### C. Verify from the app repo

After the project is active and `.env.local` has URL + service role key:

```bash
npm run db:verify
```

## Re-run / new environment

`001_cricket_scorer_initial.sql` is **idempotent** (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Safe to run again on the same or a fresh database.

## App env (not stored in Supabase)

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server only) |
| `MATCH_UNLOCK_SECRET` | Yes |
| `NEXT_PUBLIC_SITE_URL` | Optional |

Do **not** expose the service role key in client code. RLS is on with no policies; only the service role can read/write tables.

## Tables

| Table | Purpose |
|-------|---------|
| `matches` | Match config, tokens, status, result |
| `players` | Squads per side |
| `innings` | Score aggregates + current striker/non-striker/bowler |
| `deliveries` | Ball-by-ball log |
