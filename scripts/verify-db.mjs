/**
 * Verify cricket scorer tables exist via Supabase REST (service role).
 * Usage: node scripts/verify-db.mjs
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) {
    console.error("Missing .env.local — copy from .env.example");
    process.exit(1);
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

const TABLES = ["matches", "players", "innings", "deliveries"];

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const expectedRef = "lojomuhczvxyouudassi";
if (!url.includes(expectedRef)) {
  console.warn(
    `Warning: URL does not contain expected project ref "${expectedRef}".`,
  );
  console.warn(`  Current: ${url}`);
}

async function headTable(name, select = "id") {
  const res = await fetch(`${url}/rest/v1/${name}?select=${select}&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  return { name, ok: res.ok, status: res.status, statusText: res.statusText };
}

console.log(`Checking ${url} …\n`);

let failed = false;
for (const table of TABLES) {
  try {
    const r = await headTable(table);
    if (r.ok) {
      console.log(`  ✓ ${table}`);
    } else {
      failed = true;
      console.log(`  ✗ ${table} — HTTP ${r.status} ${r.statusText}`);
    }
  } catch (e) {
    failed = true;
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ✗ ${table} — ${msg}`);
    if (msg.includes("ENOTFOUND") || msg.includes("fetch failed")) {
      console.error(
        "\nProject may be paused. Resume in Supabase dashboard, then re-run.",
      );
      break;
    }
  }
}

if (failed) {
  console.error(
    "\nDatabase not ready. Run supabase/migrations/001_cricket_scorer_initial.sql",
  );
  process.exit(1);
}

const col = await headTable("deliveries", "incoming_striker_id");
if (!col.ok) {
  console.log(`  ✗ deliveries.incoming_striker_id — HTTP ${col.status}`);
  console.error(
    "\nRe-run supabase/migrations/001_cricket_scorer_initial.sql (idempotent).",
  );
  process.exit(1);
}
console.log("  ✓ deliveries.incoming_striker_id");

const col2 = await headTable("deliveries", "extra_leg_byes");
if (!col2.ok) {
  console.log(`  ✗ deliveries.extra_leg_byes — HTTP ${col2.status}`);
  console.error(
    "\nRun supabase/migrations/002_delivery_extras_wicket_meta.sql in Supabase SQL editor.",
  );
  process.exit(1);
}
console.log("  ✓ deliveries.extra_leg_byes (migration 002)");

console.log("\nCricket scorer database looks ready.");
