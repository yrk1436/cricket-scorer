import { describe, expect, it } from "vitest";
import {
  assertApplyFreshness,
  assertSameDeliveryIdentity,
  buildApplyPayload,
  changedDeliveries,
  deliveryIdsByInnings,
  describeDraftOps,
  dismissalCreasePropagation,
  diffMatchScorecards,
  effectiveReplaceFromOrder,
  findInningsContinuityIssues,
  replayDraftOps,
  StaleMatchEditError,
  validateDeliveryEdit,
  validateDraftLogs,
  validateInningsLog,
  validateReplace,
  validateSwap,
  type DraftOp,
} from "./edit-draft";
import {
  applyDeliveryEdit,
  ballLabelForDelivery,
  derivedMatchState,
  type DeliveryEditInput,
} from "./recompute";
import { computeInningsScorecard } from "./scorecard-stats";
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

const THREE_BALLS = [
  makeDelivery({ id: "d1", display_order: 1, runs_off_bat: 4, striker_id: "bat-1", non_striker_id: "bat-2" }),
  makeDelivery({ id: "d2", display_order: 2, runs_off_bat: 1, striker_id: "bat-1", non_striker_id: "bat-2" }),
  makeDelivery({ id: "d3", display_order: 3, runs_off_bat: 2, striker_id: "bat-2", non_striker_id: "bat-1" }),
];

describe("swap from a chosen ball onward", () => {
  it("flips only that ball and later IDs; earlier balls stay put", () => {
    const draft = replayDraftOps(
      { "inn-1": THREE_BALLS },
      [
        {
          kind: "swap",
          deliveryId: "d2",
          inningsId: "inn-1",
          fromDisplayOrder: 2,
          a: "bat-1",
          b: "bat-2",
        },
      ],
    )["inn-1"];

    expect(draft[0].striker_id).toBe("bat-1");
    expect(draft[0].non_striker_id).toBe("bat-2");
    expect(draft[1].striker_id).toBe("bat-2");
    expect(draft[1].non_striker_id).toBe("bat-1");
    expect(draft[2].striker_id).toBe("bat-1");
    expect(draft[2].non_striker_id).toBe("bat-2");

    const card = computeInningsScorecard({
      deliveries: draft,
      battingSide: "a",
      bowlingSide: "b",
      players: makePlayers(),
      name: nameOf,
    });
    expect(card.batting.find((r) => r.playerId === "bat-1")?.runs).toBe(6);
    expect(card.batting.find((r) => r.playerId === "bat-2")?.runs).toBe(1);
  });
});

describe("stacking draft ops", () => {
  it("ball edit then swap matches applying both to a copy of the list", () => {
    const ops: DraftOp[] = [
      {
        kind: "ball",
        deliveryId: "d1",
        inningsId: "inn-1",
        input: baseEdit({ runsOffBat: 6 }),
      },
      {
        kind: "swap",
        deliveryId: "d2",
        inningsId: "inn-1",
        fromDisplayOrder: 2,
        a: "bat-1",
        b: "bat-2",
      },
    ];
    const stacked = replayDraftOps({ "inn-1": THREE_BALLS }, ops)["inn-1"];

    const afterBall = THREE_BALLS.map((d) =>
      d.id === "d1" ? applyDeliveryEdit(d, baseEdit({ runsOffBat: 6 })) : { ...d },
    );
    const manual = replayDraftOps(
      { "inn-1": afterBall },
      [ops[1]],
    )["inn-1"];

    expect(stacked.map((d) => [d.id, d.striker_id, d.runs_off_bat])).toEqual(
      manual.map((d) => [d.id, d.striker_id, d.runs_off_bat]),
    );
    expect(stacked[0].runs_off_bat).toBe(6);
    expect(stacked[1].striker_id).toBe("bat-2");
  });

  it("swap then ball edit matches applying both to a copy of the list", () => {
    const ops: DraftOp[] = [
      {
        kind: "swap",
        deliveryId: "d2",
        inningsId: "inn-1",
        fromDisplayOrder: 2,
        a: "bat-1",
        b: "bat-2",
      },
      {
        kind: "ball",
        deliveryId: "d2",
        inningsId: "inn-1",
        input: baseEdit({
          strikerId: "bat-2",
          nonStrikerId: "bat-1",
          runsOffBat: 3,
        }),
      },
    ];
    const stacked = replayDraftOps({ "inn-1": THREE_BALLS }, ops)["inn-1"];
    expect(stacked[0].striker_id).toBe("bat-1");
    expect(stacked[1].striker_id).toBe("bat-2");
    expect(stacked[1].runs_off_bat).toBe(3);
  });
});

