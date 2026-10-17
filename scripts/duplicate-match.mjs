/**
 * Duplicate a match (and its players, innings, deliveries) into NEW ids.
 *
 * Never updates the source row. New team names must start with "TEST -".
 *
 * Usage:
 *   node scripts/duplicate-match.mjs --from <public_id> --name "TEST - Edit QA 1 …"
 *   node scripts/duplicate-match.mjs --preset qa
 *   node scripts/duplicate-match.mjs --preset qa --reset
 *
 * Optional: --pin <plaintext> to set a new PIN (default: copy source pin_hash).
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGINAL_PUBLIC_ID = "e0691e40-68ae-4ffb-a4fa-1f85a9a3e744";
const ORIGINAL_MATCH_ID = "a73f0a07-2707-4670-8cdb-46fe6559ea25";
const QA_FIXTURE = resolve(root, "e2e/.qa-matches.json");

const QA_COPIES = [
  "TEST - Edit QA 1 Ball extras (copy of Samosa Strikers vs Chai Chargers)",
  "TEST - Edit QA 2 Retirement Deepak-Roop (copy of Samosa Strikers vs Chai Chargers)",
  "TEST - Edit QA 3 Stack apply history (copy of Samosa Strikers vs Chai Chargers)",
  "TEST - Edit QA 4 Discard PIN mobile (copy of Samosa Strikers vs Chai Chargers)",
  "TEST - Edit QA 5 Stale write (copy of Samosa Strikers vs Chai Chargers)",
  "TEST - Edit QA 6 Validation scorecard chase (copy of Samosa Strikers vs Chai Chargers)",
];

function loadEnv() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) {
    throw new Error("Missing .env.local — copy from .env.example");
  }
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

function parseArgs(argv) {
  const out = {
    from: ORIGINAL_PUBLIC_ID,
    name: "",
    pin: "",
    preset: false,
    reset: false,
    allowTestSource: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") out.from = argv[++i];
    else if (a === "--name") out.name = argv[++i];
    else if (a === "--pin") out.pin = argv[++i];
    else if (a === "--preset") {
      out.preset = true;
      if (argv[i + 1] && !argv[i + 1].startsWith("-")) i += 1;
    }
    else if (a === "--reset") out.reset = true;
    else if (a === "--allow-test-source") out.allowTestSource = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "node scripts/duplicate-match.mjs --from <public_id> --name \"TEST - …\"\n" +
          "node scripts/duplicate-match.mjs --preset qa [--reset]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return out;
}

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function assertNotOriginalWrite(id, publicId) {
  if (id === ORIGINAL_MATCH_ID || publicId === ORIGINAL_PUBLIC_ID) {
    throw new Error("Refusing to modify the original prized match");
  }
}

async function mustOk(res, label) {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return res.data;
}

async function deleteQaCopies(client) {
  const existing = await mustOk(
    await client
      .from("matches")
      .select("id, public_id, team_a_name")
      .like("team_a_name", "TEST - Edit QA%"),
    "list TEST QA matches",
  );
  for (const row of existing ?? []) {
    assertNotOriginalWrite(row.id, row.public_id);
    if (!String(row.team_a_name).startsWith("TEST -")) {
      throw new Error(`Refusing to delete non-TEST match ${row.public_id}`);
    }
    await mustOk(
      await client.from("matches").delete().eq("id", row.id),
      `delete ${row.team_a_name}`,
    );
    console.log(`Deleted TEST copy ${row.public_id} — ${row.team_a_name}`);
  }
}

async function findByName(client, name) {
  const data = await mustOk(
    await client
      .from("matches")
      .select("id, public_id, write_token, team_a_name, team_b_name")
      .eq("team_a_name", name)
      .maybeSingle(),
    "find by name",
  );
  return data;
}

async function duplicateMatch(client, sourcePublicId, teamAName, pin) {
  if (!teamAName.startsWith("TEST -")) {
    throw new Error('New match name must start with "TEST -"');
  }

  const source = await mustOk(
    await client
      .from("matches")
      .select("*")
      .eq("public_id", sourcePublicId)
      .maybeSingle(),
    "load source match",
  );
  if (!source) throw new Error(`Source match not found: ${sourcePublicId}`);
  if (source.id === ORIGINAL_MATCH_ID && sourcePublicId !== ORIGINAL_PUBLIC_ID) {
    throw new Error("Source id/public_id mismatch");
  }
  if (
    String(source.team_a_name).startsWith("TEST -") &&
    sourcePublicId !== ORIGINAL_PUBLIC_ID
  ) {
    throw new Error("Refusing to clone a TEST copy without --allow-test-source");
  }

  const players = await mustOk(
    await client.from("players").select("*").eq("match_id", source.id),
    "load players",
  );
  const innings = await mustOk(
    await client
      .from("innings")
      .select("*")
      .eq("match_id", source.id)
      .order("index_num"),
    "load innings",
  );
  const innIds = (innings ?? []).map((i) => i.id);
  const deliveries = innIds.length
    ? await mustOk(
        await client.from("deliveries").select("*").in("innings_id", innIds),
        "load deliveries",
      )
    : [];

  const newMatchId = randomUUID();
  const writeToken = randomBytes(24).toString("base64url");
  const pinHash = pin ? await bcrypt.hash(pin, 10) : source.pin_hash;

  const insertedMatch = await mustOk(
    await client
      .from("matches")
      .insert({
        id: newMatchId,
        write_token: writeToken,
        pin_hash: pinHash,
        status: source.status,
        team_a_name: teamAName,
        team_b_name: "TEST - Chai Chargers copy",
        overs_per_innings: source.overs_per_innings,
        max_wickets: source.max_wickets,
        innings_count: source.innings_count,
        toss_winner: source.toss_winner,
        toss_elect: source.toss_elect,
        current_innings_index: source.current_innings_index,
        winner_side: source.winner_side,
        result_summary: source.result_summary,
        max_balls_per_over: source.max_balls_per_over ?? 0,
        edit_history: [],
      })
      .select("id, public_id, write_token, team_a_name")
      .single(),
    "insert match",
  );

  assertNotOriginalWrite(insertedMatch.id, insertedMatch.public_id);

  const playerMap = new Map();
  const newPlayers = (players ?? []).map((p) => {
    const id = randomUUID();
    playerMap.set(p.id, id);
    return {
      id,
      match_id: newMatchId,
      side: p.side,
      display_name: p.display_name,
      sort_order: p.sort_order,
      did_not_bat: p.did_not_bat,
    };
  });
  if (newPlayers.length) {
    await mustOk(await client.from("players").insert(newPlayers), "insert players");
  }

  const remapPlayer = (id) => (id ? (playerMap.get(id) ?? null) : null);
  const inningsMap = new Map();
  const newInnings = (innings ?? []).map((inn) => {
    const id = randomUUID();
    inningsMap.set(inn.id, id);
    return {
      id,
      match_id: newMatchId,
      index_num: inn.index_num,
      batting_side: inn.batting_side,
      runs: inn.runs,
      wickets: inn.wickets,
      balls_legal: inn.balls_legal,
      completed: inn.completed,
      current_striker_id: remapPlayer(inn.current_striker_id),
      current_non_striker_id: remapPlayer(inn.current_non_striker_id),
      current_bowler_id: remapPlayer(inn.current_bowler_id),
    };
  });
  if (newInnings.length) {
    await mustOk(await client.from("innings").insert(newInnings), "insert innings");
  }

  const newDeliveries = (deliveries ?? []).map((d) => ({
    id: randomUUID(),
    innings_id: inningsMap.get(d.innings_id),
    display_order: d.display_order,
    striker_id: remapPlayer(d.striker_id),
    non_striker_id: remapPlayer(d.non_striker_id),
    bowler_id: remapPlayer(d.bowler_id),
    incoming_striker_id: remapPlayer(d.incoming_striker_id),
    dismissed_batsman_id: remapPlayer(d.dismissed_batsman_id),
    fielder_id: remapPlayer(d.fielder_id),
    fielder_assist_id: remapPlayer(d.fielder_assist_id),
    is_strike_swap: d.is_strike_swap,
    runs_off_bat: d.runs_off_bat,
    extra_wide: d.extra_wide,
    extra_nb: d.extra_nb,
    extra_byes: d.extra_byes,
    extra_leg_byes: d.extra_leg_byes ?? 0,
    counts_as_legal_delivery: d.counts_as_legal_delivery,
    is_wicket: d.is_wicket,
    dismissal: d.dismissal,
    note: d.note,
    created_at: d.created_at,
  }));

  const chunk = 80;
  for (let i = 0; i < newDeliveries.length; i += chunk) {
    await mustOk(
      await client.from("deliveries").insert(newDeliveries.slice(i, i + chunk)),
      `insert deliveries ${i}-${i + chunk}`,
    );
  }

  const verify = await mustOk(
    await client
      .from("matches")
      .select("id, public_id, team_a_name")
      .eq("id", ORIGINAL_MATCH_ID)
      .single(),
    "verify original untouched",
  );
  if (verify.public_id !== ORIGINAL_PUBLIC_ID) {
    throw new Error("Original match public_id changed — aborting");
  }

  return {
    id: insertedMatch.id,
    publicId: insertedMatch.public_id,
    writeToken: insertedMatch.write_token,
    name: insertedMatch.team_a_name,
    sourcePublicId,
    playerCount: newPlayers.length,
    inningsCount: newInnings.length,
    deliveryCount: newDeliveries.length,
  };
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const client = sb();

  if (args.reset) {
    await deleteQaCopies(client);
  }

  const created = [];
  if (args.preset) {
    for (const name of QA_COPIES) {
      const existing = await findByName(client, name);
      if (existing) {
        console.log(`Exists ${existing.public_id} — ${name}`);
        created.push({
          id: existing.id,
          publicId: existing.public_id,
          writeToken: existing.write_token,
          name,
        });
        continue;
      }
      const copy = await duplicateMatch(client, args.from, name, args.pin);
      console.log(
        `Created ${copy.publicId} — ${copy.name} (${copy.deliveryCount} balls)`,
      );
      created.push(copy);
    }
  } else {
    if (!args.name) throw new Error("--name is required (or use --preset qa)");
    const copy = await duplicateMatch(client, args.from, args.name, args.pin);
    console.log(
      `Created ${copy.publicId} — ${copy.name} (${copy.deliveryCount} balls)`,
    );
    created.push(copy);
  }

  writeFileSync(
    QA_FIXTURE,
    JSON.stringify(
      {
        sourcePublicId: ORIGINAL_PUBLIC_ID,
        createdAt: new Date().toISOString(),
        matches: created.map((m) => ({
          id: m.id,
          publicId: m.publicId,
          name: m.name,
        })),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Wrote ${QA_FIXTURE} (no write tokens)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
