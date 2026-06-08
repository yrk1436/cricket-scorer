import type { DeliveryInput } from "@/lib/match-service";
import type { DismissalType } from "@/lib/types";

/** Wide: total wide runs (not legal). wd+2 → extraWide=2 */
export function wideDelivery(extraWide: number): Omit<DeliveryInput, "bowlerId"> {
  return {
    runsOffBat: 0,
    extraWide,
    extraNb: 0,
    extraByes: 0,
    extraLegByes: 0,
    countsAsLegalDelivery: false,
    isWicket: false,
    dismissal: "none",
  };
}

/** No-ball: 1 nb penalty + runs off bat. nb+4 → extraNb=1, runsOffBat=4 */
export function noBallDelivery(runsOffBat: number): Omit<DeliveryInput, "bowlerId"> {
  return {
    runsOffBat,
    extraWide: 0,
    extraNb: 1,
    extraByes: 0,
    extraLegByes: 0,
    countsAsLegalDelivery: false,
    isWicket: false,
    dismissal: "none",
  };
}

export function byeDelivery(byes: number): Omit<DeliveryInput, "bowlerId"> {
  return {
    runsOffBat: 0,
    extraWide: 0,
    extraNb: 0,
    extraByes: byes,
    extraLegByes: 0,
    countsAsLegalDelivery: true,
    isWicket: false,
    dismissal: "none",
  };
}

export function legByeDelivery(legByes: number): Omit<DeliveryInput, "bowlerId"> {
  return {
    runsOffBat: 0,
    extraWide: 0,
    extraNb: 0,
    extraByes: 0,
    extraLegByes: legByes,
    countsAsLegalDelivery: true,
    isWicket: false,
    dismissal: "none",
  };
}

export type DismissalOption = {
  id: DismissalType;
  label: string;
  needsFielder: boolean;
  /** Run out: non-striker can be dismissed */
  allowNonStrikerOut?: boolean;
  /** Runs may be scored on this ball before/out during dismissal */
  allowRuns?: boolean;
  /** Does not require incoming batter pick (striker just leaves) */
  retiresInPlace?: boolean;
};

export const DISMISSAL_OPTIONS: DismissalOption[] = [
  { id: "bowled", label: "Bowled", needsFielder: false },
  { id: "caught", label: "Caught", needsFielder: true },
  { id: "lbw", label: "LBW", needsFielder: false },
  { id: "stumped", label: "Stumped", needsFielder: true },
  { id: "run_out", label: "Run out", needsFielder: true, allowNonStrikerOut: true, allowRuns: true },
  { id: "hit_wicket", label: "Hit wicket", needsFielder: false },
  { id: "retired_out", label: "Retired out", needsFielder: false, retiresInPlace: true },
  { id: "retired_hurt", label: "Retired hurt", needsFielder: false, retiresInPlace: true },
  { id: "other", label: "Other", needsFielder: false },
];

export const WIDE_PRESETS = [1, 2, 3, 4] as const;
export const NO_BALL_BAT_RUNS = [0, 1, 2, 3, 4, 6] as const;
export const BYE_PRESETS = [0, 1, 2, 3, 4] as const;
export const LEG_BYE_PRESETS = [0, 1, 2, 3, 4] as const;
export const RUN_OUT_RUNS = [0, 1, 2, 3, 4] as const;
