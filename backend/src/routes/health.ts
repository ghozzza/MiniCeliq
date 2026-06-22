import { Router } from "express";
import { hasSupabase, hasOpenRouter, hasChain } from "../config/env";

const router = Router();

// Liveness + a quick view of which integrations are wired (handy when debugging
// graceful-degradation on a fresh deploy).
router.get("/", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    integrations: {
      supabase: hasSupabase(),
      openrouter: hasOpenRouter(),
      chain: hasChain(),
    },
  });
});

export default router;