describe("scorecard diff highlighting", () => {
  it("highlights the batter, team total, and flipped result when runs 1 → 2", () => {
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
    const draftChase = replayDraftOps(
      { "inn-1": first, "inn-2": chase },
      [
        {
          kind: "ball",
          deliveryId: "b1",
          inningsId: "inn-2",
          input: baseEdit({
            strikerId: "bowl-1",
            nonStrikerId: "bowl-2",
            bowlerId: "bat-1",
            runsOffBat: 6,
          }),
        },
      ],
    );

    const diff = diffMatchScorecards({
      teamAName: "Aces",
      teamBName: "Bears",
      inningsCount: 2,
      players: makePlayers(),
      innings: [inn1, inn2],
      savedDeliveries: { "inn-1": first, "inn-2": chase },
      draftDeliveries: draftChase,
    });

    expect(diff.result.changed).toBe(true);
    expect(diff.hasScoreChange).toBe(true);
    const chaseDiff = diff.innings.find((i) => i.inningsId === "inn-2")!;
    expect(chaseDiff.totals.changed).toBe(true);
    expect(chaseDiff.totals.before).toContain("4/0");
    expect(chaseDiff.totals.after).toContain("6/0");
    const kumar = chaseDiff.batting.find((r) => r.key === "bowl-1");
    expect(kumar?.changed).toBe(true);
    expect(kumar?.before).toContain("4 (1)");
    expect(kumar?.after).toContain("6 (1)");

    const firstDiff = diff.innings.find((i) => i.inningsId === "inn-1")!;
    expect(firstDiff.bowling.every((r) => !r.changed)).toBe(true);
  });

  it("leaves unchanged bowlers quiet when only a batter's runs move", () => {
    const dels = [
      makeDelivery({ id: "d1", display_order: 1, runs_off_bat: 1, bowler_id: "bowl-1" }),
      makeDelivery({ id: "d2", display_order: 2, runs_off_bat: 0, bowler_id: "bowl-2" }),
    ];
    const draft = replayDraftOps(
      { "inn-1": dels },
      [
        {
          kind: "ball",
          deliveryId: "d1",
          inningsId: "inn-1",
          input: baseEdit({ runsOffBat: 2 }),
        },
      ],
    );
    const diff = diffMatchScorecards({
      teamAName: "A",
      teamBName: "B",
      inningsCount: 1,
      players: makePlayers(),
      innings: [inningsRow()],
      savedDeliveries: { "inn-1": dels },
      draftDeliveries: draft,
    });
    const bowl = diff.innings[0].bowling.find((r) => r.key === "bowl-1");
    expect(bowl?.changed).toBe(true);
    expect(bowl?.before).toBe("0-1 (0.1)");
    expect(bowl?.after).toBe("0-2 (0.1)");
    expect(diff.innings[0].bowling.filter((r) => r.key !== "bowl-1").every((r) => !r.changed)).toBe(
      true,
    );
  });
});

