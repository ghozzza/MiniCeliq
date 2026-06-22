import { Router } from "express";
import { z } from "zod";
import { getNews } from "../services/rssNews";
import { getDailyBrief } from "../services/dailyBrief";
import { isActive, isChainConfigured } from "../services/chain";

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

// Optional 0x address; absent/blank → not premium (locked).
const briefQuerySchema = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
});

// Decide whether `address` is an active on-chain subscriber. No address, chain
// not configured, or a failed read all resolve to NOT active — the brief gate
// fails closed so free users never trigger LLM cost.
async function isPremium(address?: string): Promise<boolean> {
  if (!address || !isChainConfigured()) return false;
  try {
    return await isActive(address);
  } catch (err) {
    console.warn(
      `[BRIEF] isActive check failed, treating as locked: ${
        err instanceof Error ? err.message : err
      }`
    );
    return false;
  }
}

// GET /api/news/brief — once-daily Morning Brief, gated to on-chain subscribers.
//   - Active  → generate/serve the cached brief: { locked: false, day, brief, generatedAt }.
//   - Locked  → { locked: true, day } WITHOUT generating (no LLM cost for free users).
router.get("/brief", async (req, res, next) => {
  try {
    const { address } = briefQuerySchema.parse(req.query);
    const day = new Date().toISOString().slice(0, 10);

    if (!(await isPremium(address))) {
      res.json({ locked: true, day });
      return;
    }

    const brief = await getDailyBrief();
    if (!brief) {
      // Premium, but the brief couldn't be produced (no news / LLM down). Report
      // it as unlocked-but-empty so the client hides the card gracefully.
      res.json({ locked: false, day });
      return;
    }

    res.json({
      locked: false,
      day: brief.day,
      brief: brief.brief,
      generatedAt: brief.generatedAt,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
