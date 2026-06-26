// /api/health route shape. Mounts the real router on an ephemeral Express server
// and hits it over loopback (no external calls). The route only reports capability
// booleans, so we assert the envelope shape, not the integration values.

import { describe, it, expect } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import healthRouter from "../routes/health";

describe("GET /api/health", () => {
  it("returns ok + integration capability flags", async () => {
    const app = express();
    app.use("/api/health", healthRouter);
    const server = app.listen(0);

    try {
      const port = (server.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(typeof body.timestamp).toBe("string");
      expect(typeof body.uptime).toBe("number");

      expect(body.integrations).toBeDefined();
      expect(typeof body.integrations.supabase).toBe("boolean");
      expect(typeof body.integrations.openrouter).toBe("boolean");
      expect(typeof body.integrations.chain).toBe("boolean");
    } finally {
      server.close();
    }
  });
});
