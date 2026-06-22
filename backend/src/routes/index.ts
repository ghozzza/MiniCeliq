import { Router } from "express";
import healthRouter from "./health";
import newsRouter from "./news";
import summaryRouter from "./summary";
import subscriptionRouter from "./subscription";
import statsRouter from "./stats";

const router = Router();

// All routes are public. The only "auth" in MiniCeliq is the on-chain read-gate
// inside POST /api/news/summarize — MiniPay forbids message signing, so there is
// no SIWE/JWT (README §7 trust model).
router.use("/health", healthRouter);
router.use("/news", newsRouter); // GET / list  +  POST /summarize
router.use("/news", summaryRouter);
router.use("/subscription", subscriptionRouter);
router.use("/stats", statsRouter);

export default router;
