import rateLimit from "express-rate-limit";

// General API rate limiter: 100 requests per minute per IP. Mounted on `/api`.
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later", status: 429 },
});

// Tighter limiter for the ONLY endpoint that triggers a paid LLM generation
// (POST /api/news/summarize). The per-address free quota is spoofable, so this
// per-IP cap is the real backstop against running up the OpenRouter bill with a
// flood of cache-missing requests. 12/min/IP is generous for a human tapping
// headlines but caps automated abuse hard. (Audit M1.)
export const summarizeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many summary requests, please slow down", status: 429 },
});
