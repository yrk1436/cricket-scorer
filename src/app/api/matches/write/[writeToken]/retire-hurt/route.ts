import { bad, ok } from "@/lib/api-json";
import { retireBatterHurt } from "@/lib/match-service";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const body = (await req.json()) as {
      end?: "striker" | "non_striker";
      replacementPlayerId?: string;
    };

    if (!body.end || (body.end !== "striker" && body.end !== "non_striker")) {
      return bad("end must be 'striker' or 'non_striker'", 400);
    }
    if (!body.replacementPlayerId) {
      return bad("replacementPlayerId required", 400);
    }

    await retireBatterHurt(decodeURIComponent(writeToken), {
      end: body.end,
      replacementPlayerId: body.replacementPlayerId,
    });

    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
