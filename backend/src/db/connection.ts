import { AsyncLocalStorage } from "node:async_hooks";
import { Client, Pool, type QueryResult, type QueryResultRow } from "pg";

/**
 * Database access that works in two runtimes:
 * - Bun/Node: one shared `pg.Pool` (local development, ingestion, Fastify server).
 * - Cloudflare Workers: a per-request `pg.Client` through Hyperdrive. Workers forbid reusing
 *   a connection created in one request from another, so `runWithDatabase` scopes a client
 *   to the current request and closes it afterwards.
 */
const requestScope = new AsyncLocalStorage<{ getClient: () => Promise<Client> }>();

let sharedPool: Pool | null = null;

function getSharedPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/neighborhood_intelligence",
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
  }
  return sharedPool;
}

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

/** Drop-in for `pg.Pool` as used by the routes, the ingestion engine and drizzle. */
export const pool = {
  async query(text: unknown, values?: unknown) {
    const scope = requestScope.getStore();
    const target = scope ? await scope.getClient() : getSharedPool();
    // biome-ignore lint/suspicious/noExplicitAny: forwards every pg.query overload unchanged
    return (target as any).query(text, values);
  },
  async end() {
    if (sharedPool) await sharedPool.end();
  },
} as unknown as Pool;

/**
 * Runs `fn` with a database client bound to `connectionString` (a Hyperdrive string in
 * Workers). The connection opens on first use and is closed when `fn` settles.
 */
export async function runWithDatabase<T>(
  connectionString: string,
  fn: () => Promise<T>,
): Promise<T> {
  let client: Client | null = null;
  const getClient = async () => {
    if (!client) {
      client = new Client({ connectionString });
      await client.connect();
    }
    return client;
  };
  try {
    return await requestScope.run({ getClient }, fn);
  } finally {
    if (client) await (client as Client).end().catch(() => {});
  }
}
