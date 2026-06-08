"use client";

import BallOrbits from "@/components/BallOrbits";
import { ballsToOvers, chaseInfo, lastBowlingDelivery, runRate } from "@/lib/game";
import { bundleToPlaintext, formatDeliveryWicket, type SerialBundle } from "@/lib/scorecard-text";
import type { DbDelivery, DbInnings } from "@/lib/types";
import { useCallback } from "react";

type Props = {
  bundle: SerialBundle;
  readOnlyBanner?: string;
  /** When false, hide the scrolling ball list on screen; print still lists balls. */
  showBallList?: boolean;
  /** Public share page uses compact mockup cards. */
  variant?: "default" | "public";
};

function fmtRate(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

export default function Scorecard({
  bundle,
  readOnlyBanner,
  showBallList = true,
  variant = "default",
}: Props) {
  const { match, players, innings, deliveriesByInningsId } = bundle;
  const sideName = (side: "a" | "b") =>
    side === "a" ? match.team_a_name : match.team_b_name;
  const pName = (id: string | null | undefined) =>
    players.find((p) => p.id === id)?.display_name ?? "—";

  const copyTxt = useCallback(() => {
    void navigator.clipboard.writeText(bundleToPlaintext(bundle));
  }, [bundle]);

  if (variant === "public") {
    const sorted = [...innings].sort((a, b) => a.index_num - b.index_num);
    const first = sorted[0];

    return (
      <div className="scorecard-wrap phone-shell">
        <section className="hero-score glass">
          <p className="teams">
            <strong>{match.team_a_name}</strong> vs{" "}
            <strong>{match.team_b_name}</strong>
          </p>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted)" }}>
            {match.overs_per_innings} overs · {match.innings_count} innings
          </p>
        </section>

        {readOnlyBanner && (
          <div className="chase-bar no-print">{readOnlyBanner}</div>
        )}

        {match.result_summary && match.status === "completed" && (
          <section className="result-banner glass">{match.result_summary}</section>
        )}

        {sorted.map((inn) => {
          const dels = [...(deliveriesByInningsId[inn.id] ?? [])].sort(
            (a, b) => a.display_order - b.display_order,
          );
          const rr = runRate(inn.runs, inn.balls_legal);
          const chase =
            inn.index_num === 2 && first && !inn.completed
              ? chaseInfo({
                  firstInningsRuns: first.runs,
                  currentRuns: inn.runs,
                  currentWickets: inn.wickets,
                  currentBallsLegal: inn.balls_legal,
                  oversPerInnings: match.overs_per_innings,
                  maxWickets: match.max_wickets,
                })
              : null;
          const bowlerId =
            inn.current_bowler_id ?? lastBowlingDelivery(dels)?.bowler_id ?? null;

          return (
            <section key={inn.id} className="innings-card glass">
              <h3>
                Innings {inn.index_num} · {sideName(inn.batting_side as "a" | "b")}{" "}
                {inn.completed && <span className="closed">· closed</span>}
              </h3>
              <p className="score-line">
                {inn.runs}/{inn.wickets}{" "}
                <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  ({ballsToOvers(inn.balls_legal)})
                </span>
              </p>
              {chase && (
                <div className="chase-bar" style={{ margin: 0 }}>
                  Need {chase.need} from {chase.ballsLeft} balls · RRR{" "}
                  {fmtRate(chase.rrr)}
                </div>
              )}
              {!chase && inn.completed && (
                <p style={{ margin: "0 0 8px", fontSize: "0.75rem", color: "var(--muted)" }}>
                  RR {fmtRate(rr)}
                </p>
              )}
              <p className="section-title" style={{ marginTop: 16 }}>
                Last balls
              </p>
              <BallOrbits deliveries={dels} />
              {!inn.completed && (
                <p style={{ margin: "14px 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>
                  Strike: {pName(inn.current_striker_id)} · Non:{" "}
                  {pName(inn.current_non_striker_id)} · Bowler: {pName(bowlerId)}
                </p>
              )}
            </section>
          );
        })}

        <div className="toolbar no-print">
          <button type="button" className="primary" onClick={() => copyTxt()}>
            Copy scorecard
          </button>
          <button type="button" onClick={() => globalThis.print?.()}>
            Print / PDF
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="scorecard-wrap space-y-6 print:text-black">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {match.team_a_name}{" "}
            <span className="font-normal opacity-70">vs</span>{" "}
            {match.team_b_name}
          </h2>
          <p className="text-sm opacity-75">
            {match.overs_per_innings} overs · {match.max_wickets} wkts ·{" "}
            {match.innings_count} inns · {match.status}
          </p>
          {match.result_summary && (
            <p className="mt-1 font-medium">{match.result_summary}</p>
          )}
        </div>

        <div className="no-print flex gap-2">
          <button type="button" onClick={() => copyTxt()} className="hud-btn">
            Copy scorecard
          </button>
          <button type="button" onClick={() => globalThis.print?.()} className="hud-btn">
            Print / PDF
          </button>
        </div>
      </div>

      {readOnlyBanner && (
        <p className="chase-bar warn">{readOnlyBanner}</p>
      )}

      {[...innings]
        .sort((a, b) => a.index_num - b.index_num)
        .map((inn) => (
          <InningsBlock
            key={inn.id}
            inn={inn}
            sideLabel={sideName(inn.batting_side as "a" | "b")}
            deliveries={deliveriesByInningsId[inn.id] ?? []}
            strikerNameLookup={pName}
            showBallList={showBallList}
          />
        ))}
    </div>
  );
}

function InningsBlock({
  inn,
  sideLabel,
  deliveries,
  strikerNameLookup,
  showBallList,
}: {
  inn: DbInnings;
  sideLabel: string;
  deliveries: DbDelivery[];
  strikerNameLookup: (id: string | null | undefined) => string;
  showBallList: boolean;
}) {
  const dels = [...deliveries].sort((a, b) => a.display_order - b.display_order);
  const bowlerId =
    inn.current_bowler_id ?? lastBowlingDelivery(dels)?.bowler_id ?? null;

  return (
    <section className="innings-card glass print:break-inside-avoid">
      <h3>
        Innings {inn.index_num}: {sideLabel}
        <span className="ml-2 font-mono text-base font-normal opacity-80">
          · {inn.runs}/{inn.wickets} ({ballsToOvers(inn.balls_legal)})
          {inn.completed ? " · closed" : ""}
        </span>
      </h3>

      <p className="text-xs leading-relaxed opacity-75">
        Strike:{" "}
        <span className="font-medium">{strikerNameLookup(inn.current_striker_id)}</span>
        {" · "}Non:{" "}
        <span className="font-medium">{strikerNameLookup(inn.current_non_striker_id)}</span>
        {" · "}Bowler:{" "}
        <span className="font-medium">{strikerNameLookup(bowlerId)}</span>
      </p>

      {!showBallList && (
        <div className="no-print mt-3">
          <p className="section-title">Last 10 balls (this innings)</p>
          <BallOrbits deliveries={dels} />
        </div>
      )}

      {showBallList ? (
        <ul className="mt-3 space-y-1 font-mono text-sm">
          {dels.length === 0 && <li className="opacity-50">No balls yet.</li>}
          {dels.map((d) => {
            if (d.is_strike_swap) {
              return (
                <li key={d.id}>
                  {d.display_order}. {strikerNameLookup(d.striker_id)} ⇄strike-swap
                </li>
              );
            }
            const parts: string[] = [];
            parts.push(`${d.display_order}.`);
            parts.push(strikerNameLookup(d.striker_id));
            if (d.runs_off_bat) parts.push(`${d.runs_off_bat}runs`);
            if (d.extra_wide) parts.push(`${d.extra_wide}wd`);
            if (d.extra_nb) parts.push(`${d.extra_nb}nb`);
            if (d.extra_byes) parts.push(`${d.extra_byes}b`);
            if (d.extra_leg_byes) parts.push(`${d.extra_leg_byes}lb`);
            if (
              !d.counts_as_legal_delivery &&
              !d.extra_wide &&
              !d.extra_nb
            )
              parts.push("illegal");
            else if (!d.counts_as_legal_delivery) parts.push("+extra");
            if (d.is_wicket) parts.push(formatDeliveryWicket(d, strikerNameLookup));
            if (d.bowler_id) parts.push(`·${strikerNameLookup(d.bowler_id)}`);
            return <li key={d.id}>{parts.join(" ")}</li>;
          })}
        </ul>
      ) : (
        <ul className="print-only mt-3 space-y-1 font-mono text-sm">
          {dels.map((d) =>
            d.is_strike_swap ? (
              <li key={d.id}>{d.display_order}. ⇄ strike change</li>
            ) : (
              <li key={d.id}>
                {[d.display_order, strikerNameLookup(d.striker_id)]
                  .concat(d.bowler_id ? [strikerNameLookup(d.bowler_id)] : [])
                  .concat([
                    "—",
                    `${d.runs_off_bat}r`,
                    d.is_wicket ? formatDeliveryWicket(d, strikerNameLookup) : "",
                  ])
                  .filter(Boolean)
                  .join(" ")}
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
