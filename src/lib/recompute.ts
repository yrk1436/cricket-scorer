import { CREASE_REPLACE_NOTE, replayInnings, summarizeResult } from "@/lib/game";
import type {
  DbDelivery,
  DbInnings,
  DbPlayer,
  DismissalType,
  MatchEditChange,
  MatchEditLogEntry,
  TeamSide,
} from "@/lib/types";

export type ExtraType = "none" | "wide" | "nb" | "bye" | "leg_bye";

export type DeliveryEditInput = {
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string | null;
  runsOffBat: number;
  extraType: ExtraType;
  extraRuns: number;
  isWicket: boolean;
  dismissal: DismissalType;
  dismissedBatsmanId: string | null;
  incomingStrikerId: string | null;
  fielderId: string | null;
  fielderAssistId: string | null;
};

export type DerivedInnings = {
  id: string;
  runs: number;
  wickets: number;
  balls_legal: number;
  strikerId: string;
  nonStrikerId: string;
};

export type OverBallRow = {
  delivery: DbDelivery;
  over: number;
  ballLabel: string;
  editable: boolean;
};

export type OverGroup = {
  over: number;
  title: string;
  balls: OverBallRow[];
};

const BATTER_ID_FIELDS = [
  "striker_id",
  "non_striker_id",
  "dismissed_batsman_id",
  "incoming_striker_id",
] as const;

export function isRetirementDismissal(dismissal: DismissalType): boolean {
  return dismissal === "retired_out" || dismissal === "retired_hurt";
}

export function isSpecialDelivery(d: DbDelivery): boolean {
  return d.is_strike_swap || d.note === CREASE_REPLACE_NOTE;
}

export function extraTypeFromDelivery(d: DbDelivery): ExtraType {
  if (d.extra_wide > 0) return "wide";
  if (d.extra_nb > 0) return "nb";
  if (d.extra_byes > 0) return "bye";
  if ((d.extra_leg_byes ?? 0) > 0) return "leg_bye";
  return "none";
}

export function extraRunsFromDelivery(d: DbDelivery): number {
  if (d.extra_wide > 0) return d.extra_wide;
  if (d.extra_nb > 0) return d.extra_nb;
  if (d.extra_byes > 0) return d.extra_byes;
  if ((d.extra_leg_byes ?? 0) > 0) return d.extra_leg_byes ?? 0;
  return 0;
}

export function deliveryEditFromRow(d: DbDelivery): DeliveryEditInput {
  return {
    strikerId: d.striker_id ?? "",
    nonStrikerId: d.non_striker_id ?? "",
    bowlerId: d.bowler_id,
    runsOffBat: d.runs_off_bat,
    extraType: extraTypeFromDelivery(d),
    extraRuns: extraRunsFromDelivery(d),
    isWicket: d.is_wicket,
    dismissal: d.is_wicket ? d.dismissal : "none",
    dismissedBatsmanId: d.dismissed_batsman_id ?? null,
    incomingStrikerId: d.incoming_striker_id ?? null,
    fielderId: d.fielder_id ?? null,
    fielderAssistId: d.fielder_assist_id ?? null,
  };
}

/**
 * Apply a phase-1 correction to one delivery.
 * Does not insert, delete, or rewrite later balls (phase 2).
 */
