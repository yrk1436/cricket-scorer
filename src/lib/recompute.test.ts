import { describe, expect, it } from "vitest";
import { computeInningsScorecard } from "./scorecard-stats";
import {
  applyDeliveryEdit,
  derivedMatchState,
  extraTypeFromDelivery,
  groupDeliveriesByOver,
  replaceDelivery,
  swapBattersFromDelivery,
  type DeliveryEditInput,
} from "./recompute";
import type { DbDelivery, DbInnings, DbPlayer } from "./types";

function makeDelivery(overrides: Partial<DbDelivery>): DbDelivery {
  return {
    id: "del-1",
    innings_id: "inn-1",
    display_order: 1,
    striker_id: "bat-1",
    non_striker_id: "bat-2",
    bowler_id: "bowl-1",
    is_strike_swap: false,
    runs_off_bat: 0,
    extra_wide: 0,
    extra_nb: 0,
    extra_byes: 0,
    extra_leg_byes: 0,
    counts_as_legal_delivery: true,
    is_wicket: false,
    dismissal: "none",
    note: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makePlayers(): DbPlayer[] {
  return [
    { id: "bat-1", match_id: "m1", side: "a", display_name: "Ali", sort_order: 0, did_not_bat: false },
    { id: "bat-2", match_id: "m1", side: "a", display_name: "Raj", sort_order: 1, did_not_bat: false },
    { id: "bat-3", match_id: "m1", side: "a", display_name: "Sam", sort_order: 2, did_not_bat: false },
    { id: "bowl-1", match_id: "m1", side: "b", display_name: "Kumar", sort_order: 0, did_not_bat: false },
    { id: "bowl-2", match_id: "m1", side: "b", display_name: "Lee", sort_order: 1, did_not_bat: false },
  ];
}

function inningsRow(overrides: Partial<DbInnings> = {}): DbInnings {
  return {
    id: "inn-1",
    match_id: "m1",
    index_num: 1,
    batting_side: "a",
    runs: 0,
    wickets: 0,
    balls_legal: 0,
    completed: true,
    current_striker_id: "bat-1",
    current_non_striker_id: "bat-2",
    current_bowler_id: "bowl-1",
    ...overrides,
  };
}

function baseEdit(over: Partial<DeliveryEditInput> = {}): DeliveryEditInput {
  return {
    strikerId: "bat-1",
    nonStrikerId: "bat-2",
    bowlerId: "bowl-1",
    runsOffBat: 1,
    extraType: "none",
    extraRuns: 0,
    isWicket: false,
    dismissal: "none",
    dismissedBatsmanId: null,
    incomingStrikerId: null,
    fielderId: null,
    fielderAssistId: null,
    ...over,
  };
}

function nameOf(id: string | null | undefined) {
  return makePlayers().find((p) => p.id === id)?.display_name ?? "—";
}

describe("applyDeliveryEdit", () => {
  it("turns a legal single into a wide (not a legal ball)", () => {
    const before = makeDelivery({ runs_off_bat: 1 });
    const after = applyDeliveryEdit(before, baseEdit({ extraType: "wide", extraRuns: 1, runsOffBat: 1 }));
    expect(after.extra_wide).toBe(1);
    expect(after.runs_off_bat).toBe(0);
    expect(after.counts_as_legal_delivery).toBe(false);
    expect(extraTypeFromDelivery(after)).toBe("wide");
  });

  it("records retired out as a team wicket that is not a ball", () => {
    const before = makeDelivery({ runs_off_bat: 1 });
    const after = applyDeliveryEdit(
      before,
      baseEdit({
        isWicket: true,
        dismissal: "retired_out",
        dismissedBatsmanId: "bat-1",
        incomingStrikerId: "bat-3",
      }),
    );
    expect(after.is_wicket).toBe(true);
    expect(after.dismissal).toBe("retired_out");
    expect(after.counts_as_legal_delivery).toBe(false);
    expect(after.bowler_id).toBeNull();
    expect(after.runs_off_bat).toBe(0);
  });
});

describe("derivedMatchState after a ball edit", () => {
  it("recomputes team totals when runs off bat change", () => {
    const dels = [
      makeDelivery({ id: "d1", display_order: 1, runs_off_bat: 1 }),
      makeDelivery({ id: "d2", display_order: 2, runs_off_bat: 4, striker_id: "bat-2", non_striker_id: "bat-1" }),
    ];
    const inn = inningsRow();
    const before = derivedMatchState({
      teamAName: "A",
      teamBName: "B",
      inningsCount: 1,
      players: makePlayers(),
      innings: [inn],
      deliveriesByInningsId: { "inn-1": dels },
    });
    expect(before.innings[0].runs).toBe(5);

    const edited = applyDeliveryEdit(dels[0], baseEdit({ runsOffBat: 2 }));
    const after = derivedMatchState({
      teamAName: "A",
      teamBName: "B",
      inningsCount: 1,
      players: makePlayers(),
      innings: [inn],
      deliveriesByInningsId: { "inn-1": replaceDelivery(dels, edited) },
    });
    expect(after.innings[0].runs).toBe(6);
    expect(after.innings[0].balls_legal).toBe(2);
  });

  it("moves runs to the edited striker without rewriting later balls", () => {
    const dels = [
      makeDelivery({ id: "d1", display_order: 1, runs_off_bat: 4, striker_id: "bat-1", non_striker_id: "bat-2" }),
      makeDelivery({ id: "d2", display_order: 2, runs_off_bat: 1, striker_id: "bat-2", non_striker_id: "bat-1" }),
    ];
    const edited = applyDeliveryEdit(
      dels[0],
      baseEdit({ strikerId: "bat-2", nonStrikerId: "bat-1", runsOffBat: 4 }),
    );
    const next = replaceDelivery(dels, edited);
    expect(next[1].striker_id).toBe("bat-2");

    const card = computeInningsScorecard({
      deliveries: next,
      battingSide: "a",
      bowlingSide: "b",
      players: makePlayers(),
      name: nameOf,
    });
    const ali = card.batting.find((r) => r.playerId === "bat-1");
    const raj = card.batting.find((r) => r.playerId === "bat-2");
    expect(ali?.runs).toBe(0);
    expect(raj?.runs).toBe(5);
  });

  it("retired out counts as a team wicket only and is not a legal ball", () => {
    const dels = [
      makeDelivery({ id: "d1", display_order: 1, runs_off_bat: 2 }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        runs_off_bat: 1,
        striker_id: "bat-1",
        non_striker_id: "bat-2",
      }),
    ];
    const edited = applyDeliveryEdit(
      dels[1],
      baseEdit({
        isWicket: true,
        dismissal: "retired_out",
        dismissedBatsmanId: "bat-1",
        incomingStrikerId: "bat-3",
      }),
    );
    const next = replaceDelivery(dels, edited);
    const derived = derivedMatchState({
      teamAName: "A",
      teamBName: "B",
      inningsCount: 1,
      players: makePlayers(),
      innings: [inningsRow()],
      deliveriesByInningsId: { "inn-1": next },
    });
    expect(derived.innings[0].wickets).toBe(1);
    expect(derived.innings[0].balls_legal).toBe(1);
    expect(derived.innings[0].runs).toBe(2);

    const card = computeInningsScorecard({
      deliveries: next,
      battingSide: "a",
      bowlingSide: "b",
      players: makePlayers(),
      name: nameOf,
    });
    expect(card.batting.find((r) => r.playerId === "bat-1")?.dismissal).toBe("retired out");
  });

  it("retired not out does not add a team wicket", () => {
    const dels = [
      makeDelivery({ id: "d1", display_order: 1, runs_off_bat: 2 }),
      applyDeliveryEdit(
        makeDelivery({ id: "d2", display_order: 2 }),
        baseEdit({
          isWicket: true,
          dismissal: "retired_hurt",
          dismissedBatsmanId: "bat-1",
          incomingStrikerId: "bat-3",
        }),
      ),
    ];
    const derived = derivedMatchState({
      teamAName: "A",
      teamBName: "B",
      inningsCount: 1,
      players: makePlayers(),
      innings: [inningsRow()],
      deliveriesByInningsId: { "inn-1": dels },
    });
    expect(derived.innings[0].wickets).toBe(0);
    expect(derived.innings[0].balls_legal).toBe(1);

    const card = computeInningsScorecard({
      deliveries: dels,
      battingSide: "a",
      bowlingSide: "b",
      players: makePlayers(),
      name: nameOf,
    });
    expect(card.batting.find((r) => r.playerId === "bat-1")?.dismissal).toBe(
      "retired not out",
    );
  });

  it("recomputes the result when the chase innings total changes", () => {
    const inn1 = inningsRow({ id: "inn-1", index_num: 1, completed: true });
    const inn2 = inningsRow({
      id: "inn-2",
      index_num: 2,
      batting_side: "b",
      completed: true,
    });
    const first = [
      makeDelivery({ id: "a1", innings_id: "inn-1", display_order: 1, runs_off_bat: 4 }),
    ];
    const chase = [
      makeDelivery({
        id: "b1",
        innings_id: "inn-2",
        display_order: 1,
        striker_id: "bowl-1",
        non_striker_id: "bowl-2",
        bowler_id: "bat-1",
        runs_off_bat: 4,
      }),
    ];
    const players = makePlayers();
    const before = derivedMatchState({
      teamAName: "Aces",
      teamBName: "Bears",
      inningsCount: 2,
      players,
      innings: [inn1, inn2],
      deliveriesByInningsId: { "inn-1": first, "inn-2": chase },
    });
    expect(before.result.winnerSide).toBe("tie");

    const edited = applyDeliveryEdit(
      chase[0],
      baseEdit({
        strikerId: "bowl-1",
        nonStrikerId: "bowl-2",
        bowlerId: "bat-1",
        runsOffBat: 6,
      }),
    );
    const after = derivedMatchState({
      teamAName: "Aces",
      teamBName: "Bears",
      inningsCount: 2,
      players,
      innings: [inn1, inn2],
      deliveriesByInningsId: { "inn-1": first, "inn-2": [edited] },
    });
    expect(after.innings[1].runs).toBe(6);
    expect(after.result.winnerSide).toBe("b");
  });

  it("recomputes partnerships from the ball log", () => {
    const dels = [
      makeDelivery({ id: "d1", display_order: 1, runs_off_bat: 2 }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        is_wicket: true,
        dismissal: "bowled",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        striker_id: "bat-1",
        non_striker_id: "bat-2",
      }),
      makeDelivery({
        id: "d3",
        display_order: 3,
        runs_off_bat: 3,
        striker_id: "bat-3",
        non_striker_id: "bat-2",
      }),
    ];
    const card = computeInningsScorecard({
      deliveries: dels,
      battingSide: "a",
      bowlingSide: "b",
      players: makePlayers(),
      name: nameOf,
    });
    expect(card.partnerships.length).toBeGreaterThanOrEqual(2);
    expect(card.partnerships[0].runs).toBe(2);
    expect(card.partnerships[0].endedWicket).toBe(1);
    expect(card.partnerships[1].runs).toBe(3);
    expect(card.partnerships[1].endedWicket).toBeNull();
  });
});

