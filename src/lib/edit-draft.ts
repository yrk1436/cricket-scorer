import { ballsToOvers, opposite } from "@/lib/game";
import {
  applyDeliveryEdit,
  ballLabelForDelivery,
  derivedMatchState,
  describeDeliveryChanges,
  isRetirementDismissal,
  isSpecialDelivery,
  replaceDelivery,
  swapBattersFromDelivery,
  type DeliveryEditInput,
} from "@/lib/recompute";
import {
  computeInningsScorecard,
  type BattingRow,
  type BowlingRow,
  type InningsScorecard,
  type Partnership,
} from "@/lib/scorecard-stats";
import type {
  DbDelivery,
  DbInnings,
  DbPlayer,
  MatchEditLogEntry,
  TeamSide,
} from "@/lib/types";

export const STALE_MATCH_EDIT_MESSAGE =
  "This match changed. Reload and try again.";

export class StaleMatchEditError extends Error {
  readonly status = 409;
  constructor(message = STALE_MATCH_EDIT_MESSAGE) {
    super(message);
    this.name = "StaleMatchEditError";
  }
}

export type DraftBallOp = {
  kind: "ball";
  deliveryId: string;
  inningsId: string;
  input: DeliveryEditInput;
};

export type DraftSwapOp = {
  kind: "swap";
  deliveryId: string;
  inningsId: string;
  fromDisplayOrder: number;
  a: string;
  b: string;
};

export type DraftOp = DraftBallOp | DraftSwapOp;

export type ApplyMatchEditPayload = {
  expectedUpdatedAt: string;
  expectedDeliveryIdsByInningsId: Record<string, string[]>;
  operations: DraftOp[];
};

export type DiffRow = {
  key: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

export type InningsScorecardDiff = {
  inningsId: string;
  index: number;
  battingName: string;
  totals: DiffRow;
  batting: DiffRow[];
  bowling: DiffRow[];
  partnerships: DiffRow[];
  hasMaterialChange: boolean;
  hasTotalChange: boolean;
};

export type MatchScorecardDiff = {
  result: DiffRow;
  innings: InningsScorecardDiff[];
  hasMaterialChange: boolean;
  hasScoreChange: boolean;
};

function cloneDeliveries(
  deliveriesByInningsId: Record<string, DbDelivery[]>,
): Record<string, DbDelivery[]> {
  const next: Record<string, DbDelivery[]> = {};
  for (const [id, dels] of Object.entries(deliveriesByInningsId)) {
    next[id] = dels.map((d) => ({ ...d }));
  }
  return next;
}

export function replayDraftOps(
  deliveriesByInningsId: Record<string, DbDelivery[]>,
  ops: DraftOp[],
): Record<string, DbDelivery[]> {
  const next = cloneDeliveries(deliveriesByInningsId);
  for (const op of ops) {
    const list = next[op.inningsId];
    if (!list) continue;
    if (op.kind === "ball") {
      const current = list.find((d) => d.id === op.deliveryId);
      if (!current) continue;
      next[op.inningsId] = replaceDelivery(
        list,
        applyDeliveryEdit(current, op.input),
      );
    } else {
      next[op.inningsId] = swapBattersFromDelivery(
        list,
        op.fromDisplayOrder,
        op.a,
        op.b,
      );
    }
  }
  return next;
}

export function deliveryIdsByInnings(
  deliveriesByInningsId: Record<string, DbDelivery[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, dels] of Object.entries(deliveriesByInningsId)) {
    out[id] = [...dels]
      .sort((a, b) => a.display_order - b.display_order)
      .map((d) => d.id);
  }
  return out;
}

export function assertSameDeliveryIdentity(
  expected: Record<string, string[]>,
  actual: Record<string, string[]>,
): void {
  const expKeys = Object.keys(expected).sort();
  const actKeys = Object.keys(actual).sort();
  const mismatch =
    expKeys.length !== actKeys.length ||
    expKeys.some((k, i) => k !== actKeys[i]) ||
    expKeys.some((k) => {
      const a = expected[k] ?? [];
      const b = actual[k] ?? [];
      return a.length !== b.length || a.some((id, i) => id !== b[i]);
    });
  if (mismatch) {
    throw new Error(
      "Apply payload must have the same ball ids and order as saved",
    );
  }
}

