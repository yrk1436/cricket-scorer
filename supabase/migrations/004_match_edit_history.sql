-- Ball-correction audit log stored on the match (phase 1: no revert UI).
alter table public.matches
  add column if not exists edit_history jsonb not null default '[]'::jsonb;
