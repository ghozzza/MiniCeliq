// Client-side category derivation for news items.
//
// Live RSS items arrive with no `category` from the backend (the field is
// optional and currently null), so we derive one on the client from the title.
// Pure function, no deps — keeps Feed's render path simple and testable.
import type { NewsItem } from "@/lib/api";

export type Category = "Stablecoins" | "Macro" | "DeFi" | "Markets";

export const CATEGORIES: readonly Category[] = [
  "Stablecoins",
  "Macro",
  "DeFi",
  "Markets",
] as const;

// Ordered keyword buckets. First bucket with a title match wins; "Markets" is the
// default catch-all (BTC/ETH/altcoin price, ETFs, funding rounds, exchanges, etc.).
const KEYWORDS: { category: Exclude<Category, "Markets">; terms: string[] }[] = [
  {
    category: "Stablecoins",
    terms: [
      "stablecoin",
      "usdc",
      "usdt",
      "usdm",
      "cusd",
      "tether",
      "circle",
      "depeg",
      "digital dollar",
      "payments rail",
    ],
  },
  {
    category: "Macro",
    terms: [
      "fed",
      "interest rate",
      "rate cut",
      "inflation",
      "cpi",
      "central bank",
      "treasury yield",
      "gdp",
      "recession",
      "jobs report",
      "ecb",
      "bank of england",
      "macro",
    ],
  },
  {
    category: "DeFi",
    terms: [
      "defi",
      "dex",
      "yield",
      "lending",
      "liquidity",
      "tvl",
      "protocol",
      "staking",
      "restaking",
      "perp",
      "vault",
      "real-world asset",
      "rwa",
    ],
  },
];

function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

// Return a normalized category for the item: trust `item.category` when it's
// already one of the four, otherwise derive from the lowercased title.
export function categoryOf(item: NewsItem): Category {
  if (item.category && isCategory(item.category)) return item.category;

  const title = item.title.toLowerCase();
  for (const { category, terms } of KEYWORDS) {
    if (terms.some((term) => title.includes(term))) return category;
  }
  return "Markets";
}