function normalizeTimestamp(value: string): number {
  const t = Date.parse(value);
  if (Number.isNaN(t)) {
    throw new StaleMatchEditError();
  }
  return t;
}

export function assertApplyFreshness(params: {
  expectedUpdatedAt: string;
  actualUpdatedAt: string;
  expectedIds: Record<string, string[]>;
  actualIds: Record<string, string[]>;
}): void {
  if (
    normalizeTimestamp(params.expectedUpdatedAt) !==
    normalizeTimestamp(params.actualUpdatedAt)
  ) {
    throw new StaleMatchEditError();
  }
  try {
    assertSameDeliveryIdentity(params.expectedIds, params.actualIds);
  } catch {
    throw new StaleMatchEditError();
  }
}

function playerOnSide(
  players: DbPlayer[],
  id: string | null | undefined,
  side: TeamSide,
): DbPlayer | undefined {
  if (!id) return undefined;
  const p = players.find((x) => x.id === id);
  if (!p || p.side !== side) return undefined;
  return p;
}

export function validateDeliveryEdit(params: {
  delivery: DbDelivery;
  input: DeliveryEditInput;
  battingSide: TeamSide;
  players: DbPlayer[];
}): string | null {
  const { delivery, input, battingSide, players } = params;
  if (isSpecialDelivery(delivery)) {
    return "Cannot edit strike-swap or crease-replace rows";
  }

  if (!input.strikerId || !input.nonStrikerId) {
    return "Striker and non-striker are required";
  }
  if (input.strikerId === input.nonStrikerId) {
    return "Striker and non-striker must be different people";
  }

  const bowlSide = opposite(battingSide);
  const striker = playerOnSide(players, input.strikerId, battingSide);
  const nonStriker = playerOnSide(players, input.nonStrikerId, battingSide);
  if (!striker) return "Striker must be on the batting team";
  if (!nonStriker) return "Non-striker must be on the batting team";

  const retirement = input.isWicket && isRetirementDismissal(input.dismissal);
  if (!retirement) {
    if (!input.bowlerId) return "Bowler is required";
    const bowler = playerOnSide(players, input.bowlerId, bowlSide);
    if (!bowler) return "Bowler must be on the bowling team";
  }

  if (input.isWicket) {
    if (input.dismissal === "none") return "Choose a dismissal type";
    const outId = input.dismissedBatsmanId || input.strikerId;
    if (outId !== input.strikerId && outId !== input.nonStrikerId) {
      return "Who is out / retiring must be the striker or non-striker";
    }
    if (!playerOnSide(players, outId, battingSide)) {
      return "Dismissed player must be on the batting team";
    }

    const needsFielder =
      input.dismissal === "caught" ||
      input.dismissal === "stumped" ||
      input.dismissal === "run_out";
    if (needsFielder) {
      if (!input.fielderId) return "Choose a fielder for this dismissal";
      if (!playerOnSide(players, input.fielderId, bowlSide)) {
        return "Fielder must be on the bowling team";
      }
    }

    if (input.incomingStrikerId) {
      const inc = players.find((p) => p.id === input.incomingStrikerId);
      if (!inc || inc.side !== battingSide || inc.did_not_bat) {
        return "Incoming batter must be on the batting team";
      }
      if (
        inc.id === input.strikerId ||
        inc.id === input.nonStrikerId ||
        inc.id === outId
      ) {
        return "Incoming batter cannot already be at the crease";
      }
    }
  }

  return null;
}

export function validateSwap(params: {
  delivery: DbDelivery;
  a: string;
  b: string;
  battingSide: TeamSide;
  players: DbPlayer[];
}): string | null {
  const { delivery, a, b, battingSide, players } = params;
  if (isSpecialDelivery(delivery)) {
    return "Cannot swap on strike-swap or crease-replace rows";
  }
  if (!a || !b) return "Choose two batters to swap";
  if (a === b) return "Swap needs two different batting-side players";
  if (!playerOnSide(players, a, battingSide)) {
    return "Both players must be on the batting team";
  }
  if (!playerOnSide(players, b, battingSide)) {
    return "Both players must be on the batting team";
  }
  return null;
}

