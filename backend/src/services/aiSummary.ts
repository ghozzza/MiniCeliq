// AI summary service (README §7). Summarizes a news article via OpenRouter
// (Vercel AI SDK), caching the result by article id. Lazy provider init; throws
// AppError(503) when OPENROUTER_API_KEY is absent so the route degrades cleanly.
//
// Resilience: primary model → fallback model on transient upstream errors
// (429 / 5xx / 404 / timeout), mirroring Celiq's llmClient. Input errors
// (400/401/403) bubble up as a 502 AppError (no fallback).

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, APICallError } from "ai";
import { env, hasOpenRouter } from "../config/env";
import { AppError } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { getArticleById } from "./rssNews";
import type { NewsItem, SummaryRecord } from "../types";

const SUMMARY_TABLE = "news_summaries";
const MAX_OUTPUT_TOKENS = 320;
const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT =
  "You are a concise crypto + macro news editor for a mobile app. " +
  "Summarize the article in 2-3 short sentences (max ~60 words), plain English, " +
  "no hype, no emojis. Focus on what happened and why it matters. " +
  "If you only have the headline, expand it into a neutral one-line context note.";

// In-memory summary cache, used when Supabase is not configured.
const memorySummaries = new Map<string, SummaryRecord>();

let provider: ReturnType<typeof createOpenRouter> | null = null;

function getProvider(): ReturnType<typeof createOpenRouter> {
  if (!provider) {
    provider = createOpenRouter({
      apiKey: env.OPENROUTER_API_KEY as string,
      headers: {
        "HTTP-Referer": env.FRONTEND_URL ?? "https://miniceliq.app",
        "X-Title": "MiniCeliq",
      },
    });
  }
  return provider;
}

async function readCachedSummary(articleId: string): Promise<SummaryRecord | null> {
  const db = supabase();
  if (db) {
    const { data } = await db
      .from(SUMMARY_TABLE)
      .select("article_id, summary, model, created_at")
      .eq("article_id", articleId)
      .maybeSingle();
    if (data) {
      return {
        articleId: data.article_id as string,
        summary: data.summary as string,
        model: data.model as string,
        createdAt: data.created_at as string,
      };
    }
    return null;
  }
  return memorySummaries.get(articleId) ?? null;
}

async function writeCachedSummary(record: SummaryRecord): Promise<void> {
  const db = supabase();
  if (db) {
    const { error } = await db.from(SUMMARY_TABLE).upsert(
      {
        article_id: record.articleId,
        summary: record.summary,
        model: record.model,
        created_at: record.createdAt,
      },
      { onConflict: "article_id" }
    );
    if (error) {
      console.warn(`[AI] summary cache write failed, using memory: ${error.message}`);
      memorySummaries.set(record.articleId, record);
    }
    return;
  }
  memorySummaries.set(record.articleId, record);
}

// True if the error is a transient upstream failure worth a fallback attempt.
function isTransient(err: unknown): boolean {
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return true;
  }
  if (APICallError.isInstance(err)) {
    const s = err.statusCode;
    if (s === 429 || s === 404) return true;
    return typeof s === "number" && s >= 500 && s < 600;
  }
  if (err instanceof Error && /network|fetch|socket|econnreset|enotfound/i.test(err.message)) {
    return true;
  }
  return false;
}

async function callModel(modelId: string, prompt: string): Promise<string> {
  const p = getProvider();
  const result = await generateText({
    model: p(modelId),
    system: SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.4,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    maxRetries: 0, // we own the fallback chain
  });
  return result.text.trim();
}

function buildPrompt(article: NewsItem | null, fallbackTitle?: string): string {
  if (article) {
    return `Title: ${article.title}\nSource: ${article.source}\nURL: ${article.url}\n\nSummarize this article.`;
  }
  return `Title: ${fallbackTitle ?? "(unknown)"}\n\nSummarize this headline.`;
}

// Summarize an article by id, using the cache when present. `titleHint` lets the
// caller pass a title for articles not in the cache (e.g. a fresh client payload).
export async function summarizeArticle(
  articleId: string,
  titleHint?: string
): Promise<SummaryRecord> {
  const cached = await readCachedSummary(articleId);
  if (cached) return cached;

  if (!hasOpenRouter()) {
    throw new AppError("AI summaries not configured (OPENROUTER_API_KEY)", 503);
  }

  const article = await getArticleById(articleId);
  const prompt = buildPrompt(article, titleHint);

  const primary = env.LLM_PRIMARY_MODEL;
  const fallback = env.LLM_FALLBACK_MODEL;

  let text: string;
  let usedModel: string;
  try {
    text = await callModel(primary, prompt);
    usedModel = primary;
  } catch (err) {
    if (!isTransient(err) || fallback === primary) {
      throw new AppError(
        `LLM summary failed: ${err instanceof Error ? err.message : String(err)}`,
        502
      );
    }
    console.warn(`[AI] primary ${primary} failed, falling back to ${fallback}`);
    try {
      text = await callModel(fallback, prompt);
      usedModel = fallback;
    } catch (fallbackErr) {
      throw new AppError(
        `LLM summary failed (primary + fallback): ${
          fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        }`,
        502
      );
    }
  }

  const record: SummaryRecord = {
    articleId,
    summary: text,
    model: usedModel,
    createdAt: new Date().toISOString(),
  };
  await writeCachedSummary(record);
  return record;
}
