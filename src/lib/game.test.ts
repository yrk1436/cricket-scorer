import { describe, it, expect } from "vitest";
import {
  awaitingNewOverBowler,
  currentOverProgress,
  replayInnings,
  wicketIncreasesCount,
} from "./game";
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