export function validateInningsLog(params: {
  deliveries: DbDelivery[];
  battingSide: TeamSide;
  players: DbPlayer[];
}): string | null {
  const { deliveries, battingSide, players } = params;
  const bowlSide = opposite(battingSide);
  const outIds = new Set<string>();
  const sorted = [...deliveries].sort((a, b) => a.display_order - b.display_order);

  for (const d of sorted) {
    if (isSpecialDelivery(d)) continue;

    const striker = d.striker_id ?? "";
    const nonStriker = d.non_striker_id ?? "";
    if (!striker || !nonStriker) {
      return "Striker and non-striker are required";
    }
    if (striker === nonStriker) {
      return "Striker and non-striker must be different people";
    }
    if (!playerOnSide(players, striker, battingSide)) {
      return "Striker must be on the batting team";
    }
    if (!playerOnSide(players, nonStriker, battingSide)) {
      return "Non-striker must be on the batting team";
    }

    const retirement = d.is_wicket && isRetirementDismissal(d.dismissal);
    if (retirement) {
      if (d.counts_as_legal_delivery) {
        return "Retirements are not a legal ball";
      }
    } else {
      if (!d.bowler_id) return "Bowler is required";
      if (!playerOnSide(players, d.bowler_id, bowlSide)) {
        return "Bowler must be on the bowling team";
      }
    }

    const crease = [striker, nonStriker];
    for (const id of crease) {
      if (outIds.has(id)) {
        return "A batter who is out cannot appear again";
      }
    }

    if (d.is_wicket) {
      if (d.dismissal === "none") return "Choose a dismissal type";
      const outId = d.dismissed_batsman_id ?? striker;
      if (outId !== striker && outId !== nonStriker) {
        return "Who is out / retiring must be the striker or non-striker";
      }

      const needsFielder =
        d.dismissal === "caught" ||
        d.dismissal === "stumped" ||
        d.dismissal === "run_out";
      if (needsFielder && !d.fielder_id) {
        return "Choose a fielder for this dismissal";
      }
      if (d.fielder_id && !playerOnSide(players, d.fielder_id, bowlSide)) {
        return "Fielder must be on the bowling team";
      }

      if (d.incoming_striker_id) {
        const inc = d.incoming_striker_id;
        if (!playerOnSide(players, inc, battingSide)) {
          return "Incoming batter must be on the batting team";
        }
        if (inc === striker || inc === nonStriker || inc === outId) {
          return "Incoming batter cannot already be at the crease";
        }
        if (outIds.has(inc)) {
          return "A batter who is out cannot appear again";
        }
      }

      if (d.dismissal !== "retired_hurt") {
        outIds.add(outId);
      }
    }
  }

  return null;
}

export function validateDraftLogs(params: {
  innings: DbInnings[];
  players: DbPlayer[];
  deliveriesByInningsId: Record<string, DbDelivery[]>;
}): string | null {
  for (const inn of params.innings) {
    const err = validateInningsLog({
      deliveries: params.deliveriesByInningsId[inn.id] ?? [],
      battingSide: inn.batting_side as TeamSide,
      players: params.players,
    });
    if (err) return err;
  }
  return null;
}

function deliverySnap(d: DbDelivery): string {
  return [
    d.striker_id,
    d.non_striker_id,
    d.bowler_id,
    d.runs_off_bat,
    d.extra_wide,
    d.extra_nb,
    d.extra_byes,
    d.extra_leg_byes ?? 0,
    d.counts_as_legal_delivery,
    d.is_wicket,
    d.dismissal,
    d.dismissed_batsman_id ?? "",
    d.incoming_striker_id ?? "",
    d.fielder_id ?? "",
    d.fielder_assist_id ?? "",
  ].join("|");
}

