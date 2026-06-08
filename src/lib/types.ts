export type MatchStatus = "live" | "completed";
export type TeamSide = "a" | "b";
export type TossChoice = "bat" | "bowl";
export type DismissalType =
  | "none"
  | "bowled"
  | "caught"
  | "run_out"
  | "lbw"
  | "hit_wicket"
  | "stumped"
  | "retired_out"
  | "retired_hurt"
  | "other";

export type DbMatch = {
  id: string;
  public_id: string;
  write_token: string;
  pin_hash: string;
  status: MatchStatus;
  team_a_name: string;
  team_b_name: string;
  overs_per_innings: number;
  max_wickets: number;
  innings_count: number;
  toss_winner: TeamSide;
  toss_elect: TossChoice;
  current_innings_index: number;
  winner_side: string | null;
  result_summary: string | null;
  created_at: string;
  updated_at: string;
};

export type DbPlayer = {
  id: string;
  match_id: string;
  side: TeamSide;
  display_name: string;
  sort_order: number;
  did_not_bat: boolean;
};

export type DbInnings = {
  id: string;
  match_id: string;
  index_num: number;
  batting_side: TeamSide;
  runs: number;
  wickets: number;
  balls_legal: number;
  completed: boolean;
  current_striker_id: string | null;
  current_non_striker_id: string | null;
  current_bowler_id: string | null;
};

export type DbDelivery = {
  id: string;
  innings_id: string;
  display_order: number;
  striker_id: string | null;
  non_striker_id: string | null;
  bowler_id: string | null;
  incoming_striker_id?: string | null;
  is_strike_swap: boolean;
  runs_off_bat: number;
  extra_wide: number;
  extra_nb: number;
  extra_byes: number;
  extra_leg_byes?: number;
  counts_as_legal_delivery: boolean;
  is_wicket: boolean;
  dismissal: DismissalType;
  /** Who was dismissed on this ball (defaults to striker). */
  dismissed_batsman_id?: string | null;
  fielder_id?: string | null;
  fielder_assist_id?: string | null;
  note: string | null;
  created_at: string;
};

export type MatchBundle = {
  match: DbMatch;
  players: DbPlayer[];
  innings: DbInnings[];
  deliveriesByInningsId: Record<string, DbDelivery[]>;
};
