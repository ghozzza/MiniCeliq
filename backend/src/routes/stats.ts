import { Router } from "express";
import { getStats } from "../services/analytics";

const router = Router();

// GET /api/stats — public analytics (README §7, §9). Aggregated from indexed
// `Subscribed` events. Returns `available: false` with zeros when no data has
// been indexed yet (placeholder-safe, never errors).
router.get("/", async (_req, res, next) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

export default router;
