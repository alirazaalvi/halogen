import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { desoAreas, neighborhoodScores } from "../../db/schema";
import { chatReply, summary } from "../../lib/ai/describe";
import { publicScores } from "../../lib/api/area-scores";
import { sendApiError, sendApiSuccess } from "../../lib/api/contracts";
import { parseOrReply } from "../../lib/api/validation";
import type { RouteApp } from "../../lib/http/route-app";

/**
 * Text is generated in-process from stored scores (no separate AI service), so the API
 * has no external runtime dependency and runs on Cloudflare Workers.
 */
export async function aiRoutes(fastify: RouteApp, _options: object) {
  fastify.post("/chat", async (request, reply) => {
    const parsed = parseOrReply(
      z.object({
        message: z.string().min(1),
        context: z
          .object({
            name: z.string().optional(),
            region: z.string().optional(),
            scores: z.record(z.number().nullable()).optional(),
          })
          .optional(),
      }),
      request.body,
      reply,
    );
    if (!parsed) {
      return;
    }

    const { message, context } = parsed;
    return sendApiSuccess(reply, {
      reply: chatReply({
        message,
        context: context?.name
          ? { name: context.name, region: context.region, scores: context.scores }
          : undefined,
      }),
    });
  });

  fastify.post("/summary", async (request, reply) => {
    const parsed = parseOrReply(z.object({ deso_id: z.string().min(1) }), request.body, reply);
    if (!parsed) {
      return;
    }

    const { deso_id } = parsed;
    const [area] = await db
      .select({ name: desoAreas.name })
      .from(desoAreas)
      .where(eq(desoAreas.id, deso_id))
      .limit(1);
    if (!area) {
      return sendApiError(reply, 404, "NOT_FOUND", "Area not found");
    }

    const [scoreRow] = await db
      .select()
      .from(neighborhoodScores)
      .where(eq(neighborhoodScores.desoId, deso_id))
      .limit(1);

    return sendApiSuccess(
      reply,
      summary({
        name: area.name ?? deso_id,
        scores: publicScores((scoreRow ?? {}) as Record<string, unknown>),
      }),
    );
  });
}
