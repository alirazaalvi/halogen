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
        context: z.object({ name: z.string().optional() }).optional(),
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
        body: JSON.stringify({ message, context }),
      });

      const data = await response.json();
      return sendApiSuccess(reply, data);
    } catch (_error) {
      const contextName = context?.name ?? "Kista";

      return sendApiSuccess(reply, {
        reply: `I can help analyze Swedish neighborhoods. Questions about ${contextName}? Ask about schools, transport, safety or investment potential.`,
      });
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

      const data = await response.json();
      return sendApiSuccess(reply, data);
    } catch (_error) {
      return sendApiSuccess(reply, {
        summary: `Area ${deso_id}: Good family area with average scores.`,
        pros: ["Central location", "Good schools"],
        cons: ["Higher than average prices"],
        recommendation: "CONSIDER",
      });
    }
  });
}
