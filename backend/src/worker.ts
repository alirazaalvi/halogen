/** Cloudflare Workers entry. The database is reached through the Hyperdrive binding. */
import { createApp } from "./app";
import { runWithDatabase } from "./db/connection";

type Bindings = {
  HYPERDRIVE: { connectionString: string };
  ALLOWED_ORIGIN?: string;
};

const { app, mountApi } = await createApp<Bindings>({
  allowedOrigins: (env) => env?.ALLOWED_ORIGIN,
});

// Every API request gets its own database client (see db/connection.ts).
app.use("/api/*", async (c, next) => {
  await runWithDatabase(c.env.HYPERDRIVE.connectionString, async () => {
    await next();
  });
});

await mountApi();

export default app;
