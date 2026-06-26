// Client-side market-sentiment derivation for news items.
//
// Live RSS items carry no sentiment from the backend, so we infer a coarse
// market tone — Bullish / Bearish / Neutral — from the headline alone. Pure
// function, no deps; mirrors lib/category.ts's keyword-bucket approach so the
// Feed render path stays simple and testable.
//
// Difference from category.ts: several directional words are short and prone to
// false positives as raw substrings ("ath" in "weather", "down" in "shutdown",
// "ban" in "Lebanon"), so we match on WORD BOUNDARIES instead of bare includes.
// And because a single headline can carry both a bullish and a bearish word, the
// FIRST strong signal (earliest position in the title) wins; Neutral is default.
import type { NewsItem } from "@/lib/api";

export type Sentiment = "Bullish" | "Bearish" | "Neutral";

export const SENTIMENTS: readonly Sentiment[] = [
  "Bullish",
  "Bearish",
  "Neutral",
] as const;

// Directional keyword buckets (lowercase). Order within a bucket is irrelevant —
// only the earliest match position across both buckets decides the tone.
const BULLISH_TERMS = [
  "surge",
  "surges",
  "rally",
  "soar",
  "jump",
  "jumps",
  "gains",
  "gain",
  "ath",
  "all-time high",
  "record high",
  "adopts",
  "adoption",
  "approval",
  "approved",
  "raises",
  "raised",
  "partnership",
  "integration",
  "launch",
  "launches",
  "bullish",
  "breakout",
  "buys",
  "accumulates",
  "inflows",
  "upgrade",
  "green",
];

const BEARISH_TERMS = [
  "crash",
  "plunge",
  "plunges",
  "drop",
  "drops",
  "falls",
  "fall",
  "sinks",
  "hack",
  "hacked",
  "exploit",
  "exploited",
  "breach",
  "lawsuit",
  "sues",
  "sued",
  "ban",
  "banned",
  "warns",
  "warning",
  "dump",
  "liquidation",
  "liquidations",
  "outflow",
  "outflows",
  "bearish",
  "slump",
  "decline",
  "declines",
  "scam",
  "fraud",
  "sell-off",
  "selloff",
  "halt",
  "down",
];

// Build one word-boundary alternation per bucket. Our terms contain only letters,
// spaces and hyphens (all regex-safe), but we escape defensively anyway.
function buildMatcher(terms: string[]): RegExp {
  const alt = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(`\\b(?:${alt})\\b`, "i");
}

const BULLISH_RE = buildMatcher(BULLISH_TERMS);
const BEARISH_RE = buildMatcher(BEARISH_TERMS);

// Derive a coarse tone from the headline. First strong signal (earliest position
// in the title) wins; a bullish/bearish tie at the same index resolves bullish.
export function sentimentOf(item: NewsItem): Sentiment {
  const title = item.title.toLowerCase();
  const bull = BULLISH_RE.exec(title);
  const bear = BEARISH_RE.exec(title);
  if (bull && bear) return bull.index <= bear.index ? "Bullish" : "Bearish";
  if (bull) return "Bullish";
  if (bear) return "Bearish";
  return "Neutral";
}
