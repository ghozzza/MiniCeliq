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
  "You ALWAYS return a short summary. You never refuse, never apologize, never ask " +
  "for more text, and never comment on how much information you were given. " +
  "Use the title plus any provided text; if the text is thin, expand the headline " +
  "into a confident, neutral summary using general background — but do not invent " +
  "specific facts (no fabricated numbers, names, dates, or quotes). " +
  "Output only the summary itself: no preamble, labels, quotes, hype, emojis, or markdown. " +
  "Never reference a URL, link, web page, the article's location, your own access, or " +
  "yourself. Never write phrases like \"I cannot\", \"I can't\", \"I don't have\", " +
  "\"no actual article content\", \"please provide\", \"the text provided\", \"only a " +
  "title\", \"as an AI\", \"unable to\", or \"based on the headline\".";

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

// Single-model call: same provider, timeout, and no-retry policy as the summary
// path, but with a caller-supplied system prompt + token budget. Shared so other
// LLM features (e.g. the daily brief) reuse the OpenRouter provider setup without
// duplicating the API-key logic.
async function callModelWith(
  modelId: string,
  system: string,
  prompt: string,
  maxOutputTokens: number
): Promise<string> {
  const p = getProvider();
  const result = await generateText({
    model: p(modelId),
    system,
    prompt,
    maxOutputTokens,
    temperature: 0.4,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    maxRetries: 0, // we own the fallback chain
  });
  return result.text.trim();
}

// Run a prompt through the primary → fallback model chain (transient errors only
// trigger the fallback), returning the generated text plus which model produced
// it. Reused by features that need their own system prompt / token budget but the
// same provider + resilience as `summarizeArticle`. Throws AppError(503) when
// OpenRouter is unconfigured, AppError(502) on a non-transient or exhausted chain.
export async function generateLLM(
  system: string,
  prompt: string,
  maxOutputTokens: number
): Promise<{ text: string; model: string }> {
  if (!hasOpenRouter()) {
    throw new AppError("AI not configured (OPENROUTER_API_KEY)", 503);
  }

  const primary = env.LLM_PRIMARY_MODEL;
  const fallback = env.LLM_FALLBACK_MODEL;

  try {
    return { text: await callModelWith(primary, system, prompt, maxOutputTokens), model: primary };
  } catch (err) {
    if (!isTransient(err) || fallback === primary) {
      throw new AppError(
        `LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
        502
      );
    }
    console.warn(`[AI] primary ${primary} failed, falling back to ${fallback}`);
    try {
      return { text: await callModelWith(fallback, system, prompt, maxOutputTokens), model: fallback };
    } catch (fallbackErr) {
      throw new AppError(
        `LLM call failed (primary + fallback): ${
          fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        }`,
        502
      );
    }
  }
}

// Build the user prompt. We deliberately never include the raw URL: handing the
// model a link makes it try to "fetch" the page and then disclaim that it can't.
//   - With article body text → ask for a 2-3 sentence (~60 word) summary of that
//     text only.
//   - With only a title → ask for a short neutral context note that expands the
//     headline.
function buildPrompt(article: NewsItem | null, fallbackTitle?: string): string {
  const title = article?.title ?? fallbackTitle ?? "(unknown)";
  const source = article?.source;
  const body = article?.content?.trim() ?? "";
  // Generic RSS teasers ("Your day-ahead look for…") are too thin to summarize —
  // treat anything under ~80 chars as headline-only so the model rewrites the
  // headline instead of refusing for "no content".
  const hasBody = body.length >= 80;

  if (hasBody) {
    return (
      `Title: ${title}\n` +
      (source ? `Source: ${source}\n` : "") +
      `\nArticle text:\n${body}\n\n` +
      "Summarize the above in 2-3 short sentences (max ~60 words), plain English, " +
      "no hype, no emojis. Cover what happened and why it matters."
    );
  }

  return (
    `Headline: ${title}\n` +
    (source ? `Source: ${source}\n` : "") +
    "\nRewrite this headline into ONE neutral, plain-language sentence (max 25 words) " +
    "that a reader understands at a glance. Output only that sentence."
  );
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

  const { text, model } = await generateLLM(SYSTEM_PROMPT, prompt, MAX_OUTPUT_TOKENS);

  const record: SummaryRecord = {
    articleId,
    summary: text,
    model,
    createdAt: new Date().toISOString(),
  };
  await writeCachedSummary(record);
  return record;
}
