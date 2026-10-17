import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

const ORIGINAL_PUBLIC_ID = "e0691e40-68ae-4ffb-a4fa-1f85a9a3e744";

export const QA_NAMES = {
  ball: "TEST - Edit QA 1 Ball extras (copy of Samosa Strikers vs Chai Chargers)",
  retirement:
    "TEST - Edit QA 2 Retirement Deepak-Roop (copy of Samosa Strikers vs Chai Chargers)",
  stack:
    "TEST - Edit QA 3 Stack apply history (copy of Samosa Strikers vs Chai Chargers)",
  ui: "TEST - Edit QA 4 Discard PIN mobile (copy of Samosa Strikers vs Chai Chargers)",
  stale: "TEST - Edit QA 5 Stale write (copy of Samosa Strikers vs Chai Chargers)",
  validation:
    "TEST - Edit QA 6 Validation scorecard chase (copy of Samosa Strikers vs Chai Chargers)",
} as const;

export type QaMatch = {
  id: string;
  publicId: string;
  writeToken: string;
  name: string;
  updatedAt: string;
};

export type DeliveryRow = {
  id: string;
  innings_id: string;
  display_order: number;
  striker_id: string | null;
  non_striker_id: string | null;
  bowler_id: string | null;
  incoming_striker_id?: string | null;
  dismissed_batsman_id?: string | null;
  fielder_id?: string | null;
  fielder_assist_id?: string | null;
  runs_off_bat: number;
  extra_wide: number;
  extra_nb: number;
  extra_byes: number;
  extra_leg_byes?: number;
  counts_as_legal_delivery: boolean;
  is_wicket: boolean;
  dismissal: string;
};

export type PlayerRow = {
  id: string;
  display_name: string;
  side: string;
};

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export function mintUnlockCookie(matchId: string): string {
  const secret = process.env.MATCH_UNLOCK_SECRET;
  if (!secret) throw new Error("MATCH_UNLOCK_SECRET is required");
  const exp = Date.now() + 2 * 60 * 60 * 1000;
  const sig = createHmac("sha256", secret).update(`${matchId}:${exp}`).digest("hex");
  return Buffer.from(JSON.stringify({ mid: matchId, exp, sig }), "utf8").toString(
    "base64url",
  );
}

export async function loadQaMatch(name: string): Promise<QaMatch> {
  const { data, error } = await supabaseAdmin()
    .from("matches")
    .select("id, public_id, write_token, team_a_name, updated_at")
    .eq("team_a_name", name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`TEST copy missing: ${name}. Run node scripts/duplicate-match.mjs --preset qa`);
  if (data.public_id === ORIGINAL_PUBLIC_ID) {
    throw new Error("Refusing to operate on the original match");
  }
  if (!String(data.team_a_name).startsWith("TEST -")) {
    throw new Error(`Refusing non-TEST match ${data.public_id}`);
  }
  return {
    id: data.id,
    publicId: data.public_id,
    writeToken: data.write_token,
    name: data.team_a_name,
    updatedAt: data.updated_at,
  };
}

export async function assertOriginalUntouched() {
  const { data, error } = await supabaseAdmin()
    .from("matches")
    .select("public_id, team_a_name")
    .eq("public_id", ORIGINAL_PUBLIC_ID)
    .single();
  if (error) throw new Error(error.message);
  expect(data.team_a_name).toBe("Samosa Strikers");
}

