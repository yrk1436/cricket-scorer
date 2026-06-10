"use client";

import { ballsToOvers, chaseInfo, runRate } from "@/lib/game";
import type { DbInnings, DbMatch } from "@/lib/types";

type Props = {
  match: DbMatch;
  targetInnings: DbInnings | null;
  sideName: (side: "a" | "b") => string;
  allInnings: DbInnings[];
  /** Live replay totals while scoring (overs tick 0.1, 1.2, 2.3, …). */
  live?: { runs: number; wickets: number; ballsLegal: number } | null;
};

function fmtRate(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

export default function HeroScore({
  match,
  targetInnings,
  sideName,
  allInnings,
  live,
}: Props) {
  const sorted = [...allInnings].sort((a, b) => a.index_num - b.index_num);
  const inn = targetInnings ?? sorted[sorted.length - 1] ?? null;

  if (!inn) {
    return (
      <section className="hero-score glass">
        <p className="teams">
          <strong>{match.team_a_name}</strong> vs{" "}
          <strong>{match.team_b_name}</strong>
        </p>
        <p className="big">—/—</p>
      </section>
    );
  }

  const batting = sideName(inn.batting_side as "a" | "b");
  const useLive = live && !inn.completed && match.status === "live";
  const runs = useLive ? live.runs : inn.runs;
  const wickets = useLive ? live.wickets : inn.wickets;
  const ballsLegal = useLive ? live.ballsLegal : inn.balls_legal;
  const rr = runRate(runs, ballsLegal);
  const first = sorted[0];
  const isChase = inn.index_num === 2 && !!first && match.innings_count >= 2;
  const chase =
    isChase && !inn.completed
      ? chaseInfo({
          firstInningsRuns: first.runs,
          currentRuns: runs,
          currentWickets: wickets,
          currentBallsLegal: ballsLegal,
          oversPerInnings: match.overs_per_innings,
          maxWickets: match.max_wickets,
        })
      : null;

  return (
    <section className="hero-score glass">
      <p className="teams">
        <strong>{match.team_a_name}</strong> vs{" "}
        <strong>{match.team_b_name}</strong>
      </p>
      <p className="big">
        {runs}/{wickets}
      </p>
      <p className="overs-line">
        {ballsToOvers(ballsLegal)} overs · RR {fmtRate(rr)}
      </p>

      {chase && (
        <div className="meta">
          <span>
            Target <b>{chase.target}</b>
          </span>
          <span>
            Need <b>{chase.need}</b> off {chase.ballsLeft}
          </span>
          <span>
            RRR <b>{fmtRate(chase.rrr)}</b>
          </span>
        </div>
      )}

      <div className="chase-bar">
        Innings {inn.index_num} · {batting} batting
        {inn.completed
          ? " · closed"
          : ` · ${Math.max(0, match.max_wickets - inn.wickets)} wickets left`}
      </div>

      {match.result_summary && match.status === "completed" && (
        <div className="chase-bar ok" style={{ marginTop: 10 }}>
          {match.result_summary}
        </div>
      )}
    </section>
  );
}
