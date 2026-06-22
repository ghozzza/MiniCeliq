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
  "Write a plain-English summary using ONLY the text you are given in the user " +
  "message. Do not invent facts. " +
  "Output the summary text and nothing else: no preamble, no labels, no quotes, " +
  "no hype, no emojis, no markdown. " +
  "Never reference a URL, link, web page, or article location. " +
  "Never mention yourself, the model, or any limitation. " +
  "Never write phrases like \"I don't have access\", \"based on the headline alone\", " +
  "\"as an AI\", \"unable to\", \"cannot access\", or any meta-commentary about what " +
  "you can or cannot do. If the input is thin, still write a confident, neutral " +
  "summary from what is provided.";

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

// Build the user prompt. We deliberately never include the raw URL: handing the
// model a link makes it try to "fetch" the page and then disclaim that it can't.
//   - With article body text → ask for a 2-3 sentence (~60 word) summary of that
//     text only.
//   - With only a title → ask for a short neutral context note that expands the
//     headline.
function buildPrompt(article: NewsItem | null, fallbackTitle?: string): string {
  const title = article?.title ?? fallbackTitle ?? "(unknown)";
  const body = article?.content?.trim();

  if (body) {
    return (
      `Title: ${title}\n` +
      (article?.source ? `Source: ${article.source}\n` : "") +
      `\nArticle text:\n${body}\n\n` +
      "Summarize the article text above in 2-3 short sentences (max ~60 words), " +
      "plain English, no hype, no emojis. Cover what happened and why it matters."
    );
  }

  return (
    `Headline: ${title}\n` +
    (article?.source ? `Source: ${article.source}\n` : "") +
    "\nWrite a neutral 1-2 sentence context note that expands this headline into " +
    "plain language. Do not speculate beyond the headline."
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