export async function playersFor(matchId: string): Promise<PlayerRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("players")
    .select("id, display_name, side")
    .eq("match_id", matchId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function playerId(players: PlayerRow[], name: string, side?: string) {
  const p = players.find(
    (x) => x.display_name === name && (!side || x.side === side),
  );
  if (!p) throw new Error(`Player ${name} not found`);
  return p.id;
}

export async function inningsFor(matchId: string) {
  const { data, error } = await supabaseAdmin()
    .from("innings")
    .select("*")
    .eq("match_id", matchId)
    .order("index_num");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function deliveriesFor(inningsId: string): Promise<DeliveryRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("deliveries")
    .select("*")
    .eq("innings_id", inningsId)
    .order("display_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as DeliveryRow[];
}

export function extraTypeOf(d: DeliveryRow): "none" | "wide" | "nb" | "bye" | "leg_bye" {
  if (d.extra_wide > 0) return "wide";
  if (d.extra_nb > 0) return "nb";
  if (d.extra_byes > 0) return "bye";
  if ((d.extra_leg_byes ?? 0) > 0) return "leg_bye";
  return "none";
}

export function extraRunsOf(d: DeliveryRow): number {
  if (d.extra_wide > 0) return d.extra_wide;
  if (d.extra_nb > 0) return d.extra_nb;
  if (d.extra_byes > 0) return d.extra_byes;
  if ((d.extra_leg_byes ?? 0) > 0) return d.extra_leg_byes ?? 0;
  return 0;
}

export function inputFromDelivery(
  d: DeliveryRow,
  patch: Record<string, unknown> = {},
) {
  return {
    strikerId: d.striker_id ?? "",
    nonStrikerId: d.non_striker_id ?? "",
    bowlerId: d.bowler_id,
    runsOffBat: d.runs_off_bat,
    extraType: extraTypeOf(d),
    extraRuns: extraRunsOf(d),
    isWicket: d.is_wicket,
    dismissal: d.is_wicket ? d.dismissal : "none",
    dismissedBatsmanId: d.dismissed_batsman_id ?? null,
    incomingStrikerId: d.incoming_striker_id ?? null,
    fielderId: d.fielder_id ?? null,
    fielderAssistId: d.fielder_assist_id ?? null,
    ...patch,
  };
}

export async function getBundle(request: APIRequestContext, match: QaMatch) {
  const cookie = mintUnlockCookie(match.id);
  const res = await request.get(
    `/api/matches/write/${encodeURIComponent(match.writeToken)}`,
    { headers: { Cookie: `cric_match_unlock=${cookie}` } },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `GET bundle ${res.status}`);
  return json.bundle as {
    match: { updated_at: string; result_summary: string | null; public_id: string };
    players: PlayerRow[];
    innings: { id: string; index_num: number; runs: number; wickets: number; balls_legal: number }[];
    deliveriesByInningsId: Record<string, DeliveryRow[]>;
  };
}

export async function applyDraft(
  request: APIRequestContext,
  match: QaMatch,
  operations: unknown[],
  expectedUpdatedAt?: string,
) {
  const bundle = await getBundle(request, match);
  const ids: Record<string, string[]> = {};
  for (const [innId, dels] of Object.entries(bundle.deliveriesByInningsId)) {
    ids[innId] = [...dels]
      .sort((a, b) => a.display_order - b.display_order)
      .map((d) => d.id);
  }
  const cookie = mintUnlockCookie(match.id);
  const res = await request.post(
    `/api/matches/write/${encodeURIComponent(match.writeToken)}/edit-draft`,
    {
      headers: { Cookie: `cric_match_unlock=${cookie}` },
      data: {
        expectedUpdatedAt: expectedUpdatedAt ?? bundle.match.updated_at,
        expectedDeliveryIdsByInningsId: ids,
        operations,
      },
    },
  );
  const json = await res.json();
  return { status: res.status(), json, bundle };
}

export async function openUnlockedEditor(page: Page, match: QaMatch) {
  await page.context().addCookies([
    {
      name: "cric_match_unlock",
      value: mintUnlockCookie(match.id),
      url: "http://127.0.0.1:3000",
    },
  ]);
  await page.goto(`/score/${encodeURIComponent(match.writeToken)}`);
  await page.getByRole("button", { name: "Edit match" }).click();
  await expect(page.getByRole("heading", { name: "Edit match" })).toBeVisible();
}

export function nonceLabel() {
  return randomBytes(3).toString("hex");
}