describe("validation", () => {
  it("rejects the same person as striker and non-striker", () => {
    const delivery = makeDelivery({ runs_off_bat: 1 });
    expect(
      validateDeliveryEdit({
        delivery,
        input: baseEdit({ strikerId: "bat-1", nonStrikerId: "bat-1" }),
        battingSide: "a",
        players: makePlayers(),
      }),
    ).toMatch(/different people/i);

    const bad = applyDeliveryEdit(
      delivery,
      baseEdit({ strikerId: "bat-1", nonStrikerId: "bat-1" }),
    );
    expect(
      validateInningsLog({
        deliveries: [bad],
        battingSide: "a",
        players: makePlayers(),
      }),
    ).toMatch(/different people/i);
  });

  it("rejects a dismissed batter returning later", () => {
    const dels = [
      makeDelivery({
        id: "d1",
        display_order: 1,
        is_wicket: true,
        dismissal: "bowled",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        striker_id: "bat-1",
        non_striker_id: "bat-2",
      }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        striker_id: "bat-1",
        non_striker_id: "bat-2",
        runs_off_bat: 1,
      }),
    ];
    expect(
      validateInningsLog({
        deliveries: dels,
        battingSide: "a",
        players: makePlayers(),
      }),
    ).toMatch(/out or retired out is still batting/i);
  });

  it("allows a retired-not-out batter to return later", () => {
    const dels = [
      makeDelivery({
        id: "d1",
        display_order: 1,
        is_wicket: true,
        dismissal: "retired_hurt",
        counts_as_legal_delivery: false,
        bowler_id: null,
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        striker_id: "bat-1",
        non_striker_id: "bat-2",
      }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        striker_id: "bat-1",
        non_striker_id: "bat-2",
        runs_off_bat: 1,
      }),
    ];
    expect(
      validateInningsLog({
        deliveries: dels,
        battingSide: "a",
        players: makePlayers(),
      }),
    ).toBeNull();
  });

  it("rejects a swap of the same batter or a special row", () => {
    expect(
      validateSwap({
        delivery: makeDelivery({}),
        a: "bat-1",
        b: "bat-1",
        battingSide: "a",
        players: makePlayers(),
      }),
    ).toMatch(/two different/i);

    expect(
      validateSwap({
        delivery: makeDelivery({ is_strike_swap: true }),
        a: "bat-1",
        b: "bat-2",
        battingSide: "a",
        players: makePlayers(),
      }),
    ).toMatch(/strike-swap/i);
  });
});