export function applyDeliveryEdit(
  current: DbDelivery,
  input: DeliveryEditInput,
): DbDelivery {
  const retirement = input.isWicket && isRetirementDismissal(input.dismissal);

  let extra_wide = 0;
  let extra_nb = 0;
  let extra_byes = 0;
  let extra_leg_byes = 0;
  let runsOffBat = Math.max(0, Math.min(6, Math.floor(input.runsOffBat) || 0));
  const extraRuns = Math.max(0, Math.floor(input.extraRuns) || 0);

  if (!retirement) {
    switch (input.extraType) {
      case "wide":
        extra_wide = Math.max(1, extraRuns);
        runsOffBat = 0;
        break;
      case "nb":
        extra_nb = Math.max(1, extraRuns);
        break;
      case "bye":
        extra_byes = extraRuns;
        runsOffBat = 0;
        break;
      case "leg_bye":
        extra_leg_byes = extraRuns;
        runsOffBat = 0;
        break;
      default:
        break;
    }
  } else {
    runsOffBat = 0;
  }

  const countsAsLegal = !retirement && extra_wide === 0 && extra_nb === 0;

  return {
    ...current,
    striker_id: input.strikerId,
    non_striker_id: input.nonStrikerId,
    bowler_id: retirement ? null : input.bowlerId,
    runs_off_bat: runsOffBat,
    extra_wide,
    extra_nb,
    extra_byes,
    extra_leg_byes,
    counts_as_legal_delivery: countsAsLegal,
    is_wicket: input.isWicket,
    dismissal: input.isWicket ? input.dismissal : "none",
    dismissed_batsman_id: input.isWicket ? input.dismissedBatsmanId : null,
    incoming_striker_id: input.isWicket ? input.incomingStrikerId : null,
    fielder_id: input.isWicket ? input.fielderId : null,
    fielder_assist_id: input.isWicket ? input.fielderAssistId : null,
  };
}

export function replaceDelivery(
  deliveries: DbDelivery[],
  next: DbDelivery,
): DbDelivery[] {
  return deliveries.map((d) => (d.id === next.id ? next : d));
}

/**
 * Phase 2 hook (no UI yet): swap two batters from this ball onward.
 * After rewriting IDs, call `derivedMatchState` — the same path as phase 1.
 */
export function swapBattersFromDelivery(
  deliveries: DbDelivery[],
  fromDisplayOrder: number,
  a: string,
  b: string,
): DbDelivery[] {
  if (!a || !b || a === b) return deliveries.map((d) => ({ ...d }));
  return deliveries.map((d) => {
    if (d.display_order < fromDisplayOrder) return { ...d };
    const next = { ...d };
    for (const field of BATTER_ID_FIELDS) {
      if (next[field] === a) next[field] = b;
      else if (next[field] === b) next[field] = a;
    }
    return next;
  });
}

export function derivedMatchState(params: {
  teamAName: string;
  teamBName: string;
  inningsCount: number;
  players: DbPlayer[];
  innings: DbInnings[];
  deliveriesByInningsId: Record<string, DbDelivery[]>;
  maxBallsPerOver?: number;
}): {
  innings: DerivedInnings[];
  result: ReturnType<typeof summarizeResult>;
} {
  const derivedInns: DerivedInnings[] = [];
  const inningsLike: {
    batting_side: TeamSide;
    runs: number;
    wickets: number;
    completed: boolean;
  }[] = [];

  for (const inn of [...params.innings].sort((a, b) => a.index_num - b.index_num)) {
    const dels = params.deliveriesByInningsId[inn.id] ?? [];
    const strikeSeed =
      dels.length === 0 && inn.current_striker_id && inn.current_non_striker_id
        ? {
            strikerId: inn.current_striker_id,
            nonStrikerId: inn.current_non_striker_id,
          }
        : null;
    const sim = replayInnings(
      inn.batting_side as TeamSide,
      params.players,
      dels,
      strikeSeed,
      params.maxBallsPerOver ?? 0,
    );
    if (!sim) throw new Error("Cannot replay innings");

    derivedInns.push({
      id: inn.id,
      runs: sim.runs,
      wickets: sim.wickets,
      balls_legal: sim.balls_legal,
      strikerId: sim.strikerId,
      nonStrikerId: sim.nonStrikerId,
    });
    inningsLike.push({
      batting_side: inn.batting_side as TeamSide,
      runs: sim.runs,
      wickets: sim.wickets,
      completed: inn.completed,
    });
  }

  return {
    innings: derivedInns,
    result: summarizeResult({
      teamAName: params.teamAName,
      teamBName: params.teamBName,
      innings: inningsLike,
      inningsCount: params.inningsCount,
    }),
  };
}

