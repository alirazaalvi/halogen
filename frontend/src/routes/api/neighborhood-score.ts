import { createFileRoute } from "@tanstack/react-router";

type BackendSuccess<T> = {
  success: true;
  data: T;
};

type SearchResult = {
  deso_id: string;
  name: string;
};

type BackendScoreData = {
  score?: number | string | null;
  transport?: number | string | null;
  schools?: number | string | null;
  safety?: number | string | null;
  housing?: number | string | null;
  green?: number | string | null;
  growth?: number | string | null;
};

const backendBaseUrl = process.env.BACKEND_API_URL ?? "http://localhost:3001";

function toFiniteNumber(input: unknown): number | null {
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

export const Route = createFileRoute("/api/neighborhood-score")({
  head: () => ({
    meta: [{ title: "API: Neighborhood Score" }],
  }),
  component: ScoreComponent,
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = url.searchParams.get("area");
        const desoId = url.searchParams.get("deso_id");

        if (!slug && !desoId) {
          return Response.json(
            { error: "Missing query parameter. Use 'area' or 'deso_id'" },
            { status: 400 },
          );
        }

        let resolvedDesoId = desoId;

        if (!resolvedDesoId && slug) {
          try {
            const searchUrl = new URL(`${backendBaseUrl}/api/search`);
            searchUrl.searchParams.set("q", slug.replace(/-/g, " "));

            const searchRes = await fetch(searchUrl.toString());
            if (searchRes.ok) {
              const searchJson = (await searchRes.json()) as BackendSuccess<{
                results: SearchResult[];
              }>;
              resolvedDesoId = searchJson.data?.results?.[0]?.deso_id;
            }
          } catch {
            resolvedDesoId = null;
          }
        }

        if (resolvedDesoId) {
          try {
            const scoreUrl = new URL(`${backendBaseUrl}/api/neighborhood-score`);
            scoreUrl.searchParams.set("deso_id", resolvedDesoId);

            const scoreRes = await fetch(scoreUrl.toString());
            if (scoreRes.ok) {
              const scoreJson = (await scoreRes.json()) as BackendSuccess<BackendScoreData>;
              const data = scoreJson.data ?? {};

              return Response.json({
                score: toFiniteNumber(data.score),
                transport: toFiniteNumber(data.transport),
                schools: toFiniteNumber(data.schools),
                safety: toFiniteNumber(data.safety),
                housing: toFiniteNumber(data.housing),
                green: toFiniteNumber(data.green),
                growth: toFiniteNumber(data.growth),
                deso_id: resolvedDesoId,
              });
            }
          } catch {
            // Fall back to local demo data below if backend is unavailable.
          }
        }

        return Response.json(
          { error: "No backend score data found for requested area" },
          { status: 404 },
        );
      },
    },
  },
});

function ScoreComponent() {
  return null;
}
