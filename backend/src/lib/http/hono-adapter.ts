import type { Context, Hono } from "hono";
import type { RouteApp, RoutePlugin, RouteReply, RouteReq } from "./route-app";

// biome-ignore lint/suspicious/noExplicitAny: accepts a Hono app with any bindings
type AnyHono = Hono<any, any, any>;

/** Sentinel used when a handler never called `reply.send`. */
const NOT_SENT = Symbol("not-sent");

async function readBody(c: Context): Promise<unknown> {
  const type = c.req.header("content-type") ?? "";
  if (!type.includes("application/json")) return undefined;
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function queryOf(c: Context): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URL(c.req.url).searchParams) out[key] = value;
  return out;
}

/** Registers a route plugin on a Hono app under `prefix`. */
export function mountRoutes(
  app: AnyHono,
  prefix: string,
  plugin: RoutePlugin,
): Promise<void> | void {
  const register =
    (method: "get" | "post") => (path: string, handler: Parameters<RouteApp["get"]>[1]) => {
      // Fastify "/:id" and Hono "/:id" share syntax.
      app[method](`${prefix}${path}`, async (c) => {
        let status = 200;
        let sent: unknown = NOT_SENT;
        const reply: RouteReply = {
          code(code) {
            status = code;
            return reply;
          },
          send(payload) {
            sent = payload;
            return reply;
          },
        };
        const request: RouteReq = {
          query: queryOf(c),
          params: c.req.param(),
          body: method === "post" ? await readBody(c) : undefined,
        };

        const returned = await handler(request, reply);
        const payload = sent !== NOT_SENT ? sent : returned === reply ? undefined : returned;
        if (payload === undefined) return c.body(null, status as 204);
        return c.json(payload as object, status as 200);
      });
    };

  return plugin({ get: register("get"), post: register("post") }, {});
}
