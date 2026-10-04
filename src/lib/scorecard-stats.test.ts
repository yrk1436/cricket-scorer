import { describe, it, expect } from "vitest";
import { computeInningsScorecard } from "./scorecard-stats";
import { RETIRE_HURT_NOTE } from "./game";
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

describe("computeInningsScorecard - retired hurt", () => {
  const batsmen: DbPlayer[] = [
    makePlayer("b1", "a", 0),
    makePlayer("b2", "a", 1),
    makePlayer("b3", "a", 2),
    makePlayer("b4", "a", 3),
  ];
  const bowlers: DbPlayer[] = [
    makePlayer("bow1", "b", 0),
    makePlayer("bow2", "b", 1),
  ];
  const allPlayers = [...batsmen, ...bowlers];
  const name = (id: string | null | undefined) =>
    allPlayers.find((p) => p.id === id)?.display_name ?? "?";

  it("shows 'retired not out' for batter who retired via RETIRE_HURT_NOTE", () => {
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
        dismissed_batsman_id: "b1",
        incoming_striker_id: "b3",
        note: RETIRE_HURT_NOTE,
        counts_as_legal_delivery: false,
      }),
    ];

    const card = computeInningsScorecard({
      deliveries,
      battingSide: "a",
      bowlingSide: "b",
      players: allPlayers,
      name,
    });

    const b1 = card.batting.find((b) => b.playerId === "b1");
    expect(b1).toBeDefined();
    expect(b1!.dismissal).toBe("retired not out");
    expect(b1!.runs).toBe(50);
    expect(b1!.balls).toBe(1);
    expect(b1!.out).toBe(false);
  });

  it("shows 'retired not out' for batter who retired via retired_hurt dismissal", () => {
    const deliveries: DbDelivery[] = [
      makeDelivery({
        id: "d1",
        display_order: 1,
        striker_id: "b1",
        non_striker_id: "b2",
        bowler_id: "bow1",
        runs_off_bat: 30,
        is_wicket: true,
        dismissal: "retired_hurt",
        dismissed_batsman_id: "b1",
        incoming_striker_id: "b3",
      }),
    ];

    const card = computeInningsScorecard({
      deliveries,
      battingSide: "a",
      bowlingSide: "b",
      players: allPlayers,
      name,
    });

    const b1 = card.batting.find((b) => b.playerId === "b1");
    expect(b1).toBeDefined();
    expect(b1!.dismissal).toBe("retired not out");
    expect(b1!.out).toBe(false);
  });

  it("shows 'not out' when retired-hurt batter returns and is still at crease", () => {
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
      makeDelivery({
        id: "d4",
        display_order: 4,
        striker_id: "b1",
        non_striker_id: "b2",
        bowler_id: "bow1",
        runs_off_bat: 6,
      }),
    ];

    const card = computeInningsScorecard({
      deliveries,
      battingSide: "a",
      bowlingSide: "b",
      players: allPlayers,
      name,
    });

    const b1 = card.batting.find((b) => b.playerId === "b1");
    expect(b1).toBeDefined();
    expect(b1!.dismissal).toBe("not out");
    expect(b1!.runs).toBe(56);
    expect(b1!.balls).toBe(2);

    const b3 = card.batting.find((b) => b.playerId === "b3");
    expect(b3!.dismissal).toMatch(/b Player bow1/);
    expect(b3!.out).toBe(true);
  });

  it("preserves runs and balls for retired-hurt batter", () => {
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
        bowler_id: "bow1",
        runs_off_bat: 6,
      }),
      makeDelivery({
        id: "d3",
        display_order: 3,
        striker_id: "b1",
        non_striker_id: "b2",
        dismissed_batsman_id: "b1",
        incoming_striker_id: "b3",
        note: RETIRE_HURT_NOTE,
        counts_as_legal_delivery: false,
      }),
    ];

    const card = computeInningsScorecard({
      deliveries,
      battingSide: "a",
      bowlingSide: "b",
      players: allPlayers,
      name,
    });

    const b1 = card.batting.find((b) => b.playerId === "b1");
    expect(b1!.runs).toBe(10);
    expect(b1!.balls).toBe(2);
    expect(b1!.fours).toBe(1);
    expect(b1!.sixes).toBe(1);
  });

  it("does not add retired-hurt to fall of wickets", () => {
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
        dismissal: "caught",
        dismissed_batsman_id: "b3",
        incoming_striker_id: "b4",
      }),
    ];

    const card = computeInningsScorecard({
      deliveries,
      battingSide: "a",
      bowlingSide: "b",
      players: allPlayers,
      name,
    });

    expect(card.fallOfWickets.length).toBe(1);
    expect(card.fallOfWickets[0].batsmanName).toBe("Player b3");
    expect(card.fallOfWickets[0].wicket).toBe(1);
  });
});
