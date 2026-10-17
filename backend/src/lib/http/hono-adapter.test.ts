import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { mountRoutes } from "./hono-adapter";
import type { RoutePlugin } from "./route-app";

const plugin: RoutePlugin = (app) => {
  app.get("/items/:id", (request, reply) => {
    const { id } = request.params as { id: string };
    const { q } = request.query as { q?: string };
    return reply.send({ id, q });
  });
  app.post("/echo", (request, reply) => reply.code(201).send({ body: request.body }));
  app.get("/returned", async () => ({ ok: true }));
  app.get("/err", (_request, reply) => reply.code(404).send({ success: false }));
};

describe("hono adapter", () => {
  const app = new Hono();
  mountRoutes(app, "/api", plugin);

  test("passes params and query", async () => {
    const res = await app.request("/api/items/42?q=kista");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "42", q: "kista" });
  });

  test("passes JSON bodies and status codes", async () => {
    const res = await app.request("/api/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ body: { a: 1 } });
  });

  test("uses returned values and error statuses", async () => {
    expect(await (await app.request("/api/returned")).json()).toEqual({ ok: true });
    expect((await app.request("/api/err")).status).toBe(404);
  });
});
