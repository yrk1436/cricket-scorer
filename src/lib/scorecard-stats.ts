import {
  ballsToOvers,
  eligibleBatters,
  runRate,
  totalRunsOnDelivery,
  wicketIncreasesCount,
} from "@/lib/game";
import type { DbDelivery, DbPlayer, DismissalType, TeamSide } from "@/lib/types";

export type BattingRow = {
  playerId: string;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  out: boolean;
  dismissal: string;
  didNotBat: boolean;
};

export type BowlingRow = {
  playerId: string;
  name: string;
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
};

export type FallOfWicket = {
  wicket: number;
  score: number;
  batsmanName: string;
  over: string;
};

export type ExtrasBreakdown = {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  total: number;
};

export type InningsScorecard = {
  batting: BattingRow[];
  bowling: BowlingRow[];
  fallOfWickets: FallOfWicket[];
  extras: ExtrasBreakdown;
};

function bowlerGetsWicket(dismissal: DismissalType): boolean {
  return (
    dismissal === "bowled" ||
    dismissal === "caught" ||
    dismissal === "lbw" ||
    dismissal === "hit_wicket" ||
    dismissal === "stumped"
  );
}

function formatDismissal(
  d: DbDelivery,
  name: (id: string | null | undefined) => string,
): string {
  const bowler = d.bowler_id ? name(d.bowler_id) : null;
  const fielder = d.fielder_id ? name(d.fielder_id) : null;
  const assist = d.fielder_assist_id ? name(d.fielder_assist_id) : null;

  switch (d.dismissal) {
    case "bowled":
      return bowler ? `b ${bowler}` : "bowled";
    case "caught":
      return fielder && bowler
        ? `c ${fielder} b ${bowler}`
        : bowler
          ? `c & b ${bowler}`
          : "caught";
    case "lbw":
      return bowler ? `lbw b ${bowler}` : "lbw";
    case "stumped":
      return fielder && bowler
        ? `st ${fielder} b ${bowler}`
        : "stumped";
    case "hit_wicket":
      return bowler ? `hit wicket b ${bowler}` : "hit wicket";
    case "run_out":
      if (fielder && assist) return `run out (${fielder}/${assist})`;
      if (fielder) return `run out (${fielder})`;
      return "run out";
    case "retired_hurt":
      return "retired not out";
    case "retired_out":
      return "retired out";
    case "other":
      return "out";
    default:
      return bowler ? `out b ${bowler}` : "out";
  }
}

function sortedDeliveries(deliveries: DbDelivery[]): DbDelivery[] {
  return [...deliveries]
    .filter((d) => !d.is_strike_swap)
    .sort((a, b) => a.display_order - b.display_order);
}

function computeExtras(deliveries: DbDelivery[]): ExtrasBreakdown {
  let wides = 0;
  let noBalls = 0;
  let byes = 0;
  let legByes = 0;

  for (const d of deliveries) {
    wides += d.extra_wide;
    noBalls += d.extra_nb;
    byes += d.extra_byes;
    legByes += d.extra_leg_byes ?? 0;
  }

  return { wides, noBalls, byes, legByes, total: wides + noBalls + byes + legByes };
}

