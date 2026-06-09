import { ballsToOvers } from "@/lib/game";
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
  const lines: string[] = [];
  lines.push(`${match.team_a_name} vs ${match.team_b_name}`);
  lines.push(`Overs/inns: ${match.overs_per_innings}  Wkts/inns: ${match.max_wickets}`);
  lines.push(`Status: ${match.status}`);
  if (match.result_summary) lines.push(`Result: ${match.result_summary}`);
  lines.push("");

  const sortedInn = [...innings].sort((a, b) => a.index_num - b.index_num);
  for (const inn of sortedInn) {
    lines.push(
      `Innings ${inn.index_num} (${name(inn.batting_side)}): ${inn.runs}/${inn.wickets} (${ballsToOvers(inn.balls_legal)} ov)`,
    );
    const dels = [...(deliveriesByInningsId[inn.id] ?? [])].sort(
      (a, b) => a.display_order - b.display_order,
    );
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

      const wkt = d.is_wicket ? ` ${formatDeliveryWicket(d, (id) => players.find((p) => p.id === id)?.display_name ?? "?")}` : "";

      const leg = d.counts_as_legal_delivery ? "" : " (illeg)";
      const bowPart = bowler ? ` (${bowler})` : "";
      lines.push(
        `${i}. ${sn}: ${d.runs_off_bat}${extra ? ` +${extra}` : ""}${wkt}${leg}${bowPart}`,
      );

    }


    lines.push("");
  }

  

  lines.push(`Read-only share: …/m/${match.public_id}`);

  return lines.join("\n");
}
