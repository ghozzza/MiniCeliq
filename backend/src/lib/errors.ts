// AppError: operational errors with an HTTP statusCode, caught by the
// errorHandler middleware. Use for validation / not-found / forbidden / quota —
// not for programming bugs. Mirrors Celiq's `{error, status, code}` shape.

export class AppError extends Error {
  readonly statusCode: number;
  // Optional machine-readable code for the FE to branch on (e.g.
  // "summary_quota_exceeded"). Only emitted by errorHandler when present.
  readonly code?: string;

  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    if (code) this.code = code;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}