export function groupDeliveriesByOver(deliveries: DbDelivery[]): OverGroup[] {
  const sorted = [...deliveries].sort((a, b) => a.display_order - b.display_order);
  const groups: OverGroup[] = [];
  let legal = 0;

  const ensure = (over: number): OverGroup => {
    let g = groups.find((x) => x.over === over);
    if (!g) {
      g = { over, title: `Over ${over + 1}`, balls: [] };
      groups.push(g);
    }
    return g;
  };

  for (const d of sorted) {
    const over = Math.floor(legal / 6);
    const legalInOver = legal % 6;
    const retirement = d.is_wicket && isRetirementDismissal(d.dismissal);
    const editable = !isSpecialDelivery(d);

    let ballLabel: string;
    if (d.is_strike_swap) {
      ballLabel = `${over}.${legalInOver} ⇄`;
    } else if (d.note === CREASE_REPLACE_NOTE) {
      ballLabel = `${over}.${legalInOver} sub`;
    } else if (retirement) {
      ballLabel = `${over}.${legalInOver} ret`;
    } else if (d.extra_wide > 0) {
      ballLabel = `${over}.${legalInOver} wd`;
    } else if (d.extra_nb > 0) {
      ballLabel = `${over}.${legalInOver} nb`;
    } else {
      ballLabel = `${over}.${legalInOver + 1}`;
    }

    ensure(over).balls.push({ delivery: d, over, ballLabel, editable });
    if (d.counts_as_legal_delivery) legal += 1;
  }

  return groups;
}

export function ballLabelForDelivery(
  deliveries: DbDelivery[],
  deliveryId: string,
): string {
  for (const group of groupDeliveriesByOver(deliveries)) {
    const row = group.balls.find((b) => b.delivery.id === deliveryId);
    if (row) return row.ballLabel;
  }
  return "?";
}

function displayVal(
  field: string,
  raw: string | number | boolean | null | undefined,
  name: (id: string | null | undefined) => string,
): string {
  if (raw == null || raw === "") return "—";
  if (
    field.endsWith("_id") ||
    field === "striker" ||
    field === "non-striker" ||
    field === "bowler" ||
    field === "out" ||
    field === "incoming"
  ) {
    if (typeof raw === "string" && raw.includes("-")) return name(raw);
  }
  return String(raw);
}

export function describeDeliveryChanges(
  before: DbDelivery,
  after: DbDelivery,
  name: (id: string | null | undefined) => string,
): MatchEditChange[] {
  const pairs: [string, string | number | boolean | null | undefined, string | number | boolean | null | undefined][] =
    [
      ["striker", before.striker_id, after.striker_id],
      ["non-striker", before.non_striker_id, after.non_striker_id],
      ["bowler", before.bowler_id, after.bowler_id],
      ["runs off bat", before.runs_off_bat, after.runs_off_bat],
      ["wide", before.extra_wide, after.extra_wide],
      ["no-ball", before.extra_nb, after.extra_nb],
      ["byes", before.extra_byes, after.extra_byes],
      ["leg byes", before.extra_leg_byes ?? 0, after.extra_leg_byes ?? 0],
      ["legal ball", before.counts_as_legal_delivery, after.counts_as_legal_delivery],
      ["wicket", before.is_wicket, after.is_wicket],
      ["dismissal", before.dismissal, after.dismissal],
      ["out", before.dismissed_batsman_id ?? null, after.dismissed_batsman_id ?? null],
      ["incoming", before.incoming_striker_id ?? null, after.incoming_striker_id ?? null],
    ];

  const changes: MatchEditChange[] = [];
  for (const [field, from, to] of pairs) {
    if (from === to) continue;
    changes.push({
      field,
      from: displayVal(field, from, name),
      to: displayVal(field, to, name),
    });
  }
  return changes;
}

export function appendEditHistory(
  current: MatchEditLogEntry[] | null | undefined,
  entry: MatchEditLogEntry,
  cap = 200,
): MatchEditLogEntry[] {
  return [...(current ?? []), entry].slice(-cap);
}
