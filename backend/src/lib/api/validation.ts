import type { FastifyReply } from "fastify";
import { type ZodSchema, z } from "zod";
import { sendApiError } from "./contracts";

export const desoIdSchema = z.string().min(1);

export function parseOrReply<T>(
  schema: ZodSchema<T>,
  input: unknown,
  reply: FastifyReply,
): T | null {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    sendApiError(
      reply,
      400,
      "VALIDATION_ERROR",
      "Request validation failed",
      parsed.error.flatten(),
    );
    return null;
  }

  return parsed.data;
}
