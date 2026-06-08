import { ok, bad } from "@/lib/api-json";
import { createMatch, type CreateMatchInput } from "@/lib/match-service";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input: CreateMatchInput = {
      teamAName: String(body.teamAName ?? ""),
      teamBName: String(body.teamBName ?? ""),
      oversPerInnings: Number(body.oversPerInnings) || 20,
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
    const msg = e instanceof Error ? e.message : "Create failed";
    return bad(msg, 400);
  }
}
