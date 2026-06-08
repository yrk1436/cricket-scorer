import { bad, ok } from "@/lib/api-json";
import { completeMatch } from "@/lib/match-service";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    await completeMatch(decodeURIComponent(writeToken));
    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
