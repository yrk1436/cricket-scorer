"use client";

import Scorecard from "@/components/Scorecard";
import type { SerialBundle } from "@/lib/scorecard-text";
import { useState } from "react";

type Props = {
  bundle: SerialBundle;
  writeToken: string;
  onUnlocked: () => void;
};

export default function CompletedMatchView({
  bundle,
  writeToken,
  onUnlocked,
}: Props) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const apiRoot = `/api/matches/write/${encodeURIComponent(writeToken)}`;

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`${apiRoot}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Unlock failed");
      setPin("");
      onUnlocked();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="phone-shell phone-shell-wide">
      <header className="top-bar no-print">
        <div>
          <h1>Match complete</h1>
          <p className="sub">Read-only scorecard · enter PIN to edit</p>
        </div>
        <span className="badge done">Done</span>
      </header>

      <Scorecard bundle={bundle} variant="public" />

      <form onSubmit={unlock} className="glass no-print" style={{ padding: 16 }}>
        <p className="mb-2 text-sm font-medium">Scorer: enter match PIN to fix scores</p>
        <p className="mb-3 text-xs opacity-70">
          Unlocks the scoring pad on this device for 2 hours.
        </p>
        <div className="field-row">
          <div className="field" style={{ marginBottom: 0 }}>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Match PIN"
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !pin}
            className="hud-btn primary"
            style={{ alignSelf: "end" }}
          >
            Edit scores
          </button>
        </div>
        {err && <div className="error-banner mt-3">{err}</div>}
      </form>
    </div>
  );
}
