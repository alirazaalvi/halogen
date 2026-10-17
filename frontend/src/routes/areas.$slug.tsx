import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { CircularScore } from "@/components/CircularScore";
import { ScoreBar } from "@/components/ScoreBar";
import { AreaMap } from "@/components/AreaMap";
import { scoreLabels, type Area, type ScoreKey, type SourceLink } from "@/data/areas";
import { normalizeAreaDetails, slugQueryVariants, titleFromSlug, toSlug } from "@/lib/area-api";
import { formatDisplayScore, formatOrDash } from "@/lib/score-format";

const backendBaseUrl = import.meta.env.VITE_BACKEND_API_URL ?? "http://localhost:3001";

type SearchResult = { id?: string; deso_id?: string; name?: string; municipality?: string };

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | { status: "ready"; area: Area };

function futureProjectSummary(project: Area["future"][number]): string {
  const detail =
    project.type === "School"
      ? "A school-related change that may affect local families and catchment areas."
      : project.type === "Transport"
        ? "A transport upgrade that may change travel times and access in the area."
        : project.type === "Housing"
          ? "New housing or densification that may bring more residents and services."
          : project.type === "Park"
            ? "A public-space improvement that may add green space and recreation value."
            : "A road project that may affect traffic flow, parking, and access.";

  return `${detail} Expected ${project.year}.`;
}

function SourceLinksRow({ links }: { links?: SourceLink[] }) {
  if (!links || links.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Sources:</span>
      {links.map((link) => (
        <a
          key={`${link.label}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

function NoData({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export const Route = createFileRoute("/areas/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${titleFromSlug(params.slug)} neighborhood report — Swemove` },
      { name: "description", content: "Neighborhood report built from public data." },
    ],
  }),
  component: AreaPage,
});

async function resolveArea(slug: string, signal: AbortSignal): Promise<SearchResult | null> {
  for (const q of slugQueryVariants(slug)) {
    const url = new URL(`${backendBaseUrl}/api/search`);
    url.searchParams.set("q", q);
    const res = await fetch(url.toString(), { signal });
    if (!res.ok) continue;

    const json = (await res.json()) as { data?: { results?: SearchResult[] } };
    const results = json.data?.results ?? [];
    if (results.length === 0) continue;

    return results.find((r) => (r.name ? toSlug(r.name) === slug : false)) ?? results[0];
  }
  return null;
}

function AreaPage() {
  const { slug } = Route.useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    async function load() {
      try {
        const match = await resolveArea(slug, controller.signal);
        const areaId = match?.id ?? match?.deso_id;
        if (!areaId) {
          setState({ status: "not-found" });
          return;
        }

        const res = await fetch(
          `${backendBaseUrl}/api/neighborhood/${encodeURIComponent(areaId)}`,
          {
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          setState({ status: res.status === 404 ? "not-found" : "error" });
          return;
        }

        const json = (await res.json()) as { data?: unknown };
        const area = normalizeAreaDetails(json.data, slug);
        setState(area ? { status: "ready", area } : { status: "not-found" });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setState({ status: "error" });
        }
      }
    }

    load();
    return () => controller.abort();
  }, [slug]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      {state.status === "loading" && (
        <div className="mx-auto max-w-7xl px-6 py-24 text-muted-foreground">Loading area…</div>
      )}
      {state.status === "not-found" && (
        <div className="mx-auto max-w-7xl px-6 py-24">
          <h1 className="font-display text-4xl">Area not found</h1>
          <p className="mt-3 text-muted-foreground">
            We have no data for “{titleFromSlug(slug)}”.{" "}
            <Link to="/" className="underline">
              Back to search
            </Link>
          </p>
        </div>
      )}
      {state.status === "error" && (
        <div className="mx-auto max-w-7xl px-6 py-24">
          <h1 className="font-display text-4xl">Could not load this area</h1>
          <p className="mt-3 text-muted-foreground">The data service is not responding.</p>
        </div>
      )}
      {state.status === "ready" && <AreaReport area={state.area} />}
    </div>
  );
}

