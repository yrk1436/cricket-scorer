import { cookies } from "next/headers";
import { bad, ok } from "@/lib/api-json";
import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";
import { updatePlayer } from "@/lib/match-service";

export async function PATCH(
  req: Request,
  ctx: {
    params: Promise<{ writeToken: string; playerId: string }>;
  },
) {
  try {
    const { writeToken, playerId } = await ctx.params;
    const body = await req.json();
    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;
    await updatePlayer(
      decodeURIComponent(writeToken),
      playerId,
      {
        ...(typeof body.display_name === "string"
          ? { display_name: body.display_name }
          : {}),
        ...(typeof body.did_not_bat === "boolean"
          ? { did_not_bat: body.did_not_bat }
          : {}),
      },
      cookie,
    );
    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
