"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const defaultSide = (prefix: string) =>
  Array.from({ length: 11 }, (_, i) => `${prefix} player ${i + 1}`);

function parseSquadLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function CreateMatchForm({ origin }: { origin: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [teamA, setTeamA] = useState("Team A");
  const [teamB, setTeamB] = useState("Team B");
  const [overs, setOvers] = useState(20);
  const [maxWk, setMaxWk] = useState(10);
  const [tossWin, setTossWin] = useState<"a" | "b">("a");
  const [tossElect, setTossElect] = useState<"bat" | "bowl">("bat");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [squadAText, setSquadAText] = useState(defaultSide("A").join("\n"));
  const [squadBText, setSquadBText] = useState(defaultSide("B").join("\n"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamAName: teamA,
          teamBName: teamB,
          oversPerInnings: overs,
          maxWickets: maxWk,
          inningsCount: 2,
          tossWinner: tossWin,
          tossElect: tossElect,
          pin,
          pinConfirm: pin2,
          squadA: parseSquadLines(squadAText),
          squadB: parseSquadLines(squadBText),
        }),
      });
      const j = (await r.json()) as {
        error?: string;
        writeToken?: string;
        publicId?: string;
      };
      if (!r.ok) throw new Error(j.error ?? "Create failed");
      if (!j.writeToken) throw new Error("No write token");
      router.push(`/score/${encodeURIComponent(j.writeToken)}`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="phone-shell">
      <header className="top-bar">
        <h1>New match</h1>
        <span className="badge">Setup</span>
      </header>

      <form onSubmit={submit} className="form-card glass">
        <h2>Start scoring</h2>
        <p className="sub">Two innings · PIN only after the match finishes</p>

        <div className="field-row">
          <div className="field">
            <label htmlFor="team-a">Team A</label>
            <input
              id="team-a"
              value={teamA}
              onChange={(e) => setTeamA(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="team-b">Team B</label>
            <input
              id="team-b"
              value={teamB}
              onChange={(e) => setTeamB(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="overs">Overs / innings</label>
            <input
              id="overs"
              type="number"
              min={1}
              max={400}
              value={overs}
              onChange={(e) => setOvers(Number(e.target.value) || 1)}
            />
          </div>
          <div className="field">
            <label htmlFor="wkts">Max wickets</label>
            <input
              id="wkts"
              type="number"
              min={1}
              max={20}
              value={maxWk}
              onChange={(e) => setMaxWk(Number(e.target.value) || 1)}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="toss-win">Toss won by</label>
            <select
              id="toss-win"
              value={tossWin}
              onChange={(e) => setTossWin(e.target.value === "b" ? "b" : "a")}
            >
              <option value="a">Team A</option>
              <option value="b">Team B</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="toss-elect">Elects to</label>
            <select
              id="toss-elect"
              value={tossElect}
              onChange={(e) =>
                setTossElect(e.target.value === "bowl" ? "bowl" : "bat")
              }
            >
              <option value="bat">Bat</option>
              <option value="bowl">Bowl</option>
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="pin">PIN (min 4)</label>
            <input
              id="pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              minLength={4}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label htmlFor="pin2">Confirm PIN</label>
            <input
              id="pin2"
              type="password"
              value={pin2}
              onChange={(e) => setPin2(e.target.value)}
              minLength={4}
              required
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="squad-a">Squad A — one name per line</label>
          <textarea
            id="squad-a"
            value={squadAText}
            onChange={(e) => setSquadAText(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="squad-b">Squad B — one name per line</label>
          <textarea
            id="squad-b"
            value={squadBText}
            onChange={(e) => setSquadBText(e.target.value)}
          />
        </div>

        {err && <div className="error-banner">{err}</div>}

        <button
          type="submit"
          disabled={
            busy ||
            parseSquadLines(squadAText).length === 0 ||
            parseSquadLines(squadBText).length === 0
          }
          className="btn-primary"
        >
          {busy ? "Creating…" : "Create & open scorer"}
        </button>

        <p className="sub" style={{ marginTop: 14, marginBottom: 0 }}>
          Host: {origin}
        </p>
      </form>
    </div>
  );
}
