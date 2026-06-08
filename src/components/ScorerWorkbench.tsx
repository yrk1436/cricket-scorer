"use client";

import BallOrbits from "@/components/BallOrbits";
import HudModal from "@/components/HudModal";
import Scorecard from "@/components/Scorecard";
import CreaseBar from "@/components/scorer/CreaseBar";
import ExtrasHud from "@/components/scorer/ExtrasHud";
import HeroScore from "@/components/scorer/HeroScore";
import PickerField from "@/components/scorer/PickerField";
import ScoringPad from "@/components/scorer/ScoringPad";
import WicketHud from "@/components/scorer/WicketHud";
import {
  batterStats,
  eligibleBatters,
  eligibleBowlers,
  lastBowlingDelivery,
  opposite,
  replayInnings,
} from "@/lib/game";
import type { DeliveryInput } from "@/lib/match-service";
import type { SerialBundle } from "@/lib/scorecard-text";
import type { DbInnings, TeamSide } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  writeToken: string;
  initial: SerialBundle;
  initiallyLocked: boolean;
  origin: string;
};

function scoringTargetInnings(bundle: SerialBundle): DbInnings | null {
  const sorted = [...bundle.innings].sort((a, b) => a.index_num - b.index_num);
  if (bundle.match.status === "completed") {
    return sorted[sorted.length - 1] ?? null;
  }
  return (
    sorted.find(
      (i) =>
        !i.completed && i.index_num === bundle.match.current_innings_index,
    ) ?? null
  );
}

