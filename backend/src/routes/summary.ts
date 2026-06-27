import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { summarizeArticle } from "../services/aiSummary";
import { checkQuota, recordView } from "../services/summaryQuota";

const router = Router();

const bodySchema = z.object({
  // The article id from GET /api/news. Stable per article (sha1 of the URL).
  articleId: z.string().min(1).max(128),
  // The MiniPay address claimed by the client. Used for the read-gate
  // (isActive override) + free-tier quota. README §7 trust model: low-risk
  // address-spoofing is accepted for news content.
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x address"),
  // Optional title hint for articles not yet in the cache (fresh client payload).
  title: z.string().max(512).optional(),
});

// POST /api/news/summarize — gated AI summary (README §7).
//   - Free tier: SUMMARY_FREE_DAILY_LIMIT distinct articles/day per address.
//   - On-chain isActive(address) → unlimited (server read-gate).
//   - Over quota → HTTP 402 { code: "summary_quota_exceeded" }.
router.post("/summarize", async (req, res, next) => {
  try {
    const { articleId, address, title } = bodySchema.parse(req.body);

    const quota = await checkQuota(address, articleId);
    if (!quota.allowed) {
      throw new AppError(
        `Free summary quota exceeded (${quota.used}/${quota.limit} today). Subscribe for unlimited summaries.`,
        402,
        "summary_quota_exceeded"
      );
    }

    const record = await summarizeArticle(articleId, title);

    // Consume quota only for free-tier first views of an article. Premium
    // (unlimited) and re-views of an already-counted article don't consume.
    if (!quota.unlimited && !quota.alreadyViewed) {
      await recordView(address, articleId);
    }

    res.json({
      articleId: record.articleId,
      summary: record.summary,
      artinya: record.artinya,
      sentiment: record.sentiment,
      model: record.model,
      createdAt: record.createdAt,
      quota: {
        unlimited: quota.unlimited,
        // +1 reflects the view we just recorded (free, new article only).
        used: quota.unlimited
          ? null
          : quota.alreadyViewed
            ? quota.used
            : quota.used + 1,
        limit: quota.unlimited ? null : quota.limit,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
