import { createFileRoute } from "@tanstack/react-router";
import { areas } from "@/data/areas";

export const Route = createFileRoute("/api/neighborhood-score")({
  head: () => ({
    meta: [
      { title: "API: Neighborhood Score" },
    ],
  }),
  component: ScoreComponent,
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = url.searchParams.get("area");

        if (!slug) {
          return Response.json({ error: "Missing 'area' query parameter" }, { status: 400 });
        }

        const area = areas.find((a) => a.slug === slug);
        if (!area) {
          return Response.json({ error: "Area not found" }, { status: 404 });
        }

        return Response.json({
          score: area.overall,
          transport: area.scores.commute,
          schools: area.scores.schools,
          safety: area.scores.safety,
          housing: area.scores.housing,
          green: area.scores.green,
          growth: area.scores.growth,
        });
      },
    },
  },
});

function ScoreComponent() {
  return null;
}