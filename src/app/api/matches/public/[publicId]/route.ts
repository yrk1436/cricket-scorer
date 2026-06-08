import { bad, ok } from "@/lib/api-json";
import {
  fetchBundle,
  getMatchByPublicId,
} from "@/lib/match-service";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await ctx.params;
  try {
    const m = await getMatchByPublicId(publicId);
    if (!m) return bad("Not found", 404);
    const bundle = await fetchBundle(m);
    return ok({ bundle, readOnly: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 500);
  }
}
