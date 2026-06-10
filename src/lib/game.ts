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

/** Delivery note for mid-innings crease correction (no ball, no wicket). */
export const CREASE_REPLACE_NOTE = "crease_replace";

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
    // NB penalty (1) doesn't rotate — only runs off the bat.
    if (d.extra_nb > 0) return d.runs_off_bat % 2 === 1;
    // Wide penalty (1) doesn't rotate — only additional runs batsmen take.
    if (d.extra_wide > 0) return (d.extra_wide - 1) % 2 === 1;
    return false;
  }
  const offExtras = d.runs_off_bat + d.extra_byes + (d.extra_leg_byes ?? 0);
  return offExtras % 2 === 1;
}

/** Retired not out does not add to wickets column */
export function wicketIncreasesCount(
  isWicket: boolean,
  dismissal: DismissalType,
): boolean {
  if (!isWicket) return false;
  return dismissal !== "retired_hurt";
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

export type OverProgress = {
  /** Legal balls in the current over (0 after an over ends). */
  legalBalls: number;
  /** All deliveries in the current over, including wides/no-balls. */
  totalBalls: number;
  /** Wides + no-balls this over (not legal). */
  illegalBalls: number;
  /** True between overs — pick a new bowler before the next delivery. */
  needsNewBowler: boolean;
};

/** Wide or no-ball — does not count toward the 6 legal balls. */
export function isWideOrNoBall(d: DbDelivery): boolean {
  return d.extra_wide > 0 || d.extra_nb > 0;
}

function isOverComplete(legalBalls: number): boolean {
  return legalBalls >= 6;
}

function scoringDeliveriesSorted(deliveries: DbDelivery[]): DbDelivery[] {
  return [...deliveries]
    .filter((d) => !d.is_strike_swap)
    .sort((a, b) => a.display_order - b.display_order);
}

function computeOverSlice(
  sorted: DbDelivery[],
): { startIndex: number; legalBalls: number; totalBalls: number; illegalBalls: number } {
  let legalBalls = 0;
  let totalBalls = 0;
  let illegalBalls = 0;
  let startIndex = 0;

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    totalBalls += 1;
    if (d.counts_as_legal_delivery) {
      legalBalls += 1;
    } else if (isWideOrNoBall(d)) {
      illegalBalls += 1;
    }
    if (isOverComplete(legalBalls)) {
      legalBalls = 0;
      totalBalls = 0;
      illegalBalls = 0;
      startIndex = i + 1;
    }
  }

  return { startIndex, legalBalls, totalBalls, illegalBalls };
}

/** Deliveries in the over currently being bowled (oldest → newest). */
export function currentOverDeliveries(
  deliveries: DbDelivery[],
  maxBallsPerOver = 0,
): DbDelivery[] {
  const sorted = scoringDeliveriesSorted(deliveries);
  const { startIndex } = computeOverSlice(sorted);
  return sorted.slice(startIndex);
}

/** Bowler on the last delivery of the previous over. */
export function bowlerAtEndOfPreviousOver(
  deliveries: DbDelivery[],
): string | null {
  const sorted = scoringDeliveriesSorted(deliveries);
  const current = currentOverDeliveries(deliveries);
  const prev = sorted.slice(0, Math.max(0, sorted.length - current.length));
  if (prev.length === 0) return null;
  return lastBowlingDelivery(prev)?.bowler_id ?? null;
}

/** Progress within the current over. maxBallsPerOver is unused here (illegal cap enforced on delivery). */
export function currentOverProgress(
  deliveries: DbDelivery[],
  _maxBallsPerOver = 0,
): OverProgress {
  const sorted = scoringDeliveriesSorted(deliveries);
  const { legalBalls, totalBalls, illegalBalls } = computeOverSlice(sorted);
  const needsNewBowler =
    sorted.length > 0 && legalBalls === 0 && totalBalls === 0;

  return { legalBalls, totalBalls, illegalBalls, needsNewBowler };
}

