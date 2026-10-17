-- Atomic Apply for Phase 2 Edit match drafts.
-- Updates changed deliveries, innings totals, optional result, and one
-- edit_history session line — or rolls everything back.

create or replace function public.apply_match_edit(
  p_match_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_delivery_ids jsonb,
  p_delivery_patches jsonb,
  p_innings_patches jsonb,
  p_winner_side text,
  p_result_summary text,
  p_update_result boolean,
  p_history_entry jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_updated_at timestamptz;
  v_history jsonb;
  v_inn_id text;
  v_ids jsonb;
  v_actual text[];
  v_expected text[];
  v_patch jsonb;
begin
  select updated_at, coalesce(edit_history, '[]'::jsonb)
    into v_updated_at, v_history
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if date_trunc('milliseconds', timezone('utc', v_updated_at))
     is distinct from date_trunc('milliseconds', timezone('utc', p_expected_updated_at)) then
    raise exception 'STALE';
  end if;

  for v_inn_id, v_ids in
    select key, value from jsonb_each(coalesce(p_expected_delivery_ids, '{}'::jsonb))
  loop
    select coalesce(array_agg(id::text order by display_order), '{}')
      into v_actual
    from public.deliveries
    where innings_id = v_inn_id::uuid;

    select coalesce(array_agg(elem order by ord), '{}')
      into v_expected
    from jsonb_array_elements_text(v_ids) with ordinality as t(elem, ord);

    if v_actual is distinct from v_expected then
      raise exception 'STALE';
    end if;
  end loop;

  for v_patch in
    select value from jsonb_array_elements(coalesce(p_delivery_patches, '[]'::jsonb))
  loop
    update public.deliveries set
      striker_id = nullif(v_patch->>'striker_id', '')::uuid,
      non_striker_id = nullif(v_patch->>'non_striker_id', '')::uuid,
      bowler_id = nullif(v_patch->>'bowler_id', '')::uuid,
      runs_off_bat = coalesce((v_patch->>'runs_off_bat')::int, 0),
      extra_wide = coalesce((v_patch->>'extra_wide')::int, 0),
      extra_nb = coalesce((v_patch->>'extra_nb')::int, 0),
      extra_byes = coalesce((v_patch->>'extra_byes')::int, 0),
      extra_leg_byes = coalesce((v_patch->>'extra_leg_byes')::int, 0),
      counts_as_legal_delivery = coalesce((v_patch->>'counts_as_legal_delivery')::boolean, true),
      is_wicket = coalesce((v_patch->>'is_wicket')::boolean, false),
      dismissal = coalesce(v_patch->>'dismissal', 'none')::public.dismissal_type,
      dismissed_batsman_id = nullif(v_patch->>'dismissed_batsman_id', '')::uuid,
      incoming_striker_id = nullif(v_patch->>'incoming_striker_id', '')::uuid,
      fielder_id = nullif(v_patch->>'fielder_id', '')::uuid,
      fielder_assist_id = nullif(v_patch->>'fielder_assist_id', '')::uuid
    where id = (v_patch->>'id')::uuid;

    if not found then
      raise exception 'STALE';
    end if;
  end loop;

  for v_patch in
    select value from jsonb_array_elements(coalesce(p_innings_patches, '[]'::jsonb))
  loop
    update public.innings set
      runs = coalesce((v_patch->>'runs')::int, runs),
      wickets = coalesce((v_patch->>'wickets')::int, wickets),
      balls_legal = coalesce((v_patch->>'balls_legal')::int, balls_legal),
      current_striker_id = nullif(v_patch->>'current_striker_id', '')::uuid,
      current_non_striker_id = nullif(v_patch->>'current_non_striker_id', '')::uuid,
      current_bowler_id = nullif(v_patch->>'current_bowler_id', '')::uuid
    where id = (v_patch->>'id')::uuid;
  end loop;

  if p_update_result then
    update public.matches set
      winner_side = p_winner_side,
      result_summary = p_result_summary,
      edit_history = v_history || jsonb_build_array(p_history_entry)
    where id = p_match_id;
  else
    update public.matches set
      edit_history = v_history || jsonb_build_array(p_history_entry)
    where id = p_match_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.apply_match_edit(
  uuid, timestamptz, jsonb, jsonb, jsonb, text, text, boolean, jsonb
) from public;

revoke all on function public.apply_match_edit(
  uuid, timestamptz, jsonb, jsonb, jsonb, text, text, boolean, jsonb
) from anon;

revoke all on function public.apply_match_edit(
  uuid, timestamptz, jsonb, jsonb, jsonb, text, text, boolean, jsonb
) from authenticated;

grant execute on function public.apply_match_edit(
  uuid, timestamptz, jsonb, jsonb, jsonb, text, text, boolean, jsonb
) to service_role;
