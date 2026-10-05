import { ok, bad } from "@/lib/api-json";
import { createMatch, type CreateMatchInput } from "@/lib/match-service";
import { DatabaseConnectionError } from "@/lib/supabase/admin";

function formatError(e: unknown): { message: string; status: number } {
  if (e instanceof DatabaseConnectionError) {
    return { message: e.message, status: 503 };
  }
  const raw = e instanceof Error ? e.message : String(e);
  if (
    raw.includes("fetch failed") ||
    raw.includes("ENOTFOUND") ||
    raw.includes("ECONNREFUSED")
  ) {
    return {
      message:
        "Database connection failed. The database may be temporarily unavailable. Please try again later.",
      status: 503,
    };
  }
  return { message: raw || "Create failed", status: 400 };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input: CreateMatchInput = {
      teamAName: String(body.teamAName ?? ""),
      teamBName: String(body.teamBName ?? ""),
      oversPerInnings: Number(body.oversPerInnings) || 20,
      maxBallsPerOver: Number(body.maxBallsPerOver) || 0,
      maxWickets: Number(body.maxWickets) || 10,
      inningsCount: 2,
      tossWinner: body.tossWinner === "b" ? "b" : "a",
      tossElect: body.tossElect === "bowl" ? "bowl" : "bat",
      pin: String(body.pin ?? ""),
      pinConfirm: String(body.pinConfirm ?? ""),
      squadA: Array.isArray(body.squadA) ? body.squadA.map(String) : [],
      squadB: Array.isArray(body.squadB) ? body.squadB.map(String) : [],
    };

    const r = await createMatch(input);
    return ok({
      publicId: r.publicId,
      writeToken: r.writeToken,
      matchId: r.match.id,
    });
  } catch (e) {
    const { message, status } = formatError(e);
    return bad(message, status);
  }
}
