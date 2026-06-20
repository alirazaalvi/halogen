import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { CircularScore } from "@/components/CircularScore";
import { ScoreBar } from "@/components/ScoreBar";
import { AreaMap } from "@/components/AreaMap";
import { getArea, scoreLabels, type ScoreKey, type Area, type SourceLink } from "@/data/areas";

const backendBaseUrl = import.meta.env.VITE_BACKEND_API_URL ?? "http://localhost:3001";

type SearchResponse = {
  success: boolean;
  data?: {
    results?: Array<{ id?: string; deso_id?: string; name?: string; municipality?: string }>;
  };
};

type ScoreResponse = {
  success: boolean;
  data?: {
    score?: number | string | null;
    transport?: number | string | null;
    schools?: number | string | null;
    safety?: number | string | null;
    housing?: number | string | null;
    green?: number | string | null;
    growth?: number | string | null;
  };
};

type AreaDetailsResponse = {
  success: boolean;
  data?: {
    area?: {
      id?: string;
      name?: string;
      municipality?: string;
      population?: number | null;
      coordinates?: {
        lat?: number | null;
        lng?: number | null;
      };
    };
    scores?: {
      overall?: number | string | null;
      demographics?: number | string | null;
      housing?: number | string | null;
      transport?: number | string | null;
      schools?: number | string | null;
      safety?: number | string | null;
      green?: number | string | null;
      growth?: number | string | null;
    };
    details?: {
        schools?: Array<{
          name?: string;
          address?: string;
          distance?: string;
          walkMin?: number;
          students?: number;
          performance?: number;
          lat?: number | null;
          lng?: number | null;
          inspection?: "Approved" | "Excellent" | "Needs review";
          sourceLinks?: SourceLink[];
        }>;
      commute?: {
        target?: string;
        car?: number;
        transit?: number;
        bike?: number;
        walk?: number;
      };
      amenities?: Array<{
        label?: string;
        icon?: string;
        count?: number;
        nearest?: string;
        sourceLinks?: SourceLink[];
      }>;
      demographics?: {
        population?: number;
        growth?: number;
        medianIncome?: number;
        avgAge?: number;
        familiesPct?: number;
        higherEduPct?: number;
        ownershipPct?: number;
        sourceLinks?: SourceLink[];
      };
      future?: Array<{
        year?: number;
        title?: string;
        type?: "School" | "Transport" | "Housing" | "Park" | "Road";
        confidence?: number;
        sourceLinks?: SourceLink[];
      }>;
      safety?: number;
      crimeStats?: Array<{ year?: number; incidents?: number; trend?: "up" | "down" | "stable" }>;
      growthPrediction?: {
        level?: "High" | "Medium" | "Low";
        confidence?: number;
        rationale?: string;
      };
    };
  };
};

type GrowthPredictionState = {
  level: "High" | "Medium" | "Low";
  confidence: number;
  rationale: string;
};

