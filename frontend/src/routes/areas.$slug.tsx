import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { CircularScore } from "@/components/CircularScore";
import { ScoreBar } from "@/components/ScoreBar";
import { AreaMap } from "@/components/AreaMap";
import { getArea, scoreLabels, type ScoreKey, type Area } from "@/data/areas";

export const Route = createFileRoute("/areas/$slug")({
  head: ({ params }) => {
    const area = getArea(params.slug);
    return {
      meta: [
        { title: area ? `${area.name} family report — FamilyMove Sweden` : "Area — FamilyMove" },
        { name: "description", content: area?.summary ?? "Family neighborhood report" },
        { property: "og:title", content: area ? `${area.name} — ${area.overall}/100 family score` : "FamilyMove" },
        { property: "og:description", content: area?.tagline ?? "" },
      ],
    };
  },
  loader: ({ params }) => {
    const area = getArea(params.slug);
    if (!area) throw notFound();
    return { area };
  },
  component: AreaPage,
  notFoundComponent: () => (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-display text-4xl">Area not found</h1>
        <p className="mt-3 text-muted-foreground">Try one of our featured neighborhoods.</p>
        <Link to="/" className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground">Back home</Link>
      </div>
    </div>
  ),
});

function AreaPage() {
  const { area } = Route.useLoaderData() as { area: Area };
  const [workplace, setWorkplace] = useState(area.commute.target);

  const scoreKeys = Object.keys(scoreLabels) as ScoreKey[];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Header */}
      <section className="border-b border-border bg-secondary/30">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <span>/</span>
            <span>{area.region}</span>
            <span>/</span>
            <span className="text-foreground">{area.name}</span>
          </div>

          <div className="mt-6 grid gap-10 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h1 className="font-display text-5xl md:text-6xl tracking-tight">
                {area.name}<span className="text-muted-foreground">, {area.region}</span>
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{area.summary}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link to="/compare" search={{ a: area.slug, b: area.slug === "kista" ? "sollentuna" : "kista" } as never} className="rounded-full border border-border bg-card px-4 py-2 text-sm hover:border-primary">
                  Compare with another area
                </Link>
                <Link to="/assistant" className="rounded-full bg-foreground px-4 py-2 text-sm text-background">Ask the assistant</Link>
              </div>
            </div>
            <div className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <CircularScore value={area.overall} />
            </div>
          </div>
        </div>
      </section>

      {/* Score grid */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="font-display text-3xl">Family Score Breakdown</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {scoreKeys.map((k) => (
            <div key={k} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{scoreLabels[k].icon}</span>
                <span className="font-display text-2xl">{area.scores[k]}</span>
              </div>
              <div className="mt-3 text-sm font-medium">{scoreLabels[k].label}</div>
              <div className="mt-3">
                <ScoreBar value={area.scores[k]} tone={area.scores[k] >= 90 ? "leaf" : "primary"} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Schools */}
      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-3xl">Schools</h2>
          <div className="text-sm text-muted-foreground">
            Avg score <span className="font-medium text-foreground">{Math.round(area.schools.reduce((s, sc) => s + sc.performance, 0) / area.schools.length)}</span> · {area.schools.length} nearby
          </div>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <AreaMap
            center={area.coords}
            markers={area.schools.map((s, i) => ({
              position: [area.coords[0] + (i - 1) * 0.004, area.coords[1] + (i - 1) * 0.006] as [number, number],
              label: s.name,
            }))}
          />
          <div className="grid gap-3">
            {area.schools.map((s) => (
              <div key={s.name} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{s.distance} · {s.walkMin} min walk · {s.students} students</div>
                    <div className="mt-2 inline-flex rounded-full bg-accent px-2.5 py-0.5 text-xs text-accent-foreground">{s.inspection}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-3xl">{s.performance}</div>
                    <div className="text-xs text-muted-foreground">/100</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Commute */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="font-display text-3xl">Commute</h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-3xl border border-border bg-card p-6">
            <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Workplace</label>
            <input
              value={workplace}
              onChange={(e) => setWorkplace(e.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
            />
            <div className="mt-6 space-y-4">
              {[
                { label: "🚗 Car", v: area.commute.car },
                { label: "🚆 Public transport", v: area.commute.transit },
                { label: "🚲 Bike", v: area.commute.bike },
                { label: "🚶 Walking", v: area.commute.walk },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{row.label}</span>
                    <span className="font-medium">{row.v} min</span>
                  </div>
                  <ScoreBar value={Math.max(5, 100 - row.v * 1.5)} tone="sky" />
                </div>
              ))}
            </div>
          </div>
          <AreaMap center={area.coords} height={420} />
        </div>
      </section>

      {/* Amenities */}
      <section className="mx-auto max-w-7xl px-6 py-8">
        <h2 className="font-display text-3xl">Family amenities</h2>
        <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-4">
          {area.amenities.map((a) => (
            <div key={a.label} className="rounded-2xl border border-border bg-card p-5">
              <div className="text-3xl">{a.icon}</div>
              <div className="mt-3 font-medium">{a.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{a.count} nearby · {a.nearest}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Demographics */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="font-display text-3xl">Demographics</h2>
        <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Population", v: area.demographics.population.toLocaleString() },
            { label: "Growth /yr", v: `${area.demographics.growth}%` },
            { label: "Median income", v: `${(area.demographics.medianIncome / 1000).toFixed(0)}k SEK` },
            { label: "Avg age", v: `${area.demographics.avgAge}` },
            { label: "Families w/ kids", v: `${area.demographics.familiesPct}%` },
            { label: "Ownership", v: `${area.demographics.ownershipPct}%` },
          ].map((d) => (
            <div key={d.label} className="rounded-2xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{d.label}</div>
              <div className="mt-2 font-display text-2xl">{d.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Future */}
      <section className="mx-auto max-w-7xl px-6 py-8 pb-24">
        <h2 className="font-display text-3xl">Future development</h2>
        <div className="mt-8 relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border md:left-1/2" />
          <div className="space-y-6">
            {area.future.map((f, i) => (
              <div key={i} className="relative grid gap-4 md:grid-cols-2 md:gap-12">
                <div className={i % 2 === 0 ? "md:text-right md:pr-12" : "md:order-2 md:pl-12"}>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{f.type}</div>
                  <div className="font-display text-xl">{f.title}</div>
                </div>
                <div className={i % 2 === 0 ? "md:pl-12" : "md:order-1 md:text-right md:pr-12"}>
                  <span className="inline-flex items-center rounded-full bg-leaf/15 px-3 py-1 text-sm text-leaf-foreground">Expected {f.year}</span>
                  {f.confidence && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs">Confidence: {f.confidence}%</span>
                  )}
                </div>
                <span className="absolute left-2.5 top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-background md:left-[calc(50%-6px)]" />
              </div>
            ))}
          </div>
        </div>

        {/* Growth Prediction Summary */}
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card p-8">
            <h3 className="font-display text-2xl mb-4">5-Year Growth Prediction</h3>
            <div className="flex items-baseline gap-4">
              <div className="font-display text-5xl">
                {area.scores.growth >= 85 ? "High" : area.scores.growth >= 70 ? "Medium" : "Low"}
              </div>
              <div className="text-sm text-muted-foreground">Confidence: {Math.round(area.scores.growth)}%</div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Based on building permits, population growth, infrastructure investments, and planned developments.
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-card p-8">
            <h3 className="font-display text-2xl mb-4">Safety & Crime</h3>
            {area.crimeStats && (
              <div className="space-y-3">
                {area.crimeStats.map((c) => (
                  <div key={c.year} className="flex items-center justify-between text-sm">
                    <span>{c.year}</span>
                    <span className="flex items-center gap-2">
                      <span>{c.incidents} incidents</span>
                      <span className={c.trend === "down" ? "text-leaf-foreground" : c.trend === "up" ? "text-primary" : "text-muted-foreground"}>
                        {c.trend === "down" ? "↓" : c.trend === "up" ? "↑" : "→"}
                      </span>
                    </span>
                  </div>
                ))}
                <div className="mt-3 text-xs text-muted-foreground">
                  Safety score: {area.safety}/100 ({area.safety >= 80 ? "Low crime" : area.safety >= 70 ? "Moderate" : "Above average"})
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/property-analysis"
            search={{ area: area.slug }}
            className="inline-flex rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
          >
            Analyze property investment →
          </Link>
        </div>
      </section>
    </div>
  );
}