describe("groupDeliveriesByOver", () => {
  it("groups by over and labels legal balls as over.ball", () => {
    const dels = Array.from({ length: 7 }, (_, i) =>
      makeDelivery({
        id: `d${i}`,
        display_order: i + 1,
        runs_off_bat: 1,
      }),
    );
    const groups = groupDeliveriesByOver(dels);
    expect(groups).toHaveLength(2);
    expect(groups[0].balls).toHaveLength(6);
    expect(groups[0].balls[0].ballLabel).toBe("0.1");
    expect(groups[0].balls[5].ballLabel).toBe("0.6");
    expect(groups[1].balls[0].ballLabel).toBe("1.1");
  });

  it("keeps wides and retirements in the current over without advancing the ball", () => {
    const dels = [
      makeDelivery({ id: "d1", display_order: 1, runs_off_bat: 1 }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        extra_wide: 1,
        counts_as_legal_delivery: false,
        runs_off_bat: 0,
      }),
      makeDelivery({
        id: "d3",
        display_order: 3,
        is_wicket: true,
        dismissal: "retired_hurt",
        counts_as_legal_delivery: false,
        bowler_id: null,
      }),
      makeDelivery({ id: "d4", display_order: 4, runs_off_bat: 0 }),
    ];
    const groups = groupDeliveriesByOver(dels);
    expect(groups).toHaveLength(1);
    expect(groups[0].balls.map((b) => b.ballLabel)).toEqual([
      "0.1",
      "0.1 wd",
      "0.1 ret",
      "0.2",
    ]);
  });
});

