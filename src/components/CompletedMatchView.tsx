"use client";

import Scorecard from "@/components/Scorecard";
import type { SerialBundle } from "@/lib/scorecard-text";
import Link from "next/link";
import { useState } from "react";

type Props = {
  bundle: SerialBundle;
  writeToken: string;
  onUnlocked: () => void;
  onUnlockedToEdit?: () => void;
};

export default function CompletedMatchView({
  bundle,
  writeToken,
  onUnlocked,
  onUnlockedToEdit,
}: Props) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const apiRoot = `/api/matches/write/${encodeURIComponent(writeToken)}`;

  async function unlock(intent: "pad" | "edit") {
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
      if (intent === "edit" && onUnlockedToEdit) onUnlockedToEdit();
      else onUnlocked();
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
          <p className="sub">Read-only scorecard · enter PIN to edit balls</p>
        </div>
        <span className="badge done">Done</span>
      </header>

      <div className="toolbar no-print">
        <Link href={`/m/${bundle.match.public_id}`} className="primary" target="_blank">
          Share read-only ↗
        </Link>
      </div>

      <Scorecard bundle={bundle} variant="public" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void unlock("pad");
        }}
        className="glass no-print"
        style={{ padding: 16 }}
      >
        <p className="mb-2 text-sm font-medium">Scorer: enter match PIN to fix scores</p>
        <p className="mb-3 text-xs opacity-70">
          Unlocks scoring and ball-by-ball corrections on this device for 2 hours.
        </p>
        <div className="field" style={{ marginBottom: 12 }}>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Match PIN"
            autoComplete="off"
          />
        </div>
        <div className="field-row">
          <button
            type="submit"
            disabled={busy || !pin}
            className="hud-btn"
            style={{ flex: 1 }}
          >
            Unlock scoring
          </button>
          <button
            type="button"
            disabled={busy || !pin}
            className="hud-btn primary"
            style={{ flex: 1 }}
            onClick={() => void unlock("edit")}
          >
            Edit match
          </button>
        </div>
        {err && <div className="error-banner mt-3">{err}</div>}
      </form>
    </div>
  );
}
