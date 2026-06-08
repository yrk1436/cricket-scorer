-- =============================================================================
-- Cricket scorer — first-time database setup (idempotent / safe to re-run)
--
-- Project: cric-score (ref lojomuhczvxyouudassi) — must match NEXT_PUBLIC_SUPABASE_URL
--
-- Apply via:
--   • Supabase MCP: apply_migration(name: cricket_scorer_initial, query: <this file>)
--   • Dashboard: SQL Editor → paste → Run
--   • CLI: supabase db push (after supabase link)
--
-- App access: SUPABASE_SERVICE_ROLE_KEY only (RLS on, no policies).
-- Matches: src/lib/types.ts, src/lib/match-service.ts
-- =============================================================================

create extension if not exists "pgcrypto";

create or replace function public.gen_public_id()
returns text
language sql
as $$
  select encode(gen_random_bytes(6), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default public.gen_public_id(),
  write_token text not null unique,
  pin_hash text not null,
  status text not null check (status in ('live', 'completed')),
  team_a_name text not null,
  team_b_name text not null,
  overs_per_innings int not null check (overs_per_innings > 0),
  max_wickets int not null check (max_wickets > 0),
  innings_count smallint not null check (innings_count in (1, 2)),
  toss_winner text not null check (toss_winner in ('a', 'b')),
  toss_elect text not null check (toss_elect in ('bat', 'bowl')),
  current_innings_index int not null default 1 check (current_innings_index >= 1),
  winner_side text null,
  result_summary text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  side text not null check (side in ('a', 'b')),
  display_name text not null,
  sort_order int not null default 0,
  did_not_bat boolean not null default false
);

create index if not exists players_match_id_idx on public.players (match_id);

-- ---------------------------------------------------------------------------
-- innings
-- ---------------------------------------------------------------------------
create table if not exists public.innings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  index_num int not null check (index_num >= 1),
  batting_side text not null check (batting_side in ('a', 'b')),
  runs int not null default 0,
  wickets int not null default 0,
  balls_legal int not null default 0,
  completed boolean not null default false,
  current_striker_id uuid references public.players (id) on delete set null,
  current_non_striker_id uuid references public.players (id) on delete set null,
  unique (match_id, index_num)
);

create index if not exists innings_match_id_idx on public.innings (match_id);

alter table public.innings
  add column if not exists current_bowler_id uuid references public.players (id) on delete set null;

-- ---------------------------------------------------------------------------
-- deliveries
-- ---------------------------------------------------------------------------
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid not null references public.innings (id) on delete cascade,
  display_order int not null check (display_order >= 1),
  striker_id uuid references public.players (id) on delete set null,
  non_striker_id uuid references public.players (id) on delete set null,
  runs_off_bat int not null default 0,
  extra_wide int not null default 0,
  extra_nb int not null default 0,
  extra_byes int not null default 0,
  counts_as_legal_delivery boolean not null default true,
  is_wicket boolean not null default false,
  dismissal text not null default 'none' check (
    dismissal in (
      'none',
      'bowled',
      'caught',
      'run_out',
      'lbw',
      'hit_wicket',
      'stumped',
      'retired_out',
      'retired_hurt',
      'other'
    )
  ),
  note text null,
  created_at timestamptz not null default now(),
  unique (innings_id, display_order)
);

create index if not exists deliveries_innings_id_idx on public.deliveries (innings_id);

alter table public.deliveries
  add column if not exists bowler_id uuid references public.players (id) on delete set null;

alter table public.deliveries
  add column if not exists is_strike_swap boolean not null default false;

alter table public.deliveries
  add column if not exists incoming_striker_id uuid references public.players (id) on delete set null;

-- ---------------------------------------------------------------------------
-- updated_at trigger on matches
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
  before update on public.matches
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: enabled, no policies (service role bypasses)
-- ---------------------------------------------------------------------------
alter table public.matches enable row level security;
alter table public.players enable row level security;
alter table public.innings enable row level security;
alter table public.deliveries enable row level security;

-- ---------------------------------------------------------------------------
-- Sanity check (raises if anything is missing)
-- ---------------------------------------------------------------------------
do $$
declare
  missing text[];
begin
  select array_agg(t)
  into missing
  from unnest(array['matches', 'players', 'innings', 'deliveries']::text[]) as t
  where not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = t
  );

  if missing is not null then
    raise exception 'Cricket scorer setup incomplete — missing tables: %', missing;
  end if;

  raise notice 'Cricket scorer schema OK (matches, players, innings, deliveries).';
end;
$$;
