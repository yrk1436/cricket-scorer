import { describe, it, expect } from "vitest";
import {
  awaitingNewOverBowler,
  currentOverProgress,
  replayInnings,
  wicketIncreasesCount,
} from "./game";
import { computeInningsScorecard } from "./scorecard-stats";
import type { DbDelivery, DbPlayer } from "./types";

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
    { id: "bat-1", match_id: "m1", side: "a", display_name: "Batter 1", sort_order: 0, did_not_bat: false },
    { id: "bat-2", match_id: "m1", side: "a", display_name: "Batter 2", sort_order: 1, did_not_bat: false },
    { id: "bat-3", match_id: "m1", side: "a", display_name: "Batter 3", sort_order: 2, did_not_bat: false },
    { id: "bat-4", match_id: "m1", side: "a", display_name: "Batter 4", sort_order: 3, did_not_bat: false },
    { id: "bowl-1", match_id: "m1", side: "b", display_name: "Bowler 1", sort_order: 0, did_not_bat: false },
    { id: "bowl-2", match_id: "m1", side: "b", display_name: "Bowler 2", sort_order: 1, did_not_bat: false },
  ];
}

describe("currentOverProgress", () => {
  it("returns 0/0 for empty deliveries", () => {
    const prog = currentOverProgress([], 0);
    expect(prog.legalBalls).toBe(0);
    expect(prog.totalBalls).toBe(0);
    expect(prog.needsNewBowler).toBe(false);
  });

  it("counts legal balls", () => {
    const dels = [
      makeDelivery({ display_order: 1, counts_as_legal_delivery: true }),
      makeDelivery({ display_order: 2, counts_as_legal_delivery: true }),
      makeDelivery({ display_order: 3, counts_as_legal_delivery: true }),
    ];
    const prog = currentOverProgress(dels, 0);
    expect(prog.legalBalls).toBe(3);
    expect(prog.totalBalls).toBe(3);
  });

  it("resets to 0 after 6 legal balls", () => {
    const dels = Array.from({ length: 6 }, (_, i) =>
      makeDelivery({ id: `del-${i}`, display_order: i + 1, counts_as_legal_delivery: true })
    );
    const prog = currentOverProgress(dels, 0);
    expect(prog.legalBalls).toBe(0);
    expect(prog.totalBalls).toBe(0);
    expect(prog.needsNewBowler).toBe(true);
  });

  it("counts wides as illegal balls", () => {
    const dels = [
      makeDelivery({ display_order: 1, counts_as_legal_delivery: true }),
      makeDelivery({ display_order: 2, counts_as_legal_delivery: false, extra_wide: 1 }),
      makeDelivery({ display_order: 3, counts_as_legal_delivery: true }),
    ];
    const prog = currentOverProgress(dels, 0);
    expect(prog.legalBalls).toBe(2);
    expect(prog.totalBalls).toBe(3);
    expect(prog.illegalBalls).toBe(1);
  });
});

describe("awaitingNewOverBowler", () => {
  it("returns false for no deliveries", () => {
    expect(awaitingNewOverBowler([], 0, 0)).toBe(false);
  });

  it("returns true after 6 legal balls", () => {
    const dels = Array.from({ length: 6 }, (_, i) =>
      makeDelivery({ id: `del-${i}`, display_order: i + 1, counts_as_legal_delivery: true })
    );
    expect(awaitingNewOverBowler(dels, 6, 0)).toBe(true);
  });

  it("returns false mid-over", () => {
    const dels = [
      makeDelivery({ display_order: 1, counts_as_legal_delivery: true }),
      makeDelivery({ display_order: 2, counts_as_legal_delivery: true }),
    ];
    expect(awaitingNewOverBowler(dels, 2, 0)).toBe(false);
  });
});

