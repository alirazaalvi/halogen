import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { sendApiSuccess } from "../../lib/api/contracts";
import { parseOrReply } from "../../lib/api/validation";
import { IngestionEngine } from "../../lib/ingestion/engine";

const engine = new IngestionEngine();

const desoBodySchema = z.object({ deso_id: z.string().min(1).default("123") }).default({});
const smhiBodySchema = z
  .object({
    deso_id: z.string().min(1).default("123"),
    year: z.number().int().min(2000).max(2100).default(2024),
  })
  .default({});
const scbBodySchema = z
  .object({
    deso_id: z.string().min(1).default("123"),
    region: z.string().min(1).default("Stockholm"),
  })
  .default({});
const fullBodySchema = z
  .object({
    deso_id: z.string().min(1).default("123"),
    region: z.string().min(1).default("Stockholm"),
    year: z.number().int().min(2000).max(2100).default(2024),
    area_name: z.string().min(1).optional(),
  })
  .default({});
const stockholmAllBodySchema = z
  .object({
    year: z.number().int().min(2000).max(2100).default(2024),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .default({});

export async function ingestRoutes(fastify: FastifyInstance, _options: object) {
  const runFullIngestion = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseOrReply(fullBodySchema, request.body ?? {}, reply);
    if (!body) {
      return;
    }

    const result = await engine.ingestAll(
      body.deso_id ?? "123",
      body.region ?? "Stockholm",
      body.year ?? 2024,
      body.area_name,
    );
    return sendApiSuccess(reply, result);
  };

  fastify.post("/scb", async (request, reply) => {
    const body = parseOrReply(scbBodySchema, request.body ?? {}, reply);
    if (!body) {
      return;
    }

    const result = await engine.ingestSCB(body.deso_id ?? "123", body.region ?? "Stockholm");
    return sendApiSuccess(reply, result);
  });

  fastify.post("/bra", async (request, reply) => {
    const body = parseOrReply(desoBodySchema, request.body ?? {}, reply);
    if (!body) {
      return;
    }

    const result = await engine.ingestCrime(body.deso_id ?? "123");
    return sendApiSuccess(reply, result);
  });

  fastify.post("/trafiklab", async (request, reply) => {
    const body = parseOrReply(desoBodySchema, request.body ?? {}, reply);
    if (!body) {
      return;
    }

    const result = await engine.ingestTransport(body.deso_id ?? "123");
    return sendApiSuccess(reply, result);
  });

  fastify.post("/skolverket", async (request, reply) => {
    const body = parseOrReply(desoBodySchema, request.body ?? {}, reply);
    if (!body) {
      return;
    }

    const result = await engine.ingestSchools(body.deso_id ?? "123");
    return sendApiSuccess(reply, result);
  });

  fastify.post("/lantmateriet", async (request, reply) => {
    const body = parseOrReply(desoBodySchema, request.body ?? {}, reply);
    if (!body) {
      return;
    }

    const result = await engine.ingestLantmateriet(body.deso_id ?? "123");
    return sendApiSuccess(reply, result);
  });

  fastify.post("/smhi", async (request, reply) => {
    const body = parseOrReply(smhiBodySchema, request.body ?? {}, reply);
    if (!body) {
      return;
    }

    const result = await engine.ingestSMHI(body.deso_id ?? "123", body.year ?? 2024);
    return sendApiSuccess(reply, result);
  });

  fastify.post("/municipal-open-data", async (request, reply) => {
    const body = parseOrReply(desoBodySchema, request.body ?? {}, reply);
    if (!body) {
      return;
    }

    const result = await engine.ingestMunicipalOpenData(body.deso_id ?? "123");
    return sendApiSuccess(reply, result);
  });

  fastify.post("/full", async (request, reply) => {
    return runFullIngestion(request, reply);
  });

  // Dedicated trigger endpoint for clients that want an explicit "run ingestion" action.
  fastify.post("/run", async (request, reply) => {
    return runFullIngestion(request, reply);
  });

  fastify.post("/stockholm-all", async (request, reply) => {
    const body = parseOrReply(stockholmAllBodySchema, request.body ?? {}, reply);
    if (!body) {
      return;
    }

    const result = await engine.ingestAllStockholmAreas({
      year: body.year ?? 2024,
      limit: body.limit,
    });

    return sendApiSuccess(reply, result);
  });
}
