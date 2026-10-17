import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { toNumberOrNull, toSlug } from "@/lib/area-api";
import { formatDisplayScore, formatOrDash } from "@/lib/score-format";

const backendBaseUrl = import.meta.env.VITE_BACKEND_API_URL ?? "http://localhost:3001";

export const Route = createFileRoute("/property-analysis")({
  head: () => ({
    meta: [
      { title: "Property Analysis — Swemove" },
      {
        name: "description",
        content: "Price per square metre and area scores for a property you are considering.",
      },
    ],
  }),
  component: PropertyAnalysisPage,
});

type AreaOption = { id: string; name: string; municipality: string };

type Analysis = {
  metrics: {
    pricePerSqm: number;
    priceToIncomeRatio: number | null;
    housingScore: number | null;
  };
  familyScore: number | null;
  dataCoverage: number | null;
};

type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "no-area-data" }
  | { status: "error" }
  | { status: "ready"; analysis: Analysis };

export function PropertyAnalysisPage() {
  const [price, setPrice] = useState("");
  const [sqm, setSqm] = useState("");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<AreaOption[]>([]);
  const [selected, setSelected] = useState<AreaOption | null>(null);
  const [state, setState] = useState<AnalysisState>({ status: "idle" });

  const priceNum = Number(price);
  const sqmNum = Number(sqm);
  const pricePerSqm = priceNum > 0 && sqmNum > 0 ? Math.round(priceNum / sqmNum) : null;

  useEffect(() => {
    if (query.trim().length < 2) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const url = new URL(`${backendBaseUrl}/api/search`);
        url.searchParams.set("q", query.trim());
        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) return;
        const json = (await res.json()) as {
          data?: {
            results?: Array<{
              id?: string;
              deso_id?: string;
              name?: string;
              municipality?: string;
            }>;
          };
        };
        setOptions(
          (json.data?.results ?? [])
            .map((r) => ({
              id: String(r.id ?? r.deso_id ?? ""),
              name: String(r.name ?? ""),
              municipality: String(r.municipality ?? ""),
            }))
            .filter((r) => r.id && r.name),
        );
      } catch {
        setOptions([]);
      }
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!selected || pricePerSqm === null) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    (async () => {
      try {
        const res = await fetch(`${backendBaseUrl}/api/investment/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ price: priceNum, area: sqmNum, deso_id: selected.id }),
          signal: controller.signal,
        });
        if (res.status === 404) {
          setState({ status: "no-area-data" });
          return;
        }
        if (!res.ok) {
          setState({ status: "error" });
          return;
        }
        const json = (await res.json()) as { data?: Record<string, unknown> };
        const metrics = (json.data?.metrics ?? {}) as Record<string, unknown>;
        setState({
          status: "ready",
          analysis: {
            metrics: {
              pricePerSqm: Number(metrics.pricePerSqm),
              priceToIncomeRatio: toNumberOrNull(metrics.priceToIncomeRatio),
              housingScore: toNumberOrNull(metrics.housingScore),
            },
            familyScore: toNumberOrNull(json.data?.familyScore),
            dataCoverage: toNumberOrNull(json.data?.dataCoverage),
          },
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setState({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [selected, priceNum, sqmNum, pricePerSqm]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="mx-auto max-w-7xl px-6 py-12">
        <h1 className="font-display text-4xl">Property analysis</h1>
        <p className="mt-2 text-muted-foreground">
          Price per square metre for a property, next to the stored scores for its area. Market
          benchmarks and commute times need data we do not have yet, so they are not shown.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card p-8">
            <h2 className="font-display text-2xl mb-6">Property details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Area
                </label>
                <input
                  value={selected ? `${selected.name}, ${selected.municipality}` : query}
                  onChange={(e) => {
                    setSelected(null);
                    setQuery(e.target.value);
                  }}
                  placeholder="Search for an area"
                  className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-display text-lg outline-none focus:border-primary"
                />
                {!selected && options.length > 0 && (
                  <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-background">
                    {options.slice(0, 6).map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(o)}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-secondary"
                        >
                          {o.name}, {o.municipality}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Price (SEK)
                </label>
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-display text-lg outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Living area (sqm)
                </label>
                <input
                  type="number"
                  min={0}
                  value={sqm}
                  onChange={(e) => setSqm(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-display text-lg outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-8">
            <h2 className="font-display text-2xl mb-6">Results</h2>
            <div className="grid gap-4 grid-cols-2">
              <MetricCard
                label="Price per sqm"
                value={formatOrDash(pricePerSqm, (n) => `${n.toLocaleString()} SEK`)}
              />
              <MetricCard
                label="Price / median income"
                value={
                  state.status === "ready"
                    ? formatOrDash(state.analysis.metrics.priceToIncomeRatio, (n) => `${n}×`)
                    : "-"
                }
              />
              <MetricCard
                label="Housing stock score"
                value={
                  state.status === "ready"
                    ? `${formatDisplayScore(state.analysis.metrics.housingScore)}/100`
                    : "-"
                }
              />
              <MetricCard
                label="Schools score"
                value={
                  state.status === "ready"
                    ? `${formatDisplayScore(state.analysis.familyScore)}/100`
                    : "-"
                }
              />
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              {state.status === "idle" && "Choose an area and enter a price and size."}
              {state.status === "loading" && "Loading area scores…"}
              {state.status === "no-area-data" && "There are no stored scores for this area yet."}
              {state.status === "error" && "The data service is not responding."}
              {state.status === "ready" &&
                `Area data coverage: ${formatOrDash(state.analysis.dataCoverage, (n) => `${Math.round(n * 100)}%`)}. A “-” means we have no data for it.`}
            </p>
          </div>
        </div>

        {selected && (
          <div className="mt-10 text-center">
            <Link
              to="/areas/$slug"
              params={{ slug: toSlug(selected.name) }}
              className="inline-flex rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
            >
              View full neighborhood report →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 inline-flex rounded-full bg-secondary px-3 py-1 text-sm font-medium text-primary">
        {value}
      </div>
    </div>
  );
}