describe("replayInnings", () => {
  it("replays a simple innings with runs", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 1 }),
      makeDelivery({ display_order: 2, runs_off_bat: 4 }),
    ];
    const sim = replayInnings("a", players, dels, null, 0);
    expect(sim).not.toBeNull();
    expect(sim!.runs).toBe(5);
    expect(sim!.wickets).toBe(0);
    expect(sim!.balls_legal).toBe(2);
  });

  it("handles wicket with incoming batter", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({
        display_order: 1,
        is_wicket: true,
        dismissal: "bowled",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
      }),
    ];
    const sim = replayInnings("a", players, dels, null, 0);
    expect(sim).not.toBeNull();
    expect(sim!.wickets).toBe(1);
    expect(sim!.dismissedIds.has("bat-1")).toBe(true);
    expect(sim!.strikerId).toBe("bat-3");
  });

  it("handles wicket without incoming batter (partial undo scenario)", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({
        display_order: 1,
        is_wicket: true,
        dismissal: "bowled",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: null,
      }),
    ];
    const sim = replayInnings("a", players, dels, null, 0);
    expect(sim).not.toBeNull();
    expect(sim!.wickets).toBe(1);
    expect(sim!.dismissedIds.has("bat-1")).toBe(true);
    // With no incoming_striker_id, the replay should pick next available batter
    expect(["bat-3", "bat-4"].includes(sim!.strikerId)).toBe(true);
  });

  it("handles retired out - counts as wicket but not a legal ball", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 2 }),
      makeDelivery({
        display_order: 2,
        is_wicket: true,
        dismissal: "retired_out",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        counts_as_legal_delivery: false,
        bowler_id: null,
      }),
    ];
    const sim = replayInnings("a", players, dels, null, 0);
    expect(sim).not.toBeNull();
    expect(sim!.wickets).toBe(1);
    expect(sim!.balls_legal).toBe(1);
    expect(sim!.dismissedIds.has("bat-1")).toBe(true);
    expect(sim!.strikerId).toBe("bat-3");
  });

  it("handles retired not out (retired_hurt) - does not count as wicket or ball", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 2 }),
      makeDelivery({
        display_order: 2,
        is_wicket: true,
        dismissal: "retired_hurt",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        counts_as_legal_delivery: false,
        bowler_id: null,
      }),
    ];
    const sim = replayInnings("a", players, dels, null, 0);
    expect(sim).not.toBeNull();
    expect(sim!.wickets).toBe(0);
    expect(sim!.balls_legal).toBe(1);
    expect(sim!.dismissedIds.has("bat-1")).toBe(false);
    expect(sim!.strikerId).toBe("bat-3");
  });

  it("retired hurt batter is not in dismissedIds and can potentially return", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 2 }),
      makeDelivery({
        display_order: 2,
        is_wicket: true,
        dismissal: "retired_hurt",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        counts_as_legal_delivery: false,
        bowler_id: null,
      }),
    ];
    const sim = replayInnings("a", players, dels, null, 0);
    expect(sim).not.toBeNull();
    expect(sim!.dismissedIds.has("bat-1")).toBe(false);
  });

  it("handles non-striker retired out - incoming batter takes non-striker end", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 2 }),
      makeDelivery({
        display_order: 2,
        is_wicket: true,
        dismissal: "retired_out",
        dismissed_batsman_id: "bat-2",
        incoming_striker_id: "bat-3",
        counts_as_legal_delivery: false,
        bowler_id: null,
      }),
    ];
    const sim = replayInnings("a", players, dels, null, 0);
    expect(sim).not.toBeNull();
    expect(sim!.wickets).toBe(1);
    expect(sim!.balls_legal).toBe(1);
    expect(sim!.dismissedIds.has("bat-2")).toBe(true);
    expect(sim!.strikerId).toBe("bat-1");
    expect(sim!.nonStrikerId).toBe("bat-3");
  });

  it("handles non-striker retired not out - incoming batter takes non-striker end", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 2 }),
      makeDelivery({
        display_order: 2,
        is_wicket: true,
        dismissal: "retired_hurt",
        dismissed_batsman_id: "bat-2",
        incoming_striker_id: "bat-3",
        counts_as_legal_delivery: false,
        bowler_id: null,
      }),
    ];
    const sim = replayInnings("a", players, dels, null, 0);
    expect(sim).not.toBeNull();
    expect(sim!.wickets).toBe(0);
    expect(sim!.balls_legal).toBe(1);
    expect(sim!.dismissedIds.has("bat-2")).toBe(false);
    expect(sim!.strikerId).toBe("bat-1");
    expect(sim!.nonStrikerId).toBe("bat-3");
  });
});

