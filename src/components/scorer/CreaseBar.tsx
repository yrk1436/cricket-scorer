"use client";

type Props = {
  strikerName: string;
  nonStrikerName: string;
  strikerRuns?: number;
  strikerBalls?: number;
  nonStrikerRuns?: number;
  nonStrikerBalls?: number;
  bowlerName: string;
  ballsInOver: number;
  disabled?: boolean;
  onSwap: () => void;
};

function miniStat(runs: number, balls: number): string | null {
  if (balls <= 0 && runs <= 0) return null;
  return `${runs} (${balls})`;
}

export default function CreaseBar({
  strikerName,
  nonStrikerName,
  strikerRuns = 0,
  strikerBalls = 0,
  nonStrikerRuns = 0,
  nonStrikerBalls = 0,
  bowlerName,
  ballsInOver,
  disabled,
  onSwap,
}: Props) {
  const strikerMini = miniStat(strikerRuns, strikerBalls);
  const nonStrikerMini = miniStat(nonStrikerRuns, nonStrikerBalls);

  return (
    <section>
      <div className="crease-bar">
        <div className="crease-pill striker">
          <p className="label">Striker</p>
          <p className="name">{strikerName}</p>
          {strikerMini && <p className="runs-mini">{strikerMini}</p>}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onSwap}
          title="Swap strike"
          aria-label="Swap strike"
          className="crease-swap"
        >
          ⇄
        </button>
        <div className="crease-pill">
          <p className="label">Non-striker</p>
          <p className="name">{nonStrikerName}</p>
          {nonStrikerMini && <p className="runs-mini">{nonStrikerMini}</p>}
        </div>
      </div>
      <div className="bowler-line">
        <span>
          Bowler: <b>{bowlerName}</b>
        </span>
        <span style={{ fontFamily: "var(--mono)" }}>
          Over ball {ballsInOver || "—"}
        </span>
      </div>
    </section>
  );
}
