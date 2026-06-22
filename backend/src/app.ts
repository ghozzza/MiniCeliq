import express from "express";
import cors from "cors";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimiter";

const app = express();

// Railway / reverse proxy — trust 1 hop so express-rate-limit reads the real
// client IP from X-Forwarded-For (not the load balancer's).
app.set("trust proxy", 1);

// CORS — allow the MiniCeliq frontend origin only (defaults to localhost in dev).
app.use(
  cors({
    origin: env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use("/api", apiLimiter);
app.use("/api", routes);
app.use(errorHandler);

export default app;