export function deliveriesDiffer(a: DbDelivery, b: DbDelivery): boolean {
  return deliverySnap(a) !== deliverySnap(b);
}

export function changedDeliveries(
  saved: Record<string, DbDelivery[]>,
  draft: Record<string, DbDelivery[]>,
): DbDelivery[] {
  const out: DbDelivery[] = [];
  for (const [innId, draftList] of Object.entries(draft)) {
    const savedById = new Map(
      (saved[innId] ?? []).map((d) => [d.id, d] as const),
    );
    for (const d of draftList) {
      const prev = savedById.get(d.id);
      if (!prev || deliveriesDiffer(prev, d)) out.push(d);
    }
  }
  return out;
}

function formatBatter(row: BattingRow): string {
  if (row.didNotBat) return "did not bat";
  return `${row.runs} (${row.balls}) · ${row.dismissal}`;
}

function formatBowler(row: BowlingRow): string {
  return `${row.wickets}-${row.runs} (${row.overs})`;
}

function formatPartnership(p: Partnership): string {
  const pair = [p.batterAName, p.batterBName]
    .filter((n) => n && n !== "—")
    .join(" & ");
  const end = p.endedWicket != null ? ` · ${p.endedWicket} wkt` : " · unbroken";
  return `${pair} ${p.runs} (${p.balls})${end}`;
}

function pairKey(a: string, b: string): string {
  return [a, b].filter(Boolean).sort().join("|");
}

function scorecardForInnings(params: {
  inn: DbInnings;
  deliveries: DbDelivery[];
  players: DbPlayer[];
  name: (id: string | null | undefined) => string;
}): InningsScorecard {
  return computeInningsScorecard({
    deliveries: params.deliveries,
    battingSide: params.inn.batting_side as TeamSide,
    bowlingSide: opposite(params.inn.batting_side as TeamSide),
    players: params.players,
    name: params.name,
  });
}

function diffMap<T>(
  before: T[],
  after: T[],
  keyOf: (row: T) => string,
  labelOf: (row: T) => string,
  format: (row: T | undefined) => string,
): DiffRow[] {
  const keys = [
    ...new Set([...before.map(keyOf), ...after.map(keyOf)]),
  ];
  const bMap = new Map(before.map((r) => [keyOf(r), r] as const));
  const aMap = new Map(after.map((r) => [keyOf(r), r] as const));
  return keys.map((key) => {
    const b = bMap.get(key);
    const a = aMap.get(key);
    const beforeText = format(b);
    const afterText = format(a);
    return {
      key,
      label: labelOf(a ?? b!),
      before: beforeText,
      after: afterText,
      changed: beforeText !== afterText,
    };
  });
}

