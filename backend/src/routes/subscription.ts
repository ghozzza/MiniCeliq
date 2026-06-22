import { Router } from "express";
import { z } from "zod";
import { getSubscriptionStatus } from "../services/chain";

const router = Router();

const paramsSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x address"),
});

// GET /api/subscription/:address — public on-chain read (README §7).
// Returns { active, expiry } straight from the contract. 503 when the chain is
// not configured (handled by chain service → AppError → errorHandler).
router.get("/:address", async (req, res, next) => {
  try {
    const { address } = paramsSchema.parse(req.params);
    const status = await getSubscriptionStatus(address);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

export default router;
