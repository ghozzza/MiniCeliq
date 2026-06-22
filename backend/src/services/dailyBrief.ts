// Morning AI Brief service (subscriber perk). Generates ONE digest per UTC day
// from the day's top headlines, caches it in Supabase (+ an in-memory fallback),
// and serves it from cache thereafter. Only generated on demand for active
// on-chain subscribers — the route never calls this for free/locked requests, so
// free users can't trigger LLM cost.
//
// Graceful degradation mirrors the rest of the backend:
//   - Supabase absent / read fails → in-memory Map cache (single-instance).
//   - LLM unconfigured or the news fetch fails → returns null (route degrades).
// Single-flight: concurrent first-requests for the same day await one promise.

import { supabase } from "../lib/supabase";
import { getNews } from "./rssNews";
import { generateLLM } from "./aiSummary";

const BRIEF_TABLE = "daily_brief";
const HEADLINE_COUNT = 12;
const MAX_OUTPUT_TOKENS = 360;

// Same refusal-proof rules as aiSummary, framed for a morning digest. Neutral,
// plain English, grouped by theme, no hype/emoji/preamble.
const SYSTEM_PROMPT =
  "You are a concise crypto + macro news editor writing a morning brief for a " +
  "mobile app. You ALWAYS return a brief. You never refuse, never apologize, never " +
  "ask for more text, and never comment on how much information you were given. " +
  "Write 4-6 short sentences (or 4-5 tight bullet lines) covering the day's most " +
  "important stories, grouped by theme where useful. Use the provided headlines and " +
  "sources; if detail is thin, summarize confidently using general background — but " +
  "do not invent specific facts (no fabricated numbers, names, dates, or quotes). " +
  "Neutral, plain English, no hype, no emojis, no markdown, no preamble or sign-off. " +
  "Output only the brief itself. Never reference a URL, link, web page, the source " +
  "list, your own access, or yourself. Never write phrases like \"I cannot\", " +
  "\"I can't\", \"I don't have\", \"no actual content\", \"please provide\", \"the text " +
  "provided\", \"only headlines\", \"as an AI\", \"unable to\", or \"based on the headlines\".";

export interface DailyBrief {
  day: string; // YYYY-MM-DD (UTC)
  brief: string;
  generatedAt: string; // ISO 8601
}

// In-memory fallback cache (per UTC day), used when Supabase is absent or errors.
const memoryBriefs = new Map<string, DailyBrief>();

// Single-flight: one in-progress generation per day so concurrent first-requests
// share a single LLM call instead of each triggering their own.
const inFlight = new Map<string, Promise<DailyBrief | null>>();

function utcDay(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

async function readCachedBrief(day: string): Promise<DailyBrief | null> {
  const db = supabase();
  if (db) {
    const { data, error } = await db
      .from(BRIEF_TABLE)
      .select("brief_day, brief, generated_at")
      .eq("brief_day", day)
      .maybeSingle();
    if (!error && data) {
      return {
        day: data.brief_day as string,
        brief: data.brief as string,
        generatedAt: data.generated_at as string,
      };
    }
    if (error) {
      console.warn(`[BRIEF] supabase read failed, using memory: ${error.message}`);
    }
  }
  return memoryBriefs.get(day) ?? null;
}

async function writeCachedBrief(day: string, brief: DailyBrief, model: string): Promise<void> {
  const db = supabase();
  if (db) {
    const { error } = await db.from(BRIEF_TABLE).upsert(
      {
        brief_day: day,
        brief: brief.brief,
        model,
        generated_at: brief.generatedAt,
      },
      { onConflict: "brief_day" }
    );
    if (error) {
      console.warn(`[BRIEF] cache write failed, using memory: ${error.message}`);
    }
  }
  // Always seed the memory cache too, so a single instance keeps serving fast.
  memoryBriefs.set(day, brief);
}

// Build the user prompt from the day's top headlines: title + source + a short
// content snippet when the feed provides one. We never include raw URLs.
function buildPrompt(items: Awaited<ReturnType<typeof getNews>>): string {
  const lines = items.map((it, i) => {
    const snippet = it.content?.trim();
    const tail = snippet ? ` — ${snippet.slice(0, 200)}` : "";
    return `${i + 1}. ${it.title} (${it.source})${tail}`;
  });
  return (
    "Today's top headlines:\n" +
    lines.join("\n") +
    "\n\nWrite the morning brief now."
  );
}

async function generate(day: string): Promise<DailyBrief | null> {
  let items: Awaited<ReturnType<typeof getNews>>;
  try {
    items = await getNews(HEADLINE_COUNT);
  } catch (err) {
    console.warn(`[BRIEF] news fetch failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
  if (items.length === 0) return null;

  let result: { text: string; model: string };
  try {
    result = await generateLLM(SYSTEM_PROMPT, buildPrompt(items), MAX_OUTPUT_TOKENS);
  } catch (err) {
    // LLM unconfigured (503) or upstream failure (502) — degrade to no brief.
    console.warn(`[BRIEF] generation failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }

  const brief: DailyBrief = {
    day,
    brief: result.text,
    generatedAt: new Date().toISOString(),
  };
  await writeCachedBrief(day, brief, result.model);
  return brief;
}

// Return today's brief, generating + caching it on first request. Returns null if
// it can't be produced (no news / LLM unconfigured / upstream failure) so the
// route can respond cleanly. Callers should only invoke this for premium users.
export async function getDailyBrief(): Promise<DailyBrief | null> {
  const day = utcDay();

  const cached = await readCachedBrief(day);
  if (cached) return cached;

  // Single-flight: reuse an in-progress generation for the same day.
  const existing = inFlight.get(day);
  if (existing) return existing;

  const job = generate(day).finally(() => {
    inFlight.delete(day);
  });
  inFlight.set(day, job);
  return job;
}