describe("swapBattersFromDelivery (phase 2 hook)", () => {
  it("swaps two batters from a chosen ball onward, then recompute uses the new log", () => {
    const dels = [
      makeDelivery({ id: "d1", display_order: 1, runs_off_bat: 4, striker_id: "bat-1", non_striker_id: "bat-2" }),
      makeDelivery({ id: "d2", display_order: 2, runs_off_bat: 1, striker_id: "bat-1", non_striker_id: "bat-2" }),
      makeDelivery({ id: "d3", display_order: 3, runs_off_bat: 2, striker_id: "bat-2", non_striker_id: "bat-1" }),
    ];
    const swapped = swapBattersFromDelivery(dels, 2, "bat-1", "bat-2");
    expect(swapped[0].striker_id).toBe("bat-1");
    expect(swapped[1].striker_id).toBe("bat-2");
    expect(swapped[1].non_striker_id).toBe("bat-1");
    expect(swapped[2].striker_id).toBe("bat-1");
    expect(swapped[2].non_striker_id).toBe("bat-2");

    const card = computeInningsScorecard({
      deliveries: swapped,
      battingSide: "a",
      bowlingSide: "b",
      players: makePlayers(),
      name: nameOf,
    });
    expect(card.batting.find((r) => r.playerId === "bat-1")?.runs).toBe(6);
    expect(card.batting.find((r) => r.playerId === "bat-2")?.runs).toBe(1);
  });
});
