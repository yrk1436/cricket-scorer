"use client";

import HudModal from "@/components/HudModal";
import {
  ballsToOvers,
  chaseInfo,
  opposite,
  replayInnings,
  runRate,
} from "@/lib/game";
import {
  computeInningsScorecard,
  formatExtrasLine,
  formatFallOfWickets,
  type InningsScorecard,
} from "@/lib/scorecard-stats";
import type { DbDelivery, DbInnings, DbPlayer, DbMatch, TeamSide } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  match: DbMatch;
  players: DbPlayer[];
  innings: DbInnings[];
  deliveriesByInningsId: Record<string, DbDelivery[]>;
};

function fmtRate(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function fmtSr(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

type LiveInningsCardProps = {
  inn: DbInnings;
  teamName: string;
  card: InningsScorecard;
  currentBowlerId: string | null;
  currentStrikerId: string | null;
  currentNonStrikerId: string | null;
  isCurrentInnings: boolean;
  chaseData?: {
    target: number;
    need: number;
    ballsLeft: number;
    rrr: number;
  } | null;
};

function LiveInningsCard({
  inn,
  teamName,
  card,
  currentBowlerId,
  currentStrikerId,
  currentNonStrikerId,
  isCurrentInnings,
  chaseData,
}: LiveInningsCardProps) {
  const rr = runRate(inn.runs, inn.balls_legal);
  const batted = card.batting.filter((b) => !b.didNotBat);
  const dnb = card.batting.filter((b) => b.didNotBat);

  return (
    <section className="innings-card glass scorecard-full">
      <h3>
        Innings {inn.index_num} · {teamName}
        {inn.completed && <span className="closed"> · closed</span>}
        {isCurrentInnings && !inn.completed && (
          <span style={{ color: "var(--accent)", fontWeight: 400 }}> · batting</span>
        )}
      </h3>
      <p className="score-line">
        {inn.runs}/{inn.wickets}{" "}
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          ({ballsToOvers(inn.balls_legal)} ov)
        </span>
        <span className="score-meta"> · RR {fmtRate(rr)}</span>
      </p>

      {chaseData && !inn.completed && (
        <div className="chase-bar" style={{ margin: "0 0 12px" }}>
          Need {chaseData.need} from {chaseData.ballsLeft} balls · RRR{" "}
          {fmtRate(chaseData.rrr)}
        </div>
      )}

      <p className="section-title">Batting</p>
      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>Batter</th>
              <th className="num">R</th>
              <th className="num">B</th>
              <th className="num">4s</th>
              <th className="num">6s</th>
              <th className="num">SR</th>
            </tr>
          </thead>
          <tbody>
            {batted.map((b) => {
              const isNotOut = !b.out && !b.didNotBat;
              const isOnCrease =
                isCurrentInnings &&
                !inn.completed &&
                (b.playerId === currentStrikerId ||
                  b.playerId === currentNonStrikerId);
              const isStriker =
                isCurrentInnings &&
                !inn.completed &&
                b.playerId === currentStrikerId;

              return (
                <tr
                  key={b.playerId}
                  style={isOnCrease ? { background: "rgba(52, 211, 153, 0.08)" } : undefined}
                >
                  <td>
                    <span className="batter-name">
                      {b.name}
                      {isNotOut && <span style={{ color: "var(--accent)" }}> *</span>}
                      {isStriker && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: "0.6rem",
                            color: "var(--accent)",
                            textTransform: "uppercase",
                          }}
                        >
                          strike
                        </span>
                      )}
                    </span>
                    <span className="dismissal">{b.dismissal}</span>
                  </td>
                  <td className="num">{b.runs}</td>
                  <td className="num">{b.balls}</td>
                  <td className="num">{b.fours}</td>
                  <td className="num">{b.sixes}</td>
                  <td className="num">{fmtSr(b.strikeRate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dnb.length > 0 && (
        <p className="dnb-line">
          <span className="dnb-label">Yet to bat:</span>{" "}
          {dnb.map((b) => b.name).join(", ")}
        </p>
      )}

      <p className="extras-line">
        <span className="extras-label">Extras</span> {card.extras.total}
        <span className="extras-detail"> ({formatExtrasLine(card.extras)})</span>
      </p>

      {card.fallOfWickets.length > 0 && (
        <>
          <p className="section-title" style={{ marginTop: 12 }}>
            Fall of wickets
          </p>
          <p className="fow-line">{formatFallOfWickets(card.fallOfWickets)}</p>
        </>
      )}

      {card.bowling.length > 0 && (
        <>
          <p className="section-title" style={{ marginTop: 12 }}>
            Bowling
          </p>
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Bowler</th>
                  <th className="num">O</th>
                  <th className="num">M</th>
                  <th className="num">R</th>
                  <th className="num">W</th>
                  <th className="num">Econ</th>
                </tr>
              </thead>
              <tbody>
                {card.bowling.map((b) => {
                  const isCurrent =
                    isCurrentInnings &&
                    !inn.completed &&
                    b.playerId === currentBowlerId;

                  return (
                    <tr
                      key={b.playerId}
                      style={isCurrent ? { background: "rgba(251, 191, 36, 0.1)" } : undefined}
                    >
                      <td>
                        {b.name}
                        {isCurrent && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: "0.6rem",
                              color: "#fde68a",
                              textTransform: "uppercase",
                            }}
                          >
                            bowling
                          </span>
                        )}
                      </td>
                      <td className="num">{b.overs}</td>
                      <td className="num">{b.maidens}</td>
                      <td className="num">{b.runs}</td>
                      <td className="num">{b.wickets}</td>
                      <td className="num">{fmtRate(b.economy)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export default function LiveScorecardSheet({
  open,
  onClose,
  match,
  players,
  innings,
  deliveriesByInningsId,
}: Props) {
  const sideName = (side: "a" | "b") =>
    side === "a" ? match.team_a_name : match.team_b_name;

  const pName = (id: string | null | undefined) =>
    players.find((p) => p.id === id)?.display_name ?? "—";

  const sorted = [...innings].sort((a, b) => a.index_num - b.index_num);
  const currentInnings = sorted.find(
    (i) => !i.completed && i.index_num === match.current_innings_index
  );
  const firstInnings = sorted[0];

  const getCurrentBowlerId = (inn: DbInnings): string | null => {
    if (inn.current_bowler_id) return inn.current_bowler_id;
    const dels = deliveriesByInningsId[inn.id] ?? [];
    const sortedDels = [...dels].sort((a, b) => a.display_order - b.display_order);
    for (let i = sortedDels.length - 1; i >= 0; i--) {
      const d = sortedDels[i];
      if (!d.is_strike_swap && d.bowler_id) return d.bowler_id;
    }
    return null;
  };

  return (
    <HudModal open={open} title="Scorecard" onBackdropClick={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>
            {match.team_a_name} vs {match.team_b_name}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: "0.72rem", color: "var(--muted)" }}>
            {match.overs_per_innings} overs · {match.max_wickets} wickets
            {match.status === "completed" && match.result_summary && (
              <>
                <br />
                <span style={{ color: "var(--accent)" }}>{match.result_summary}</span>
              </>
            )}
          </p>
        </div>

        {sorted.map((inn) => {
          const dels = [...(deliveriesByInningsId[inn.id] ?? [])].sort(
            (a, b) => a.display_order - b.display_order
          );
          const battingSide = inn.batting_side as TeamSide;
          const bowlingSide = opposite(battingSide);

          const card = computeInningsScorecard({
            deliveries: dels,
            battingSide,
            bowlingSide,
            players,
            name: pName,
          });

          const isCurrentInnings = currentInnings?.id === inn.id;
          const currentBowlerId = getCurrentBowlerId(inn);

          const strikeSeed =
            dels.length === 0 && inn.current_striker_id && inn.current_non_striker_id
              ? { strikerId: inn.current_striker_id, nonStrikerId: inn.current_non_striker_id }
              : null;
          const sim = replayInnings(battingSide, players, dels, strikeSeed, match.max_balls_per_over ?? 0);
          const currentStrikerId = sim?.strikerId ?? inn.current_striker_id;
          const currentNonStrikerId = sim?.nonStrikerId ?? inn.current_non_striker_id;

          const chase =
            inn.index_num === 2 && firstInnings && !inn.completed
              ? chaseInfo({
                  firstInningsRuns: firstInnings.runs,
                  currentRuns: inn.runs,
                  currentWickets: inn.wickets,
                  currentBallsLegal: inn.balls_legal,
                  oversPerInnings: match.overs_per_innings,
                  maxWickets: match.max_wickets,
                })
              : null;

          return (
            <LiveInningsCard
              key={inn.id}
              inn={inn}
              teamName={sideName(battingSide)}
              card={card}
              currentBowlerId={currentBowlerId}
              currentStrikerId={currentStrikerId}
              currentNonStrikerId={currentNonStrikerId}
              isCurrentInnings={isCurrentInnings}
              chaseData={chase}
            />
          );
        })}

        <button
          type="button"
          className="hud-btn"
          onClick={onClose}
          style={{ marginTop: 8 }}
        >
          Close
        </button>
      </div>
    </HudModal>
  );
}
