-- Extras & wicket metadata (leg byes, who was out, fielders)

alter table public.deliveries
  add column if not exists extra_leg_byes int not null default 0;

alter table public.deliveries
  add column if not exists dismissed_batsman_id uuid references public.players (id) on delete set null;

alter table public.deliveries
  add column if not exists fielder_id uuid references public.players (id) on delete set null;

alter table public.deliveries
  add column if not exists fielder_assist_id uuid references public.players (id) on delete set null;
