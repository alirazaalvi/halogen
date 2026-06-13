import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { CircularScore } from "@/components/CircularScore";
import { areas, getArea } from "@/data/areas";

export const Route = createFileRoute("/property-analysis")({
  head: () => ({
    meta: [
      { title: "Property Investment Analysis — FamilyMove Sweden" },
      { name: "description", content: "Analyze Swedish property prices with AI-powered investment insights." },
    ],
  }),
  component: PropertyAnalysisPage,
});

type PropertyInput = {
  price: number;
  area: number;
  fee: number;
};

export function PropertyAnalysisPage() {
  const [input, setInput] = useState<PropertyInput>({ price: 3700000, area: 96, fee: 6000 });
  const [selectedArea, setSelectedArea] = useState(areas[0].slug);
  const area = getArea(selectedArea) ?? areas[0];

  const { pricePerSqm, avgPrice, marketPosition, affordability, riskScore } = calculateMetrics(input, area);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="mx-auto max-w-7xl px-6 py-12">
        <h1 className="font-display text-4xl">House Investment Analysis</h1>
        <p className="mt-2 text-muted-foreground">
          Get AI-powered insights on property value, market trends, and investment potential.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {/* Input Form */}
          <div className="rounded-3xl border border-border bg-card p-8">
            <h2 className="font-display text-2xl mb-6">Property Details</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Area</label>
                <select
                  value={selectedArea}
                  onChange={(e) => setSelectedArea(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-display text-lg outline-none focus:border-primary"
                >
                  {areas.map((a) => (
                    <option key={a.slug} value={a.slug}>
                      {a.name}, {a.region}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Price (SEK)</label>
                <input
                  type="number"
                  value={input.price}
                  onChange={(e) => setInput({ ...input, price: parseInt(e.target.value) || 0 })}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-display text-lg outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Living Area (sqm)
                </label>
                <input
                  type="number"
                  value={input.area}
                  onChange={(e) => setInput({ ...input, area: parseInt(e.target.value) || 0 })}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-display text-lg outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Monthly Fee (SEK)
                </label>
                <input
                  type="number"
                  value={input.fee}
                  onChange={(e) => setInput({ ...input, fee: parseInt(e.target.value) || 0 })}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-display text-lg outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Investment Metrics */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-8">
              <h2 className="font-display text-2xl mb-6">Investment Metrics</h2>

              <div className="grid gap-4 grid-cols-2">
                <MetricCard label="Price per sqm" value={`${pricePerSqm.toLocaleString()} SEK`} />
                <MetricCard label="Avg area price" value={`${avgPrice.toLocaleString()} SEK`} />
                <MetricCard
                  label="Market position"
                  value={marketPosition}
                  tone={
                    marketPosition === "Above average"
                      ? "sky"
                      : marketPosition === "Below average"
                        ? "leaf"
                        : "primary"
                  }
                />
                <MetricCard label="Affordability" value={affordability} />
                <MetricCard label="Risk score" value={`${riskScore}/100`} />
                <MetricCard label="Housing score" value={`${area.scores.housing}/100`} />
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-8">
              <h2 className="font-display text-2xl mb-6">Commute to Stockholm</h2>
              <div className="space-y-3">
                <CommuteRow label="🚆 Train" minutes={area.commute.transit} />
                <CommuteRow label="🚗 Car" minutes={area.commute.car} />
                <CommuteRow label="🚲 Bike" minutes={area.commute.bike} />
              </div>
              <div className="mt-6">
                <CircularScore value={calculateCommuteScore(area.commute.transit)} label="Commute Score" />
              </div>
            </div>
          </div>
        </div>

        {/* Family Score Section */}
        <section className="mt-16 rounded-3xl border border-border bg-card p-8">
          <h2 className="font-display text-2xl mb-6">Family Score</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <FamilyMetric label="Schools" score={area.scores.schools} />
              <FamilyMetric label="Playgrounds" score={Math.min(100, area.amenities.find((a) => a.label === "Playgrounds")?.count * 3 || 80)} />
              <FamilyMetric label="Healthcare" score={Math.min(100, area.amenities.find((a) => a.label === "Healthcare")?.count * 15 || 90)} />
              <FamilyMetric label="Parks" score={area.scores.green} />
              <FamilyMetric label="Sports facilities" score={Math.min(100, area.amenities.find((a) => a.label === "Football Clubs")?.count * 14 || 75)} />
            </div>
            <div className="flex items-center justify-center">
              <CircularScore value={area.scores.schools} label="Family Score" size={200} />
            </div>
          </div>
        </section>

        <div className="mt-10 text-center">
          <Link
            to="/areas/$slug"
            params={{ slug: area.slug }}
            className="inline-flex rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
          >
            View full neighborhood report →
          </Link>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: "primary" | "leaf" | "sky" }) {
  const bgClass =
    tone === "leaf"
      ? "bg-leaf/15 text-leaf-foreground"
      : tone === "sky"
        ? "bg-sky-10 text-sky-foreground"
        : "bg-secondary text-primary";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-medium ${bgClass}`}>{value}</div>
    </div>
  );
}

function CommuteRow({ label, minutes }: { label: string; minutes: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <span className="font-display text-lg">{minutes} min</span>
    </div>
  );
}

function FamilyMetric({ label, score }: { label: string; score: number }) {
  const color = score >= 85 ? "var(--color-leaf)" : score >= 70 ? "var(--color-sky)" : "var(--color-primary)";
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <span className="font-display text-lg">{score}/100</span>
    </div>
  );
}

function calculateMetrics(input: PropertyInput, area: typeof areas[0]) {
  const pricePerSqm = input.price / input.area;
  const avgPrice = area.monthlyEstimate * 12 * 20; // estimated avg price proxy
  const diff = ((pricePerSqm - avgPrice / 50) / (avgPrice / 50)) * 100;
  const marketPosition = diff > 5 ? "Above average" : diff < -5 ? "Below average" : "Average";
  const affordability = (input.price / area.demographics.medianIncome < 7 ? "Affordable" : "Premium").replace(
    /(.)/,
    (c) => c.toUpperCase(),
  );
  const riskScore = area.scores.growth >= 85 ? 25 : area.scores.growth >= 70 ? 45 : 65;

  return { pricePerSqm, avgPrice, marketPosition, affordability, riskScore };
}

function calculateCommuteScore(transitMinutes: number): number {
  if (transitMinutes <= 15) return Math.round(100 - transitMinutes * 2);
  if (transitMinutes <= 30) return Math.round(85 - (transitMinutes - 15) * 2);
  return Math.round(60 - (transitMinutes - 30) * 1.5);
}