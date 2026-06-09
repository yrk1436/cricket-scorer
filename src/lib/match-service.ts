import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  awaitingNewOverBowler,
  currentOverProgress,
  firstBattingSide,
  lastBowlingDelivery,
  mustChangeBowlerForDelivery,
  opposite,
  replayInnings,
  summarizeResult,
} from "@/lib/game";
import { isEditUnlockedForMatch } from "@/lib/edit-unlock";
import type {
  DbDelivery,
  DbInnings,
  DbMatch,
  DbPlayer,
  DismissalType,
  MatchBundle,
  MatchStatus,
  TeamSide,
  TossChoice,
} from "@/lib/types";
import bcrypt from "bcryptjs";

function sb() {
  return createSupabaseAdmin();
}

export async function getMatchByPublicId(
  publicId: string,
): Promise<DbMatch | null> {
  const { data, error } = await sb()
    .from("matches")
    .select("*")
    .eq("public_id", publicId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as DbMatch | null;
}

export async function getMatchByWriteToken(
  writeToken: string,
): Promise<DbMatch | null> {
  const { data, error } = await sb()
    .from("matches")
    .select("*")
    .eq("write_token", writeToken)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as DbMatch | null;
}

export async function getMatchById(id: string): Promise<DbMatch | null> {
  const { data, error } = await sb()
    .from("matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as DbMatch | null;
}

export async function fetchBundle(match: DbMatch): Promise<MatchBundle> {
  const client = sb();
  const { data: players, error: e1 } = await client
    .from("players")
    .select("*")
    .eq("match_id", match.id)
    .order("sort_order");

  const { data: innings, error: e2 } = await client
    .from("innings")
    .select("*")
    .eq("match_id", match.id)
    .order("index_num");

  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const pList = (players ?? []) as DbPlayer[];
  const iList = (innings ?? []) as DbInnings[];

  const deliveriesByInningsId: Record<string, DbDelivery[]> = {};
  for (const inn of iList) {
    const { data: dels, error: e3 } = await client
      .from("deliveries")
      .select("*")
      .eq("innings_id", inn.id)
      .order("display_order");

    if (e3) throw new Error(e3.message);
    deliveriesByInningsId[inn.id] = (dels ?? []) as DbDelivery[];
  }

  return {
    match,
    players: pList,
    innings: iList,
    deliveriesByInningsId,
  };
}

function lastInningsByIndex(bundle: MatchBundle): DbInnings | null {
  if (bundle.innings.length === 0) return null;
  return [...bundle.innings].sort((a, b) => b.index_num - a.index_num)[0] ?? null;
}

function findLastDeliveryGlobal(bundle: MatchBundle): {
  inn: DbInnings;
  del: DbDelivery;
} | null {
  const inns = [...bundle.innings].sort((a, b) => b.index_num - a.index_num);
  for (const inn of inns) {
    const dels = bundle.deliveriesByInningsId[inn.id] ?? [];
    if (dels.length === 0) continue;
    const last = dels.reduce((a, b) =>
      a.display_order > b.display_order ? a : b,
    );
    return { inn, del: last };
  }
  return null;
}

async function recomputeAllInningsAndSummary(matchId: string) {
  const m = await getMatchById(matchId);
  if (!m || m.status !== "completed") return;

  let bundle = await fetchBundle(m);
  for (const inn of bundle.innings) {
    const dels = bundle.deliveriesByInningsId[inn.id] ?? [];
    await persistInningsState(inn, bundle.players, dels, m.max_balls_per_over ?? 0);
  }

  bundle = await fetchBundle(m);

  const inningsLike = [...bundle.innings]
    .sort((a, b) => a.index_num - b.index_num)
    .map((i) => ({
      batting_side: i.batting_side as TeamSide,
      runs: i.runs,
      wickets: i.wickets,
      completed: i.completed,
    }));

  const { winnerSide, summary } = summarizeResult({
    teamAName: m.team_a_name,
    teamBName: m.team_b_name,
    innings: inningsLike,
    inningsCount: m.innings_count,
  });

  const { error } = await sb()
    .from("matches")
    .update({ winner_side: winnerSide, result_summary: summary })
    .eq("id", matchId);

  if (error) throw new Error(error.message);
}

export async function persistInningsState(
  inn: DbInnings,
  allPlayers: DbPlayer[],
  deliveries: DbDelivery[],
  maxBallsPerOver = 0,
) {
  const strikeSeed =
    deliveries.length === 0 &&
    inn.current_striker_id &&
    inn.current_non_striker_id
      ? {
          strikerId: inn.current_striker_id,
          nonStrikerId: inn.current_non_striker_id,
        }
      : null;

  const sim = replayInnings(
    inn.batting_side as TeamSide,
    allPlayers,
    deliveries,
    strikeSeed,
    maxBallsPerOver,
  );
  if (!sim) throw new Error("Cannot replay innings");

  const lb = lastBowlingDelivery(deliveries);
  const bowlerOut = lb?.bowler_id ?? inn.current_bowler_id ?? null;

  const client = sb();
  const { error } = await client
    .from("innings")
    .update({
      runs: sim.runs,
      wickets: sim.wickets,
      balls_legal: sim.balls_legal,
      current_striker_id: sim.strikerId,
      current_non_striker_id: sim.nonStrikerId,
      current_bowler_id: bowlerOut,
    })
    .eq("id", inn.id);

  if (error) throw new Error(error.message);
}

export async function setOpeningLineup(
  writeToken: string,
  payload: {
    strikerId: string;
    nonStrikerId: string;
    bowlerId: string;
  },
  unlockCookie?: string,
) {
  const m = await getMatchByWriteToken(writeToken);
  if (!m) throw new Error("Match not found");

  if (m.status === "completed" && !isEditUnlockedForMatch(unlockCookie, m.id)) {
    throw new Error("PIN required to edit a completed match");
  }

  const bundle = await fetchBundle(m);
  const inn =
    m.status === "completed"
      ? lastInningsByIndex(bundle)
      : await getActiveInnings(m, bundle.innings);

  if (!inn) throw new Error("No innings");

  const dels = bundle.deliveriesByInningsId[inn.id] ?? [];
  if (dels.length > 0) {
    throw new Error("Opening lineup can only be set before the first ball");
  }

  const bat = inn.batting_side as TeamSide;
  const bowl = opposite(bat);
  const s = bundle.players.find((p) => p.id === payload.strikerId);
  const n = bundle.players.find((p) => p.id === payload.nonStrikerId);
  const b = bundle.players.find((p) => p.id === payload.bowlerId);

  const ids = new Set([payload.strikerId, payload.nonStrikerId, payload.bowlerId]);
  if (ids.size < 3) throw new Error("Striker, non-striker, and bowler must be different");

  if (!s || s.side !== bat) throw new Error("Striker must be on the batting team");
  if (!n || n.side !== bat) throw new Error("Non-striker must be on the batting team");
  if (!b || b.side !== bowl) throw new Error("Bowler must be on the bowling team");

  const { error } = await sb()
    .from("innings")
    .update({
      current_striker_id: payload.strikerId,
      current_non_striker_id: payload.nonStrikerId,
      current_bowler_id: payload.bowlerId,
    })
    .eq("id", inn.id);

  if (error) throw new Error(error.message);

  const refreshed = await fetchBundle(m);
  const realDels = refreshed.deliveriesByInningsId[inn.id] ?? [];
  await persistInningsState(
    refreshed.innings.find((x) => x.id === inn.id)!,
    refreshed.players,
    realDels,
    m.max_balls_per_over ?? 0,
  );
}

export async function updateMatchSettings(
  writeToken: string,
  patch: UpdateMatchSettingsInput,
  unlockCookie?: string,
) {
  const m = await getMatchByWriteToken(writeToken);
  if (!m) throw new Error("Match not found");

  if (m.status === "completed" && !isEditUnlockedForMatch(unlockCookie, m.id)) {
    throw new Error("PIN required to edit a completed match");
  }

  const updates: Record<string, number> = {};
  if (patch.maxBallsPerOver !== undefined) {
    const v = Math.floor(patch.maxBallsPerOver);
    if (v < 0 || v > 30) throw new Error("Max balls per over must be 0–30 (0 = no cap)");
    updates.max_balls_per_over = v;
  }
  if (patch.oversPerInnings !== undefined) {
    const v = Math.floor(patch.oversPerInnings);
    if (v < 1 || v > 200) throw new Error("Overs per innings must be 1–200");
    if (m.status === "live") {
      const bundle = await fetchBundle(m);
      const active = await getActiveInnings(m, bundle.innings);
      if (active) {
        const dels = bundle.deliveriesByInningsId[active.id] ?? [];
        const sim = replayInnings(
          active.batting_side as TeamSide,
          bundle.players,
          dels,
          null,
          m.max_balls_per_over ?? 0,
        );
        const bowled = sim?.balls_legal ?? 0;
        const minOvers = Math.max(1, Math.ceil(bowled / 6));
        if (v < minOvers) {
          throw new Error(
            `Innings already at ${Math.floor(bowled / 6)}.${bowled % 6} overs — set at least ${minOvers} overs`,
          );
        }
      }
    }
    updates.overs_per_innings = v;
  }
  if (patch.maxWickets !== undefined) {
    const v = Math.floor(patch.maxWickets);
    if (v < 1 || v > 20) throw new Error("Max wickets must be 1–20");
    updates.max_wickets = v;
  }

  if (Object.keys(updates).length === 0) throw new Error("No settings to update");

  const { error } = await sb().from("matches").update(updates).eq("id", m.id);
  if (error) throw new Error(error.message);
}

export async function verifyPin(pin: string, pinHash: string) {
  return bcrypt.compare(pin, pinHash);
}

export type CreateMatchInput = {
  teamAName: string;
  teamBName: string;
  oversPerInnings: number;
  maxBallsPerOver?: number;
  maxWickets: number;
  inningsCount: 1 | 2;
  tossWinner: TeamSide;
  tossElect: TossChoice;
  pin: string;
  pinConfirm: string;
  squadA: string[];
  squadB: string[];
};

export type UpdateMatchSettingsInput = {
  maxBallsPerOver?: number;
  oversPerInnings?: number;
  maxWickets?: number;
};

export async function createMatch(input: CreateMatchInput) {
  if (input.pin.length < 4) throw new Error("PIN must be at least 4 characters");
  if (input.pin !== input.pinConfirm) throw new Error("PIN confirmation does not match");

  const writeToken = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString(
    "base64url",
  );
  const pinHash = await bcrypt.hash(input.pin, 10);

  const client = sb();
  const { data: match, error: mErr } = await client
    .from("matches")
    .insert({
      write_token: writeToken,
      pin_hash: pinHash,
      status: "live" as MatchStatus,
      team_a_name: input.teamAName.trim(),
      team_b_name: input.teamBName.trim(),
      overs_per_innings: input.oversPerInnings,
      max_balls_per_over: Math.max(0, input.maxBallsPerOver ?? 0),
      max_wickets: input.maxWickets,
      innings_count: input.inningsCount,
      toss_winner: input.tossWinner,
      toss_elect: input.tossElect,
      current_innings_index: 1,
    })
    .select("*")
    .single();

  if (mErr) throw new Error(mErr.message);
  const m = match as DbMatch;

  const squadA = input.squadA.map((n) => n.trim()).filter(Boolean);
  const squadB = input.squadB.map((n) => n.trim()).filter(Boolean);
  if (squadA.length === 0 || squadB.length === 0)
    throw new Error("Each team needs at least one player");

  const playersRows: Omit<DbPlayer, "id">[] = [
    ...squadA.map((display_name, i) => ({
      match_id: m.id,
      side: "a" as const,
      display_name,
      sort_order: i,
      did_not_bat: false,
    })),
    ...squadB.map((display_name, i) => ({
      match_id: m.id,
      side: "b" as const,
      display_name,
      sort_order: i,
      did_not_bat: false,
    })),
  ];

  const { error: pErr } = await client.from("players").insert(playersRows);
  if (pErr) throw new Error(pErr.message);

  const firstBat = firstBattingSide(m.toss_winner, m.toss_elect);
  const { data: playerRows } = await client
    .from("players")
    .select("*")
    .eq("match_id", m.id);

  const allP = (playerRows ?? []) as DbPlayer[];
  const batList = allP
    .filter((p) => p.side === firstBat && !p.did_not_bat)
    .sort((a, b) => a.sort_order - b.sort_order);

  const s1 = batList[0]?.id;
  const s2 = batList[1]?.id ?? s1;

  const { error: iErr } = await client.from("innings").insert({
    match_id: m.id,
    index_num: 1,
    batting_side: firstBat,
    runs: 0,
    wickets: 0,
    balls_legal: 0,
    completed: false,
    current_striker_id: s1 ?? null,
    current_non_striker_id: s2 ?? null,
  });

  if (iErr) throw new Error(iErr.message);

  return { match: m, writeToken: m.write_token, publicId: m.public_id };
}

export async function getActiveInnings(
  match: DbMatch,
  inningsList: DbInnings[],
): Promise<DbInnings | null> {
  const idx = match.current_innings_index;
  return inningsList.find((i) => i.index_num === idx && !i.completed) ?? null;
}

export type DeliveryInput = {
  runsOffBat: number;
  extraWide: number;
  extraNb: number;
  extraByes: number;
  extraLegByes?: number;
  countsAsLegalDelivery: boolean;
  isWicket: boolean;
  dismissal: DismissalType;
  note?: string;
  bowlerId?: string;
  strikeSwap?: boolean;
  /** Batter who walks in at the vacated end (not required for retired hurt). */
  incomingStrikerId?: string;
  /** Who was dismissed (defaults to striker at delivery). */
  dismissedBatsmanId?: string;
  fielderId?: string;
  fielderAssistId?: string;
};

export async function appendDelivery(
  writeToken: string,
  body: DeliveryInput,
  unlockCookie?: string,
) {
  const m = await getMatchByWriteToken(writeToken);
  if (!m) throw new Error("Match not found");

  const bundle = await fetchBundle(m);
  let target: DbInnings | null = null;

  if (m.status === "completed") {
    if (!isEditUnlockedForMatch(unlockCookie, m.id)) {
      throw new Error("PIN required to edit a completed match");
    }
    target = lastInningsByIndex(bundle);
  } else {
    target = await getActiveInnings(m, bundle.innings);
  }

  if (!target) {
    throw new Error(
      m.status === "completed"
        ? "No innings to edit"
        : "No active innings — close innings or complete match",
    );
  }

  const dels = bundle.deliveriesByInningsId[target.id] ?? [];
  const strikeSeed =
    dels.length === 0 &&
    target.current_striker_id &&
    target.current_non_striker_id
      ? {
          strikerId: target.current_striker_id,
          nonStrikerId: target.current_non_striker_id,
        }
      : null;

  const maxOver = m.max_balls_per_over ?? 0;
  const overProg = currentOverProgress(dels, maxOver);

  const sim = replayInnings(
    target.batting_side as TeamSide,
    bundle.players,
    dels,
    strikeSeed,
    maxOver,
  );
  if (!sim) throw new Error("Bad state");

  if (target.current_bowler_id == null && !body.strikeSwap) {
    throw new Error(
      "Set striker, non-striker, and bowler with “Start innings” before scoring",
    );
  }

  const maxBalls = m.overs_per_innings * 6;
  if (body.countsAsLegalDelivery && sim.balls_legal >= maxBalls) {
    throw new Error("Innings overs complete — close this innings");
  }

  const wf = body.isWicket && body.dismissal !== "retired_hurt";
  if (wf && sim.wickets >= m.max_wickets) {
    throw new Error("All out — close this innings");
  }

  const bowlingSide = opposite(target.batting_side as TeamSide);
  let bowlerIdInsert: string | null = null;

  if (!body.strikeSwap) {
    const bid = body.bowlerId;
    if (!bid) throw new Error("Bowler is required");

    const bowlerPlayer = bundle.players.find((p) => p.id === bid);
    if (!bowlerPlayer || bowlerPlayer.side !== bowlingSide)
      throw new Error("Invalid bowler");

    const lastBall = lastBowlingDelivery(dels);

    if (mustChangeBowlerForDelivery(dels, sim.balls_legal, bid, maxOver)) {
      throw new Error(
        "Pick a different bowler for the new over — the previous over’s bowler cannot continue",
      );
    }

    const inProgressOver = !awaitingNewOverBowler(dels, sim.balls_legal, maxOver);
    if (
      inProgressOver &&
      overProg.legalBalls > 0 &&
      lastBall?.bowler_id &&
      lastBall.bowler_id !== bid
    ) {
      throw new Error(
        "Same bowler bowls the whole over — pick this bowler until the over ends",
      );
    }

    if (
      maxOver > 0 &&
      overProg.totalBalls >= maxOver &&
      overProg.legalBalls < 6
    ) {
      throw new Error(
        "Over ball limit reached — choose the bowler for the next over",
      );
    }

    bowlerIdInsert = bid;
  }

  let incomingInsert: string | null = null;
  let dismissedInsert: string | null = null;
  let fielderInsert: string | null = null;
  let fielderAssistInsert: string | null = null;

  if (!body.strikeSwap && body.isWicket) {
    const batSide = target.batting_side as TeamSide;
    const bowlSide = opposite(batSide);

    dismissedInsert = body.dismissedBatsmanId ?? sim.strikerId;
    const outP = bundle.players.find((p) => p.id === dismissedInsert);
    if (!outP || outP.side !== batSide) {
      throw new Error("Dismissed player must be on the batting team");
    }
    if (dismissedInsert !== sim.strikerId && dismissedInsert !== sim.nonStrikerId) {
      throw new Error("Dismissed player must be the striker or non-striker");
    }

    const needsFielder =
      body.dismissal === "caught" ||
      body.dismissal === "stumped" ||
      body.dismissal === "run_out";
    if (needsFielder) {
      const fid = body.fielderId;
      if (!fid) throw new Error("Choose a fielder for this dismissal");
      const fp = bundle.players.find((p) => p.id === fid);
      if (!fp || fp.side !== bowlSide) throw new Error("Fielder must be on the bowling team");
      fielderInsert = fid;
    }

    if (body.fielderAssistId) {
      const aid = body.fielderAssistId;
      const ap = bundle.players.find((p) => p.id === aid);
      if (!ap || ap.side !== bowlSide) throw new Error("Assist fielder must be on the bowling team");
      if (aid === fielderInsert) throw new Error("Assist fielder must differ from primary fielder");
      fielderAssistInsert = aid;
    }

    const inc = body.incomingStrikerId;
    if (!inc) {
      throw new Error(
        body.dismissal === "retired_hurt"
          ? "Choose who replaces the retired-not-out batter at the crease"
          : "Choose who comes in after the wicket",
      );
    }
    const incP = bundle.players.find((p) => p.id === inc);
    if (!incP || incP.side !== batSide || incP.did_not_bat) {
      throw new Error("Incoming batter must be on the batting team and not marked DNB");
    }
    if (inc === sim.strikerId || inc === sim.nonStrikerId) {
      throw new Error("Incoming batter cannot already be at the crease");
    }
    if (sim.dismissedIds.has(inc)) {
      throw new Error("That player is already out");
    }
    if (inc === dismissedInsert) {
      throw new Error("Incoming batter cannot be the player leaving the crease");
    }
    incomingInsert = inc;
  }

  const nextOrder =
    dels.length === 0 ? 1 : Math.max(...dels.map((d) => d.display_order)) + 1;

  const row = body.strikeSwap
    ? {
        innings_id: target.id,
        display_order: nextOrder,
        striker_id: sim.strikerId,
        non_striker_id: sim.nonStrikerId,
        bowler_id: null,
        incoming_striker_id: null as string | null,
        is_strike_swap: true,
        runs_off_bat: 0,
        extra_wide: 0,
        extra_nb: 0,
        extra_byes: 0,
        extra_leg_byes: 0,
        dismissed_batsman_id: null as string | null,
        fielder_id: null as string | null,
        fielder_assist_id: null as string | null,
        counts_as_legal_delivery: false,
        is_wicket: false,
        dismissal: "none" as DismissalType,
        note: null as string | null,
      }
    : {
        innings_id: target.id,
        display_order: nextOrder,
        striker_id: sim.strikerId,
        non_striker_id: sim.nonStrikerId,
        bowler_id: bowlerIdInsert,
        incoming_striker_id: incomingInsert,
        is_strike_swap: false,
        runs_off_bat: body.runsOffBat,
        extra_wide: body.extraWide,
        extra_nb: body.extraNb,
        extra_byes: body.extraByes,
        extra_leg_byes: body.extraLegByes ?? 0,
        dismissed_batsman_id: dismissedInsert,
        fielder_id: fielderInsert,
        fielder_assist_id: fielderAssistInsert,
        counts_as_legal_delivery: body.countsAsLegalDelivery,
        is_wicket: body.isWicket,
        dismissal: body.dismissal,
        note: body.note ?? null,
      };

  const { error } = await sb().from("deliveries").insert(row);
  if (error) throw new Error(error.message);

  const refreshed = await fetchBundle(m);
  const freshInnings = refreshed.innings.find((i) => i.id === target.id);
  const realDels = refreshed.deliveriesByInningsId[target.id] ?? [];

  await persistInningsState(
    freshInnings ?? target,
    refreshed.players,
    realDels,
    maxOver,
  );

  if (m.status === "completed") {
    await recomputeAllInningsAndSummary(m.id);
  }
}

export async function undoLastDelivery(writeToken: string, unlockCookie?: string) {
  const m = await getMatchByWriteToken(writeToken);
  if (!m) throw new Error("Match not found");

  const bundle = await fetchBundle(m);
  let inn: DbInnings;
  let last: DbDelivery;

  if (m.status === "completed") {
    if (!isEditUnlockedForMatch(unlockCookie, m.id)) {
      throw new Error("PIN required to edit a completed match");
    }
    const hit = findLastDeliveryGlobal(bundle);
    if (!hit) throw new Error("Nothing to undo");
    inn = hit.inn;
    last = hit.del;
  } else {
    const active = await getActiveInnings(m, bundle.innings);
    if (!active) throw new Error("No innings");
    const dels = bundle.deliveriesByInningsId[active.id] ?? [];
    if (dels.length === 0) throw new Error("Nothing to undo");
    last = dels.reduce((a, b) => (a.display_order > b.display_order ? a : b));
    inn = active;
  }

  const { error } = await sb().from("deliveries").delete().eq("id", last.id);
  if (error) throw new Error(error.message);

  const refreshed = await fetchBundle(m);
  const realDels = refreshed.deliveriesByInningsId[inn.id] ?? [];
  await persistInningsState(inn, refreshed.players, realDels, m.max_balls_per_over ?? 0);

  if (m.status === "completed") {
    await recomputeAllInningsAndSummary(m.id);
  }
}

export async function updatePlayer(
  writeToken: string,
  playerId: string,
  patch: { display_name?: string; did_not_bat?: boolean },
  unlockCookie?: string,
) {
  const m = await getMatchByWriteToken(writeToken);
  if (!m) throw new Error("Match not found");

  if (m.status === "completed" && !isEditUnlockedForMatch(unlockCookie, m.id)) {
    throw new Error("PIN required to edit a completed match");
  }

  const { error } = await sb()
    .from("players")
    .update({
      ...(patch.display_name !== undefined
        ? { display_name: patch.display_name.trim() }
        : {}),
      ...(patch.did_not_bat !== undefined ? { did_not_bat: patch.did_not_bat } : {}),
    })
    .eq("id", playerId)
    .eq("match_id", m.id);

  if (error) throw new Error(error.message);

  /* Reconcile active innings striker if renamed — replay handles totals */
  const bundle = await fetchBundle(m);
  for (const inn of bundle.innings) {
    const dlist = bundle.deliveriesByInningsId[inn.id] ?? [];
    await persistInningsState(inn, bundle.players, dlist, m.max_balls_per_over ?? 0);
  }

  if (m.status === "completed") {
    await recomputeAllInningsAndSummary(m.id);
  }
}

export async function closeCurrentInnings(writeToken: string) {
  const m = await getMatchByWriteToken(writeToken);
  if (!m) throw new Error("Match not found");

  if (m.status === "completed") {
    throw new Error("Match already complete — use PIN unlock only for ball/player fixes");
  }

  const bundle = await fetchBundle(m);
  const active =
    bundle.innings.find(
      (i) => i.index_num === m.current_innings_index && !i.completed,
    ) ?? null;

  if (!active) throw new Error("No open innings");

  const client = sb();
  const { error } = await client
    .from("innings")
    .update({ completed: true })
    .eq("id", active.id);

  if (error) throw new Error(error.message);

  if (m.innings_count === 2 && m.current_innings_index === 1) {
    const nextBatting = opposite(active.batting_side as TeamSide);

    const { data: plist } = await client
      .from("players")
      .select("*")
      .eq("match_id", m.id);

    const allP = (plist ?? []) as DbPlayer[];
    const lineup = allP
      .filter((p) => p.side === nextBatting && !p.did_not_bat)
      .sort((a, b) => a.sort_order - b.sort_order);

    const ns1 = lineup[0]?.id;
    const ns2 = lineup[1]?.id ?? ns1;

    const { error: i2e } = await client.from("innings").insert({
      match_id: m.id,
      index_num: 2,
      batting_side: nextBatting,
      runs: 0,
      wickets: 0,
      balls_legal: 0,
      completed: false,
      current_striker_id: ns1 ?? null,
      current_non_striker_id: ns2 ?? null,
    });

    if (i2e) throw new Error(i2e.message);

    const { error: u2 } = await client
      .from("matches")
      .update({ current_innings_index: 2 })
      .eq("id", m.id);

    if (u2) throw new Error(u2.message);
    return { closed: active.index_num, next: 2 };
  }

  /* Single-innings tournament or second closed */
  return { closed: active.index_num, next: null as number | null };
}

export async function completeMatch(writeToken: string) {
  const m = await getMatchByWriteToken(writeToken);
  if (!m) throw new Error("Match not found");

  if (m.status === "completed") return;

  const bundle = await fetchBundle(m);
  const completedAll =
    bundle.innings.length >= m.innings_count &&
    bundle.innings.every((i) => i.completed);

  if (!completedAll) {
    throw new Error("Finish or close all innings before completing match");
  }

  const inningsLike = bundle.innings
    .sort((a, b) => a.index_num - b.index_num)
    .map((i) => ({
      batting_side: i.batting_side as TeamSide,
      runs: i.runs,
      wickets: i.wickets,
      completed: i.completed,
    }));

  const { winnerSide, summary } = summarizeResult({
    teamAName: m.team_a_name,
    teamBName: m.team_b_name,
    innings: inningsLike,
    inningsCount: m.innings_count,
  });

  const { error } = await sb()
    .from("matches")
    .update({
      status: "completed",
      winner_side: winnerSide,
      result_summary: summary,
    })
    .eq("id", m.id);

  if (error) throw new Error(error.message);
}

/** Public helpers — server-only */

export function needsPinForWrites(
  match: DbMatch,
  unlockCookie: string | undefined,
): boolean {
  if (match.status !== "completed") return false;
  return !isEditUnlockedForMatch(unlockCookie, match.id);
}