describe("apply payload identity and stale writes", () => {
  it("keeps the same ball ids and order after replay", () => {
    const base = { "inn-1": THREE_BALLS };
    const draft = replayDraftOps(base, [
      {
        kind: "ball",
        deliveryId: "d2",
        inningsId: "inn-1",
        input: baseEdit({ runsOffBat: 2 }),
      },
      {
        kind: "swap",
        deliveryId: "d3",
        inningsId: "inn-1",
        fromDisplayOrder: 3,
        a: "bat-1",
        b: "bat-2",
      },
    ]);
    const payload = buildApplyPayload({
      expectedUpdatedAt: "2026-10-16T14:00:00.000Z",
      deliveriesByInningsId: base,
      operations: [],
    });
    expect(payload.expectedDeliveryIdsByInningsId).toEqual({
      "inn-1": ["d1", "d2", "d3"],
    });
    expect(deliveryIdsByInnings(draft)).toEqual(payload.expectedDeliveryIdsByInningsId);
    expect(() =>
      assertSameDeliveryIdentity(
        payload.expectedDeliveryIdsByInningsId,
        deliveryIdsByInnings(draft),
      ),
    ).not.toThrow();
    expect(changedDeliveries(base, draft).map((d) => d.id).sort()).toEqual(["d2", "d3"]);
  });

  it("rejects a missing or extra delivery id", () => {
    expect(() =>
      assertSameDeliveryIdentity({ "inn-1": ["d1", "d2"] }, { "inn-1": ["d1"] }),
    ).toThrow(/same ball ids and order/i);
    expect(() =>
      assertSameDeliveryIdentity({ "inn-1": ["d1", "d2"] }, { "inn-1": ["d1", "d2", "d3"] }),
    ).toThrow(/same ball ids and order/i);
    expect(() =>
      assertSameDeliveryIdentity({ "inn-1": ["d1", "d2"] }, { "inn-1": ["d2", "d1"] }),
    ).toThrow(/same ball ids and order/i);
  });

  it("rejects a stale updated_at and does not treat the draft as writable", () => {
    const ids = { "inn-1": ["d1", "d2"] };
    expect(() =>
      assertApplyFreshness({
        expectedUpdatedAt: "2026-10-16T14:00:00.000Z",
        actualUpdatedAt: "2026-10-16T15:00:00.000Z",
        expectedIds: ids,
        actualIds: ids,
      }),
    ).toThrow(StaleMatchEditError);

    expect(() =>
      assertApplyFreshness({
        expectedUpdatedAt: "2026-10-16T14:00:00.000Z",
        actualUpdatedAt: "2026-10-16T14:00:00.000Z",
        expectedIds: ids,
        actualIds: { "inn-1": ["d1", "d2", "d-new"] },
      }),
    ).toThrow(StaleMatchEditError);
  });

  it("accepts the same timestamp and identity", () => {
    expect(() =>
      assertApplyFreshness({
        expectedUpdatedAt: "2026-10-16T14:00:00.000Z",
        actualUpdatedAt: "2026-10-16T14:00:00.000+00:00",
        expectedIds: { "inn-1": ["d1"] },
        actualIds: { "inn-1": ["d1"] },
      }),
    ).not.toThrow();
  });

  it("describes stacked ops for one session history line", () => {
    const described = describeDraftOps(
      { "inn-1": THREE_BALLS },
      [
        {
          kind: "ball",
          deliveryId: "d1",
          inningsId: "inn-1",
          input: baseEdit({ runsOffBat: 6 }),
        },
        {
          kind: "swap",
          deliveryId: "d2",
          inningsId: "inn-1",
          fromDisplayOrder: 2,
          a: "bat-1",
          b: "bat-2",
        },
      ],
      nameOf,
    );
    expect(described.summary).toBe("1 ball edit, 1 batter swap");
    expect(described.operations[0].summary).toMatch(/Ali/);
    expect(described.operations[0].summary).toMatch(/4 → 6/);
    expect(described.operations[1].summary).toMatch(/swap Ali ↔ Raj from here onward/);
  });

  it("keeps validation passing for a legal stacked draft", () => {
    const draft = replayDraftOps(
      { "inn-1": THREE_BALLS },
      [
        {
          kind: "ball",
          deliveryId: "d1",
          inningsId: "inn-1",
          input: baseEdit({ runsOffBat: 2 }),
        },
      ],
    );
    expect(
      validateDraftLogs({
        innings: [inningsRow()],
        players: makePlayers(),
        deliveriesByInningsId: draft,
      }),
    ).toBeNull();
    expect(
      derivedMatchState({
        teamAName: "A",
        teamBName: "B",
        inningsCount: 1,
        players: makePlayers(),
        innings: [inningsRow()],
        deliveriesByInningsId: draft,
      }).innings[0].runs,
    ).toBe(5);
  });
});

