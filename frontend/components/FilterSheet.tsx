"use client";

// Bottom-sheet filter panel for the feed — holds the Category + Tone selectors
// off-screen until the toolbar's "Filter" button opens it (keeps the 360px header
// to just the mode tabs + a slim search/Filter row). Same sheet pattern as
// SummaryCard: a full-screen dimmed overlay that closes on tap, with a rounded-top
// card that swallows its own clicks. Selections apply live (the parent owns the
// state) — "Done" / overlay tap just closes; "Clear" resets both to All.
import { CATEGORIES, type Category } from "@/lib/category";
import { SENTIMENTS, type Sentiment } from "@/lib/sentiment";
import { copy } from "@/lib/copy";

export type CategoryFilter = Category | "All";
export type ToneFilter = Sentiment | "All";

// Per-tone color tokens — mirrors the old SentimentBar pills (Bullish = green,
// Bearish = red, Neutral = muted). `softBg` has no red design token, so Bearish
// uses a light arbitrary tint (matches Feed's inline tone styling).
const TONE: Record<
  Sentiment,
  { text: string; dot: string; softBg: string; border: string }
> = {
  Bullish: {
    text: "text-pos",
    dot: "bg-pos",
    softBg: "bg-accent-soft",
    border: "border-pos",
  },
  Bearish: {
    text: "text-neg",
    dot: "bg-neg",
    softBg: "bg-[#fdecec]",
    border: "border-neg",
  },
  Neutral: {
    text: "text-ink-muted",
    dot: "bg-ink-muted",
    softBg: "bg-rule",
    border: "border-rule-strong",
  },
};

interface FilterSheetProps {
  category: CategoryFilter;
  onCategory: (c: CategoryFilter) => void;
  tone: ToneFilter;
  onTone: (t: ToneFilter) => void;
  // For-You mode hides the Category section (the chosen interests already ARE the
  // category filter), leaving a Tone-only sheet.
  showCategory: boolean;
  onClear: () => void;
  onClose: () => void;
}

export function FilterSheet({
  category,
  onCategory,
  tone,
  onTone,
  showCategory,
  onClear,
  onClose,
}: FilterSheetProps) {
  const categories: CategoryFilter[] = ["All", ...CATEGORIES];
  const tones: ToneFilter[] = ["All", ...SENTIMENTS];
  // Clear is inert when nothing visible in this sheet is set (tone-only in For-You).
  const hasActive = (showCategory && category !== "All") || tone !== "All";

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-ink/40"
      role="dialog"
      aria-modal="true"
      aria-label={copy.feed.filterTitle}
      onClick={onClose}
    >
      <div
        className="mx-auto w-full max-w-md rounded-t-2xl border-t-[0.5px] border-rule-strong bg-card p-5 pb-7 shadow-[0_-8px_24px_rgba(10,37,64,0.10)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-rule-strong" />

        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.09em] text-accent">
            {copy.feed.filterTitle}
          </p>
          <button
            type="button"
            onClick={onClear}
            disabled={!hasActive}
            className="text-[11px] font-medium uppercase tracking-[0.09em] text-accent transition-opacity active:opacity-70 disabled:text-ink-muted disabled:opacity-60"
          >
            {copy.feed.filterClear}
          </button>
        </div>

        {/* Category — single-select; hidden in For-You (interests are the category). */}
        {showCategory && (
          <section className="mb-5">
            <p className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              {copy.feed.filterCategory}
            </p>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const isActive = c === category;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onCategory(c)}
                    className={`shrink-0 whitespace-nowrap border-[0.5px] px-3 py-1.5 text-[12px] font-medium transition-colors duration-[120ms] ${
                      isActive
                        ? "border-accent bg-accent-soft text-ink"
                        : "border-rule-strong text-ink-2 hover:text-ink"
                    }`}
                  >
                    {c === "All" ? copy.feed.filterAll : c}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Tone — single-select, color-coded pills with a leading tone dot. */}
        <section>
          <p className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            {copy.feed.filterTone}
          </p>
          <div className="flex flex-wrap gap-2">
            {tones.map((t) => {
              const isActive = t === tone;
              const toneToken = t === "All" ? null : TONE[t];
              const activeCls = toneToken
                ? `${toneToken.border} ${toneToken.softBg} ${toneToken.text}`
                : "border-accent bg-accent-soft text-ink";
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onTone(t)}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[0.5px] px-3 py-1.5 text-[12px] font-medium transition-colors duration-[120ms] ${
                    isActive
                      ? activeCls
                      : "border-rule-strong text-ink-2 hover:text-ink"
                  }`}
                >
                  {toneToken && (
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${toneToken.dot}`}
                    />
                  )}
                  {t === "All" ? copy.feed.filterAll : t}
                </button>
              );
            })}
          </div>
        </section>

        <button
          onClick={onClose}
          className="mt-6 w-full border-[0.5px] border-rule-strong bg-warm py-3 text-[14px] font-medium text-ink-2 transition-colors active:bg-rule"
        >
          {copy.feed.filterDone}
        </button>
      </div>
    </div>
  );
}