export function diffMatchScorecards(params: {
  teamAName: string;
  teamBName: string;
  inningsCount: number;
  players: DbPlayer[];
  innings: DbInnings[];
  savedDeliveries: Record<string, DbDelivery[]>;
  draftDeliveries: Record<string, DbDelivery[]>;
  maxBallsPerOver?: number;
}): MatchScorecardDiff {
  const name = (id: string | null | undefined) =>
    params.players.find((p) => p.id === id)?.display_name ?? "—";
  const sideName = (side: TeamSide) =>
    side === "a" ? params.teamAName : params.teamBName;

  const savedState = derivedMatchState({
    teamAName: params.teamAName,
    teamBName: params.teamBName,
    inningsCount: params.inningsCount,
    players: params.players,
    innings: params.innings,
    deliveriesByInningsId: params.savedDeliveries,
    maxBallsPerOver: params.maxBallsPerOver,
  });
  const draftState = derivedMatchState({
    teamAName: params.teamAName,
    teamBName: params.teamBName,
    inningsCount: params.inningsCount,
    players: params.players,
    innings: params.innings,
    deliveriesByInningsId: params.draftDeliveries,
    maxBallsPerOver: params.maxBallsPerOver,
  });

  const result: DiffRow = {
    key: "result",
    label: "Result",
    before: savedState.result.summary,
    after: draftState.result.summary,
    changed: savedState.result.summary !== draftState.result.summary,
  };

  const innings = [...params.innings]
    .sort((a, b) => a.index_num - b.index_num)
    .map((inn) => {
      const savedDels = params.savedDeliveries[inn.id] ?? [];
      const draftDels = params.draftDeliveries[inn.id] ?? [];
      const savedInn = savedState.innings.find((x) => x.id === inn.id);
      const draftInn = draftState.innings.find((x) => x.id === inn.id);
      const beforeTotals = `${savedInn?.runs ?? inn.runs}/${savedInn?.wickets ?? inn.wickets} (${ballsToOvers(savedInn?.balls_legal ?? inn.balls_legal)})`;
      const afterTotals = `${draftInn?.runs ?? inn.runs}/${draftInn?.wickets ?? inn.wickets} (${ballsToOvers(draftInn?.balls_legal ?? inn.balls_legal)})`;
      const savedCard = scorecardForInnings({
        inn,
        deliveries: savedDels,
        players: params.players,
        name,
      });
      const draftCard = scorecardForInnings({
        inn,
        deliveries: draftDels,
        players: params.players,
        name,
      });

      const batting = diffMap(
        savedCard.batting,
        draftCard.batting,
        (r) => r.playerId,
        (r) => r.name,
        (r) => (r ? formatBatter(r) : "—"),
      );
      const bowling = diffMap(
        savedCard.bowling,
        draftCard.bowling,
        (r) => r.playerId,
        (r) => r.name,
        (r) => (r ? formatBowler(r) : "—"),
      );
      const partnerships = diffMap(
        savedCard.partnerships,
        draftCard.partnerships,
        (r) => `${pairKey(r.batterAId, r.batterBId)}|${r.endedWicket ?? "open"}`,
        (r) => [r.batterAName, r.batterBName].filter((n) => n && n !== "—").join(" & "),
        (r) => (r ? formatPartnership(r) : "—"),
      );

      const totals: DiffRow = {
        key: `inn-${inn.id}`,
        label: `Inns ${inn.index_num}`,
        before: beforeTotals,
        after: afterTotals,
        changed: beforeTotals !== afterTotals,
      };

      const hasMaterialChange =
        totals.changed ||
        batting.some((r) => r.changed) ||
        bowling.some((r) => r.changed) ||
        partnerships.some((r) => r.changed);

      return {
        inningsId: inn.id,
        index: inn.index_num,
        battingName: sideName(inn.batting_side as TeamSide),
        totals,
        batting,
        bowling,
        partnerships,
        hasMaterialChange,
        hasTotalChange: totals.changed,
      };
    });

  return {
    result,
    innings,
    hasMaterialChange: result.changed || innings.some((i) => i.hasMaterialChange),
    hasScoreChange: result.changed || innings.some((i) => i.hasTotalChange),
  };
}

export function describeDraftOps(
  base: Record<string, DbDelivery[]>,
  ops: DraftOp[],
  name: (id: string | null | undefined) => string,
): { summary: string; operations: { summary: string }[] } {
  const operations: { summary: string }[] = [];
  let current = cloneDeliveries(base);

  for (const op of ops) {
    const beforeList = current[op.inningsId] ?? [];
    const label = ballLabelForDelivery(beforeList, op.deliveryId);
    const next = replayDraftOps(current, [op]);
    const afterList = next[op.inningsId] ?? [];

    if (op.kind === "ball") {
      const before = beforeList.find((d) => d.id === op.deliveryId);
      const after = afterList.find((d) => d.id === op.deliveryId);
      const changes =
        before && after ? describeDeliveryChanges(before, after, name) : [];
      const changeText =
        changes.length > 0
          ? changes.map((c) => `${c.field} ${c.from} → ${c.to}`).join(", ")
          : "no field change";
      const who = name(after?.striker_id ?? before?.striker_id);
      operations.push({ summary: `${label}  ${who} ${changeText}` });
    } else {
      operations.push({
        summary: `${label}  swap ${name(op.a)} ↔ ${name(op.b)} from here onward`,
      });
    }
    current = next;
  }

  const balls = ops.filter((o) => o.kind === "ball").length;
  const swaps = ops.filter((o) => o.kind === "swap").length;
  const parts: string[] = [];
  if (balls) parts.push(`${balls} ball edit${balls === 1 ? "" : "s"}`);
  if (swaps) parts.push(`${swaps} batter swap${swaps === 1 ? "" : "s"}`);

  return {
    summary: parts.join(", ") || "corrections",
    operations,
  };
}

