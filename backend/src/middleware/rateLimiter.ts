import rateLimit from "express-rate-limit";

// General API rate limiter: 100 requests per minute per IP. Mounted on `/api`.
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later", status: 429 },
});