function computeBatting(
  deliveries: DbDelivery[],
  battingSide: TeamSide,
  players: DbPlayer[],
  name: (id: string | null | undefined) => string,
): BattingRow[] {
  const lineup = eligibleBatters(battingSide, players);
  const sorted = sortedDeliveries(deliveries);

  type Acc = {
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    out: boolean;
    dismissal: string;
    batted: boolean;
    order: number;
  };

  const acc = new Map<string, Acc>();
  for (const p of lineup) {
    acc.set(p.id, {
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false,
      dismissal: "did not bat",
      batted: false,
      order: p.sort_order,
    });
  }

  let orderCounter = 0;

  const markBatted = (id: string) => {
    const a = acc.get(id);
    if (!a) return;
    if (!a.batted) {
      a.batted = true;
      a.order = orderCounter++;
    }
  };

  if (sorted.length > 0) {
    if (sorted[0].striker_id) markBatted(sorted[0].striker_id);
    if (sorted[0].non_striker_id) markBatted(sorted[0].non_striker_id);
  }

  for (const d of sorted) {
    const onStrike = d.striker_id;
    if (!onStrike) continue;

    markBatted(onStrike);
    if (d.non_striker_id) markBatted(d.non_striker_id);
    if (d.incoming_striker_id) markBatted(d.incoming_striker_id);

    if (d.counts_as_legal_delivery) {
      const a = acc.get(onStrike)!;
      a.runs += d.runs_off_bat;
      a.balls += 1;
      if (d.runs_off_bat === 4) a.fours += 1;
      if (d.runs_off_bat === 6) a.sixes += 1;
    } else if (d.extra_nb > 0) {
      const a = acc.get(onStrike)!;
      a.runs += d.runs_off_bat;
      a.balls += 1;
      if (d.runs_off_bat === 4) a.fours += 1;
      if (d.runs_off_bat === 6) a.sixes += 1;
    }

    if (d.is_wicket) {
      const outId = d.dismissed_batsman_id ?? onStrike;
      markBatted(outId);
      const a = acc.get(outId);
      if (a) {
        if (d.dismissal === "retired_hurt") {
          a.dismissal = "retired not out";
        } else {
          a.out = true;
          a.dismissal = formatDismissal(d, name);
        }
      }
    }
  }

  const rows: BattingRow[] = [];
  for (const p of lineup) {
    const a = acc.get(p.id)!;
    const sr = a.balls > 0 ? (a.runs / a.balls) * 100 : 0;
    rows.push({
      playerId: p.id,
      name: p.display_name,
      runs: a.runs,
      balls: a.balls,
      fours: a.fours,
      sixes: a.sixes,
      strikeRate: sr,
      out: a.out,
      dismissal: a.batted ? (a.out ? a.dismissal : "not out") : "did not bat",
      didNotBat: !a.batted,
    });
  }

  rows.sort((a, b) => {
    const ao = acc.get(a.playerId)?.order ?? 999;
    const bo = acc.get(b.playerId)?.order ?? 999;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

function computeBowling(
  deliveries: DbDelivery[],
  bowlingSide: TeamSide,
  players: DbPlayer[],
  name: (id: string | null | undefined) => string,
): BowlingRow[] {
  const sorted = sortedDeliveries(deliveries);

  type Acc = {
    legalBalls: number;
    runs: number;
    wickets: number;
    maidens: number;
    legalInOver: number;
    overRuns: number;
  };

  const acc = new Map<string, Acc>();

  for (const d of sorted) {
    if (!d.bowler_id) continue;
    const b = players.find((p) => p.id === d.bowler_id);
    if (!b || b.side !== bowlingSide) continue;

    if (!acc.has(d.bowler_id)) {
      acc.set(d.bowler_id, {
        legalBalls: 0,
        runs: 0,
        wickets: 0,
        maidens: 0,
        legalInOver: 0,
        overRuns: 0,
      });
    }

    const a = acc.get(d.bowler_id)!;
    const bowlerRuns = d.runs_off_bat + d.extra_wide + d.extra_nb;
    a.runs += bowlerRuns;
    a.overRuns += bowlerRuns;

    if (d.counts_as_legal_delivery) {
      a.legalBalls += 1;
      a.legalInOver += 1;
      if (a.legalInOver >= 6) {
        if (a.overRuns === 0) a.maidens += 1;
        a.legalInOver = 0;
        a.overRuns = 0;
      }
    }

    if (
      d.is_wicket &&
      wicketIncreasesCount(true, d.dismissal) &&
      bowlerGetsWicket(d.dismissal)
    ) {
      a.wickets += 1;
    }
  }

  const rows: BowlingRow[] = [];
  for (const [id, a] of acc) {
    const p = players.find((pl) => pl.id === id);
    if (!p) continue;
    rows.push({
      playerId: id,
      name: p.display_name,
      overs: ballsToOvers(a.legalBalls),
      maidens: a.maidens,
      runs: a.runs,
      wickets: a.wickets,
      economy: runRate(a.runs, a.legalBalls),
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

function computeFallOfWickets(
  deliveries: DbDelivery[],
  name: (id: string | null | undefined) => string,
): FallOfWicket[] {
  const sorted = sortedDeliveries(deliveries);
  let runs = 0;
  let wickets = 0;
  let ballsLegal = 0;
  const fow: FallOfWicket[] = [];

  for (const d of sorted) {
    runs += totalRunsOnDelivery(d);
    if (d.counts_as_legal_delivery) ballsLegal += 1;

    if (d.is_wicket && wicketIncreasesCount(true, d.dismissal)) {
      wickets += 1;
      const outId = d.dismissed_batsman_id ?? d.striker_id;
      fow.push({
        wicket: wickets,
        score: runs,
        batsmanName: name(outId),
        over: ballsToOvers(ballsLegal),
      });
    }
  }

  return fow;
}

export function computeInningsScorecard(params: {
  deliveries: DbDelivery[];
  battingSide: TeamSide;
  bowlingSide: TeamSide;
  players: DbPlayer[];
  name: (id: string | null | undefined) => string;
}): InningsScorecard {
  const { deliveries, battingSide, bowlingSide, players, name } = params;
  const dels = sortedDeliveries(deliveries);

  return {
    batting: computeBatting(dels, battingSide, players, name),
    bowling: computeBowling(dels, bowlingSide, players, name),
    fallOfWickets: computeFallOfWickets(dels, name),
    extras: computeExtras(dels),
  };
}

export function formatExtrasLine(extras: ExtrasBreakdown): string {
  const parts: string[] = [];
  if (extras.byes) parts.push(`b ${extras.byes}`);
  if (extras.legByes) parts.push(`lb ${extras.legByes}`);
  if (extras.wides) parts.push(`w ${extras.wides}`);
  if (extras.noBalls) parts.push(`nb ${extras.noBalls}`);
  return parts.length ? parts.join(", ") : "—";
}

export function formatFallOfWickets(fow: FallOfWicket[]): string {
  if (fow.length === 0) return "—";
  return fow
    .map((w) => `${w.score}-${w.wicket} (${w.batsmanName}, ${w.over} ov)`)
    .join(" · ");
}
