"use client";

import HudModal from "@/components/HudModal";
import MatchEditMode from "@/components/MatchEditMode";
import Scorecard from "@/components/Scorecard";
import type { DeliveryEditInput } from "@/lib/recompute";
import type { SerialBundle } from "@/lib/scorecard-text";
import { useCallback, useState } from "react";

type Props = {
  bundle: SerialBundle;
};

export default function PublicMatchView({ bundle: initial }: Props) {
  const [bundle, setBundle] = useState(initial);
  const [writeToken, setWriteToken] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const completed = bundle.match.status === "completed";
  const publicId = bundle.match.public_id;

  const refreshWithToken = useCallback(
    async (token: string) => {
      const r = await fetch(`/api/matches/write/${encodeURIComponent(token)}`);
      const j = (await r.json()) as { bundle?: SerialBundle; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Reload failed");
      if (j.bundle) setBundle(j.bundle);
    },
    [],
  );

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/matches/public/${encodeURIComponent(publicId)}/unlock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin }),
        },
      );
      const j = (await r.json()) as { writeToken?: string; error?: string };
      if (!r.ok || !j.writeToken) throw new Error(j.error ?? "Unlock failed");
      setWriteToken(j.writeToken);
      setPin("");
      setPinOpen(false);
      await refreshWithToken(j.writeToken);
      setEditMode(true);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  function onEditMatch() {
    setErr(null);
    if (writeToken) {
      setEditMode(true);
      return;
    }
    setPinOpen(true);
  }

  if (editMode && writeToken) {
    const apiRoot = `/api/matches/write/${encodeURIComponent(writeToken)}`;
    return (
      <MatchEditMode
        bundle={bundle}
        busy={busy}
        error={err}
        onClose={() => {
          setEditMode(false);
          setErr(null);
        }}
        onSave={async (deliveryId, input: DeliveryEditInput) => {
          setBusy(true);
          setErr(null);
          try {
            const r = await fetch(`${apiRoot}/delivery/${deliveryId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error ?? "Could not save correction");
            await refreshWithToken(writeToken);
            return true;
          } catch (x) {
            setErr(x instanceof Error ? x.message : String(x));
            return false;
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <>
      <Scorecard
        bundle={bundle}
        variant="public"
        readOnlyBanner="Anyone with this link can view only."
        onEditMatch={completed ? onEditMatch : undefined}
      />
      <HudModal
        open={pinOpen}
        title="Edit match"
        onBackdropClick={() => !busy && setPinOpen(false)}
      >
        <form onSubmit={submitPin}>
          <p className="mb-3 text-sm opacity-85">
            Enter the match PIN to correct balls. Unlocks this device for 2
            hours.
          </p>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="public-edit-pin">Match PIN</label>
            <input
              id="public-edit-pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Match PIN"
              autoComplete="off"
              autoFocus
            />
          </div>
          {err && (
            <div className="error-banner mb-3" role="alert">
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="hud-btn flex-1"
              disabled={busy}
              onClick={() => setPinOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="hud-btn primary flex-1 disabled:opacity-40"
              disabled={busy || !pin}
            >
              Unlock
            </button>
          </div>
        </form>
      </HudModal>
    </>
  );
}
