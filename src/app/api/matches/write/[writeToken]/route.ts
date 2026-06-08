import { cookies } from "next/headers";
import { bad, ok } from "@/lib/api-json";
import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";
import {
  fetchBundle,
  getMatchByWriteToken,
  needsPinForWrites,
} from "@/lib/match-service";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const m = await getMatchByWriteToken(decodeURIComponent(writeToken));
    if (!m) return bad("Not found", 404);
    const bundle = await fetchBundle(m);
    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;
    const locked = needsPinForWrites(bundle.match, cookie);
    return ok({ bundle, locked });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 500);
  }
}
