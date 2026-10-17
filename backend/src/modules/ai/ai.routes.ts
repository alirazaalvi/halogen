import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendApiError, sendApiSuccess } from "../../lib/api/contracts";
import { parseOrReply } from "../../lib/api/validation";

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";

export async function aiRoutes(fastify: FastifyInstance, _options: object) {
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

    if (!message) {
      return sendApiError(reply, 400, "BAD_REQUEST", "Message is required");
    }

    try {
      const response = await fetch(`${PYTHON_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          context: context?.name
            ? { name: context.name, region: context.region ?? "", scores: context.scores ?? {} }
            : undefined,
        }),
      });
      if (!response.ok) {
        return sendApiError(reply, 503, "AI_UNAVAILABLE", "The AI service returned an error");
      }

      const data = await response.json();
      return sendApiSuccess(reply, data);
    } catch (_error) {
      // Never answer with canned text that looks like analysis (DR-52).
      return sendApiError(reply, 503, "AI_UNAVAILABLE", "The AI service is unavailable");
    }
  });

  fastify.post("/summary", async (request, reply) => {
    const parsed = parseOrReply(z.object({ deso_id: z.string().min(1) }), request.body, reply);
    if (!parsed) {
      return;
    }

    const { deso_id } = parsed;

    if (!deso_id) {
      return sendApiError(reply, 400, "BAD_REQUEST", "deso_id is required");
    }

    try {
      const response = await fetch(`${PYTHON_API_URL}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deso_id }),
      });
      if (!response.ok) {
        return sendApiError(reply, 503, "AI_UNAVAILABLE", "The AI service returned an error");
      }

      const data = await response.json();
      return sendApiSuccess(reply, data);
    } catch (_error) {
      return sendApiError(reply, 503, "AI_UNAVAILABLE", "The AI service is unavailable");
    }
  });
}
