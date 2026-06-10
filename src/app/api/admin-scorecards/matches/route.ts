import { bad, ok } from "@/lib/api-json";
import { listMatchesForAdmin } from "@/lib/match-service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? undefined;
    const status = url.searchParams.get("status") as
      | "all"
      | "live"
      | "completed"
      | null;
    const sort = url.searchParams.get("sort") as
      | "date_desc"
      | "date_asc"
      | "team_asc"
      | null;

    const rows = await listMatchesForAdmin({
      q,
      status: status ?? "all",
      sort: sort ?? "date_desc",
    });

    const live = rows.filter((r) => r.status === "live").length;
    const completed = rows.filter((r) => r.status === "completed").length;

    return ok({
      matches: rows,
      stats: { total: rows.length, live, completed },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 500);
  }
}