export default function ScorerWorkbench({
  writeToken,
  initial,
  initiallyLocked,
  origin,
}: Props) {
  const apiRoot = `/api/matches/write/${encodeURIComponent(writeToken)}`;

  const [bundle, setBundle] = useState(initial);
  const [locked, setLocked] = useState(initiallyLocked);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [showSquad, setShowSquad] = useState(false);
  const [extrasHudOpen, setExtrasHudOpen] = useState(false);
  const [overPick, setOverPick] = useState({
    gateKey: Number.MIN_SAFE_INTEGER,
    bowlingId: "",
    ready: false,
  });
  const [wicketHudOpen, setWicketHudOpen] = useState(false);

  const { match } = bundle;
  const sideName = (side: "a" | "b") =>
    side === "a" ? match.team_a_name : match.team_b_name;

  const pName = (id: string | null | undefined) =>
    bundle.players.find((p) => p.id === id)?.display_name ?? "—";

  const refresh = useCallback(async () => {
    const r = await fetch(apiRoot);
    const j = (await r.json()) as {
      bundle?: SerialBundle;
      locked?: boolean;
      error?: string;
    };
    if (!r.ok) throw new Error(j.error ?? "Reload failed");
    if (j.bundle) setBundle(j.bundle);
    if (typeof j.locked === "boolean") setLocked(j.locked);
  }, [apiRoot]);

  const exec = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const readOnlyHref = `${origin.replace(/\/$/, "")}/m/${match.public_id}`;

  const allowPad =
    match.status === "live"
      ? true
      : match.status === "completed"
        ? !locked
        : false;

  const canEditPlayers =
    match.status === "live" ||
    (match.status === "completed" && !locked);

  const targetInnings = useMemo(() => scoringTargetInnings(bundle), [bundle]);

  const activeDels = useMemo(() => {
    if (!targetInnings) return [];
    return [...(bundle.deliveriesByInningsId[targetInnings.id] ?? [])].sort(
      (a, b) => a.display_order - b.display_order,
    );
  }, [bundle.deliveriesByInningsId, targetInnings]);

  const battingSide = (targetInnings?.batting_side ?? "a") as TeamSide;
  const bowlingSide = opposite(battingSide);

  const batsmen = useMemo(
    () => eligibleBatters(battingSide, bundle.players),
    [battingSide, bundle.players],
  );

  const bowlers = useMemo(
    () => eligibleBowlers(bowlingSide, bundle.players),
    [bowlingSide, bundle.players],
  );

  const sim = useMemo(() => {
    if (!targetInnings) return null;
    const strikeSeed =
      activeDels.length === 0 &&
      targetInnings.current_striker_id &&
      targetInnings.current_non_striker_id
        ? {
            strikerId: targetInnings.current_striker_id,
            nonStrikerId: targetInnings.current_non_striker_id,
          }
        : null;
    return replayInnings(
      battingSide,
      bundle.players,
      activeDels,
      strikeSeed,
    );
  }, [activeDels, battingSide, bundle.players, targetInnings]);

  const lastBd = lastBowlingDelivery(activeDels);
  const ballsLegal = sim?.balls_legal ?? 0;
  const newOver =
    activeDels.length === 0 || (ballsLegal > 0 && ballsLegal % 6 === 0);
  const lockedBowlerId =
    !newOver && lastBd?.bowler_id ? lastBd.bowler_id : null;

  const needsOpeningGate =
    allowPad && !!targetInnings && targetInnings.current_bowler_id == null;

  const pickNewOverBowlerGate =
    !needsOpeningGate &&
    allowPad &&
    !!targetInnings &&
    ballsLegal > 0 &&
    ballsLegal % 6 === 0;

  const pickGateKey = pickNewOverBowlerGate ? ballsLegal : -1;

  useEffect(() => {
    setOverPick({ gateKey: pickGateKey, bowlingId: "", ready: false });
  }, [pickGateKey]);

  const bowlersForNewOver = useMemo(
    () => bowlers.filter((b) => b.id !== lastBd?.bowler_id),
    [bowlers, lastBd?.bowler_id],
  );

  const effectiveBowlerId =
    lockedBowlerId ??
    (pickNewOverBowlerGate
      ? overPick.ready
        ? overPick.bowlingId
        : ""
      : targetInnings?.current_bowler_id ?? "");

  const bowlerInSquad =
    !effectiveBowlerId || bowlers.some((b) => b.id === effectiveBowlerId);
  const safeBowlerValue = bowlerInSquad ? effectiveBowlerId : "";

  const mustPickNewOverBowler =
    pickNewOverBowlerGate && !lockedBowlerId && !overPick.ready;

  const padUnlocked =
    allowPad &&
    !needsOpeningGate &&
    !mustPickNewOverBowler &&
    !wicketHudOpen &&
    !extrasHudOpen &&
    !!sim;

  const ballsInOver = ballsLegal % 6 || (ballsLegal > 0 ? 6 : 0);

  const strikerStat = useMemo(
    () => batterStats(activeDels, sim?.strikerId),
    [activeDels, sim?.strikerId],
  );
  const nonStrikerStat = useMemo(
    () => batterStats(activeDels, sim?.nonStrikerId),
    [activeDels, sim?.nonStrikerId],
  );

  const postDelivery = (body: Record<string, unknown>) =>
    exec(async () => {
      const strikeSwap = Boolean(body.strikeSwap);
      const payload = strikeSwap
        ? { strikeSwap: true }
        : (() => {
            if (needsOpeningGate) {
              throw new Error(
                "Confirm opening striker, non-striker, and bowler first",
              );
            }
            if (mustPickNewOverBowler) {
              throw new Error("Choose the bowler for the new over first");
            }
            const bid = effectiveBowlerId;
            if (!bid) throw new Error("No bowler set for this ball");
            return { ...body, bowlerId: bid };
          })();

      const r = await fetch(`${apiRoot}/delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Delivery failed");
    });

  const submitExtra = async (payload: Omit<DeliveryInput, "bowlerId">) => {
    const ok = await postDelivery({
      ...payload,
      isWicket: false,
      dismissal: "none",
    });
    if (ok) setExtrasHudOpen(false);
  };

  const submitWicketPayload = async (payload: Omit<DeliveryInput, "bowlerId">) => {
    const ok = await postDelivery(payload);
    if (ok) setWicketHudOpen(false);
  };

  const recordRun = (n: number) =>
    void postDelivery({
      runsOffBat: n,
      extraWide: 0,
      extraNb: 0,
      extraByes: 0,
      extraLegByes: 0,
      countsAsLegalDelivery: true,
      isWicket: false,
      dismissal: "none",
    });

  const postOpening = (body: {
    strikerId: string;
    nonStrikerId: string;
    bowlerId: string;
  }) =>
    exec(async () => {
      const r = await fetch(`${apiRoot}/opening`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Opening failed");
    });

  const allInningsClosed =
    bundle.innings.length >= match.innings_count &&
    bundle.innings.every((i) => i.completed);

  const canComplete = match.status === "live" && allInningsClosed && !busy;
  const hasOpenInnings = bundle.innings.some((i) => !i.completed);
  const canCloseInnings =
    match.status === "live" && hasOpenInnings && !busy;

  const availableBatsmen = useMemo(() => {
    if (!sim) return batsmen;
    return batsmen.filter((p) => !sim.dismissedIds.has(p.id));
  }, [batsmen, sim]);

  async function unlock(ev: React.FormEvent) {
    ev.preventDefault();
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
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmNewOverBowler() {
    if (!overPick.bowlingId) {
      setErr("Pick a bowler for this over");
      return;
    }
    setErr(null);
    setOverPick((o) => ({ ...o, ready: true }));
  }

  const statusBadge =
    match.status === "live" ? "live" : match.status === "completed" ? "done" : "";

  return (
    <div className="phone-shell">
      <HudModal open={needsOpeningGate && !!targetInnings} title="Start innings">
        {targetInnings && (
          <OpeningLineupForm
            busy={busy}
            batsmen={batsmen}
            bowlers={bowlers}
            defaultStrikerId={targetInnings.current_striker_id ?? ""}
            defaultNonStrikerId={targetInnings.current_non_striker_id ?? ""}
            onSubmit={postOpening}
          />
        )}
      </HudModal>

      <HudModal
        open={pickNewOverBowlerGate && !overPick.ready}
        title="New over — choose bowler"
      >
        <p className="mb-3 text-sm opacity-90">
          The previous over&apos;s bowler cannot bowl again next over. Pick who
          bowls this over, then continue scoring.
        </p>
        {bowlersForNewOver.length === 0 ? (
          <p className="text-sm" style={{ color: "#fde68a" }}>
            No other bowlers on the squad list. Mark players as not DNB or add
            more bowlers.
          </p>
        ) : (
          <>
            <PickerField
              label="Bowler this over"
              value={overPick.bowlingId}
              onChange={(id) => {
                setOverPick((o) => ({ ...o, bowlingId: id }));
                setErr(null);
              }}
              options={bowlersForNewOver.map((p) => ({
                id: p.id,
                label: p.display_name,
              }))}
              placeholder="Select…"
              required
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || !overPick.bowlingId}
              className="hud-btn primary mt-4 w-full disabled:opacity-50"
              onClick={() => confirmNewOverBowler()}
            >
              Continue scoring
            </button>
          </>
        )}
      </HudModal>

      <ExtrasHud
        open={extrasHudOpen}
        busy={busy}
        onClose={() => setExtrasHudOpen(false)}
        onSubmit={submitExtra}
      />

      {sim && targetInnings && (
        <WicketHud
          open={wicketHudOpen}
          busy={busy}
          onClose={() => setWicketHudOpen(false)}
          strikerId={sim.strikerId}
          nonStrikerId={sim.nonStrikerId}
          strikerName={pName(sim.strikerId)}
          nonStrikerName={pName(sim.nonStrikerId)}
          batsmen={availableBatsmen}
          fielders={bowlers}
          onSubmit={submitWicketPayload}
        />
      )}

      <header className="top-bar no-print">
        <div>
          <h1>Scoring</h1>
          <p className="sub">Secret link · do not share</p>
        </div>
        <span className={`badge ${statusBadge}`}>
          {match.status === "live" ? "Live" : match.status}
        </span>
      </header>

      {err && <div className="error-banner no-print">{err}</div>}

      {match.status === "completed" && locked && (
        <form onSubmit={unlock} className="glass no-print" style={{ padding: 16 }}>
          <p className="mb-2 text-sm font-medium">Match finished — enter PIN to edit</p>
          <div className="field-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !pin}
              className="hud-btn primary"
              style={{ alignSelf: "end" }}
            >
              Unlock
            </button>
          </div>
        </form>
      )}

      {match.status === "completed" && !locked && (
        <div className="chase-bar ok no-print">Editing unlocked</div>
      )}

      {!sim && targetInnings && (
        <div className="error-banner no-print">
          Cannot simulate innings — check batting lineup still has eligible players.
        </div>
      )}

      <HeroScore
        match={match}
        targetInnings={targetInnings}
        sideName={sideName}
        allInnings={bundle.innings}
      />

      {sim && (
        <CreaseBar
          strikerName={pName(sim.strikerId)}
          nonStrikerName={pName(sim.nonStrikerId)}
          strikerRuns={strikerStat.runs}
          strikerBalls={strikerStat.balls}
          nonStrikerRuns={nonStrikerStat.runs}
          nonStrikerBalls={nonStrikerStat.balls}
          bowlerName={pName(safeBowlerValue || null)}
          ballsInOver={ballsInOver}
          disabled={busy || !padUnlocked}
          onSwap={() => void postDelivery({ strikeSwap: true })}
        />
      )}

      {pickNewOverBowlerGate && !overPick.ready && (
        <div className="chase-bar warn no-print">
          Confirm the new-over bowler in the dialog above before scoring.
        </div>
      )}

      {targetInnings && (
        <section className="glass no-print" style={{ padding: "14px 16px" }}>
          <p className="section-title">Last 10 balls</p>
          <BallOrbits deliveries={activeDels} />
        </section>
      )}

      <div className="toolbar no-print">
        <button
          type="button"
          disabled={busy || !allowPad}
          onClick={() =>
            exec(async () => {
              const r = await fetch(`${apiRoot}/undo`, { method: "POST" });
              const j = await r.json();
              if (!r.ok) throw new Error(j.error ?? "Undo failed");
            })
          }
        >
          Undo
        </button>
        <button
          type="button"
          disabled={busy || !canCloseInnings}
          onClick={() =>
            exec(async () => {
              const r = await fetch(`${apiRoot}/close-innings`, { method: "POST" });
              const j = await r.json();
              if (!r.ok) throw new Error(j.error ?? "Could not close innings");
            })
          }
        >
          Close innings
        </button>
        {canComplete && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              exec(async () => {
                const r = await fetch(`${apiRoot}/complete`, { method: "POST" });
                const j = await r.json();
                if (!r.ok) throw new Error(j.error ?? "Complete failed");
              })
            }
          >
            Complete match
          </button>
        )}
        <Link href={`/m/${match.public_id}`} className="primary" target="_blank">
          Share read-only ↗
        </Link>
      </div>

      {allowPad && sim && (
        <ScoringPad
          disabled={busy || !padUnlocked}
          onRun={recordRun}
          onExtras={() => setExtrasHudOpen(true)}
          onWicket={() => setWicketHudOpen(true)}
        />
      )}

      <details className="admin-panel glass no-print">
        <summary>Squad &amp; admin</summary>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowSquad((x) => !x)}
            className="hud-btn"
            style={{ marginBottom: 8 }}
          >
            {showSquad ? "Hide squad" : "Edit squad names / DNB"}
          </button>
          {showSquad && (
            <ul className="space-y-2 text-sm">
              {bundle.players.map((p) => (
                <PlayerRow
                  key={p.id}
                  disabled={busy || !canEditPlayers}
                  apiRoot={`${apiRoot}/player/${p.id}`}
                  player={p}
                  exec={exec}
                />
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs opacity-60">
            Read-only link:{" "}
            <Link className="underline" href={readOnlyHref}>
              {readOnlyHref}
            </Link>
          </p>
        </div>
      </details>

      <div className="print-only">
        <Scorecard bundle={bundle} />
      </div>
    </div>
  );
}

function OpeningLineupForm({
  batsmen,
  bowlers,
  busy,
  defaultStrikerId,
  defaultNonStrikerId,
  onSubmit,
}: {
  batsmen: { id: string; display_name: string }[];
  bowlers: { id: string; display_name: string }[];
  busy: boolean;
  defaultStrikerId: string;
  defaultNonStrikerId: string;
  onSubmit: (payload: {
    strikerId: string;
    nonStrikerId: string;
    bowlerId: string;
  }) => Promise<unknown>;
}) {
  const [strikerId, setStrikerId] = useState(defaultStrikerId);
  const [nonStrikerId, setNonStrikerId] = useState(defaultNonStrikerId);
  const [bowlerId, setBowlerId] = useState("");

  const batOptions = batsmen.map((p) => ({ id: p.id, label: p.display_name }));
  const bowlOptions = bowlers.map((p) => ({ id: p.id, label: p.display_name }));

  return (
    <>
      <p className="mb-3 text-sm opacity-85">
        One-time for this innings: striker, non-striker, and opening bowler.
      </p>
      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({ strikerId, nonStrikerId, bowlerId });
        }}
      >
        <PickerField
          label="Striker"
          value={strikerId}
          onChange={setStrikerId}
          options={batOptions}
          placeholder="Pick…"
          required
          disabled={busy}
        />
        <PickerField
          label="Non-striker"
          value={nonStrikerId}
          onChange={setNonStrikerId}
          options={batOptions}
          placeholder="Pick…"
          required
          disabled={busy}
        />
        <PickerField
          label="Bowler (first ball)"
          value={bowlerId}
          onChange={setBowlerId}
          options={bowlOptions}
          placeholder="Pick…"
          required
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !strikerId || !nonStrikerId || !bowlerId}
          className="hud-btn primary mt-2 w-full disabled:opacity-50"
        >
          Confirm and start scoring
        </button>
      </form>
    </>
  );
}

function PlayerRow({
  player: p,
  disabled,
  apiRoot,
  exec,
}: {
  player: { id: string; side: string; display_name: string; did_not_bat: boolean };
  disabled: boolean;
  apiRoot: string;
  exec: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const [name, setName] = useState(p.display_name);
  const [didNotBat, setDidNotBat] = useState(p.did_not_bat);

  useEffect(() => {
    setName(p.display_name);
  }, [p.display_name]);

  useEffect(() => {
    setDidNotBat(p.did_not_bat);
  }, [p.did_not_bat]);

  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2">
      <span className="w-16 text-xs opacity-70">{p.side.toUpperCase()}</span>
      <input
        disabled={disabled}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (!v || v === p.display_name) {
            setName(p.display_name);
            return;
          }
          void exec(async () => {
            const r = await fetch(apiRoot, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ display_name: v }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error ?? "Rename failed");
          });
        }}
        className="input-select min-w-[10rem] flex-1 py-1.5 text-sm"
      />
      <label className="flex items-center gap-1 text-xs opacity-80">
        <input
          type="checkbox"
          disabled={disabled}
          checked={didNotBat}
          onChange={(ev) => {
            const next = ev.target.checked;
            setDidNotBat(next);
            void exec(async () => {
              const r = await fetch(apiRoot, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ did_not_bat: next }),
              });
              const j = await r.json();
              if (!r.ok) throw new Error(j.error ?? "Update failed");
            });
          }}
        />
        DNB
      </label>
    </li>
  );
}
