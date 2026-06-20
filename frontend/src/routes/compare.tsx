import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { CircularScore } from "@/components/CircularScore";
import { ScoreBar } from "@/components/ScoreBar";

const backendBaseUrl = import.meta.env.VITE_BACKEND_API_URL ?? "http://localhost:3001";

type SearchResult = {
  id?: string;
  name?: string;
  municipality?: string;
  type?: "deso" | "district";
};

type SearchResponse = {
  success: boolean;
  data?: {
    results?: SearchResult[];
  };
};

type CompareScoreSet = {
  overall?: number | null;
  demographics?: number | null;
  housing?: number | null;
  transport?: number | null;
  schools?: number | null;
  safety?: number | null;
  green?: number | null;
  growth?: number | null;
};

type CompareArea = {
  id?: string;
  deso_id?: string;
  type?: "deso" | "district";
  name?: string;
  municipality?: string;
  scores?: CompareScoreSet;
};

type CompareResponse = {
  success: boolean;
  data?: {
    comparison?: CompareArea[];
  };
};

type FeaturedResponse = {
  success: boolean;
  data?: {
    results?: Array<{
      id?: string;
      name?: string;
      region?: string;
      type?: "municipality" | "district";
    }>;
  };
};

type PickedArea = {
  id: string;
  name: string;
  municipality?: string;
  type?: "deso" | "district";
};

const metrics: Array<{ key: keyof CompareScoreSet; label: string }> = [
  { key: "overall", label: "Overall score" },
  { key: "schools", label: "Schools" },
  { key: "transport", label: "Transport" },
  { key: "safety", label: "Safety" },
  { key: "housing", label: "Housing" },
  { key: "green", label: "Green areas" },
  { key: "demographics", label: "Demographics" },
  { key: "growth", label: "Future growth" },
];