describe("currentOverProgress with retirements", () => {
  it("retirement does not count towards legal balls in over", () => {
    const dels = [
      makeDelivery({ display_order: 1, counts_as_legal_delivery: true }),
      makeDelivery({ display_order: 2, counts_as_legal_delivery: true }),
      makeDelivery({
        display_order: 3,
        is_wicket: true,
        dismissal: "retired_out",
        counts_as_legal_delivery: false,
      }),
      makeDelivery({ display_order: 4, counts_as_legal_delivery: true }),
    ];
    const prog = currentOverProgress(dels, 0);
    expect(prog.legalBalls).toBe(3);
    expect(prog.totalBalls).toBe(4);
  });

  it("over does not end after retirement even with 6 total balls", () => {
    const dels = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeDelivery({ id: `del-${i}`, display_order: i + 1, counts_as_legal_delivery: true })
      ),
      makeDelivery({
        id: "del-ret",
        display_order: 6,
        is_wicket: true,
        dismissal: "retired_hurt",
        counts_as_legal_delivery: false,
      }),
    ];
    const prog = currentOverProgress(dels, 0);
    expect(prog.legalBalls).toBe(5);
    expect(prog.needsNewBowler).toBe(false);
  });
});

describe("wicketIncreasesCount", () => {
  it("returns true for regular dismissals", () => {
    expect(wicketIncreasesCount(true, "bowled")).toBe(true);
    expect(wicketIncreasesCount(true, "caught")).toBe(true);
    expect(wicketIncreasesCount(true, "lbw")).toBe(true);
    expect(wicketIncreasesCount(true, "run_out")).toBe(true);
    expect(wicketIncreasesCount(true, "stumped")).toBe(true);
    expect(wicketIncreasesCount(true, "hit_wicket")).toBe(true);
  });

  it("returns true for retired out (counts as wicket for team)", () => {
    expect(wicketIncreasesCount(true, "retired_out")).toBe(true);
  });

  it("returns false for retired not out (retired_hurt)", () => {
    expect(wicketIncreasesCount(true, "retired_hurt")).toBe(false);
  });

  it("returns false when isWicket is false", () => {
    expect(wicketIncreasesCount(false, "bowled")).toBe(false);
    expect(wicketIncreasesCount(false, "none")).toBe(false);
  });
});

