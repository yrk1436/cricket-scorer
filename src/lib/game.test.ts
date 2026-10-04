import { describe, it, expect } from "vitest";
import {
  replayInnings,
  wicketIncreasesCount,
  RETIRE_HURT_NOTE,
} from "./game";
import type { DbDelivery, DbPlayer } from "./types";

const makePlayer = (id: string, side: "a" | "b", order: number): DbPlayer => ({
  id,
  match_id: "m1",
  side,
  display_name: `Player ${id}`,
  sort_order: order,
  did_not_bat: false,
});

const makeDelivery = (
  overrides: Partial<DbDelivery> & { id: string; display_order: number },
): DbDelivery => ({
  innings_id: "i1",
  striker_id: null,
  non_striker_id: null,
  bowler_id: null,
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
  created_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("wicketIncreasesCount", () => {
  it("returns true for regular dismissals", () => {
    expect(wicketIncreasesCount(true, "bowled")).toBe(true);
    expect(wicketIncreasesCount(true, "caught")).toBe(true);
    expect(wicketIncreasesCount(true, "lbw")).toBe(true);
    expect(wicketIncreasesCount(true, "run_out")).toBe(true);
    expect(wicketIncreasesCount(true, "stumped")).toBe(true);
    expect(wicketIncreasesCount(true, "hit_wicket")).toBe(true);
    expect(wicketIncreasesCount(true, "retired_out")).toBe(true);
  });

  it("returns false for retired_hurt", () => {
    expect(wicketIncreasesCount(true, "retired_hurt")).toBe(false);
  });

  it("returns false when isWicket is false", () => {
    expect(wicketIncreasesCount(false, "bowled")).toBe(false);
    expect(wicketIncreasesCount(false, "none")).toBe(false);
  });
});

describe("replayInnings - retired hurt tracking", () => {
  const batsmen: DbPlayer[] = [
    makePlayer("b1", "a", 0),
    makePlayer("b2", "a", 1),
    makePlayer("b3", "a", 2),
    makePlayer("b4", "a", 3),
    makePlayer("b5", "a", 4),
  ];

  const bowlers: DbPlayer[] = [
    makePlayer("bow1", "b", 0),
    makePlayer("bow2", "b", 1),
  ];

  const allPlayers = [...batsmen, ...bowlers];

  it("tracks retired-hurt batter in retiredHurtIds (via RETIRE_HURT_NOTE)", () => {
    const deliveries: DbDelivery[] = [
      makeDelivery({
        id: "d1",
        display_order: 1,
        striker_id: "b1",
        non_striker_id: "b2",
        bowler_id: "bow1",
        runs_off_bat: 4,
      }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        striker_id: "b1",
        non_striker_id: "b2",
        dismissed_batsman_id: "b1",
        incoming_striker_id: "b3",
        note: RETIRE_HURT_NOTE,
        counts_as_legal_delivery: false,
      }),
    ];

    const sim = replayInnings("a", allPlayers, deliveries);
    expect(sim).not.toBeNull();
    expect(sim!.retiredHurtIds.has("b1")).toBe(true);
    expect(sim!.strikerId).toBe("b3");
    expect(sim!.nonStrikerId).toBe("b2");
    expect(sim!.wickets).toBe(0);
    expect(sim!.runs).toBe(4);
  });

  it("tracks retired-hurt batter in retiredHurtIds (via retired_hurt dismissal)", () => {
    const deliveries: DbDelivery[] = [
      makeDelivery({
        id: "d1",
        display_order: 1,
        striker_id: "b1",
        non_striker_id: "b2",
        bowler_id: "bow1",
        runs_off_bat: 10,
      }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        striker_id: "b1",
        non_striker_id: "b2",
        bowler_id: "bow1",
        is_wicket: true,
        dismissal: "retired_hurt",
        dismissed_batsman_id: "b1",
        incoming_striker_id: "b3",
      }),
    ];

    const sim = replayInnings("a", allPlayers, deliveries);
    expect(sim).not.toBeNull();
    expect(sim!.retiredHurtIds.has("b1")).toBe(true);
    expect(sim!.dismissedIds.has("b1")).toBe(false);
    expect(sim!.wickets).toBe(0);
  });

  it("removes batter from retiredHurtIds when they return", () => {
    const deliveries: DbDelivery[] = [
      makeDelivery({
        id: "d1",
        display_order: 1,
        striker_id: "b1",
        non_striker_id: "b2",
        bowler_id: "bow1",
        runs_off_bat: 10,
      }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        striker_id: "b1",
        non_striker_id: "b2",
        dismissed_batsman_id: "b1",
        incoming_striker_id: "b3",
        note: RETIRE_HURT_NOTE,
        counts_as_legal_delivery: false,
      }),
      makeDelivery({
        id: "d3",
        display_order: 3,
        striker_id: "b3",
        non_striker_id: "b2",
        bowler_id: "bow1",
        is_wicket: true,
        dismissal: "bowled",
        dismissed_batsman_id: "b3",
        incoming_striker_id: "b1",
      }),
    ];

    const sim = replayInnings("a", allPlayers, deliveries);
    expect(sim).not.toBeNull();
    expect(sim!.retiredHurtIds.has("b1")).toBe(false);
    expect(sim!.dismissedIds.has("b3")).toBe(true);
    expect(sim!.wickets).toBe(1);
    expect(sim!.strikerId).toBe("b1");
  });

  it("allows retired-hurt non-striker", () => {
    const deliveries: DbDelivery[] = [
      makeDelivery({
        id: "d1",
        display_order: 1,
        striker_id: "b1",
        non_striker_id: "b2",
        bowler_id: "bow1",
        runs_off_bat: 1,
      }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        striker_id: "b2",
        non_striker_id: "b1",
        dismissed_batsman_id: "b1",
        incoming_striker_id: "b3",
        note: RETIRE_HURT_NOTE,
        counts_as_legal_delivery: false,
      }),
    ];

    const sim = replayInnings("a", allPlayers, deliveries);
    expect(sim).not.toBeNull();
    expect(sim!.retiredHurtIds.has("b1")).toBe(true);
    expect(sim!.strikerId).toBe("b2");
    expect(sim!.nonStrikerId).toBe("b3");
  });

  it("preserves runs and balls for retired-hurt batter when they return", () => {
    const deliveries: DbDelivery[] = [
      makeDelivery({
        id: "d1",
        display_order: 1,
        striker_id: "b1",
        non_striker_id: "b2",
        bowler_id: "bow1",
        runs_off_bat: 50,
      }),
      makeDelivery({
        id: "d2",
        display_order: 2,
        striker_id: "b1",
        non_striker_id: "b2",
        bowler_id: "bow1",
        runs_off_bat: 1,
      }),
      makeDelivery({
        id: "d3",
        display_order: 3,
        striker_id: "b2",
        non_striker_id: "b1",
        dismissed_batsman_id: "b1",
        incoming_striker_id: "b3",
        note: RETIRE_HURT_NOTE,
        counts_as_legal_delivery: false,
      }),
      makeDelivery({
        id: "d4",
        display_order: 4,
        striker_id: "b2",
        non_striker_id: "b3",
        bowler_id: "bow1",
        is_wicket: true,
        dismissal: "caught",
        dismissed_batsman_id: "b2",
        incoming_striker_id: "b1",
      }),
      makeDelivery({
        id: "d5",
        display_order: 5,
        striker_id: "b1",
        non_striker_id: "b3",
        bowler_id: "bow1",
        runs_off_bat: 6,
      }),
    ];

    const sim = replayInnings("a", allPlayers, deliveries);
    expect(sim).not.toBeNull();
    expect(sim!.retiredHurtIds.has("b1")).toBe(false);
    expect(sim!.runs).toBe(50 + 1 + 6);
    expect(sim!.balls_legal).toBe(4);
    expect(sim!.wickets).toBe(1);
  });

  it("does not count retired_hurt as wicket", () => {
    const deliveries: DbDelivery[] = [
      makeDelivery({
        id: "d1",
        display_order: 1,
        striker_id: "b1",
        non_striker_id: "b2",
        bowler_id: "bow1",
        is_wicket: true,
        dismissal: "retired_hurt",
        dismissed_batsman_id: "b1",
        incoming_striker_id: "b3",
      }),
    ];

    const sim = replayInnings("a", allPlayers, deliveries);
    expect(sim).not.toBeNull();
    expect(sim!.wickets).toBe(0);
    expect(sim!.retiredHurtIds.has("b1")).toBe(true);
    expect(sim!.dismissedIds.has("b1")).toBe(false);
  });
});
