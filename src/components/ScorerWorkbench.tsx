"use client";

import BallOrbits from "@/components/BallOrbits";
import HudModal from "@/components/HudModal";
import Scorecard from "@/components/Scorecard";
import CreaseBar from "@/components/scorer/CreaseBar";
import ExtrasHud from "@/components/scorer/ExtrasHud";
import HeroScore from "@/components/scorer/HeroScore";
import PickerField, { PickerGroup } from "@/components/scorer/PickerField";
import ScoringPad from "@/components/scorer/ScoringPad";
import CompletedMatchView from "@/components/CompletedMatchView";
import ReplaceBatterHud from "@/components/ReplaceBatterHud";
import WicketHud from "@/components/scorer/WicketHud";
import { rememberMatch, touchRecentMatch } from "@/lib/recent-matches";
import {
  awaitingNewOverBowler,
  batterStats,
  currentOverProgress,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const [showSquad, setShowSquad] = useState(false);
  const [extrasHudOpen, setExtrasHudOpen] = useState(false);
  const [overPick, setOverPick] = useState({
    gateKey: Number.MIN_SAFE_INTEGER,
    bowlingId: "",
    ready: false,
  });
  const [wicketHudOpen, setWicketHudOpen] = useState(false);
  const [replaceHud, setReplaceHud] = useState<{
    open: boolean;
    end?: "striker" | "non_striker";
    pickLeaving?: boolean;
  }>({ open: false, end: "striker" });
  const [bowlerHudOpen, setBowlerHudOpen] = useState(false);
  const [openingHudOpen, setOpeningHudOpen] = useState(true);
  const prevNeedsBowlerRef = useRef(false);

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
    if (j.bundle) {
      setBundle(j.bundle);
      touchRecentMatch(j.bundle.match.public_id, {
        teamAName: j.bundle.match.team_a_name,
        teamBName: j.bundle.match.team_b_name,
        status: j.bundle.match.status,
        resultSummary: j.bundle.match.result_summary,
      });
    }
    if (typeof j.locked === "boolean") setLocked(j.locked);
  }, [apiRoot]);

  useEffect(() => {
    rememberMatch({
      publicId: match.public_id,
      writeToken,
      teamAName: match.team_a_name,
      teamBName: match.team_b_name,
      status: match.status,
      resultSummary: match.result_summary,
    });
  }, [
    match.public_id,
    match.team_a_name,
    match.team_b_name,
    match.status,
    match.result_summary,
    writeToken,
  ]);

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
      match.max_balls_per_over ?? 0,
    );
  }, [activeDels, battingSide, bundle.players, match.max_balls_per_over, targetInnings]);

  const maxBallsPerOver = match.max_balls_per_over ?? 0;
  const lastBd = lastBowlingDelivery(activeDels);
  const overProg = useMemo(
    () => currentOverProgress(activeDels, maxBallsPerOver),
    [activeDels, maxBallsPerOver],
  );
  const ballsLegal = sim?.balls_legal ?? 0;

  const needsOpeningGate =
    allowPad && !!targetInnings && targetInnings.current_bowler_id == null;

  const awaitingBowler = awaitingNewOverBowler(
    activeDels,
    ballsLegal,
    maxBallsPerOver,
  );

  /** Confirmed pick is only valid for this over boundary (legal-ball count). */
  const bowlerPickConfirmed =
    overPick.ready && overPick.gateKey === ballsLegal;

  const needsBowlerPick = awaitingBowler && !bowlerPickConfirmed;

  const mustPickNewOverBowler =
    allowPad && !!targetInnings && needsBowlerPick;

  const openBowlerPicker = () => {
    setErr(null);
    setBowlerHudOpen(true);
  };

  useEffect(() => {
    if (needsOpeningGate) setOpeningHudOpen(true);
  }, [needsOpeningGate]);

  useEffect(() => {
    if (needsBowlerPick && !prevNeedsBowlerRef.current) {
      setOverPick({ gateKey: ballsLegal, bowlingId: "", ready: false });
      setBowlerHudOpen(true);
    }
    prevNeedsBowlerRef.current = needsBowlerPick;
  }, [needsBowlerPick, ballsLegal]);

  const bowlersForNewOver = useMemo(
    () => bowlers.filter((b) => b.id !== lastBd?.bowler_id),
    [bowlers, lastBd?.bowler_id],
  );

  const effectiveBowlerId = awaitingBowler
    ? bowlerPickConfirmed
      ? overPick.bowlingId
      : ""
    : lastBd?.bowler_id ?? targetInnings?.current_bowler_id ?? "";

  const bowlerInSquad =
    !effectiveBowlerId || bowlers.some((b) => b.id === effectiveBowlerId);
  const safeBowlerValue = bowlerInSquad ? effectiveBowlerId : "";

  const padUnlocked =
    allowPad &&
    !needsOpeningGate &&
    !mustPickNewOverBowler &&
    !wicketHudOpen &&
    !extrasHudOpen &&
    !!sim;

  const overStatus = needsBowlerPick
    ? "Pick bowler first"
    : awaitingBowler && bowlerPickConfirmed
      ? "New over"
      : maxBallsPerOver > 0
        ? `Legal ${overProg.legalBalls}/6 · wd/nb ${overProg.illegalBalls}/${maxBallsPerOver}`
        : `Legal ${overProg.legalBalls}/6`;

  const strikerStat = useMemo(
    () => batterStats(activeDels, sim?.strikerId, battingSide, bundle.players),
    [activeDels, sim?.strikerId, battingSide, bundle.players],
  );
  const nonStrikerStat = useMemo(
    () => batterStats(activeDels, sim?.nonStrikerId, battingSide, bundle.players),
    [activeDels, sim?.nonStrikerId, battingSide, bundle.players],
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

  function confirmNewOverBowler() {
    if (!overPick.bowlingId) {
      setErr("Pick a bowler for this over");
      return;
    }
    if (overPick.bowlingId === lastBd?.bowler_id) {
      setErr("Pick a different bowler — the previous over's bowler cannot continue");
      return;
    }
    setErr(null);
    setOverPick((o) => ({ ...o, ready: true, gateKey: ballsLegal }));
    setBowlerHudOpen(false);
  }

  const statusBadge =
    match.status === "live" ? "live" : match.status === "completed" ? "done" : "";

  const battersInInnings = useMemo(() => {
    const ids = new Set<string>();
    for (const d of activeDels) {
      if (d.is_strike_swap || d.note === "crease_replace") continue;
      if (d.striker_id) ids.add(d.striker_id);
      if (d.non_striker_id) ids.add(d.non_striker_id);
      if (d.dismissed_batsman_id) ids.add(d.dismissed_batsman_id);
      if (d.incoming_striker_id) ids.add(d.incoming_striker_id);
    }
    return batsmen.filter((p) => ids.has(p.id));
  }, [activeDels, batsmen]);

  const replaceCandidates = useMemo(() => {
    if (!sim) return [];
    if (replaceHud.pickLeaving || match.status === "completed") {
      return batsmen.filter((p) => !p.did_not_bat);
    }
    return batsmen.filter(
      (p) =>
        p.id !== sim.strikerId &&
        p.id !== sim.nonStrikerId &&
        !sim.dismissedIds.has(p.id),
    );
  }, [batsmen, match.status, replaceHud.pickLeaving, sim]);

  if (match.status === "completed" && locked) {
    return (
      <CompletedMatchView
        bundle={bundle}
        writeToken={writeToken}
        onUnlocked={async () => {
          setLocked(false);
          await refresh();
        }}
      />
    );
  }

  return (
    <div className="phone-shell">
      <HudModal
        open={needsOpeningGate && openingHudOpen && !!targetInnings}
        title="Start innings"
        onBackdropClick={() => setOpeningHudOpen(false)}
      >
        {targetInnings && (
          <OpeningLineupForm
            busy={busy}
            batsmen={batsmen}
            bowlers={bowlers}
            onSubmit={async (payload) => {
              const ok = await postOpening(payload);
              if (ok) setOpeningHudOpen(false);
            }}
            onCancel={() => setOpeningHudOpen(false)}
          />
        )}
      </HudModal>

      <HudModal
        open={needsBowlerPick && bowlerHudOpen}
        title="New over — choose bowler"
        onBackdropClick={() => setBowlerHudOpen(false)}
      >
        {err ? (
          <div className="error-banner mb-3" role="alert">
            {err}
          </div>
        ) : null}
        <p className="mb-3 text-sm opacity-90">
          Six legal balls finished. Pick who bowls this over — not the same
          bowler as the last over.
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
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="hud-btn flex-1"
                onClick={() => {
                  setErr(null);
                  setBowlerHudOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !overPick.bowlingId}
                className="hud-btn primary flex-1 disabled:opacity-50"
                onClick={() => confirmNewOverBowler()}
              >
                Continue scoring
              </button>
            </div>
          </>
        )}
      </HudModal>

      <ExtrasHud
        open={extrasHudOpen}
        busy={busy}
        onClose={() => setExtrasHudOpen(false)}
        onSubmit={submitExtra}
      />

      {sim && (
        <ReplaceBatterHud
          open={replaceHud.open}
          busy={busy}
          pickLeaving={replaceHud.pickLeaving}
          end={replaceHud.end}
          leavingName={
            replaceHud.end
              ? pName(
                  replaceHud.end === "striker"
                    ? sim.strikerId
                    : sim.nonStrikerId,
                )
              : undefined
          }
          leavingOptions={
            replaceHud.pickLeaving ? battersInInnings : undefined
          }
          candidates={replaceCandidates}
          onClose={() => setReplaceHud((h) => ({ ...h, open: false }))}
          onConfirm={async ({ incomingPlayerId, leavingPlayerId }) => {
            const ok = await exec(async () => {
              const body: Record<string, string> = { incomingPlayerId };
              if (replaceHud.pickLeaving && leavingPlayerId) {
                body.leavingPlayerId = leavingPlayerId;
              } else if (replaceHud.end) {
                body.end = replaceHud.end;
              }
              const r = await fetch(`${apiRoot}/crease`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              const j = await r.json();
              if (!r.ok) throw new Error(j.error ?? "Replace failed");
            });
            if (ok) setReplaceHud((h) => ({ ...h, open: false }));
          }}
        />
      )}

      {sim && targetInnings && (
        <WicketHud
          open={wicketHudOpen}
          busy={busy}
          error={err}
          onClose={() => {
            setErr(null);
            setWicketHudOpen(false);
          }}
          strikerId={sim.strikerId}
          nonStrikerId={sim.nonStrikerId}
          strikerName={pName(sim.strikerId)}
          nonStrikerName={pName(sim.nonStrikerId)}
          batsmen={availableBatsmen}
          fielders={bowlers}
          maxWickets={match.max_wickets}
          currentWickets={sim.wickets}
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

      {err &&
        !(needsBowlerPick && bowlerHudOpen) &&
        !(wicketHudOpen) && (
          <div className="error-banner no-print">{err}</div>
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
        live={
          sim && targetInnings && !targetInnings.completed
            ? {
                runs: sim.runs,
                wickets: sim.wickets,
                ballsLegal: sim.balls_legal,
              }
            : null
        }
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
          overStatus={overStatus}
          bowlerPickPending={needsBowlerPick}
          onPickBowler={openBowlerPicker}
          onReplaceStriker={
            padUnlocked && allowPad && match.status === "live"
              ? () => setReplaceHud({ open: true, end: "striker" })
              : undefined
          }
          onReplaceNonStriker={
            padUnlocked && allowPad && match.status === "live"
              ? () => setReplaceHud({ open: true, end: "non_striker" })
              : undefined
          }
          disabled={busy || !padUnlocked}
          onSwap={() => void postDelivery({ strikeSwap: true })}
        />
      )}

      {needsOpeningGate && !openingHudOpen && (
        <div className="chase-bar warn no-print">
          <button
            type="button"
            className="bowler-pick-link"
            onClick={() => setOpeningHudOpen(true)}
          >
            Set openers &amp; bowler
          </button>{" "}
          before scoring.
        </div>
      )}

      {targetInnings && (
        <section className="glass no-print" style={{ padding: "14px 16px" }}>
          <p className="section-title">
            This over
            {overProg.legalBalls > 0 || overProg.totalBalls > 0 ? (
              <span className="section-title-sub">
                {overProg.legalBalls}/6 legal
                {maxBallsPerOver > 0
                  ? ` · wd/nb ${overProg.illegalBalls}/${maxBallsPerOver}`
                  : ""}
              </span>
            ) : null}
          </p>
          <BallOrbits
            deliveries={activeDels}
            variant="currentOver"
            maxBallsPerOver={maxBallsPerOver}
          />
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
        {match.status === "completed" && allowPad && (
          <button
            type="button"
            disabled={busy || battersInInnings.length === 0}
            onClick={() =>
              setReplaceHud({ open: true, pickLeaving: true })
            }
          >
            Correct batter
          </button>
        )}
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
          onWicket={() => {
            setErr(null);
            setWicketHudOpen(true);
          }}
        />
      )}

      <details className="admin-panel glass no-print">
        <summary>Squad &amp; admin</summary>
        <div style={{ marginTop: 12 }}>
          <MatchSettingsPanel
            match={match}
            disabled={busy || match.status === "completed"}
            apiRoot={apiRoot}
            exec={exec}
          />
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

function MatchSettingsPanel({
  match,
  disabled,
  apiRoot,
  exec,
}: {
  match: {
    overs_per_innings: number;
    max_wickets: number;
    max_balls_per_over?: number;
  };
  disabled: boolean;
  apiRoot: string;
  exec: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const [maxBalls, setMaxBalls] = useState(match.max_balls_per_over ?? 0);
  const [overs, setOvers] = useState(match.overs_per_innings);
  const [maxWk, setMaxWk] = useState(match.max_wickets);

  useEffect(() => {
    setMaxBalls(match.max_balls_per_over ?? 0);
    setOvers(match.overs_per_innings);
    setMaxWk(match.max_wickets);
  }, [match.max_balls_per_over, match.overs_per_innings, match.max_wickets]);

  return (
    <form
      className="mb-4 space-y-2 border-b border-white/10 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        void exec(async () => {
          const r = await fetch(`${apiRoot}/settings`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              maxBallsPerOver: maxBalls,
              oversPerInnings: overs,
              maxWickets: maxWk,
            }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? "Settings update failed");
        });
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
        Match settings
      </p>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Max wides/no-balls per over (0 = no cap)</span>
        <input
          type="number"
          min={0}
          max={30}
          disabled={disabled}
          value={maxBalls}
          onChange={(e) => setMaxBalls(Number(e.target.value) || 0)}
          className="input-select"
        />
      </label>
      <p className="text-xs opacity-60">
        Kids games: set 8 or 10 to limit extras. Over still ends at 6 legal
        balls.
      </p>
      <div className="field-row">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Overs per innings</span>
          <input
            type="number"
            min={1}
            max={200}
            disabled={disabled}
            value={overs}
            onChange={(e) => setOvers(Number(e.target.value) || 1)}
            className="input-select"
          />
          <p className="text-xs opacity-60" style={{ marginTop: 4 }}>
            Extend mid-innings (e.g. 20 → 25) — applies from save onward.
          </p>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Max wickets</span>
          <input
            type="number"
            min={1}
            max={20}
            disabled={disabled}
            value={maxWk}
            onChange={(e) => setMaxWk(Number(e.target.value) || 1)}
            className="input-select"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="hud-btn primary w-full disabled:opacity-50"
      >
        Save settings
      </button>
    </form>
  );
}

function OpeningLineupForm({
  batsmen,
  bowlers,
  busy,
  onSubmit,
  onCancel,
}: {
  batsmen: { id: string; display_name: string }[];
  bowlers: { id: string; display_name: string }[];
  busy: boolean;
  onSubmit: (payload: {
    strikerId: string;
    nonStrikerId: string;
    bowlerId: string;
  }) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [strikerId, setStrikerId] = useState("");
  const [nonStrikerId, setNonStrikerId] = useState("");
  const [bowlerId, setBowlerId] = useState("");

  const batOptions = batsmen.map((p) => ({ id: p.id, label: p.display_name }));
  const bowlOptions = bowlers.map((p) => ({ id: p.id, label: p.display_name }));
  const strikerOptions = batOptions.filter((o) => o.id !== nonStrikerId);
  const nonStrikerOptions = batOptions.filter((o) => o.id !== strikerId);
  const creaseClash = !!strikerId && strikerId === nonStrikerId;

  return (
    <>
      <p className="mb-3 text-sm opacity-85">
        One-time for this innings: striker, non-striker, and opening bowler.
      </p>
      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (strikerId === nonStrikerId) return;
          void onSubmit({ strikerId, nonStrikerId, bowlerId });
        }}
      >
        <PickerGroup>
        <PickerField
          label="Striker"
          value={strikerId}
          onChange={(id) => {
            setStrikerId(id);
            if (id === nonStrikerId) setNonStrikerId("");
          }}
          options={strikerOptions}
          placeholder="Pick…"
          required
          disabled={busy}
        />
        <PickerField
          label="Non-striker"
          value={nonStrikerId}
          onChange={(id) => {
            setNonStrikerId(id);
            if (id === strikerId) setStrikerId("");
          }}
          options={nonStrikerOptions}
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
        </PickerGroup>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="hud-btn flex-1"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              busy || !strikerId || !nonStrikerId || !bowlerId || creaseClash
            }
            className="hud-btn primary flex-1 disabled:opacity-50"
          >
            Start scoring
          </button>
        </div>
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
