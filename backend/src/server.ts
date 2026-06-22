// Import env FIRST — the side-effect validates process.env at boot. Invalid
// vars cause process.exit(1) before any other module loads, so a misconfigured
// deploy fails fast instead of crashing mid-request. Integrations are
// optional (graceful degradation), so a fresh deploy with zero secrets still
// boots and serves /api/health.
import { env } from "./config/env";
import app from "./app";
import { startCronJobs } from "./jobs";

app.listen(env.PORT, () => {
  console.log(`[SERVER] Running on http://localhost:${env.PORT}`);
  console.log(`[SERVER] Environment: ${env.NODE_ENV}`);
  startCronJobs();
});
