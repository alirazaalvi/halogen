import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import heroImg from "@/assets/hero-neighborhood.jpg";
import { SiteHeader } from "@/components/SiteHeader";

const backendBaseUrl = import.meta.env.VITE_BACKEND_API_URL ?? "http://localhost:3001";

type BackendSearchResponse = {
  success: boolean;
  data?: {
    results?: Array<{
      id?: string;
      deso_id?: string;
      name: string;
      municipality?: string;
    }>;
  };
};

type FeaturedArea = {
  slug: string;
  id?: string;
  type?: "municipality" | "district";
  name: string;
  region?: string;
  overall?: number;
  schools?: number;
  commute?: number;
  green?: number;
};

type BackendFeaturedResponse = {
  success: boolean;
  data?: {
    results?: Array<{
      slug: string;
      id?: string;
      type?: "municipality" | "district";
      name: string;
      region?: string;
      overall?: number | string | null;
      schools?: number | string | null;
      commute?: number | string | null;
      green?: number | string | null;
    }>;
  };
};

function toFiniteNumber(input: unknown): number | null {
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Swemove — AI neighborhood reports for families" },
      {
        name: "description",
        content:
          "Search any Swedish neighborhood and get a beautiful, AI-powered family report — schools, commute, parks, amenities and future growth in one place.",
      },
      { property: "og:title", content: "Swemove" },
      {
        property: "og:description",
        content: "AI-powered neighborhood reports for families relocating in Sweden.",
      },
    ],
  }),
  component: Landing,
});

const dataSources = [
  { label: "SCB", url: "https://www.scb.se/" },
  { label: "Skolverket", url: "https://www.skolverket.se/" },
  { label: "Trafiklab", url: "https://www.trafiklab.se/" },
  {
    label: "Lantmäteriet",
    url: "https://www.lantmateriet.se/sv/geodata/geodataprodukter/produktlista/adresser/",
  },
  { label: "SMHI", url: "https://www.smhi.se/data" },
  { label: "Municipal Open Data", url: "https://dataportalen.stockholm.se/" },
];

