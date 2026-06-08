import type {
  DbDelivery,
  DbPlayer,
  DismissalType,
  TeamSide,
  TossChoice,
} from "@/lib/types";

export type SimState = {
  runs: number;
  wickets: number;
  balls_legal: number;
  strikerId: string;
  nonStrikerId: string;
  dismissedIds: Set<string>;
};

export type ReplayStrikeSeed = {
  strikerId: string;
  nonStrikerId: string;
};

/** Runs scored from one delivery row (excluding wicket meta). */
export function totalRunsOnDelivery(d: DbDelivery): number {
  return (
    d.runs_off_bat +
    d.extra_wide +
    d.extra_nb +
    d.extra_byes +
    (d.extra_leg_byes ?? 0)
  );
}

function deliveryRotatesStrike(d: DbDelivery): boolean {
  if (d.is_strike_swap || d.is_wicket) return false;
  if (!d.counts_as_legal_delivery) {
    if (d.extra_nb > 0) return d.runs_off_bat % 2 === 1;
    if (d.extra_wide > 0) return d.extra_wide % 2 === 1;
    return false;
  }
  const offExtras = d.runs_off_bat + d.extra_byes + (d.extra_leg_byes ?? 0);
  return offExtras % 2 === 1;
}

/** Retired hurt does not add to wickets column */
export function wicketIncreasesCount(
  isWicket: boolean,
  dismissal: DismissalType,
): boolean {
  if (!isWicket) return false;
  return dismissal !== "retired_hurt";
}

function dismissalOptionRetires(dismissal: DismissalType): boolean {
  return dismissal === "retired_hurt" || dismissal === "retired_out";
}

export function eligibleBatters(side: TeamSide, players: DbPlayer[]) {
  return players
    .filter((p) => p.side === side && !p.did_not_bat)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function eligibleBowlers(side: TeamSide, players: DbPlayer[]) {
  return eligibleBatters(side, players);
}

function swap(a: string, b: string): [string, string] {
  return [b, a];
}

function nextBatId(
  lineup: DbPlayer[],
  dismissed: Set<string>,
  mustNotMatch: Set<string>,
): string | null {
  for (const p of lineup) {
    if (dismissed.has(p.id)) continue;
    if (mustNotMatch.has(p.id)) continue;
    return p.id;
  }
  return null;
}

/** Last bowler from a bowling delivery (skip strike swaps). */
export function lastBowlingDelivery(
  deliveries: DbDelivery[],
): DbDelivery | null {
  const sorted = [...deliveries].sort((a, b) => a.display_order - b.display_order);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const d = sorted[i];
    if (d.is_strike_swap) continue;
    return d;
  }
  return null;
}

/**
 * Rebuild aggregates from ball history.
 * Strike seed applies only when there are zero deliveries on this innings row.
 */
export function replayInnings(
  battingSide: TeamSide,
  allPlayers: DbPlayer[],
  deliveries: DbDelivery[],
  strikeSeed?: ReplayStrikeSeed | null,
): SimState | null {
  const lineup = eligibleBatters(battingSide, allPlayers);
  const sorted = [...deliveries].sort((a, b) => a.display_order - b.display_order);

  let strikerId: string;
  let nonStrikerId: string;

  if (sorted.length > 0 && sorted[0].striker_id) {
    strikerId = sorted[0].striker_id;
    nonStrikerId = sorted[0].non_striker_id ?? strikerId;
  } else if (strikeSeed?.strikerId && strikeSeed?.nonStrikerId) {
    strikerId = strikeSeed.strikerId;
    nonStrikerId = strikeSeed.nonStrikerId;
  } else {
    strikerId = lineup[0]?.id ?? "";
    nonStrikerId = lineup[1]?.id ?? strikerId;
  }
  if (!strikerId) return null;

  const dismissedIds = new Set<string>();

  let runs = 0;
  let wickets = 0;
  let ballsLegal = 0;

  for (const d of sorted) {
    if (d.is_strike_swap) {
      [strikerId, nonStrikerId] = swap(strikerId, nonStrikerId);
      continue;
    }

    runs += totalRunsOnDelivery(d);

    if (d.counts_as_legal_delivery) ballsLegal += 1;

    if (wicketIncreasesCount(d.is_wicket, d.dismissal)) wickets += 1;

    const endOver =
      d.counts_as_legal_delivery &&
      ballsLegal > 0 &&
      ballsLegal % 6 === 0;

    const outId =
      d.dismissed_batsman_id ?? d.striker_id ?? strikerId;

    if (d.is_wicket) {
      dismissedIds.add(outId);

      let next: string | null = null;
      const inc = d.incoming_striker_id;

      if (
        inc &&
        !dismissedIds.has(inc) &&
        inc !== strikerId &&
        inc !== nonStrikerId &&
        lineup.some((p) => p.id === inc)
      ) {
        next = inc;
      }
      if (next == null && !dismissalOptionRetires(d.dismissal)) {
        const vacatedEnd =
          outId === nonStrikerId ? "non_striker" : "striker";
        next = nextBatId(
          lineup,
          dismissedIds,
          new Set(
            vacatedEnd === "non_striker" ? [strikerId] : [nonStrikerId],
          ),
        );
      }

      if (outId === nonStrikerId) {
        nonStrikerId = next ?? strikerId;
        if (nonStrikerId === strikerId) {
          const pick = lineup.find(
            (p) => !dismissedIds.has(p.id) && p.id !== strikerId,
          );
          if (pick) nonStrikerId = pick.id;
        }
      } else {
        strikerId = next ?? nonStrikerId;
        if (next == null || strikerId === nonStrikerId) {
          const pick = lineup.find((p) => !dismissedIds.has(p.id));
          if (pick) strikerId = pick.id;
        }
      }

      if (endOver) [strikerId, nonStrikerId] = swap(strikerId, nonStrikerId);
      continue;
    }

    if (deliveryRotatesStrike(d))
      [strikerId, nonStrikerId] = swap(strikerId, nonStrikerId);

    if (endOver) [strikerId, nonStrikerId] = swap(strikerId, nonStrikerId);
  }

  return {
    runs,
    wickets,
    balls_legal: ballsLegal,
    strikerId,
    nonStrikerId,
    dismissedIds,
  };
}

