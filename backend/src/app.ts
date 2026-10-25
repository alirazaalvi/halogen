/**
 * The read API as a Hono app, shared by every serverless target (Cloudflare Workers, Vercel).
 * Ingestion is intentionally not exposed: it is long-running and runs from the CLI.
 *
 * `allowedOrigins` is read per request so each platform can supply its own configuration.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { mountRoutes } from "./lib/http/hono-adapter";
import { aiRoutes } from "./modules/ai/ai.routes";
import { compareRoutes } from "./modules/compare/compare.routes";
import { investmentRoutes } from "./modules/investment/investment.routes";
import { neighborhoodRoutes } from "./modules/neighborhoods/neighborhood.routes";
import { searchRoutes } from "./modules/search/search.routes";

// biome-ignore lint/suspicious/noExplicitAny: platform-specific bindings differ per target
export type AppOptions<E extends object = any> = {
  /** Comma-separated allowed origins, or "*"; resolved on every request. */
  allowedOrigins: (env: E) => string | undefined;
};

export async function createApp<E extends object>(options: AppOptions<E>) {
  const app = new Hono<{ Bindings: E }>();

  app.use(
    "*",
    cors({
      origin: (origin, c) => {
        const allowed = options.allowedOrigins(c.env);
        if (!allowed || allowed === "*") return origin || "*";
        return allowed
          .split(",")
          .map((o: string) => o.trim())
          .includes(origin)
          ? origin
          : "";
      },
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok" }));

  return {
    app,
    async mountApi() {
      await mountRoutes(app, "/api", searchRoutes);
      await mountRoutes(app, "/api", neighborhoodRoutes);
      await mountRoutes(app, "/api/investment", investmentRoutes);
      await mountRoutes(app, "/api/ai", aiRoutes);
      await mountRoutes(app, "/api", compareRoutes);
    },
  };
}
