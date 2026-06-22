import { Router } from "express";
import { z } from "zod";
import { getNews } from "../services/rssNews";

const router = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// GET /api/news — public headline list from the RSS cache (README §7).
router.get("/", async (req, res, next) => {
  try {
    const { limit } = querySchema.parse(req.query);
    const items = await getNews(limit);
    res.json({ items, count: items.length });
  } catch (err) {
    next(err);
  }
});

export default router;
