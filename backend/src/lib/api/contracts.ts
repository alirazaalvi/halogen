import type { FastifyReply } from "fastify";

export type ApiErrorCode = "BAD_REQUEST" | "NOT_FOUND" | "VALIDATION_ERROR" | "INTERNAL_ERROR";

export type ApiErrorBody = {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export type ApiSuccessBody<T> = {
  success: true;
  data: T;
};

export function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
) {
  const body: ApiErrorBody = {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };

  return reply.code(statusCode).send(body);
}

export function sendApiSuccess<T>(reply: FastifyReply, data: T, statusCode = 200) {
  const body: ApiSuccessBody<T> = {
    success: true,
    data,
  };

  return reply.code(statusCode).send(body);
}