export function buildSessionHistoryEntry(params: {
  actor: string;
  base: Record<string, DbDelivery[]>;
  ops: DraftOp[];
  name: (id: string | null | undefined) => string;
}): MatchEditLogEntry {
  const described = describeDraftOps(params.base, params.ops, params.name);
  return {
    at: new Date().toISOString(),
    actor: params.actor,
    kind: "session",
    summary: described.summary,
    operations: described.operations,
    changes: [],
  };
}

export function buildApplyPayload(params: {
  expectedUpdatedAt: string;
  deliveriesByInningsId: Record<string, DbDelivery[]>;
  operations: DraftOp[];
}): ApplyMatchEditPayload {
  return {
    expectedUpdatedAt: params.expectedUpdatedAt,
    expectedDeliveryIdsByInningsId: deliveryIdsByInnings(
      params.deliveriesByInningsId,
    ),
    operations: params.operations,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseDraftOps(raw: unknown): DraftOp[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("No draft changes to apply");
  }
  return raw.map((item, index) => {
    const row = asRecord(item);
    if (!row) throw new Error(`Invalid draft operation ${index + 1}`);
    const kind = row.kind;
    const deliveryId = String(row.deliveryId ?? "");
    const inningsId = String(row.inningsId ?? "");
    if (!deliveryId || !inningsId) {
      throw new Error(`Invalid draft operation ${index + 1}`);
    }
    if (kind === "ball") {
      const input = asRecord(row.input);
      if (!input) throw new Error(`Invalid ball edit ${index + 1}`);
      return {
        kind: "ball",
        deliveryId,
        inningsId,
        input: {
          strikerId: String(input.strikerId ?? ""),
          nonStrikerId: String(input.nonStrikerId ?? ""),
          bowlerId: input.bowlerId ? String(input.bowlerId) : null,
          runsOffBat: Number(input.runsOffBat) || 0,
          extraType:
            input.extraType === "wide" ||
            input.extraType === "nb" ||
            input.extraType === "bye" ||
            input.extraType === "leg_bye"
              ? input.extraType
              : "none",
          extraRuns: Number(input.extraRuns) || 0,
          isWicket: Boolean(input.isWicket),
          dismissal:
            typeof input.dismissal === "string" ? input.dismissal : "none",
          dismissedBatsmanId: input.dismissedBatsmanId
            ? String(input.dismissedBatsmanId)
            : null,
          incomingStrikerId: input.incomingStrikerId
            ? String(input.incomingStrikerId)
            : null,
          fielderId: input.fielderId ? String(input.fielderId) : null,
          fielderAssistId: input.fielderAssistId
            ? String(input.fielderAssistId)
            : null,
        } as DeliveryEditInput,
      };
    }
    if (kind === "swap") {
      return {
        kind: "swap",
        deliveryId,
        inningsId,
        fromDisplayOrder: Number(row.fromDisplayOrder) || 0,
        a: String(row.a ?? ""),
        b: String(row.b ?? ""),
      };
    }
    throw new Error(`Unknown draft operation ${index + 1}`);
  });
}

export function parseExpectedDeliveryIds(
  raw: unknown,
): Record<string, string[]> {
  const rec = asRecord(raw);
  if (!rec) {
    throw new Error("Expected delivery ids are required");
  }
  const out: Record<string, string[]> = {};
  for (const [id, value] of Object.entries(rec)) {
    if (!Array.isArray(value)) {
      throw new Error("Expected delivery ids are required");
    }
    out[id] = value.map((v) => String(v));
  }
  return out;
}