export function firstBattingSide(
  tossWinner: TeamSide,
  elect: TossChoice,
): TeamSide {
  const wantsBat = elect === "bat";
  return tossWinner === "a" ? (wantsBat ? "a" : "b") : wantsBat ? "b" : "a";
}

export function opposite(side: TeamSide): TeamSide {
  return side === "a" ? "b" : "a";
}

export function ballsToOvers(balls: number): string {
  const o = Math.floor(balls / 6);
  const b = balls % 6;
  return `${o}.${b}`;
}

export function runRate(runs: number, ballsLegal: number): number {
  if (ballsLegal <= 0) return 0;
  return (runs / ballsLegal) * 6;
}

export type BatterStat = { runs: number; balls: number };

/** Runs off bat and legal balls faced while on strike. */
export function batterStats(
  deliveries: DbDelivery[],
  playerId: string | null | undefined,
): BatterStat {
  if (!playerId) return { runs: 0, balls: 0 };
  let runs = 0;
  let balls = 0;
  for (const d of deliveries) {
    if (d.is_strike_swap) continue;
    if (d.striker_id !== playerId) continue;
    if (d.counts_as_legal_delivery) balls += 1;
    runs += d.runs_off_bat;
  }
  return { runs, balls };
}

export type ChaseInfo = {
  target: number;
  need: number;
  ballsLeft: number;
  wicketsLeft: number;
  rrr: number;
  rr: number;
};

export function chaseInfo(params: {
  firstInningsRuns: number;
  currentRuns: number;
  currentWickets: number;
  currentBallsLegal: number;
  oversPerInnings: number;
  maxWickets: number;
}): ChaseInfo {
  const {
    firstInningsRuns,
    currentRuns,
    currentWickets,
    currentBallsLegal,
    oversPerInnings,
    maxWickets,
  } = params;
  const target = firstInningsRuns + 1;
  const need = Math.max(0, target - currentRuns);
  const maxBalls = oversPerInnings * 6;
  const ballsLeft = Math.max(0, maxBalls - currentBallsLegal);
  const wicketsLeft = Math.max(0, maxWickets - currentWickets);
  const rrr = ballsLeft > 0 ? (need / ballsLeft) * 6 : need > 0 ? Infinity : 0;
  const rr = runRate(currentRuns, currentBallsLegal);
  return { target, need, ballsLeft, wicketsLeft, rrr, rr };
}

export type InnLike = {
  batting_side: TeamSide;
  runs: number;
  wickets: number;
  completed: boolean;
};

export function summarizeResult(params: {
  teamAName: string;
  teamBName: string;
  innings: InnLike[];
  inningsCount: number;
}) {
  const { innings, teamAName, teamBName, inningsCount } = params;
  const nameOf = (s: TeamSide) => (s === "a" ? teamAName : teamBName);

  const in1 = innings[0];
  if (!in1)
    return { winnerSide: null as TeamSide | "tie" | null, summary: "No innings" };

  if (inningsCount === 1) {
    return {
      winnerSide: null,
      summary: `${nameOf(in1.batting_side)} ${in1.runs}/${in1.wickets}`,
    };
  }

  const in2 = innings[1];
  if (!in2?.completed) {
    return {
      winnerSide: null,
      summary: `${nameOf(in1.batting_side)} ${in1.runs}/${in1.wickets} — chasing`,
    };
  }

  const r1 = in1.runs;
  const chaseTarget = r1 + 1;
  const r2 = in2.runs;
  const chasing = in2.batting_side;
  const defender = opposite(chasing);

  if (r2 >= chaseTarget) {
    return {
      winnerSide: chasing,
      summary: `${nameOf(chasing)} won chasing (${r2}/${in2.wickets} vs ${r1})`,
    };
  }

  const margin = r1 - r2;
  return {
    winnerSide: defender,
    summary: `${nameOf(defender)} won by ${margin} run${margin === 1 ? "" : "s"} (${r1} defended)`,
  };
}
