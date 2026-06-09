-- Kids / informal cricket: cap total balls per over (legal + extras). 0 = no cap (6 legal only).

alter table public.matches
  add column if not exists max_balls_per_over int not null default 0;

alter table public.matches
  drop constraint if exists matches_max_balls_per_over_check;

alter table public.matches
  add constraint matches_max_balls_per_over_check
  check (max_balls_per_over >= 0 and max_balls_per_over <= 30);
