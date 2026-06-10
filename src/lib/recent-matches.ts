export type RecentMatchEntry = {
  publicId: string;
  writeToken: string;
  teamAName: string;
  teamBName: string;
  status: "live" | "completed";
  resultSummary?: string | null;
  updatedAt: string;
};

const STORAGE_KEY = "cric_scorer_recent_v1";
const MAX = 24;

function readAll(): RecentMatchEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentMatchEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: RecentMatchEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX)));
}

export function listRecentMatches(): RecentMatchEntry[] {
  return readAll().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function rememberMatch(entry: Omit<RecentMatchEntry, "updatedAt">) {
  const now = new Date().toISOString();
  const rest = readAll().filter(
    (e) => e.publicId !== entry.publicId && e.writeToken !== entry.writeToken,
  );
  writeAll([{ ...entry, updatedAt: now }, ...rest]);
}

export function touchRecentMatch(
  publicId: string,
  patch: Partial<Omit<RecentMatchEntry, "publicId" | "writeToken">>,
) {
  const all = readAll();
  const idx = all.findIndex((e) => e.publicId === publicId);
  if (idx < 0) return;
  all[idx] = {
    ...all[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeAll(all);
}

export function removeRecentMatch(publicId: string) {
  writeAll(readAll().filter((e) => e.publicId !== publicId));
}