describe("dismissal crease propagation", () => {
  const retirementLog = [
    makeDelivery({
      id: "d0",
      display_order: 1,
      runs_off_bat: 1,
      striker_id: "bat-2",
      non_striker_id: "bat-1",
    }),
    makeDelivery({
      id: "d-ret",
      display_order: 2,
      striker_id: "bat-2",
      non_striker_id: "bat-1",
      bowler_id: null,
      runs_off_bat: 0,
      counts_as_legal_delivery: false,
      is_wicket: true,
      dismissal: "retired_hurt",
      dismissed_batsman_id: "bat-1",
      incoming_striker_id: "bat-3",
    }),
    makeDelivery({
      id: "d-next",
      display_order: 3,
      striker_id: "bat-1",
      non_striker_id: "bat-3",
      runs_off_bat: 1,
    }),
    makeDelivery({
      id: "d-later",
      display_order: 4,
      striker_id: "bat-2",
      non_striker_id: "bat-3",
      runs_off_bat: 2,
    }),
  ];

  const flipWhoRetired = baseEdit({
    strikerId: "bat-2",
    nonStrikerId: "bat-1",
    bowlerId: null,
    runsOffBat: 0,
    isWicket: true,
    dismissal: "retired_hurt",
    dismissedBatsmanId: "bat-2",
    incomingStrikerId: "bat-3",
  });

  it("replaces the newly retired batter with the previous one from the next ball onward", () => {
    const prop = dismissalCreasePropagation(retirementLog[1], flipWhoRetired);
    expect(prop).toEqual({ removeId: "bat-2", stayId: "bat-1" });

    const draft = replayDraftOps(
      { "inn-1": retirementLog },
      [
        {
          kind: "ball",
          deliveryId: "d-ret",
          inningsId: "inn-1",
          input: flipWhoRetired,
          propagateDismissed: true,
        },
      ],
    )["inn-1"];

    expect(draft[0].striker_id).toBe("bat-2");
    expect(draft[1].dismissed_batsman_id).toBe("bat-2");
    expect(draft[2].striker_id).toBe("bat-1");
    expect(draft[2].non_striker_id).toBe("bat-3");
    expect(draft[3].striker_id).toBe("bat-1");
    expect(draft[3].non_striker_id).toBe("bat-3");

    const described = describeDraftOps(
      { "inn-1": retirementLog },
      [
        {
          kind: "ball",
          deliveryId: "d-ret",
          inningsId: "inn-1",
          input: flipWhoRetired,
          propagateDismissed: true,
        },
      ],
      nameOf,
    );
    expect(described.operations[0].summary).toMatch(/later crease Raj → Ali/);
  });

  it("does not rewrite later creases when propagate is off", () => {
    const draft = replayDraftOps(
      { "inn-1": retirementLog },
      [
        {
          kind: "ball",
          deliveryId: "d-ret",
          inningsId: "inn-1",
          input: flipWhoRetired,
          propagateDismissed: false,
        },
      ],
    )["inn-1"];
    expect(draft[3].striker_id).toBe("bat-2");
  });

  it("uses incoming when replacing would put the same batter at both ends", () => {
    const pairLater = [
      makeDelivery({
        id: "d-ret",
        display_order: 1,
        striker_id: "bat-2",
        non_striker_id: "bat-1",
        bowler_id: null,
        runs_off_bat: 0,
        counts_as_legal_delivery: false,
        is_wicket: true,
        dismissal: "retired_hurt",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
      }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        striker_id: "bat-2",
        non_striker_id: "bat-1",
        runs_off_bat: 1,
      }),
    ];
    const draft = replayDraftOps(
      { "inn-1": pairLater },
      [
        {
          kind: "ball",
          deliveryId: "d-ret",
          inningsId: "inn-1",
          input: flipWhoRetired,
          propagateDismissed: true,
        },
      ],
    )["inn-1"];
    expect(draft[1].striker_id).toBe("bat-3");
    expect(draft[1].non_striker_id).toBe("bat-1");
  });

  it("flags a later ball where a retired-out batter is still batting", () => {
    const dels = [
      makeDelivery({
        id: "d1",
        display_order: 1,
        is_wicket: true,
        dismissal: "retired_out",
        counts_as_legal_delivery: false,
        bowler_id: null,
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        striker_id: "bat-1",
        non_striker_id: "bat-2",
      }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        striker_id: "bat-1",
        non_striker_id: "bat-2",
        runs_off_bat: 1,
      }),
    ];
    expect(
      validateInningsLog({
        deliveries: dels,
        battingSide: "a",
        players: makePlayers(),
      }),
    ).toMatch(/out or retired out is still batting/i);
  });

  it("propagates a regular wicket who-is-out change onto later creases", () => {
    const dels = [
      makeDelivery({
        id: "d1",
        display_order: 1,
        is_wicket: true,
        dismissal: "bowled",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        striker_id: "bat-1",
        non_striker_id: "bat-2",
      }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        striker_id: "bat-3",
        non_striker_id: "bat-2",
        runs_off_bat: 1,
      }),
      makeDelivery({
        id: "d3",
        display_order: 3,
        striker_id: "bat-1",
        non_striker_id: "bat-3",
        runs_off_bat: 1,
      }),
    ];
    const draft = replayDraftOps(
      { "inn-1": dels },
      [
        {
          kind: "ball",
          deliveryId: "d1",
          inningsId: "inn-1",
          input: baseEdit({
            isWicket: true,
            dismissal: "bowled",
            dismissedBatsmanId: "bat-2",
            incomingStrikerId: "bat-3",
          }),
          propagateDismissed: true,
        },
      ],
    )["inn-1"];
    expect(draft[0].dismissed_batsman_id).toBe("bat-2");
    expect(draft[2].striker_id).toBe("bat-1");
    expect(
      validateInningsLog({
        deliveries: draft,
        battingSide: "a",
        players: makePlayers(),
      }),
    ).toBeNull();
  });
});

