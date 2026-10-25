/**
 * Vercel Functions entry (Node.js runtime). Uses the shared pg pool, configured by
 * DATABASE_URL; use the pooled connection string of the database provider.
 * Bundled to api/index.mjs by `bun run vercel:build`.
 */
import { handle } from "hono/vercel";
import { createApp } from "./app";

const { app, mountApi } = await createApp({
  allowedOrigins: () => process.env.ALLOWED_ORIGIN,
});
await mountApi();

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
export const HEAD = handler;
