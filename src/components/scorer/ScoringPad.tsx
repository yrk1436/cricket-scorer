"use client";

import type { DeliveryInput } from "@/lib/match-service";

type Props = {
  disabled?: boolean;
  onRun: (runs: number) => void;
  onExtras: () => void;
  onWicket: () => void;
};

const RUNS = [
  { n: 1, cls: "" },
  { n: 2, cls: "" },
  { n: 3, cls: "" },
  { n: 4, cls: "" },
  { n: 6, cls: "six" },
  { n: 0, cls: "zero" },
] as const;

export default function ScoringPad({
  disabled,
  onRun,
  onExtras,
  onWicket,
}: Props) {
  return (
    <section className="pad-card glass no-print">
      <h2>Record ball</h2>
      <div className="run-grid">
        {RUNS.map(({ n, cls }) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            className={`run-btn ${cls}`.trim()}
            onClick={() => onRun(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="action-row">
        <button
          type="button"
          disabled={disabled}
          className="chip-btn extras"
          onClick={onExtras}
        >
          Extras…
        </button>
        <button
          type="button"
          disabled={disabled}
          className="chip-btn wicket"
          onClick={onWicket}
        >
          Wicket…
        </button>
      </div>
    </section>
  );
}