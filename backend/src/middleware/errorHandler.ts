import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { AppError } from "../lib/errors";

// Terminal error middleware. Emits the canonical Celiq-style shape
// `{ error, status, code? }`. 500s are masked in production so internals don't
// leak; AppErrors surface their message + optional machine-readable code;
// ZodErrors (request validation) map to a readable 400.
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode: number;
  let message: string;
  let code: string | undefined;

  if (err instanceof ZodError) {
    // Request validation failure → 400 with a compact, human-readable message
    // instead of dumping the raw issue array.
    statusCode = 400;
    message = err.issues
      .map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`)
      .join("; ");
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
  } else {
    statusCode = 500;
    message = env.NODE_ENV === "production" ? "Internal server error" : err.message;
  }

  console.error(`[ERROR] ${statusCode} — ${err.message}`);

  const body: { error: string; status: number; code?: string } = {
    error: message,
    status: statusCode,
  };
  // Surface an optional machine-readable code without changing the base shape.
  if (code) body.code = code;

  res.status(statusCode).json(body);
}