function normalizeScore(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ComparePicker({
  value,
  options,
  onType,
  onPick,
  side,
}: {
  value: string;
  options: PickedArea[];
  onType: (value: string) => void;
  onPick: (area: PickedArea) => void;
  side: "a" | "b";
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <input
        value={value}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          setTimeout(() => setIsOpen(false), 120);
        }}
        onChange={(event) => {
          onType(event.target.value);
          setIsOpen(true);
        }}
        placeholder={side === "a" ? "Search area A" : "Search area B"}
        className="w-full rounded-xl border border-border bg-background px-4 py-3 font-display text-2xl outline-none focus:border-primary"
      />
      {isOpen && options.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-border bg-background shadow-[var(--shadow-soft)]">
          {options.slice(0, 8).map((area) => (
            <button
              key={`${area.id}-${side}`}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(area);
                setIsOpen(false);
              }}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-secondary/40"
            >
              <span>
                <span className="font-medium">{area.name}</span>
                {area.municipality ? (
                  <span className="text-muted-foreground"> · {area.municipality}</span>
                ) : null}
              </span>
              <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                {area.type ?? "area"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare neighborhoods — Swemove" },
      {
        name: "description",
        content:
          "Compare Swedish neighborhoods side by side across schools, commute, parks and family scores.",
      },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const [featured, setFeatured] = useState<PickedArea[]>([]);
  const [queryA, setQueryA] = useState("");
  const [queryB, setQueryB] = useState("");
  const [optionsA, setOptionsA] = useState<PickedArea[]>([]);
  const [optionsB, setOptionsB] = useState<PickedArea[]>([]);
  const [pickedA, setPickedA] = useState<PickedArea | null>(null);
  const [pickedB, setPickedB] = useState<PickedArea | null>(null);
  const [comparison, setComparison] = useState<CompareArea[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadFeatured() {
      try {
        const url = new URL(`${backendBaseUrl}/api/featured-neighborhoods`);
        url.searchParams.set("limit", "30");
        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) {
          return;
        }

        const json = (await res.json()) as FeaturedResponse;
        const results = (json.data?.results ?? [])
          .filter((item) => Boolean(item.id && item.name))
          .map((item) => ({
            id: String(item.id),
            name: String(item.name),
            municipality: item.region,
            type: item.type === "district" ? "district" : "deso",
          }));

        setFeatured(results);
        setOptionsA(results);
        setOptionsB(results);
        if (results.length >= 2) {
          setPickedA(results[0]);
          setPickedB(results[1]);
          setQueryA(results[0].name);
          setQueryB(results[1].name);
        }
      } catch {
        setFeatured([]);
      }
    }

    loadFeatured();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function searchAreas(query: string, setOptions: (areas: PickedArea[]) => void) {
      if (query.trim().length < 2) {
        setOptions(featured);
        return;
      }

      try {
        const url = new URL(`${backendBaseUrl}/api/search`);
        url.searchParams.set("q", query.trim());
        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) {
          setOptions([]);
          return;
        }

        const json = (await res.json()) as SearchResponse;
        const matches = (json.data?.results ?? [])
          .filter((item) => Boolean(item.id && item.name))
          .map((item) => ({
            id: String(item.id),
            name: String(item.name),
            municipality: item.municipality,
            type: item.type,
          }));

        setOptions(matches);
      } catch {
        setOptions([]);
      }
    }

    const timeoutA = setTimeout(() => {
      void searchAreas(queryA, setOptionsA);
    }, 200);

    const timeoutB = setTimeout(() => {
      void searchAreas(queryB, setOptionsB);
    }, 200);

    return () => {
      clearTimeout(timeoutA);
      clearTimeout(timeoutB);
      controller.abort();
    };
  }, [queryA, queryB, featured]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadComparison() {
      if (!pickedA?.id || !pickedB?.id) {
        return;
      }

      if (pickedA.id === pickedB.id) {
        setError("Please choose two different areas to compare.");
        setComparison([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const url = new URL(`${backendBaseUrl}/api/compare`);
        url.searchParams.set("a", pickedA.id);
        url.searchParams.set("b", pickedB.id);

        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) {
          setComparison([]);
          setError("Could not load comparison data.");
          return;
        }

        const json = (await res.json()) as CompareResponse;
        const payload = json.data?.comparison ?? [];
        if (payload.length !== 2) {
          setComparison([]);
          setError("Comparison response is incomplete.");
          return;
        }

        setComparison(payload);
      } catch {
        setComparison([]);
        setError("Could not load comparison data.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadComparison();

    return () => {
      controller.abort();
    };
  }, [pickedA, pickedB]);

  const [areaA, areaB] = comparison;

  const rows = useMemo(() => {
    return metrics.map((metric) => {
      const scoreA = normalizeScore(areaA?.scores?.[metric.key]);
      const scoreB = normalizeScore(areaB?.scores?.[metric.key]);
      const winner: "a" | "b" | "tie" =
        scoreA == null || scoreB == null
          ? "tie"
          : scoreA === scoreB
            ? "tie"
            : scoreA > scoreB
              ? "a"
              : "b";
      return {
        label: metric.label,
        a: scoreA,
        b: scoreB,
        winner,
      };
    });
  }, [areaA, areaB]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="font-display text-4xl md:text-5xl">Compare neighborhoods</h1>
        <p className="mt-2 text-muted-foreground">
          Pick any two areas from live backend data. Winners are highlighted per metric.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {[
            {
              side: "a" as const,
              selected: pickedA,
              setSelected: setPickedA,
              query: queryA,
              setQuery: setQueryA,
              options: optionsA,
            },
            {
              side: "b" as const,
              selected: pickedB,
              setSelected: setPickedB,
              query: queryB,
              setQuery: setQueryB,
              options: optionsB,
            },
          ].map(({ side, selected, setSelected, query, setQuery, options }) => (
            <div
              key={side}
              className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
            >
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {side === "a" ? "Area A" : "Area B"}
              </div>
              <div className="mt-2">
                <ComparePicker
                  value={query}
                  options={options}
                  onType={setQuery}
                  onPick={(area) => {
                    setSelected(area);
                    setQuery(area.name);
                  }}
                  side={side}
                />
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">
                    {selected?.municipality ?? "Unknown municipality"}
                  </div>
                  <div className="mt-1 max-w-xs text-sm">
                    {selected?.type === "district" ? "District" : "Area"}
                  </div>
                </div>
                <CircularScore
                  value={
                    normalizeScore(
                      side === "a" ? areaA?.scores?.overall : areaB?.scores?.overall,
                    ) ?? 0
                  }
                  size={130}
                />
              </div>
            </div>
          ))}
        </div>

        {isLoading && (
          <div className="mt-6 text-sm text-muted-foreground">Loading comparison...</div>
        )}
        {error && (
          <div className="mt-6 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="mt-10 overflow-hidden rounded-3xl border border-border bg-card">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] border-b border-border bg-secondary/40 px-6 py-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <span>Category</span>
            <span className="text-center">{areaA?.name ?? pickedA?.name ?? "Area A"}</span>
            <span className="text-center">{areaB?.name ?? pickedB?.name ?? "Area B"}</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.label}
              className="grid grid-cols-[1.4fr_1fr_1fr] items-center border-b border-border/60 px-6 py-4 last:border-0"
            >
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

function Cell({ value, win }: { value: number | null; win: boolean }) {
  const isNum = typeof value === "number";
  return (
    <div className="text-center">
      <div
        className={`mx-auto inline-flex min-w-[64px] items-center justify-center rounded-full px-3 py-1 font-display text-xl ${win ? "bg-leaf/20 text-leaf-foreground" : "text-foreground/80"}`}
      >
        {value == null ? "-" : value}
      </div>
      {isNum && (
        <div className="mx-auto mt-2 w-24">
          <ScoreBar value={value} tone={win ? "leaf" : "primary"} />
        </div>
      )}
    </div>
  );
}