function toFiniteNumber(input: unknown): number | undefined {
  const n = Number(input);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeSourceLinks(input: unknown): SourceLink[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const links: SourceLink[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const raw = item as { label?: unknown; url?: unknown };
    const label = String(raw.label ?? "").trim();
    const url = String(raw.url ?? "").trim();
    if (!label || !url) {
      continue;
    }

    const key = `${label.toLowerCase()}|${url.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    links.push({ label, url });
  }

  return links;
}

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function slugQueryVariants(slug: string): string[] {
  const base = slug.replace(/-/g, " ");
  const variants = new Set<string>([base]);

  const oVariants = [base, base.replace(/o/g, "ö")];
  for (const v of oVariants) {
    variants.add(v);
    variants.add(v.replace(/a/g, "å"));
    variants.add(v.replace(/a/g, "ä"));
  }

  return [...variants].map((v) => v.trim()).filter((v) => v.length > 0);
}

function futureProjectSummary(project: NonNullable<Area["future"]>[number]): string {
  const detail =
    project.type === "School"
      ? "A school-related change that may affect local families and catchment areas."
      : project.type === "Transport"
        ? "A transport upgrade that may change travel times and access in the area."
        : project.type === "Housing"
          ? "New housing or densification that may bring more residents and services."
          : project.type === "Park"
            ? "A public-space improvement that may add green space and recreation value."
            : project.type === "Road"
              ? "A road project that may affect traffic flow, parking, and access."
              : "A planned development that may influence everyday life in the neighborhood.";

  return `${detail} Expected ${project.year}.`;
}

function buildFallbackArea(slug: string): Area {
  const name = titleFromSlug(slug);
  return {
    slug,
    name,
    region: "Stockholm",
    tagline: `${name} family living overview`,
    summary: `Live data report for ${name}.`,
    overall: 70,
    coords: [59.33, 18.06],
    scores: {
      schools: 70,
      commute: 70,
      green: 70,
      kids: 70,
      amenities: 70,
      community: 70,
      growth: 70,
      safety: 70,
      housing: 70,
    },
    demographics: {
      population: 0,
      growth: 0,
      medianIncome: 0,
      avgAge: 0,
      familiesPct: 0,
      higherEduPct: 0,
      ownershipPct: 0,
    },
    schools: [],
    amenities: [],
    commute: {
      target: "Stockholm City",
      car: 0,
      transit: 0,
      bike: 0,
      walk: 0,
    },
    future: [],
    monthlyEstimate: 0,
    safety: 70,
    housing: 70,
    crimeStats: [],
  };
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

export const Route = createFileRoute("/areas/$slug")({
  head: ({ params }) => {
    const area = getArea(params.slug) ?? buildFallbackArea(params.slug);
    return {
      meta: [
        { title: area ? `${area.name} family report — Swemove` : "Area — FamilyMove" },
        { name: "description", content: area?.summary ?? "Family neighborhood report" },
        {
          property: "og:title",
          content: area ? `${area.name} — ${area.overall}/100 family score` : "FamilyMove",
        },
        { property: "og:description", content: area?.tagline ?? "" },
      ],
    };
  },
  loader: async ({ params }) => {
    const area = getArea(params.slug) ?? buildFallbackArea(params.slug);

    return { area };
  },
  component: AreaPage,
});

function AreaPage() {
  const { area } = Route.useLoaderData() as { area: Area };
  const { slug } = Route.useParams();
  const [liveArea, setLiveArea] = useState<Area>(area);
  const [workplace, setWorkplace] = useState(area.commute.target);
  const [growthPrediction, setGrowthPrediction] = useState<GrowthPredictionState>({
    level: area.scores.growth >= 85 ? "High" : area.scores.growth >= 70 ? "Medium" : "Low",
    confidence: Math.round(area.scores.growth),
    rationale:
      "Based on building permits, population growth, infrastructure investments, and planned developments.",
  });

  useEffect(() => {
    setLiveArea(area);
    setWorkplace(area.commute.target);
    setGrowthPrediction({
      level: area.scores.growth >= 85 ? "High" : area.scores.growth >= 70 ? "Medium" : "Low",
      confidence: Math.round(area.scores.growth),
      rationale:
        "Based on building permits, population growth, infrastructure investments, and planned developments.",
    });
  }, [area]);

  useEffect(() => {
    const controller = new AbortController();

    async function resolveArea() {
      const variants = slugQueryVariants(slug);

      for (const q of variants) {
        const searchUrl = new URL(`${backendBaseUrl}/api/search`);
        searchUrl.searchParams.set("q", q);

        const searchRes = await fetch(searchUrl.toString(), {
          signal: controller.signal,
        });

        if (!searchRes.ok) {
          continue;
        }

        const searchJson = (await searchRes.json()) as SearchResponse;
        const results = searchJson.data?.results ?? [];
        if (results.length === 0) {
          continue;
        }

        const exact = results.find((r) => (r.name ? toSlug(r.name) === slug : false));
        return exact ?? results[0];
      }

      return null;
    }

    async function hydrateLiveScore() {
      try {
        const match = await resolveArea();
        const areaId = match?.id ?? match?.deso_id;
        if (!areaId) {
          return;
        }

        if (match && (match.name || match.municipality)) {
          setLiveArea((prev) => ({
            ...prev,
            name: match.name ?? prev.name,
            region: match.municipality ?? prev.region,
          }));
        }

        const scoreUrl = new URL(`${backendBaseUrl}/api/neighborhood-score`);
        scoreUrl.searchParams.set("id", areaId);

        const detailsUrl = new URL(`${backendBaseUrl}/api/neighborhood/${areaId}`);

        const [scoreRes, detailsRes] = await Promise.all([
          fetch(scoreUrl.toString(), {
            signal: controller.signal,
          }),
          fetch(detailsUrl.toString(), {
            signal: controller.signal,
          }),
        ]);

        if (!scoreRes.ok && !detailsRes.ok) {
          return;
        }

        let live: ScoreResponse["data"] | undefined;
        if (scoreRes.ok) {
          const scoreJson = (await scoreRes.json()) as ScoreResponse;
          live = scoreJson.data;
        }

        let details: AreaDetailsResponse["data"] | undefined;
        if (detailsRes.ok) {
          const detailsJson = (await detailsRes.json()) as AreaDetailsResponse;
          details = detailsJson.data;
        }

        setLiveArea((prev) => ({
          ...prev,
          name: details?.area?.name ?? prev.name,
          region: details?.area?.municipality ?? prev.region,
          coords:
            details?.area?.coordinates?.lat != null && details?.area?.coordinates?.lng != null
              ? [Number(details.area.coordinates.lat), Number(details.area.coordinates.lng)]
              : prev.coords,
          summary: details?.area?.name
            ? `Live data report for ${details.area.name}, ${details?.area?.municipality ?? prev.region}.`
            : prev.summary,
          overall: toFiniteNumber(live?.score) ?? prev.overall,
          scores: {
            ...prev.scores,
            commute: toFiniteNumber(live?.transport) ?? prev.scores.commute,
            schools: toFiniteNumber(live?.schools) ?? prev.scores.schools,
            safety: toFiniteNumber(live?.safety) ?? prev.scores.safety,
            housing: toFiniteNumber(live?.housing) ?? prev.scores.housing,
            green: toFiniteNumber(live?.green) ?? prev.scores.green,
            growth: toFiniteNumber(live?.growth) ?? prev.scores.growth,
            community:
              toFiniteNumber(details?.scores?.demographics) ??
              toFiniteNumber(details?.scores?.safety) ??
              prev.scores.community,
            kids:
              toFiniteNumber(details?.scores?.schools) ??
              toFiniteNumber(details?.scores?.growth) ??
              prev.scores.kids,
            amenities:
              toFiniteNumber(details?.scores?.housing) ??
              toFiniteNumber(details?.scores?.transport) ??
              prev.scores.amenities,
          },
          schools:
            details?.details?.schools?.map((s) => ({
              name: s.name ?? "School",
              address: s.address ?? "",
              distance: s.distance ?? "-",
              walkMin: Number(s.walkMin ?? 0),
              students: Number(s.students ?? 0),
              performance: Number(s.performance ?? 0),
              lat: toFiniteNumber(s.lat),
              lng: toFiniteNumber(s.lng),
              inspection: s.inspection ?? "Approved",
              sourceLinks: normalizeSourceLinks(s.sourceLinks),
            })) ?? prev.schools,
          commute: {
            target: details?.details?.commute?.target ?? prev.commute.target,
            car: Number(details?.details?.commute?.car ?? prev.commute.car),
            transit: Number(details?.details?.commute?.transit ?? prev.commute.transit),
            bike: Number(details?.details?.commute?.bike ?? prev.commute.bike),
            walk: Number(details?.details?.commute?.walk ?? prev.commute.walk),
          },
          amenities:
            details?.details?.amenities?.map((a) => ({
              label: a.label ?? "Amenity",
              icon: a.icon ?? "📍",
              count: Number(a.count ?? 0),
              nearest: a.nearest ?? "-",
              sourceLinks: normalizeSourceLinks(a.sourceLinks),
            })) ?? prev.amenities,
          demographics: {
            population: Number(
              details?.details?.demographics?.population ?? prev.demographics.population,
            ),
            growth: Number(details?.details?.demographics?.growth ?? prev.demographics.growth),
            medianIncome: Number(
              details?.details?.demographics?.medianIncome ?? prev.demographics.medianIncome,
            ),
            avgAge: Number(details?.details?.demographics?.avgAge ?? prev.demographics.avgAge),
            familiesPct: Number(
              details?.details?.demographics?.familiesPct ?? prev.demographics.familiesPct,
            ),
            higherEduPct: Number(
              details?.details?.demographics?.higherEduPct ?? prev.demographics.higherEduPct,
            ),
            ownershipPct: Number(
              details?.details?.demographics?.ownershipPct ?? prev.demographics.ownershipPct,
            ),
            sourceLinks: normalizeSourceLinks(details?.details?.demographics?.sourceLinks),
          },
          future:
            details?.details?.future?.map((f) => ({
              year: Number(f.year ?? new Date().getFullYear() + 1),
              title: f.title ?? "Planned project",
              type: f.type ?? "Road",
              confidence: Number(f.confidence ?? 0),
              sourceLinks: normalizeSourceLinks(f.sourceLinks),
            })) ?? prev.future,
          safety: Number(
            details?.details?.safety ?? toFiniteNumber(live?.safety) ?? prev.safety ?? 0,
          ),
          crimeStats:
            details?.details?.crimeStats?.map((c) => ({
              year: Number(c.year ?? new Date().getFullYear()),
              incidents: Number(c.incidents ?? 0),
              trend: c.trend ?? "stable",
            })) ?? prev.crimeStats,
        }));

        if (details?.details?.growthPrediction) {
          const liveGrowth = toFiniteNumber(live?.growth) ?? 0;
          const fallbackLevel: GrowthPredictionState["level"] =
            liveGrowth >= 85 ? "High" : liveGrowth >= 70 ? "Medium" : "Low";

          setGrowthPrediction({
            level: details.details.growthPrediction.level ?? fallbackLevel,
            confidence: Math.round(
              Number(
                details.details.growthPrediction.confidence ??
                  toFiniteNumber(live?.growth) ??
                  area.scores.growth,
              ),
            ),
            rationale:
              details.details.growthPrediction.rationale ??
              "Based on building permits, population growth, infrastructure investments, and planned developments.",
          });
        }
      } catch {
        // Keep static loader data when the API request fails.
      }
    }

    hydrateLiveScore();

    return () => {
      controller.abort();
    };
  }, [slug, area.scores.growth]);

  const scoreKeys = Object.keys(scoreLabels) as ScoreKey[];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Header */}
      <section className="border-b border-border bg-secondary/30">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground">
              Home
            </Link>
            <span>/</span>
            <span>{liveArea.region}</span>
            <span>/</span>
            <span className="text-foreground">{liveArea.name}</span>
          </div>

          <div className="mt-6 grid gap-10 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h1 className="font-display text-5xl md:text-6xl tracking-tight">
                {liveArea.name}
                <span className="text-muted-foreground">, {liveArea.region}</span>
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{liveArea.summary}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  to="/compare"
                  search={
                    {
                      a: liveArea.slug,
                      b: liveArea.slug === "kista" ? "sollentuna" : "kista",
                    } as never
                  }
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
              <CircularScore value={liveArea.overall} />
            </div>
          </div>
        </div>
      </section>

      {/* Score grid */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="font-display text-3xl">Family Score Breakdown</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {scoreKeys.map((k) => (
            <div
              key={k}
              className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{scoreLabels[k].icon}</span>
                <span className="font-display text-2xl">{liveArea.scores[k]}</span>
              </div>
              <div className="mt-3 text-sm font-medium">{scoreLabels[k].label}</div>
              <div className="mt-3">
                <ScoreBar
                  value={liveArea.scores[k]}
                  tone={liveArea.scores[k] >= 90 ? "leaf" : "primary"}
                />
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
            Avg score{" "}
            <span className="font-medium text-foreground">
              {liveArea.schools.length > 0
                ? Math.round(
                    liveArea.schools.reduce((s, sc) => s + sc.performance, 0) /
                      liveArea.schools.length,
                  )
                : 0}
            </span>{" "}
            · {liveArea.schools.length} nearby
          </div>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <AreaMap
            center={liveArea.coords}
            markers={liveArea.schools.map((s, i) => ({
              position:
                s.lat != null && s.lng != null
                  ? ([s.lat, s.lng] as [number, number])
                  : ([
                      liveArea.coords[0] + (i - 1) * 0.004,
                      liveArea.coords[1] + (i - 1) * 0.006,
                    ] as [number, number]),
              label: s.name,
            }))}
          />
          <div className="grid gap-3">
            {liveArea.schools.map((s) => (
              <div key={s.name} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    {s.address && (
                      <div className="mt-1 text-sm text-muted-foreground">{s.address}</div>
                    )}
                    <div className="mt-1 text-sm text-muted-foreground">
                      {s.distance} · {s.walkMin} min walk · {s.students} students
                    </div>
                    <SourceLinksRow links={s.sourceLinks} />
                    <div className="mt-2 inline-flex rounded-full bg-accent px-2.5 py-0.5 text-xs text-accent-foreground">
                      {s.inspection}
                    </div>
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
            <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Workplace
            </label>
            <input
              value={workplace}
              onChange={(e) => setWorkplace(e.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
            />
            <div className="mt-6 space-y-4">
              {[
                { label: "🚗 Car", v: liveArea.commute.car },
                { label: "🚆 Public transport", v: liveArea.commute.transit },
                { label: "🚲 Bike", v: liveArea.commute.bike },
                { label: "🚶 Walking", v: liveArea.commute.walk },
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
          <AreaMap center={liveArea.coords} height={420} />
        </div>
      </section>

      {/* Amenities */}
      <section className="mx-auto max-w-7xl px-6 py-8">
        <h2 className="font-display text-3xl">Family amenities</h2>
        <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-4">
          {liveArea.amenities.map((a) => (
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
        <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Population", v: liveArea.demographics.population.toLocaleString() },
            { label: "Growth /yr", v: `${liveArea.demographics.growth}%` },
            {
              label: "Median income",
              v: `${(liveArea.demographics.medianIncome / 1000).toFixed(0)}k SEK`,
            },
            { label: "Avg age", v: `${liveArea.demographics.avgAge}` },
            { label: "Families w/ kids", v: `${liveArea.demographics.familiesPct}%` },
            { label: "Ownership", v: `${liveArea.demographics.ownershipPct}%` },
          ].map((d) => (
            <div key={d.label} className="rounded-2xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {d.label}
              </div>
              <div className="mt-2 font-display text-2xl">{d.v}</div>
            </div>
          ))}
        </div>
        <SourceLinksRow links={liveArea.demographics.sourceLinks} />
      </section>

      {/* Future */}
      <section className="mx-auto max-w-7xl px-6 py-8 pb-24">
        <h2 className="font-display text-3xl">Future development</h2>
        <div className="mt-8 relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border md:left-1/2" />
          <div className="space-y-6">
            {liveArea.future.map((f, i) => (
              <div key={i} className="relative grid gap-4 md:grid-cols-2 md:gap-12">
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

        {/* Growth Prediction Summary */}
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card p-8">
            <h3 className="font-display text-2xl mb-4">5-Year Growth Prediction</h3>
            <div className="flex items-baseline gap-4">
              <div className="font-display text-5xl">{growthPrediction.level}</div>
              <div className="text-sm text-muted-foreground">
                Confidence: {growthPrediction.confidence}%
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{growthPrediction.rationale}</p>
          </div>

          <div className="rounded-3xl border border-border bg-card p-8">
            <h3 className="font-display text-2xl mb-4">Safety & Crime</h3>
            {liveArea.crimeStats && (
              <div className="space-y-3">
                {liveArea.crimeStats.map((c) => (
                  <div key={c.year} className="flex items-center justify-between text-sm">
                    <span>{c.year}</span>
                    <span className="flex items-center gap-2">
                      <span>{c.incidents} incidents</span>
                      <span
                        className={
                          c.trend === "down"
                            ? "text-leaf-foreground"
                            : c.trend === "up"
                              ? "text-primary"
                              : "text-muted-foreground"
                        }
                      >
                        {c.trend === "down" ? "↓" : c.trend === "up" ? "↑" : "→"}
                      </span>
                    </span>
                  </div>
                ))}
                <div className="mt-3 text-xs text-muted-foreground">
                  Safety score: {liveArea.safety ?? 0}/100 (
                  {(liveArea.safety ?? 0) >= 80
                    ? "Low crime"
                    : (liveArea.safety ?? 0) >= 70
                      ? "Moderate"
                      : "Above average"}
                  )
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/property-analysis"
            search={{ area: liveArea.slug }}
            className="inline-flex rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
          >
            Analyze property investment →
          </Link>
        </div>
      </section>
    </div>
  );
}
