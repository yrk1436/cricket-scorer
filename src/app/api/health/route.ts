import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const checks: Record<string, { ok: boolean; message: string }> = {};

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  checks.env_supabase_url = {
    ok: !!supabaseUrl,
    message: supabaseUrl
      ? `Configured: ${supabaseUrl.replace(/^https?:\/\//, "").split(".")[0]}...`
      : "Missing NEXT_PUBLIC_SUPABASE_URL",
  };

  checks.env_service_key = {
    ok: hasServiceKey,
    message: hasServiceKey ? "Configured" : "Missing SUPABASE_SERVICE_ROLE_KEY",
  };

  // Check database connectivity
  if (supabaseUrl && hasServiceKey) {
    try {
      const client = createSupabaseAdmin();
      const { error } = await client.from("matches").select("id").limit(1);
      if (error) {
        checks.database = {
          ok: false,
          message: `Query failed: ${error.message}`,
        };
      } else {
        checks.database = { ok: true, message: "Connected" };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      let diagnosis = msg;

      if (msg.includes("fetch failed") || msg.includes("ENOTFOUND")) {
        diagnosis =
          "Cannot reach database server. The Supabase project may be paused, deleted, or the URL is incorrect.";
      } else if (msg.includes("ECONNREFUSED")) {
        diagnosis = "Connection refused by database server.";
      }

      checks.database = { ok: false, message: diagnosis };
    }
  } else {
    checks.database = {
      ok: false,
      message: "Skipped - missing environment variables",
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return Response.json(
    {
      status: allOk ? "healthy" : "unhealthy",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