describe("replace batter from this ball onward", () => {
  const savedRetirement = [
    makeDelivery({
      id: "d-ret",
      display_order: 1,
      striker_id: "bat-1",
      non_striker_id: "bat-2",
      bowler_id: null,
      runs_off_bat: 0,
      counts_as_legal_delivery: false,
      is_wicket: true,
      dismissal: "retired_hurt",
      dismissed_batsman_id: "bat-2",
      incoming_striker_id: "bat-3",
    }),
    makeDelivery({
      id: "d-7-1",
      display_order: 2,
      striker_id: "bat-1",
      non_striker_id: "bat-3",
      runs_off_bat: 1,
    }),
    makeDelivery({
      id: "d-7-2",
      display_order: 3,
      striker_id: "bat-2",
      non_striker_id: "bat-3",
      runs_off_bat: 2,
    }),
  ];

  it("replaces the batter on this and later creases only", () => {
    const draft = replayDraftOps(
      { "inn-1": savedRetirement },
      [
        {
          kind: "replace",
          deliveryId: "d-7-1",
          inningsId: "inn-1",
          fromDisplayOrder: 2,
          fromId: "bat-2",
          toId: "bat-1",
        },
      ],
    )["inn-1"];
    expect(draft[0].non_striker_id).toBe("bat-2");
    expect(draft[0].dismissed_batsman_id).toBe("bat-2");
    expect(draft[1].striker_id).toBe("bat-1");
    expect(draft[2].striker_id).toBe("bat-1");
    expect(draft[2].non_striker_id).toBe("bat-3");
  });

  it("heals a stored retirement that was marked as a legal ball", () => {
    const dels = [
      makeDelivery({
        id: "d-ret",
        display_order: 1,
        is_wicket: true,
        dismissal: "retired_hurt",
        counts_as_legal_delivery: true,
        bowler_id: "bowl-1",
        dismissed_batsman_id: "bat-1",
        striker_id: "bat-1",
        non_striker_id: "bat-2",
      }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        runs_off_bat: 1,
        striker_id: "bat-3",
        non_striker_id: "bat-2",
      }),
    ];
    const draft = replayDraftOps(
      { "inn-1": dels },
      [
        {
          kind: "ball",
          deliveryId: "d2",
          inningsId: "inn-1",
          input: baseEdit({
            strikerId: "bat-3",
            nonStrikerId: "bat-2",
            runsOffBat: 2,
          }),
        },
      ],
    );
    expect(draft["inn-1"][0].counts_as_legal_delivery).toBe(false);
    expect(
      validateDraftLogs({
        innings: [inningsRow()],
        players: makePlayers(),
        deliveriesByInningsId: draft,
      }),
    ).toBeNull();
  });

  it("allows replacing with a crease batter or retired-not-out batter", () => {
    expect(
      validateReplace({
        delivery: savedRetirement[1],
        fromId: "bat-2",
        toId: "bat-1",
        battingSide: "a",
        players: makePlayers(),
      }),
    ).toBeNull();
  });

  it("re-check flags a retired batter still batting and the fix clears it", () => {
    const issues = findInningsContinuityIssues({
      innings: [inningsRow()],
      deliveriesByInningsId: { "inn-1": savedRetirement },
      name: nameOf,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].removeId).toBe("bat-2");
    expect(issues[0].stayId).toBe("bat-1");
    expect(issues[0].fromLabel).toBe("0.1");
    expect(issues[0].fixLabel).toMatch(/replace Raj with Ali from 0.1/);

    const fixed = replayDraftOps(
      { "inn-1": savedRetirement },
      [
        {
          kind: "replace",
          deliveryId: issues[0].fromDeliveryId,
          inningsId: "inn-1",
          fromDisplayOrder: issues[0].fromDisplayOrder,
          fromId: issues[0].removeId,
          toId: issues[0].stayId,
        },
      ],
    );
    expect(
      findInningsContinuityIssues({
        innings: [inningsRow()],
        deliveriesByInningsId: fixed,
        name: nameOf,
      }),
    ).toHaveLength(0);
  });

  it("starting on the 7.0 retirement keeps that record and puts Roop on 7.2+", () => {
    const draft = replayDraftOps(
      { "inn-1": savedRetirement },
      [
        {
          kind: "replace",
          deliveryId: "d-ret",
          inningsId: "inn-1",
          fromDisplayOrder: 1,
          fromId: "bat-2",
          toId: "bat-1",
        },
      ],
    );
    const balls = draft["inn-1"];
    expect(balls[0].striker_id).toBe("bat-1");
    expect(balls[0].non_striker_id).toBe("bat-2");
    expect(balls[0].dismissed_batsman_id).toBe("bat-2");
    expect(balls[0].dismissal).toBe("retired_hurt");
    expect(balls[1].striker_id).toBe("bat-1");
    expect(balls[2].striker_id).toBe("bat-1");
    expect(balls[2].non_striker_id).toBe("bat-3");
    expect(
      validateDraftLogs({
        innings: [inningsRow()],
        players: makePlayers(),
        deliveriesByInningsId: draft,
      }),
    ).toBeNull();
    expect(
      findInningsContinuityIssues({
        innings: [inningsRow()],
        deliveriesByInningsId: draft,
        name: nameOf,
      }),
    ).toHaveLength(0);
  });

  it("7.0 retired not out Deepak (striker Roop, NS Deepak) replace yields Roop from 7.2", () => {
    const players: DbPlayer[] = [
      {
        id: "roop",
        match_id: "m1",
        side: "a",
        display_name: "Roop",
        sort_order: 0,
        did_not_bat: false,
      },
      {
        id: "deepak",
        match_id: "m1",
        side: "a",
        display_name: "Deepak",
        sort_order: 1,
        did_not_bat: false,
      },
      {
        id: "inc",
        match_id: "m1",
        side: "a",
        display_name: "Incoming",
        sort_order: 2,
        did_not_bat: false,
      },
      {
        id: "bowl-1",
        match_id: "m1",
        side: "b",
        display_name: "Bowler",
        sort_order: 0,
        did_not_bat: false,
      },
    ];
    const name = (id: string | null | undefined) =>
      players.find((p) => p.id === id)?.display_name ?? "—";

    const pads = Array.from({ length: 42 }, (_, i) =>
      makeDelivery({
        id: `pad-${i}`,
        display_order: i + 1,
        striker_id: "roop",
        non_striker_id: "deepak",
        runs_off_bat: 0,
      }),
    );
    const retirement = makeDelivery({
      id: "d-7-0",
      display_order: 43,
      striker_id: "roop",
      non_striker_id: "deepak",
      bowler_id: null,
      runs_off_bat: 0,
      counts_as_legal_delivery: false,
      is_wicket: true,
      dismissal: "retired_hurt",
      dismissed_batsman_id: "deepak",
      incoming_striker_id: "inc",
    });
    const ball71 = makeDelivery({
      id: "d-7-1",
      display_order: 44,
      striker_id: "roop",
      non_striker_id: "inc",
      runs_off_bat: 1,
    });
    const ball72 = makeDelivery({
      id: "d-7-2",
      display_order: 45,
      striker_id: "deepak",
      non_striker_id: "inc",
      runs_off_bat: 2,
    });
    const ball73 = makeDelivery({
      id: "d-7-3",
      display_order: 46,
      striker_id: "deepak",
      non_striker_id: "inc",
      runs_off_bat: 1,
    });
    const log = [...pads, retirement, ball71, ball72, ball73];

    expect(ballLabelForDelivery(log, "d-7-0")).toBe("7.0 ret");
    expect(ballLabelForDelivery(log, "d-7-2")).toBe("7.2");
    expect(
      effectiveReplaceFromOrder(log, retirement, retirement.display_order),
    ).toBe(ball71.display_order);

    expect(
      validateReplace({
        delivery: retirement,
        fromId: "deepak",
        toId: "roop",
        battingSide: "a",
        players,
      }),
    ).toBeNull();

    const issues = findInningsContinuityIssues({
      innings: [inningsRow()],
      deliveriesByInningsId: { "inn-1": log },
      name,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].removeId).toBe("deepak");
    expect(issues[0].stayId).toBe("roop");
    expect(issues[0].fromLabel).toBe("7.1");
    expect(issues[0].fixLabel).toBe("Fix: replace Deepak with Roop from 7.1");

    const fromRetirement: DraftOp = {
      kind: "replace",
      deliveryId: "d-7-0",
      inningsId: "inn-1",
      fromDisplayOrder: retirement.display_order,
      fromId: "deepak",
      toId: "roop",
    };
    const fromRecheck: DraftOp = {
      kind: "replace",
      deliveryId: issues[0].fromDeliveryId,
      inningsId: "inn-1",
      fromDisplayOrder: issues[0].fromDisplayOrder,
      fromId: issues[0].removeId,
      toId: issues[0].stayId,
    };

    for (const op of [fromRetirement, fromRecheck]) {
      const draft = replayDraftOps({ "inn-1": log }, [op]);
      const balls = draft["inn-1"];
      const ret = balls.find((d) => d.id === "d-7-0")!;
      const later = balls.filter((d) => d.display_order >= ball72.display_order);

      expect(ret.striker_id).toBe("roop");
      expect(ret.non_striker_id).toBe("deepak");
      expect(ret.dismissed_batsman_id).toBe("deepak");
      expect(ret.dismissal).toBe("retired_hurt");
      expect(later.every((d) => d.striker_id === "roop")).toBe(true);
      expect(later.every((d) => d.non_striker_id === "inc")).toBe(true);
      expect(later.some((d) => d.striker_id === "deepak")).toBe(false);

      expect(
        validateDraftLogs({
          innings: [inningsRow()],
          players,
          deliveriesByInningsId: draft,
        }),
      ).toBeNull();
      expect(
        findInningsContinuityIssues({
          innings: [inningsRow()],
          deliveriesByInningsId: draft,
          name,
        }),
      ).toHaveLength(0);
    }
  });

  it("also moves who-is-out when that batter leaves a later wicket crease", () => {
    const withLaterWicket = [
      ...savedRetirement,
      makeDelivery({
        id: "d-out",
        display_order: 4,
        striker_id: "bat-2",
        non_striker_id: "bat-3",
        is_wicket: true,
        dismissal: "bowled",
        dismissed_batsman_id: "bat-2",
        incoming_striker_id: null,
      }),
    ];
    const draft = replayDraftOps(
      { "inn-1": withLaterWicket },
      [
        {
          kind: "replace",
          deliveryId: "d-ret",
          inningsId: "inn-1",
          fromDisplayOrder: 1,
          fromId: "bat-2",
          toId: "bat-1",
        },
      ],
    )["inn-1"];
    expect(draft[0].dismissed_batsman_id).toBe("bat-2");
    expect(draft[3].striker_id).toBe("bat-1");
    expect(draft[3].dismissed_batsman_id).toBe("bat-1");
    expect(
      validateDraftLogs({
        innings: [inningsRow()],
        players: makePlayers(),
        deliveriesByInningsId: { "inn-1": draft },
      }),
    ).toBeNull();
  });

  it("does not two-way swap: the replacement stays on later balls", () => {
    const draft = replayDraftOps(
      { "inn-1": savedRetirement },
      [
        {
          kind: "replace",
          deliveryId: "d-7-1",
          inningsId: "inn-1",
          fromDisplayOrder: 2,
          fromId: "bat-2",
          toId: "bat-1",
        },
      ],
    )["inn-1"];
    expect(draft[1].striker_id).toBe("bat-1");
    expect(draft[1].non_striker_id).toBe("bat-3");
  });
});
