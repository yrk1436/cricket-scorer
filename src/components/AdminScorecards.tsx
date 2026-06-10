"use client";

import type { AdminMatchListRow } from "@/lib/match-service";
import { ballsToOvers } from "@/lib/game";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Props = {
  siteOrigin: string;
};

type Sort = "date_desc" | "date_asc" | "team_asc";
type Filter = "all" | "live" | "completed";

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function scoreLine(innings: AdminMatchListRow["innings"]) {
  const sorted = [...innings].sort((a, b) => a.index_num - b.index_num);
  if (sorted.length === 0) return "—";
  return sorted
    .map(
      (i) =>
        `${i.runs}/${i.wickets} (${ballsToOvers(i.balls_legal)})`,
    )
    .join(" · ");
}

export default function AdminScorecards({ siteOrigin }: Props) {
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("date_desc");
  const [matches, setMatches] = useState<AdminMatchListRow[]>([]);
  const [stats, setStats] = useState({ total: 0, live: 0, completed: 0 });

  const load = useCallback(async () => {
    const params = new URLSearchParams({ sort, status: filter });
    if (q.trim()) params.set("q", q.trim());
    const r = await fetch(`/api/admin-scorecards/matches?${params}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Load failed");
    setMatches(j.matches ?? []);
    setStats(j.stats ?? { total: 0, live: 0, completed: 0 });
  }, [filter, q, sort]);

  useEffect(() => {
    void load().catch((e) => setErr(String(e)));
  }, [load]);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  const origin = siteOrigin.replace(/\/$/, "");

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>All scorecards</h1>
          <p className="sub">Unlisted route · <code>/admin-scorecards</code></p>
        </div>
        <Link href="/scorer" className="btn-primary admin-new-btn">
          + New match
        </Link>
      </header>

      <section className="admin-stats glass">
        <div className="admin-stat">
          <span className="n">{stats.total}</span>
          <span className="l">Shown</span>
        </div>
        <div className="admin-stat">
          <span className="n live-n">{stats.live}</span>
          <span className="l">Live</span>
        </div>
        <div className="admin-stat">
          <span className="n">{stats.completed}</span>
          <span className="l">Done</span>
        </div>
      </section>

      <section className="admin-toolbar glass">
        <label className="admin-search">
          <span className="sr-only">Search</span>
          <input
            type="search"
            placeholder="Team name, result…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
        </label>
        <div className="admin-toolbar-row">
          <div className="admin-filters">
            {(["all", "live", "completed"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={filter === f ? "active" : ""}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f === "live" ? "Live" : "Done"}
              </button>
            ))}
          </div>
          <select
            className="admin-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort"
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="team_asc">Team A–Z</option>
          </select>
        </div>
        <button type="button" className="hud-btn" onClick={() => void load()}>
          Apply
        </button>
      </section>

      {err && <div className="error-banner">{err}</div>}

      <ul className="match-list">
        {matches.map((m) => (
          <li key={m.id} className="match-card glass">
            <div className="match-card-top">
              <div>
                <h2>
                  {m.team_a_name} <span className="vs">vs</span> {m.team_b_name}
                </h2>
                <p className="match-meta">
                  {m.overs_per_innings} overs · {m.innings_count} innings ·{" "}
                  {fmtDate(m.created_at)}
                </p>
              </div>
              <span className={`badge ${m.status === "live" ? "live" : "done"}`}>
                {m.status === "live" ? "Live" : "Done"}
              </span>
            </div>
            <p className="match-scores">{scoreLine(m.innings)}</p>
            {m.result_summary && (
              <p className="match-result">{m.result_summary}</p>
            )}
            <div className="match-links">
              <Link
                href={`/m/${m.public_id}`}
                className="match-link primary"
                target="_blank"
              >
                Scorecard ↗
              </Link>
              <Link
                href={`/score/${encodeURIComponent(m.write_token)}`}
                className="match-link"
              >
                Scorer ↗
              </Link>
              <button
                type="button"
                className="match-link ghost"
                onClick={() =>
                  void copyText(`${origin}/m/${m.public_id}`)
                }
              >
                Copy public
              </button>
              <button
                type="button"
                className="match-link ghost"
                onClick={() =>
                  void copyText(
                    `${origin}/score/${encodeURIComponent(m.write_token)}`,
                  )
                }
              >
                Copy scorer
              </button>
            </div>
          </li>
        ))}
        {matches.length === 0 && (
          <li className="glass" style={{ padding: 20, textAlign: "center" }}>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.85rem" }}>
              No matches match your filters.
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}
