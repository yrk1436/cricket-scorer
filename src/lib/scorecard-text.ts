import { ballsToOvers, opposite } from "@/lib/game";
import {
  computeInningsScorecard,
  formatExtrasLine,
  formatFallOfWickets,
} from "@/lib/scorecard-stats";
import type { DbDelivery, DbInnings, DbMatch, DbPlayer } from "@/lib/types";

export type SerialBundle = {
  match: DbMatch;
  players: DbPlayer[];
  innings: DbInnings[];
  deliveriesByInningsId: Record<string, DbDelivery[]>;
};

export function formatDeliveryWicket(
  d: DbDelivery,
  name: (id: string | null | undefined) => string,
): string {
  if (!d.is_wicket) return "";
  const outId = d.dismissed_batsman_id ?? d.striker_id;
  let label =
    d.dismissal === "retired_hurt"
      ? "retired not out"
      : d.dismissal === "retired_out"
        ? "retired out"
        : d.dismissal !== "none"
          ? d.dismissal
          : "out";
  if (outId !== d.striker_id) label += `(NS:${name(outId)})`;
  if (d.fielder_id) {
    label += ` ${name(d.fielder_id)}`;
    if (d.fielder_assist_id) label += `/${name(d.fielder_assist_id)}`;
  }
  return `W:${label}`;
}

export function bundleToPlaintext(b: SerialBundle): string {
  const { match, players, innings, deliveriesByInningsId } = b;
  const name = (s: "a" | "b") => (s === "a" ? match.team_a_name : match.team_b_name);
  const pName = (id: string | null | undefined) =>
    players.find((p) => p.id === id)?.display_name ?? "?";
  const lines: string[] = [];
  lines.push(`${match.team_a_name} vs ${match.team_b_name}`);
  lines.push(`Overs/inns: ${match.overs_per_innings}  Wkts/inns: ${match.max_wickets}`);
  lines.push(`Status: ${match.status}`);
  if (match.result_summary) lines.push(`Result: ${match.result_summary}`);
  lines.push("");

  const sortedInn = [...innings].sort((a, b) => a.index_num - b.index_num);

  for (const inn of sortedInn) {
    const dels = [...(deliveriesByInningsId[inn.id] ?? [])].sort(
      (a, b) => a.display_order - b.display_order,
    );

    lines.push(
      `Innings ${inn.index_num} (${name(inn.batting_side)}): ${inn.runs}/${inn.wickets} (${ballsToOvers(inn.balls_legal)} ov)`,
    );

    if (match.status === "completed") {
      const card = computeInningsScorecard({
        deliveries: dels,
        battingSide: inn.batting_side as "a" | "b",
        bowlingSide: opposite(inn.batting_side as "a" | "b"),
        players,
        name: pName,
      });

      lines.push("");
      lines.push("Batting");
      for (const row of card.batting.filter((r) => !r.didNotBat)) {
        lines.push(
          `  ${row.name}  ${row.runs} (${row.balls})  4s:${row.fours}  6s:${row.sixes}  SR:${row.strikeRate.toFixed(1)}  ${row.dismissal}`,
        );
      }
      const dnb = card.batting.filter((r) => r.didNotBat);
      if (dnb.length) {
        lines.push(`  DNB: ${dnb.map((r) => r.name).join(", ")}`);
      }

      lines.push(`Extras ${card.extras.total} (${formatExtrasLine(card.extras)})`);
      if (card.fallOfWickets.length) {
        lines.push(`Fall of wickets: ${formatFallOfWickets(card.fallOfWickets)}`);
      }

      if (card.bowling.length) {
        lines.push("");
        lines.push("Bowling");
        for (const row of card.bowling) {
          lines.push(
            `  ${row.name}  ${row.overs}-${row.maidens}-${row.runs}-${row.wickets}  Econ:${row.economy.toFixed(2)}`,
          );
        }
      }
    } else {
      let i = 0;
      for (const d of dels) {
        i += 1;
        const striker = players.find((p) => p.id === d.striker_id);
        const sn = striker?.display_name ?? "?";

        if (d.is_strike_swap) {
          lines.push(`${i}. ${sn}: strike swap`);
          continue;
        }

        const bowler = d.bowler_id
          ? players.find((p) => p.id === d.bowler_id)?.display_name
          : null;

        const extra = `${d.extra_wide ? `${d.extra_wide}w ` : ""}${d.extra_nb ? `${d.extra_nb}nb ` : ""}${d.extra_byes ? `${d.extra_byes}b ` : ""}${d.extra_leg_byes ? `${d.extra_leg_byes}lb ` : ""}`.trim();

        const wkt = d.is_wicket
          ? ` ${formatDeliveryWicket(d, (id) => players.find((p) => p.id === id)?.display_name ?? "?")}`
          : "";

        const leg = d.counts_as_legal_delivery ? "" : " (illeg)";
        const bowPart = bowler ? ` (${bowler})` : "";
        lines.push(
          `${i}. ${sn}: ${d.runs_off_bat}${extra ? ` +${extra}` : ""}${wkt}${leg}${bowPart}`,
        );
      }
    }

    lines.push("");
  }

  lines.push(`Read-only share: …/m/${match.public_id}`);

  return lines.join("\n");
}
