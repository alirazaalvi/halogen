import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { areas, scoreLabels, type ScoreKey } from "@/data/areas";
import { CircularScore } from "@/components/CircularScore";
import { ScoreBar } from "@/components/ScoreBar";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare neighborhoods — FamilyMove Sweden" },
      { name: "description", content: "Compare Swedish neighborhoods side by side across schools, commute, parks and family scores." },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const [a, setA] = useState(areas[0].slug);
  const [b, setB] = useState(areas[1].slug);
  const A = areas.find((x) => x.slug === a)!;
  const B = areas.find((x) => x.slug === b)!;

  const scoreKeys = Object.keys(scoreLabels) as ScoreKey[];

  const rows: { label: string; a: number | string; b: number | string; winner: "a" | "b" | "tie" }[] = [
    ...scoreKeys.map((k) => ({
      label: scoreLabels[k].label,
      a: A.scores[k],
      b: B.scores[k],
      winner: (A.scores[k] === B.scores[k] ? "tie" : A.scores[k] > B.scores[k] ? "a" : "b") as "a" | "b" | "tie",
    })),
    {
      label: "Median income",
      a: `${(A.demographics.medianIncome / 1000).toFixed(0)}k`,
      b: `${(B.demographics.medianIncome / 1000).toFixed(0)}k`,
      winner: A.demographics.medianIncome > B.demographics.medianIncome ? "a" : "b",
    },
    {
      label: "Population growth",
      a: `${A.demographics.growth}%`,
      b: `${B.demographics.growth}%`,
      winner: A.demographics.growth > B.demographics.growth ? "a" : "b",
    },
    {
      label: "Monthly living est.",
      a: `${A.monthlyEstimate.toLocaleString()} SEK`,
      b: `${B.monthlyEstimate.toLocaleString()} SEK`,
      winner: A.monthlyEstimate < B.monthlyEstimate ? "a" : "b",
    },
  ];

  function Picker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-4 py-3 font-display text-2xl outline-none focus:border-primary"
      >
        {areas.map((x) => (
          <option key={x.slug} value={x.slug}>{x.name}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="font-display text-4xl md:text-5xl">Compare neighborhoods</h1>
        <p className="mt-2 text-muted-foreground">Pick any two areas. Winners are highlighted per row.</p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {[{ side: "a" as const, x: A, set: setA, val: a }, { side: "b" as const, x: B, set: setB, val: b }].map(({ side, x, set, val }) => (
            <div key={side} className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{side === "a" ? "Area A" : "Area B"}</div>
              <div className="mt-2"><Picker value={val} onChange={set} /></div>
              <div className="mt-6 flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">{x.region}</div>
                  <div className="mt-1 max-w-xs text-sm">{x.tagline}</div>
                </div>
                <CircularScore value={x.overall} size={130} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 overflow-hidden rounded-3xl border border-border bg-card">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] border-b border-border bg-secondary/40 px-6 py-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <span>Category</span>
            <span className="text-center">{A.name}</span>
            <span className="text-center">{B.name}</span>
          </div>
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[1.4fr_1fr_1fr] items-center border-b border-border/60 px-6 py-4 last:border-0">
              <span className="text-sm text-muted-foreground">{r.label}</span>
              <Cell value={r.a} win={r.winner === "a"} />
              <Cell value={r.b} win={r.winner === "b"} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Cell({ value, win }: { value: number | string; win: boolean }) {
  const isNum = typeof value === "number";
  return (
    <div className="text-center">
      <div className={`mx-auto inline-flex min-w-[64px] items-center justify-center rounded-full px-3 py-1 font-display text-xl ${win ? "bg-leaf/20 text-leaf-foreground" : "text-foreground/80"}`}>
        {value}{isNum ? "" : ""}
      </div>
      {isNum && (
        <div className="mx-auto mt-2 w-24">
          <ScoreBar value={value as number} tone={win ? "leaf" : "primary"} />
        </div>
      )}
    </div>
  );
}
