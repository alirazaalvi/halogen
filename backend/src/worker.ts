/**
 * Cloudflare Workers entry for the read API. Ingestion is intentionally not exposed here:
 * it is long-running and runs from the CLI against the same database.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { runWithDatabase } from "./db/connection";
import { mountRoutes } from "./lib/http/hono-adapter";
import { aiRoutes } from "./modules/ai/ai.routes";
import { compareRoutes } from "./modules/compare/compare.routes";
import { investmentRoutes } from "./modules/investment/investment.routes";
import { neighborhoodRoutes } from "./modules/neighborhoods/neighborhood.routes";
import { searchRoutes } from "./modules/search/search.routes";

type Bindings = {
  HYPERDRIVE: { connectionString: string };
  ALLOWED_ORIGIN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.ALLOWED_ORIGIN;
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

// Every API request gets its own database client (see db/connection.ts).
app.use("/api/*", async (c, next) => {
  await runWithDatabase(c.env.HYPERDRIVE.connectionString, async () => {
    await next();
  });
});

await mountRoutes(app, "/api", searchRoutes);
await mountRoutes(app, "/api", neighborhoodRoutes);
await mountRoutes(app, "/api/investment", investmentRoutes);
await mountRoutes(app, "/api/ai", aiRoutes);
await mountRoutes(app, "/api", compareRoutes);

export default app;
