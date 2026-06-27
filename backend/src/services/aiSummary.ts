// AI summary service (README §7). Summarizes a news article via OpenRouter
// (Vercel AI SDK), caching the result by article id. Lazy provider init; throws
// AppError(503) when OPENROUTER_API_KEY is absent so the route degrades cleanly.
//
// Resilience: primary model → fallback model on transient upstream errors
// (429 / 5xx / 404 / timeout), mirroring Celiq's llmClient. Input errors
// (400/401/403) bubble up as a 502 AppError (no fallback).

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, APICallError } from "ai";
import { z } from "zod";
import { env, hasOpenRouter } from "../config/env";
import { AppError } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { getArticleById } from "./rssNews";
import type { NewsItem, Sentiment, SummaryRecord } from "../types";

const SUMMARY_TABLE = "news_summaries";
// Bumped from 320: the JSON envelope + the extra `artinya` block need more room
// than a bare summary did (mirrors Celiq's 400-token budget for the same shape).
const MAX_OUTPUT_TOKENS = 400;
const TIMEOUT_MS = 30_000;

// Structured-output prompt (mirrors Celiq's `{summary, artinya, sentiment}` shape,
// in English). The model returns ONE JSON object: a summary, an "artinya" /
// "what it means" implication block, and an LLM-classified market tone. Keeps the
// same refusal-proof + thin-content rules as the old plain-text summarizer.
const SYSTEM_PROMPT =
  "You are a concise crypto + macro news editor for a mobile app. " +
  "You ALWAYS return a result. You never refuse, never apologize, never ask " +
  "for more text, and never comment on how much information you were given. " +
  "Use the title plus any provided text; if the text is thin, expand the headline " +
  "into a confident, neutral summary using general background — but do not invent " +
  "specific facts (no fabricated numbers, names, dates, or quotes). " +
  "Never reference a URL, link, web page, the article's location, your own access, or " +
  "yourself. Never write phrases like \"I cannot\", \"I can't\", \"I don't have\", " +
  "\"no actual article content\", \"please provide\", \"the text provided\", \"only a " +
  "title\", \"as an AI\", \"unable to\", or \"based on the headline\".\n\n" +
  "Produce three fields:\n" +
  "1. summary — 2-3 short sentences (~50-80 words) of what happened, plain English, " +
  "no hype, no emojis, no markdown.\n" +
  "2. artinya — 1-2 sentences (~30-50 words) on what it MEANS / why it matters for a " +
  "retail reader: the impact or implication, NOT a restatement of the summary.\n" +
  "3. sentiment — classify the market tone as exactly one of \"Bullish\", \"Bearish\", " +
  "or \"Neutral\":\n" +
  "   - Bullish: price up, adoption, favorable regulation, positive supply shock, breakout.\n" +
  "   - Bearish: price down, regulatory crackdown, hack/breach, selloff, network issues.\n" +
  "   - Neutral: mixed/ambiguous signals, wait-and-see, governance talk, unclear impact.\n\n" +
  "Output ONLY valid JSON in exactly this shape, with no text before or after it:\n" +
  "{\"summary\": \"...\", \"artinya\": \"...\", \"sentiment\": \"Bullish|Bearish|Neutral\"}\n\n" +
  "If the body is a thin teaser, still produce a confident summary, a best-effort " +
  "artinya, and sentiment \"Neutral\". Never refuse.";

// Validates the parsed JSON envelope. `sentiment` is preprocessed to be tolerant
// of casing / minor variants (e.g. "bullish" → "Bullish"); anything unrecognized
// falls through to "Neutral". `artinya` is coerced to a string (empty if absent).
const summaryJsonSchema = z.object({
  summary: z.string().min(1),
  artinya: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string()),
  sentiment: z.preprocess(normalizeSentiment, z.enum(["Bullish", "Bearish", "Neutral"])),
});

// Map any model output (case-insensitive, with fallback) to the Sentiment enum.
// Also used when reading legacy cache rows whose `sentiment` column is null.
function normalizeSentiment(value: unknown): Sentiment {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "bullish") return "Bullish";
  if (v === "bearish") return "Bearish";
  return "Neutral";
}

// Parse the LLM's structured output. Strips ```json / ``` fences, JSON.parses,
// and validates with `summaryJsonSchema`. On ANY failure we fall back gracefully
// to a Neutral record built from the raw text, so the endpoint never errors.
function parseSummaryJson(raw: string): {
  summary: string;
  artinya: string;
  sentiment: Sentiment;
} {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    const parsed = summaryJsonSchema.parse(JSON.parse(cleaned));
    return {
      summary: parsed.summary.trim(),
      artinya: parsed.artinya.trim(),
      sentiment: parsed.sentiment,
    };
  } catch {
    // Not valid JSON (or failed validation) → keep whatever text we got as the
    // summary, no implication block, neutral tone. Never throw.
    return { summary: cleaned || raw.trim(), artinya: "", sentiment: "Neutral" };
  }
}

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
      .select("article_id, summary, artinya, sentiment, model, created_at")
      .eq("article_id", articleId)
      .maybeSingle();
    if (data) {
      return {
        articleId: data.article_id as string,
        summary: data.summary as string,
        // Legacy rows (pre-structured-output) have null artinya/sentiment.
        artinya: (data.artinya as string | null) ?? "",
        sentiment: normalizeSentiment(data.sentiment),
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
        artinya: record.artinya,
        sentiment: record.sentiment,
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
// The system prompt owns the JSON shape + field rules; the user prompt only
// supplies the content (full body vs. headline-only) and re-pins the output.
function buildPrompt(article: NewsItem | null, fallbackTitle?: string): string {
  const title = article?.title ?? fallbackTitle ?? "(unknown)";
  const source = article?.source;
  const body = article?.content?.trim() ?? "";
  // Generic RSS teasers ("Your day-ahead look for…") are too thin to summarize —
  // treat anything under ~80 chars as headline-only so the model expands the
  // headline instead of refusing for "no content".
  const hasBody = body.length >= 80;

  if (hasBody) {
    return (
      `Title: ${title}\n` +
      (source ? `Source: ${source}\n` : "") +
      `\nArticle text:\n${body}\n\n` +
      "Summarize the above and output JSON exactly as instructed."
    );
  }

  return (
    `Headline: ${title}\n` +
    (source ? `Source: ${source}\n` : "") +
    "\nThe full text is unavailable — work from the headline only. Be conservative: " +
    "if the headline is ambiguous, use sentiment \"Neutral\". Output JSON exactly as instructed."
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
  const { summary, artinya, sentiment } = parseSummaryJson(text);

  const record: SummaryRecord = {
    articleId,
    summary,
    artinya,
    sentiment,
    model,
    createdAt: new Date().toISOString(),
  };
  await writeCachedSummary(record);
  return record;
}
