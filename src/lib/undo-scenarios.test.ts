import { describe, it, expect } from "vitest";
import {
  awaitingNewOverBowler,
  currentOverProgress,
} from "./game";
import type { DbDelivery } from "./types";

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

describe("Undo scenario: Bowler selected, ball not started yet", () => {
  it("should detect when bowler is selected but no ball bowled (new over)", () => {
    // Scenario: 6 legal balls bowled, new over started, bowler picked but no ball
    const dels = Array.from({ length: 6 }, (_, i) =>
      makeDelivery({ id: `del-${i}`, display_order: i + 1, counts_as_legal_delivery: true })
    );
    
    // After 6 balls, we're awaiting a new bowler
    const awaiting = awaitingNewOverBowler(dels, 6, 0);
    expect(awaiting).toBe(true);
    
    // The current over has 0 balls
    const prog = currentOverProgress(dels, 0);
    expect(prog.legalBalls).toBe(0);
    expect(prog.totalBalls).toBe(0);
    
    // In the UI, if bowlerPickConfirmed is true and overProg shows 0 balls,
    // undo should reset the bowler pick
  });

  it("should not allow bowler change once a ball is bowled", () => {
    // First over: 6 balls
    const dels = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeDelivery({ id: `del-${i}`, display_order: i + 1, counts_as_legal_delivery: true })
      ),
      // Second over: 1 ball bowled
      makeDelivery({ id: "del-6", display_order: 7, counts_as_legal_delivery: true, bowler_id: "bowl-2" }),
    ];
    
    // We're not awaiting a new bowler anymore
    const awaiting = awaitingNewOverBowler(dels, 7, 0);
    expect(awaiting).toBe(false);
    
    // Current over has 1 ball
    const prog = currentOverProgress(dels, 0);
    expect(prog.legalBalls).toBe(1);
    expect(prog.totalBalls).toBe(1);
    
    // In the UI, bowler cannot be changed because a ball was bowled
  });
});

describe("Undo scenario: Batter is out, new batter just selected", () => {
  it("should identify wicket delivery with incoming batter for partial undo", () => {
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 4 }),
      makeDelivery({
        id: "wicket-del",
        display_order: 2,
        is_wicket: true,
        dismissal: "bowled",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
      }),
    ];
    
    // Last delivery is a wicket with incoming batter
    const lastDel = dels.reduce((a, b) => a.display_order > b.display_order ? a : b);
    expect(lastDel.is_wicket).toBe(true);
    expect(lastDel.incoming_striker_id).toBe("bat-3");
    
    // This is the condition for partial undo (clear incoming batter)
    const isWicketWithIncoming = lastDel.is_wicket && lastDel.incoming_striker_id;
    expect(isWicketWithIncoming).toBeTruthy();
  });

  it("should identify wicket without incoming batter (after partial undo)", () => {
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 4 }),
      makeDelivery({
        id: "wicket-del",
        display_order: 2,
        is_wicket: true,
        dismissal: "bowled",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: null,  // Cleared by partial undo
      }),
    ];
    
    const lastDel = dels.reduce((a, b) => a.display_order > b.display_order ? a : b);
    expect(lastDel.is_wicket).toBe(true);
    expect(lastDel.incoming_striker_id).toBe(null);
    
    // No incoming batter - full undo should delete this delivery
    const isWicketWithIncoming = lastDel.is_wicket && lastDel.incoming_striker_id;
    expect(isWicketWithIncoming).toBeFalsy();
  });

  it("should handle normal ball (not wicket) for full undo", () => {
    const dels = [
      makeDelivery({ display_order: 1, runs_off_bat: 4 }),
      makeDelivery({ id: "last-del", display_order: 2, runs_off_bat: 2 }),
    ];
    
    const lastDel = dels.reduce((a, b) => a.display_order > b.display_order ? a : b);
    expect(lastDel.is_wicket).toBe(false);
    
    // Normal delivery - full undo (delete delivery)
    const isWicketWithIncoming = lastDel.is_wicket && lastDel.incoming_striker_id;
    expect(isWicketWithIncoming).toBe(false);
  });
});

describe("Undo flow sequence", () => {
  it("should support three-step undo: bowler -> incoming batter -> wicket", () => {
    // State 1: After 6 balls, bowler confirmed for new over but no ball bowled
    let dels = Array.from({ length: 6 }, (_, i) =>
      makeDelivery({ id: `del-${i}`, display_order: i + 1, counts_as_legal_delivery: true })
    );
    const prog = currentOverProgress(dels, 0);
    let awaiting = awaitingNewOverBowler(dels, 6, 0);
    
    expect(prog.legalBalls).toBe(0);
    expect(awaiting).toBe(true);
    // UI: bowlerPickConfirmed=true, canChangeBowler=true
    // Undo action: reset bowler pick (client-side only)
    
    // State 2: First ball of new over is a wicket with incoming batter
    dels = [
      ...dels,
      makeDelivery({
        id: "wicket-del",
        display_order: 7,
        is_wicket: true,
        dismissal: "caught",
        dismissed_batsman_id: "bat-1",
        incoming_striker_id: "bat-3",
        bowler_id: "bowl-2",
      }),
    ];
    
    let lastDel = dels.reduce((a, b) => a.display_order > b.display_order ? a : b);
    let isWicketWithIncoming = lastDel.is_wicket && lastDel.incoming_striker_id;
    expect(isWicketWithIncoming).toBeTruthy();
    // Undo action: clear incoming batter (partial undo), show batter picker
    
    // State 3: After partial undo - wicket without incoming batter
    dels = dels.map(d => 
      d.id === "wicket-del" 
        ? { ...d, incoming_striker_id: null }
        : d
    ) as DbDelivery[];
    
    lastDel = dels.reduce((a, b) => a.display_order > b.display_order ? a : b);
    isWicketWithIncoming = lastDel.is_wicket && lastDel.incoming_striker_id;
    expect(isWicketWithIncoming).toBeFalsy();
    expect(lastDel.is_wicket).toBe(true);
    // Undo action: delete the wicket delivery entirely
    
    // State 4: After full undo - back to end of first over
    dels = dels.filter(d => d.id !== "wicket-del");
    expect(dels.length).toBe(6);
    awaiting = awaitingNewOverBowler(dels, 6, 0);
    expect(awaiting).toBe(true);
    // UI: needs new bowler again
  });
});
