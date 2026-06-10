import { cookies } from "next/headers";
import { bad, ok } from "@/lib/api-json";
import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";
import { replaceCreasePlayer } from "@/lib/match-service";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const body = (await req.json()) as {
      end?: "striker" | "non_striker";
      leavingPlayerId?: string;
      incomingPlayerId?: string;
    };
    if (!body.incomingPlayerId) {
      return bad("incomingPlayerId required", 400);
    }
    if (!body.end && !body.leavingPlayerId) {
      return bad("end or leavingPlayerId required", 400);
    }
    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;
    await replaceCreasePlayer(
      decodeURIComponent(writeToken),
      {
        end: body.end,
        leavingPlayerId: body.leavingPlayerId,
        incomingPlayerId: body.incomingPlayerId,
      },
      cookie,
    );
    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
