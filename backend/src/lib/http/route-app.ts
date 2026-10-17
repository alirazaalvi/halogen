/**
 * Minimal framework-neutral route types. Route modules depend only on these, so the same
 * code runs under Fastify (Bun/Node, local and ingestion host) and Hono (Cloudflare Workers).
 */
export interface RouteReq {
  query: unknown;
  params: unknown;
  body: unknown;
}

export interface RouteReply {
  code(statusCode: number): RouteReply;
  send(payload: unknown): unknown;
}

export type RouteHandler = (request: RouteReq, reply: RouteReply) => unknown | Promise<unknown>;

export interface RouteApp {
  get(path: string, handler: RouteHandler): unknown;
  post(path: string, handler: RouteHandler): unknown;
}

export type RoutePlugin = (app: RouteApp, options: object) => Promise<void> | void;