function Landing() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [featuredAreas, setFeaturedAreas] = useState<FeaturedArea[]>([]);
  const [backendMatches, setBackendMatches] = useState<
    Array<{ id?: string; deso_id?: string; name: string; municipality?: string }>
  >([]);

  useEffect(() => {
    const rawQuery = q.trim();
    const query = rawQuery.length >= 2 ? rawQuery : "stockholm";

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const searchUrl = new URL(`${backendBaseUrl}/api/search`);
        searchUrl.searchParams.set("q", query);

        const res = await fetch(searchUrl.toString(), { signal: controller.signal });
        if (!res.ok) {
          setBackendMatches([]);
          return;
        }

        const json = (await res.json()) as BackendSearchResponse;
        setBackendMatches(json.data?.results ?? []);
      } catch {
        setBackendMatches([]);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadFeatured() {
      try {
        const url = new URL(`${backendBaseUrl}/api/featured-neighborhoods`);
        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) {
          return;
        }

        const json = (await res.json()) as BackendFeaturedResponse;
        const apiResults = json.data?.results ?? [];
        setFeaturedAreas(
          apiResults.map((item) => ({
            slug: item.slug,
            id: item.id,
            type: item.type,
            name: item.name,
            region: item.region,
            overall: toFiniteNumber(item.overall) ?? undefined,
            schools: toFiniteNumber(item.schools) ?? undefined,
            commute: toFiniteNumber(item.commute) ?? undefined,
            green: toFiniteNumber(item.green) ?? undefined,
          })),
        );
      } catch {
        setFeaturedAreas([]);
      }
    }

    loadFeatured();

    return () => {
      controller.abort();
    };
  }, []);

  function goFirst() {
    const firstMatch = backendMatches[0];
    if (firstMatch?.name) {
      navigate({ to: "/areas/$slug", params: { slug: toSlug(firstMatch.name) } });
      return;
    }

    const target = featuredAreas[0];
    if (target?.slug) {
      navigate({ to: "/areas/$slug", params: { slug: target.slug } });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-[1.05fr_1fr] md:py-24 md:gap-16 md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-leaf" /> AI relocation intelligence for
              Sweden
            </div>
            <h1 className="mt-5 font-display text-5xl leading-[1.02] tracking-tight md:text-7xl">
              Find the right
              <span className="block italic text-primary">place to raise a family.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Search any address, neighborhood or municipality in Sweden. Get one beautiful score
              combining schools, commute, parks, amenities and future growth.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                goFirst();
              }}
              className="mt-8"
            >
              <div className="relative">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search an address, neighborhood or municipality"
                  className="w-full rounded-2xl border border-border bg-card px-6 py-5 pr-40 text-base shadow-[var(--shadow-soft)] outline-none ring-0 placeholder:text-muted-foreground focus:border-primary"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Search
                </button>
              </div>
              {q.length >= 2 && backendMatches.length > 0 && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
                  {backendMatches.slice(0, 6).map((r) => (
                    <button
                      key={r.id ?? r.deso_id ?? r.name}
                      type="button"
                      onClick={() =>
                        navigate({ to: "/areas/$slug", params: { slug: toSlug(r.name) } })
                      }
                      className="flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-secondary/50"
                    >
                      <span>
                        <span className="font-medium">{r.name}</span>
                        {r.municipality ? (
                          <span className="text-muted-foreground"> · {r.municipality}</span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">backend</span>
                    </button>
                  ))}
                </div>
              )}
              {q.length >= 2 && backendMatches.length === 0 && (
                <div className="mt-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm text-muted-foreground">
                  No backend matches found.
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                Try
                {["Gamla Stan", "Södermalm", "Sollentuna", "Täby", "Solna", "Nacka"].map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setQ(t)}
                    className="rounded-full border border-border bg-card px-3 py-1 hover:border-primary hover:text-foreground"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </form>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/areas/$slug"
                params={{ slug: featuredAreas[0]?.slug ?? "gamla-stan" }}
                className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background hover:opacity-90"
              >
                Explore areas →
              </Link>
              <Link
                to="/compare"
                className="rounded-full border border-border bg-card px-5 py-3 text-sm font-medium hover:border-primary"
              >
                Compare neighborhoods
              </Link>
            </div>
            <div className="mt-4">
              <Link
                to="/property-analysis"
                className="rounded-full border border-primary bg-primary/10 px-5 py-3 text-sm font-medium text-primary hover:bg-primary/20"
              >
                Property Investment Analysis
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-[3rem] bg-[color-mix(in_oklab,var(--color-sky)_60%,transparent)] blur-3xl" />
            <img
              src={heroImg}
              alt="Illustration of a Swedish family neighborhood with painted wooden houses, birch trees and a playground"
              width={1920}
              height={1280}
              className="w-full rounded-[2rem] border border-border shadow-[var(--shadow-card)]"
            />
            <div className="absolute -bottom-6 -left-4 hidden rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] md:block">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Live API status
              </div>
              <div className="mt-1 font-display text-3xl">
                {featuredAreas.length}
                <span className="text-base text-muted-foreground"> loaded</span>
              </div>
              <div className="text-xs text-leaf-foreground">featured cards from backend</div>
            </div>
          </div>
        </div>

        {/* Data sources */}
        <div className="border-t border-border/60 bg-card/40">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-6 py-6 md:flex-row md:justify-between">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Built on trusted public data
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
              {dataSources.map((d) => (
                <a
                  key={d.label}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline decoration-dotted underline-offset-2 hover:text-foreground"
                >
                  {d.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Featured areas */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="font-display text-3xl md:text-4xl">Stockholm County Districts</h2>
            <p className="mt-2 text-muted-foreground">
              All neighborhoods and areas across Stockholm County with full reports.
            </p>
          </div>
          <Link
            to="/compare"
            className="hidden text-sm text-primary underline-offset-4 hover:underline md:block"
          >
            Compare side by side →
          </Link>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {featuredAreas.length === 0 && (
            <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
              No featured API data available.
            </div>
          )}
          {featuredAreas.map((a) => (
            <Link
              key={a.slug}
              to="/areas/$slug"
              params={{ slug: a.slug }}
              className="group flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] transition hover:-translate-y-1 hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="mt-1 font-display text-2xl">{a.name}</div>
                </div>
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary font-display text-xl text-primary">
                  {a.overall ?? "--"}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Live score snapshot from backend data.
              </p>
              <div className="mt-auto flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">
                  Schools {a.schools ?? "--"}
                </span>
                <span className="rounded-full bg-secondary px-2.5 py-1">
                  Commute {a.commute ?? "--"}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-foreground">
                  Green {a.green ?? "--"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* AI strip */}
      <section className="border-t border-border bg-secondary/40">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <h2 className="font-display text-3xl md:text-4xl">Ask the AI relocation assistant</h2>
            <p className="mt-3 max-w-xl text-muted-foreground">
              "We have two children and work in Kista. Which area is best?" Get tailored
              recommendations across schools, commute, budget and lifestyle.
            </p>
            <Link
              to="/assistant"
              className="mt-6 inline-flex rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background"
            >
              Open the assistant →
            </Link>
          </div>
          <div className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <div className="rounded-2xl bg-muted p-4 text-sm">
              We're a family of four moving from Berlin, work in Solna.
            </div>
            <div className="mt-3 rounded-2xl bg-primary/10 p-4 text-sm">
              <span className="font-medium text-primary">Sollentuna</span> stands out — 94/100
              schools, an 18 min train into the city, and a calm lakeside feel families love.{" "}
              <span className="font-medium text-primary">Vasastan</span> is the lively city
              alternative if you'd rather skip the commute.
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        Live API verification mode
      </footer>
    </div>
  );
}