function AreaReport({ area }: { area: Area }) {
  const scoreKeys = Object.keys(scoreLabels) as ScoreKey[];
  const scoredCount = scoreKeys.filter((k) => area.scores[k] !== null).length;
  const performances = area.schools
    .map((s) => s.performance)
    .filter((p): p is number => p !== null);
  const demo = area.demographics;

  return (
    <>
      {/* Header */}
      <section className="border-b border-border bg-secondary/30">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground">
              Home
            </Link>
            <span>/</span>
            <span>{area.region}</span>
            <span>/</span>
            <span className="text-foreground">{area.name}</span>
          </div>

          <div className="mt-6 grid gap-10 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h1 className="font-display text-5xl md:text-6xl tracking-tight">
                {area.name}
                <span className="text-muted-foreground">, {area.region}</span>
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
                {area.overall === null
                  ? "There is not enough data yet to give this area an overall score."
                  : `Score built from ${scoredCount} of ${scoreKeys.length} data areas.`}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  to="/compare"
                  className="rounded-full border border-border bg-card px-4 py-2 text-sm hover:border-primary"
                >
                  Compare with another area
                </Link>
                <Link
                  to="/assistant"
                  className="rounded-full bg-foreground px-4 py-2 text-sm text-background"
                >
                  Ask the assistant
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <CircularScore value={area.overall} />
              <div className="mt-2 text-center text-xs text-muted-foreground">
                Data coverage: {formatOrDash(area.coverage, (n) => `${Math.round(n * 100)}%`)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Score grid */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="font-display text-3xl">Score Breakdown</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {scoreKeys.map((k) => (
            <div
              key={k}
              className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{scoreLabels[k].icon}</span>
                <span className="font-display text-2xl">{formatDisplayScore(area.scores[k])}</span>
              </div>
              <div className="mt-3 text-sm font-medium">{scoreLabels[k].label}</div>
              <div className="mt-3">
                <ScoreBar
                  value={area.scores[k]}
                  tone={(area.scores[k] ?? 0) >= 90 ? "leaf" : "primary"}
                />
              </div>
              {area.scores[k] === null && (
                <div className="mt-2 text-xs text-muted-foreground">No data yet</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Schools */}
      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-3xl">Schools</h2>
          <div className="text-sm text-muted-foreground">
            Avg score{" "}
            <span className="font-medium text-foreground">
              {performances.length > 0
                ? Math.round(performances.reduce((s, p) => s + p, 0) / performances.length)
                : "-"}
            </span>{" "}
            · {area.schools.length} nearby
          </div>
        </div>
        {area.schools.length === 0 ? (
          <div className="mt-6">
            <NoData>No schools are recorded for this area yet.</NoData>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            {area.coords && (
              <AreaMap
                center={area.coords}
                markers={area.schools
                  .filter((s) => s.lat !== null && s.lng !== null)
                  .map((s) => ({
                    position: [s.lat as number, s.lng as number] as [number, number],
                    label: s.name,
                  }))}
              />
            )}
            <div className="grid gap-3">
              {area.schools.map((s) => (
                <div
                  key={`${s.name}-${s.address}`}
                  className="rounded-2xl border border-border bg-card p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      {s.address && (
                        <div className="mt-1 text-sm text-muted-foreground">{s.address}</div>
                      )}
                      <div className="mt-1 text-sm text-muted-foreground">
                        {s.distance}
                        {s.walkMin !== null && ` · ${s.walkMin} min walk`}
                        {s.students !== null && ` · ${s.students} students`}
                      </div>
                      <SourceLinksRow links={s.sourceLinks} />
                      {s.inspection && (
                        <div className="mt-2 inline-flex rounded-full bg-accent px-2.5 py-0.5 text-xs text-accent-foreground">
                          {s.inspection}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-display text-3xl">
                        {formatDisplayScore(s.performance)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.performance === null ? "no results data" : "/100"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Location & commute */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="font-display text-3xl">Location</h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <NoData>Commute times are not available yet.</NoData>
          {area.coords ? (
            <AreaMap center={area.coords} height={420} />
          ) : (
            <NoData>No map position.</NoData>
          )}
        </div>
      </section>

      {/* Amenities */}
      <section className="mx-auto max-w-7xl px-6 py-8">
        <h2 className="font-display text-3xl">Nearby</h2>
        <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-4">
          {area.amenities.map((a) => (
            <div key={a.label} className="rounded-2xl border border-border bg-card p-5">
              <div className="text-3xl">{a.icon}</div>
              <div className="mt-3 font-medium">{a.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {a.count} nearby · {a.nearest}
              </div>
              <SourceLinksRow links={a.sourceLinks} />
            </div>
          ))}
        </div>
      </section>

      {/* Demographics */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="font-display text-3xl">Demographics</h2>
        {demo === null ? (
          <div className="mt-6">
            <NoData>No demographic data is available for this area yet.</NoData>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {[
                {
                  label: demo.year ? `Population (${demo.year})` : "Population",
                  v: formatOrDash(demo.population, (n) => n.toLocaleString()),
                },
                {
                  label: "Growth /yr",
                  v: formatOrDash(demo.growth, (n) => `${Math.round(n * 10) / 10}%`),
                },
                {
                  label: "Median income",
                  v: formatOrDash(demo.medianIncome, (n) => `${Math.round(n / 1000)}k SEK`),
                },
                {
                  label: "Families w/ kids",
                  v: formatOrDash(demo.familiesPct, (n) => `${Math.round(n)}%`),
                },
                {
                  label: "Higher education",
                  v: formatOrDash(demo.higherEduPct, (n) => `${Math.round(n)}%`),
                },
                {
                  label: "Foreign born",
                  v: formatOrDash(demo.foreignBornPct, (n) => `${Math.round(n)}%`),
                },
              ].map((d) => (
                <div key={d.label} className="rounded-2xl border border-border bg-card p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {d.label}
                  </div>
                  <div className="mt-2 font-display text-2xl">{d.v}</div>
                </div>
              ))}
            </div>
            <SourceLinksRow links={demo.sourceLinks} />
          </>
        )}
      </section>

      {/* Future */}
      <section className="mx-auto max-w-7xl px-6 py-8 pb-24">
        <h2 className="font-display text-3xl">Future development</h2>
        {area.future.length === 0 ? (
          <div className="mt-6">
            <NoData>No planned projects are recorded for this area.</NoData>
          </div>
        ) : (
          <div className="mt-8 relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border md:left-1/2" />
            <div className="space-y-6">
              {area.future.map((f, i) => (
                <div
                  key={`${f.title}-${i}`}
                  className="relative grid gap-4 md:grid-cols-2 md:gap-12"
                >
                  <div className={i % 2 === 0 ? "md:text-right md:pr-12" : "md:order-2 md:pl-12"}>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {f.type}
                    </div>
                    <div className="font-display text-xl">{f.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {futureProjectSummary(f)}
                    </div>
                    <SourceLinksRow links={f.sourceLinks} />
                  </div>
                  <div className={i % 2 === 0 ? "md:pl-12" : "md:order-1 md:text-right md:pr-12"}>
                    <span className="inline-flex items-center rounded-full bg-leaf/15 px-3 py-1 text-sm text-leaf-foreground">
                      Expected {f.year}
                    </span>
                  </div>
                  <span className="absolute left-2.5 top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-background md:left-[calc(50%-6px)]" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card p-8">
            <h3 className="font-display text-2xl mb-4">Growth outlook</h3>
            {area.growthPrediction ? (
              <>
                <div className="font-display text-5xl">{area.growthPrediction.level}</div>
                <p className="mt-4 text-sm text-muted-foreground">
                  {area.growthPrediction.rationale}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not enough data for a growth outlook.</p>
            )}
          </div>

          <div className="rounded-3xl border border-border bg-card p-8">
            <h3 className="font-display text-2xl mb-4">Safety & Crime</h3>
            {area.crimeStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Area-level crime statistics are not available yet.
              </p>
            ) : (
              <div className="space-y-3">
                {area.crimeStats.map((c) => (
                  <div key={c.year} className="flex items-center justify-between text-sm">
                    <span>{c.year}</span>
                    <span>{formatOrDash(c.incidents)} incidents</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 text-xs text-muted-foreground">
              Safety score:{" "}
              {area.scores.safety === null
                ? "no data"
                : `${formatDisplayScore(area.scores.safety)}/100`}
            </div>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/property-analysis"
            className="inline-flex rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
          >
            Analyze property investment →
          </Link>
        </div>
      </section>
    </>
  );
}
