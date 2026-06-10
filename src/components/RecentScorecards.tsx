"use client";

import {
  listRecentMatches,
  removeRecentMatch,
  type RecentMatchEntry,
} from "@/lib/recent-matches";
import Link from "next/link";
import { useEffect, useState } from "react";

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function RecentScorecards() {
  const [items, setItems] = useState<RecentMatchEntry[]>([]);

  useEffect(() => {
    setItems(listRecentMatches());
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="recent-scorecards glass">
      <h2 className="recent-title">Recent on this device</h2>
      <p className="recent-sub">
        Saved in your browser — open scorer or share link without hunting URLs.
      </p>
      <ul className="recent-list">
        {items.map((m) => (
          <li key={m.publicId} className="recent-item">
            <div className="recent-item-head">
              <p className="recent-teams">
                <strong>{m.teamAName}</strong> vs <strong>{m.teamBName}</strong>
              </p>
              <span className={`badge ${m.status === "live" ? "live" : "done"}`}>
                {m.status === "live" ? "Live" : "Done"}
              </span>
            </div>
            {m.resultSummary && (
              <p className="recent-result">{m.resultSummary}</p>
            )}
            <p className="recent-when">{fmtWhen(m.updatedAt)}</p>
            <div className="recent-links">
              <Link
                href={`/score/${encodeURIComponent(m.writeToken)}`}
                className="recent-link primary"
              >
                {m.status === "completed" ? "View / edit" : "Scorer"}
              </Link>
              <Link
                href={`/m/${m.publicId}`}
                className="recent-link"
                target="_blank"
              >
                Share ↗
              </Link>
              <button
                type="button"
                className="recent-link ghost"
                onClick={() => {
                  removeRecentMatch(m.publicId);
                  setItems(listRecentMatches());
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