/**
 * True when a new-over bowler must be chosen before more scoring.
 * Covers the gap after 6 legal balls when wides/no-balls were recorded
 * without picking a new bowler first.
 */
export function awaitingNewOverBowler(
  deliveries: DbDelivery[],
  ballsLegalTotal: number,
  maxBallsPerOver = 0,
): boolean {
  if (deliveries.length === 0 || ballsLegalTotal <= 0) return false;
  const prog = currentOverProgress(deliveries, maxBallsPerOver);
  if (prog.needsNewBowler) return true;
  if (ballsLegalTotal % 6 !== 0 || prog.legalBalls > 0) return false;
  if (prog.totalBalls === 0) return true;
  // Extras-only start to the over — only block if still bowling with last over's bowler.
  const prevBowler = bowlerAtEndOfPreviousOver(deliveries);
  const currBowler = lastBowlingDelivery(deliveries)?.bowler_id ?? null;
  return !!(prevBowler && currBowler === prevBowler);
}

/** Server: incoming delivery needs a different bowler than the last over. */
export function mustChangeBowlerForDelivery(
  deliveries: DbDelivery[],
  ballsLegalTotal: number,
  proposedBowlerId: string,
  maxBallsPerOver = 0,
): boolean {
  if (!awaitingNewOverBowler(deliveries, ballsLegalTotal, maxBallsPerOver)) {
    return false;
  }
  const last = lastBowlingDelivery(deliveries);
  if (!last?.bowler_id) return true;
  return proposedBowlerId === last.bowler_id;
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
  maxBallsPerOver = 0,
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

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    if (d.is_strike_swap) {
      [strikerId, nonStrikerId] = swap(strikerId, nonStrikerId);
      continue;
    }

    if (d.note === CREASE_REPLACE_NOTE) {
      const outId = d.dismissed_batsman_id ?? strikerId;
      const next = d.incoming_striker_id;
      if (next && !dismissedIds.has(next)) {
        if (outId === nonStrikerId) {
          nonStrikerId = next;
        } else {
          strikerId = next;
        }
        if (strikerId === nonStrikerId) {
          const pick = lineup.find(
            (p) => !dismissedIds.has(p.id) && p.id !== strikerId,
          );
          if (pick) nonStrikerId = pick.id;
        }
      }
      continue;
    }

    runs += totalRunsOnDelivery(d);

    if (d.counts_as_legal_delivery) ballsLegal += 1;

    if (wicketIncreasesCount(d.is_wicket, d.dismissal)) wickets += 1;

    const prevProg = currentOverProgress(sorted.slice(0, i), maxBallsPerOver);
    const currProg = currentOverProgress(sorted.slice(0, i + 1), maxBallsPerOver);
    const endOver = currProg.needsNewBowler && !prevProg.needsNewBowler;

    const outId =
      d.dismissed_batsman_id ?? d.striker_id ?? strikerId;

    if (d.is_wicket) {
      // Retired not out — batter may bat again later in the innings.
      if (d.dismissal !== "retired_hurt") {
        dismissedIds.add(outId);
      }

      let next: string | null = null;
      const inc = d.incoming_striker_id;

      if (
        inc &&
        !dismissedIds.has(inc) &&
        inc !== strikerId &&
        inc !== nonStrikerId &&
        inc !== outId &&
        lineup.some((p) => p.id === inc)
      ) {
        next = inc;
      }
      if (next == null) {
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

function bumpBatterStat(
  stats: Map<string, BatterStat>,
  id: string,
  runs: number,
  balls: number,
) {
  const cur = stats.get(id) ?? { runs: 0, balls: 0 };
  stats.set(id, { runs: cur.runs + runs, balls: cur.balls + balls });
}

/** Runs off bat and legal balls faced — replay for strike rotation, striker_id per delivery for scoring. */
export function batterStats(
  deliveries: DbDelivery[],
  playerId: string | null | undefined,
  battingSide: TeamSide,
  allPlayers: DbPlayer[],
): BatterStat {
  if (!playerId) return { runs: 0, balls: 0 };

  const lineup = eligibleBatters(battingSide, allPlayers);
  const sorted = [...deliveries]
    .filter((d) => !d.is_strike_swap)
    .sort((a, b) => a.display_order - b.display_order);

  if (sorted.length === 0) return { runs: 0, balls: 0 };

  let strikerId = sorted[0].striker_id ?? "";
  let nonStrikerId = sorted[0].non_striker_id ?? strikerId;
  const dismissedIds = new Set<string>();
  const stats = new Map<string, BatterStat>();

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    if (d.is_strike_swap) {
      [strikerId, nonStrikerId] = swap(strikerId, nonStrikerId);
      continue;
    }

    const onStrike = d.striker_id ?? strikerId;
    if (d.counts_as_legal_delivery) {
      bumpBatterStat(stats, onStrike, d.runs_off_bat, 1);
    } else if (d.extra_nb > 0) {
      // No-ball: runs off bat + 1 ball faced (illegal for the over, like Cricbuzz).
      bumpBatterStat(stats, onStrike, d.runs_off_bat, 1);
    }

    const prevProg = currentOverProgress(sorted.slice(0, i));
    const currProg = currentOverProgress(sorted.slice(0, i + 1));
    const endOver = currProg.needsNewBowler && !prevProg.needsNewBowler;

    const outId =
      d.dismissed_batsman_id ?? d.striker_id ?? strikerId;

    if (d.is_wicket) {
      if (d.dismissal !== "retired_hurt") dismissedIds.add(outId);

      let next: string | null = null;
      const inc = d.incoming_striker_id;
      if (
        inc &&
        !dismissedIds.has(inc) &&
        inc !== strikerId &&
        inc !== nonStrikerId &&
        inc !== outId &&
        lineup.some((p) => p.id === inc)
      ) {
        next = inc;
      }
      if (next == null) {
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

  return stats.get(playerId) ?? { runs: 0, balls: 0 };
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

/** Second innings: runs to win (first innings total + 1). */
export function chaseTarget(firstInningsRuns: number): number {
  return firstInningsRuns + 1;
}

export function chaseTargetReached(
  inningsCount: number,
  inningsIndex: number,
  firstInningsRuns: number | undefined,
  currentRuns: number,
  completed: boolean,
): boolean {
  if (completed || inningsCount < 2 || inningsIndex !== 2) return false;
  if (firstInningsRuns === undefined) return false;
  return currentRuns >= chaseTarget(firstInningsRuns);
}

/** Chase innings over: target reached, all out, or overs exhausted. */
export function secondInningsShouldEnd(params: {
  firstInningsRuns: number;
  currentRuns: number;
  currentWickets: number;
  currentBallsLegal: number;
  maxWickets: number;
  oversPerInnings: number;
}): boolean {
  const {
    firstInningsRuns,
    currentRuns,
    currentWickets,
    currentBallsLegal,
    maxWickets,
    oversPerInnings,
  } = params;
  if (currentRuns >= chaseTarget(firstInningsRuns)) return true;
  if (currentWickets >= maxWickets) return true;
  if (currentBallsLegal >= oversPerInnings * 6) return true;
  return false;
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

  if (r2 === r1) {
    return {
      winnerSide: "tie" as const,
      summary: `Match tied (${r1} each · ${nameOf(in1.batting_side)} ${r1}/${in1.wickets}, ${nameOf(chasing)} ${r2}/${in2.wickets})`,
    };
  }

  const margin = r1 - r2;
  return {
    winnerSide: defender,
    summary: `${nameOf(defender)} won by ${margin} run${margin === 1 ? "" : "s"} (${r1} defended)`,
  };
}