describe("computeInningsScorecard with retirements", () => {
  const name = (id: string | null | undefined) => {
    const names: Record<string, string> = {
      "bat-1": "Batter 1",
      "bat-2": "Batter 2",
      "bat-3": "Batter 3",
      "bat-4": "Batter 4",
      "bowl-1": "Bowler 1",
    };
    return names[id ?? ""] ?? "Unknown";
  };

  it("retired not out batter shows correct dismissal text and isRetired flag", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 2, striker_id: "bat-1", non_striker_id: "bat-2" }),
      makeDelivery({
        display_order: 2,
        is_wicket: true,
        dismissal: "retired_hurt",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        counts_as_legal_delivery: false,
        bowler_id: null,
        striker_id: "bat-1",
        non_striker_id: "bat-2",
      }),
      makeDelivery({ display_order: 3, runs_off_bat: 4, striker_id: "bat-3", non_striker_id: "bat-2" }),
    ];
    const card = computeInningsScorecard({
      deliveries: dels,
      battingSide: "a",
      bowlingSide: "b",
      players,
      name,
    });

    const bat1 = card.batting.find((b) => b.playerId === "bat-1");
    expect(bat1).toBeDefined();
    expect(bat1!.dismissal).toBe("retired not out");
    expect(bat1!.out).toBe(false);
    expect(bat1!.isRetired).toBe(true);
    expect(bat1!.runs).toBe(2);
    expect(bat1!.balls).toBe(1);
  });

  it("retired out batter shows correct dismissal text and isRetired flag", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 2 }),
      makeDelivery({
        display_order: 2,
        is_wicket: true,
        dismissal: "retired_out",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        counts_as_legal_delivery: false,
        bowler_id: null,
      }),
    ];
    const card = computeInningsScorecard({
      deliveries: dels,
      battingSide: "a",
      bowlingSide: "b",
      players,
      name,
    });

    const bat1 = card.batting.find((b) => b.playerId === "bat-1");
    expect(bat1).toBeDefined();
    expect(bat1!.dismissal).toBe("retired out");
    expect(bat1!.out).toBe(true);
    expect(bat1!.isRetired).toBe(true);
  });

  it("current batters (not retired) show not out with isRetired false", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 2, striker_id: "bat-1", non_striker_id: "bat-2" }),
      makeDelivery({
        display_order: 2,
        is_wicket: true,
        dismissal: "retired_hurt",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        counts_as_legal_delivery: false,
        bowler_id: null,
        striker_id: "bat-1",
        non_striker_id: "bat-2",
      }),
      makeDelivery({ display_order: 3, runs_off_bat: 4, striker_id: "bat-3", non_striker_id: "bat-2" }),
    ];
    const card = computeInningsScorecard({
      deliveries: dels,
      battingSide: "a",
      bowlingSide: "b",
      players,
      name,
    });

    const bat2 = card.batting.find((b) => b.playerId === "bat-2");
    expect(bat2).toBeDefined();
    expect(bat2!.dismissal).toBe("not out");
    expect(bat2!.out).toBe(false);
    expect(bat2!.isRetired).toBe(false);

    const bat3 = card.batting.find((b) => b.playerId === "bat-3");
    expect(bat3).toBeDefined();
    expect(bat3!.dismissal).toBe("not out");
    expect(bat3!.out).toBe(false);
    expect(bat3!.isRetired).toBe(false);
  });

  it("only two current batters should be at crease after retirement", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 2, striker_id: "bat-1", non_striker_id: "bat-2" }),
      makeDelivery({
        display_order: 2,
        is_wicket: true,
        dismissal: "retired_hurt",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        counts_as_legal_delivery: false,
        bowler_id: null,
        striker_id: "bat-1",
        non_striker_id: "bat-2",
      }),
    ];
    const card = computeInningsScorecard({
      deliveries: dels,
      battingSide: "a",
      bowlingSide: "b",
      players,
      name,
    });

    const notOutNotRetired = card.batting.filter(
      (b) => !b.out && !b.didNotBat && !b.isRetired
    );
    expect(notOutNotRetired.length).toBe(2);
    expect(notOutNotRetired.map((b) => b.playerId).sort()).toEqual(["bat-2", "bat-3"]);
  });

  it("retired not out batter returns to crease when selected as incoming batter", () => {
    const players = makePlayers();
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 2, striker_id: "bat-1", non_striker_id: "bat-2" }),
      makeDelivery({
        display_order: 2,
        is_wicket: true,
        dismissal: "retired_hurt",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        counts_as_legal_delivery: false,
        bowler_id: null,
        striker_id: "bat-1",
        non_striker_id: "bat-2",
      }),
      makeDelivery({ display_order: 3, runs_off_bat: 1, striker_id: "bat-3", non_striker_id: "bat-2" }),
      makeDelivery({
        display_order: 4,
        is_wicket: true,
        dismissal: "bowled",
        dismissed_batsman_id: "bat-2",
        incoming_striker_id: "bat-1",
        striker_id: "bat-2",
        non_striker_id: "bat-3",
      }),
      makeDelivery({ display_order: 5, runs_off_bat: 4, striker_id: "bat-1", non_striker_id: "bat-3" }),
    ];
    const card = computeInningsScorecard({
      deliveries: dels,
      battingSide: "a",
      bowlingSide: "b",
      players,
      name,
    });

    const bat1 = card.batting.find((b) => b.playerId === "bat-1");
    expect(bat1).toBeDefined();
    expect(bat1!.dismissal).toBe("not out");
    expect(bat1!.out).toBe(false);
    expect(bat1!.isRetired).toBe(false);
    expect(bat1!.runs).toBe(6);
    expect(bat1!.balls).toBe(2);
  });
});
