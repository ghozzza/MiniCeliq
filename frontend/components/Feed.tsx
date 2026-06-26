"use client";

// The free headline list. Everyone sees full headlines; tapping one opens the
// AI summary (which the backend gates by free quota / on-chain subscription).
// Editorial styling mirrors Celiq's news rows: uppercase meta + serif headline.
//
// Decoration only (no behavior change): a calm stat ribbon, a featured lead story
// with a serif drop cap, and a subtle fade-up reveal on the rows. All motion is
// disabled under prefers-reduced-motion (see globals.css).
import { useEffect, useRef, useState } from "react";
import { fetchNews, type NewsItem } from "@/lib/api";
import { categoryOf, CATEGORIES, type Category } from "@/lib/category";
import { sentimentOf, type Sentiment } from "@/lib/sentiment";
import { copy } from "@/lib/copy";
import { formatRelative } from "@/lib/time";
import {
  FilterSheet,
  type CategoryFilter,
  type ToneFilter,
} from "@/components/FilterSheet";

// The feed's view selector. Picks WHAT list to show; the FilterSheet (category +
// tone) and the search box then narrow it. Default "Latest".
type Mode = "Latest" | "For You" | "Saved";

interface FeedProps {
  onOpenSummary: (item: NewsItem) => void;
  // Saved articles (lifted to HomePage). Powers the "Saved" filter view + count.
  saved: NewsItem[];
  // For-You personalization (lifted to HomePage — single source of truth). The
  // feed filters to these when "For You" is active; the inline picker toggles them.
  interests: Category[];
  hasInterest: (c: Category) => boolean;
  onToggleInterest: (c: Category) => void;
  interestsSet: boolean;
}

// Thin hairline band of calm, mostly-static figures under the masthead.
function StatRibbon({ headlines }: { headlines: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-[0.5px] border-rule px-4 py-2 text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">
      <span className="font-plex-mono num">USDm $1.00</span>
      <span aria-hidden>·</span>
      <span className="font-plex-mono num">Promo $0.10/mo</span>
      <span aria-hidden>·</span>
      <span>
        <span className="font-plex-mono num text-ink-2">{headlines}</span>{" "}
        headlines
      </span>
    </div>
  );
}

// Bookmark glyph — outline by default, filled when the Saved view is active.
function BookmarkGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3"
      aria-hidden
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
    >
      <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1z" />
    </svg>
  );
}

// Sparkle glyph — marks the personalized "For You" chip. Outline by default,
// filled when the For-You view is active (mirrors the bookmark glyph's pattern).
function SparkGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3"
      aria-hidden
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
    >
      <path d="M12 2.5l1.9 5.8 5.8 1.9-5.8 1.9L12 17.9l-1.9-5.8L4.3 10l5.8-1.9L12 2.5z" />
    </svg>
  );
}

// Mode tabs — the single compact view selector that replaces the old mixed chip
// bar. Three equal segments: Latest (default) · For You (sparkle) · Saved
// (bookmark + live count). Active segment = accent fill; the rest = strong-rule
// outline. Equal-width so the whole row fits a 360px screen without scrolling.
function ModeTabs({
  active,
  onSelect,
  savedCount,
}: {
  active: Mode;
  onSelect: (m: Mode) => void;
  savedCount: number;
}) {
  const tabs: { mode: Mode; label: string }[] = [
    { mode: "Latest", label: copy.feed.modeLatest },
    { mode: "For You", label: copy.feed.modeForYou },
    { mode: "Saved", label: copy.feed.modeSaved },
  ];
  return (
    <div
      role="tablist"
      aria-label={copy.feed.modeAria}
      className="flex gap-1.5 border-b-[0.5px] border-rule px-4 py-2.5"
    >
      {tabs.map(({ mode, label }) => {
        const isActive = mode === active;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(mode)}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-[0.5px] px-2 py-1.5 text-[12.5px] font-medium transition-colors duration-[120ms] ${
              isActive
                ? "border-accent bg-accent-soft text-ink"
                : "border-rule-strong text-ink-2 hover:text-ink"
            }`}
          >
            {mode === "For You" && <SparkGlyph filled={isActive} />}
            {mode === "Saved" && <BookmarkGlyph filled={isActive} />}
            {label}
            {mode === "Saved" && savedCount > 0 && (
              <span className="font-plex-mono num text-[11px] text-ink-muted">
                {savedCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Sliders glyph for the Filter button.
function FilterGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

// Slim toolbar: a compact headline search (underlined field + clear ×) on the
// left and a "Filter" button on the right that opens the FilterSheet. The Filter
// button carries an accent count badge whenever any category/tone filter is set.
function Toolbar({
  query,
  onQuery,
  onOpenFilter,
  activeCount,
}: {
  query: string;
  onQuery: (v: string) => void;
  onOpenFilter: () => void;
  activeCount: number;
}) {
  return (
    <div className="flex items-stretch gap-2 border-b-[0.5px] border-rule px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2 border-b-[0.5px] border-rule-strong pb-1.5">
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={copy.feed.searchPlaceholder}
          aria-label={copy.feed.searchAria}
          className="min-w-0 flex-1 bg-transparent text-[14px] leading-none text-ink placeholder:text-ink-muted focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label={copy.feed.searchClear}
            className="-mr-0.5 shrink-0 px-1 py-0.5 text-[14px] leading-none text-ink-muted transition-colors active:text-ink"
          >
            ×
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onOpenFilter}
        aria-label={
          activeCount > 0
            ? `${copy.feed.filterButton}, ${activeCount} ${copy.feed.filterActiveAria}`
            : copy.feed.filterButton
        }
        className={`flex shrink-0 items-center gap-1.5 self-stretch border-[0.5px] px-3 text-[12px] font-medium transition-colors duration-[120ms] ${
          activeCount > 0
            ? "border-accent bg-accent-soft text-ink"
            : "border-rule-strong text-ink-2 hover:text-ink"
        }`}
      >
        <FilterGlyph />
        {copy.feed.filterButton}
        {activeCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-plex-mono num text-[10px] leading-none text-warm">
            {activeCount}
          </span>
        )}
      </button>
    </div>
  );
}

// Per-tone color tokens. Bullish = green (pos), Bearish = red (neg), Neutral =
// muted. `softBg` has no design token for red, so it uses a light arbitrary tint.
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

// Inline interest picker for the For-You view — a tidy accent-tinted panel (not a
// full-screen step). A short prompt + the four categories as toggle chips (reusing
// the topic-chip styling) + a "Done" affordance. Only four chips, so they wrap
// rather than scroll. Toggling persists immediately (lifted store); "Done" closes
// the panel and is inert until at least one topic is chosen (an empty For-You feed
// would have nothing to show).
function InterestPicker({
  hasInterest,
  onToggle,
  onDone,
  isSet,
}: {
  hasInterest: (c: Category) => boolean;
  onToggle: (c: Category) => void;
  onDone: () => void;
  isSet: boolean;
}) {
  return (
    <div className="border-b-[0.5px] border-rule bg-accent-soft/30 px-4 py-3.5">
      <p className="text-[12.5px] leading-snug text-ink-2">
        {copy.feed.forYouPrompt}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const on = hasInterest(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(c)}
              className={`shrink-0 whitespace-nowrap border-[0.5px] px-3 py-1.5 text-[12px] font-medium transition-colors duration-[120ms] ${
                on
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-rule-strong text-ink-2 hover:text-ink"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onDone}
          disabled={!isSet}
          className="text-[11px] font-medium uppercase tracking-[0.09em] text-accent transition-opacity active:opacity-70 disabled:text-ink-muted disabled:opacity-60"
        >
          {copy.feed.forYouDone}
        </button>
      </div>
    </div>
  );
}

// Thin contextual strip above the For-You feed: the chosen topics (truncated) plus
// a compact "Edit" affordance that reopens the picker.
function ForYouHeader({
  interests,
  onEdit,
}: {
  interests: Category[];
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b-[0.5px] border-rule px-4 py-2">
      <span className="min-w-0 truncate text-[10.5px] uppercase tracking-[0.09em] text-ink-muted">
        {copy.feed.forYouTopics}{" "}
        <span className="normal-case tracking-normal text-ink-2">
          {interests.join(", ")}
        </span>
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-[11px] font-medium uppercase tracking-[0.09em] text-accent transition-opacity active:opacity-70"
      >
        {copy.feed.forYouEdit}
      </button>
    </div>
  );
}

// Subtle inline tone badge: a colored dot + uppercase word, tinted by sentiment
// (Bullish = green, Bearish = red, Neutral = muted). Sits inside the meta line.
function SentimentTag({ sentiment }: { sentiment: Sentiment }) {
  const tone = TONE[sentiment];
  return (
    <span className={`inline-flex items-center gap-1 ${tone.text}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {sentiment}
    </span>
  );
}

// Editorial source · category · time · tone meta line. Time is compact + relative
// (e.g. "3h ago") in a mono face to match the editorial number styling.
function MetaLine({ item }: { item: NewsItem }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] uppercase tracking-[0.09em] text-ink-muted">
      <span>{item.source}</span>
      {item.category && (
        <>
          <span aria-hidden>·</span>
          <span>{item.category}</span>
        </>
      )}
      {item.publishedAt && (
        <>
          <span aria-hidden>·</span>
          <span className="font-plex-mono num normal-case tracking-normal">
            {formatRelative(item.publishedAt)}
          </span>
        </>
      )}
      <span aria-hidden>·</span>
      <SentimentTag sentiment={sentimentOf(item)} />
    </span>
  );
}

// The first story, rendered dominant: bigger serif title + a drop cap.
function LeadStory({
  item,
  index,
  onOpen,
}: {
  item: NewsItem;
  index: number;
  onOpen: (item: NewsItem) => void;
}) {
  const initial = item.title.charAt(0);
  const rest = item.title.slice(1);
  return (
    <button
      onClick={() => onOpen(item)}
      style={{ animationDelay: `${index * 55}ms` }}
      className="fade-up group block w-full border-b-[0.5px] border-rule px-4 pb-5 pt-5 text-left active:bg-accent-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="mb-2 block">
        <MetaLine item={item} />
      </span>
      <span className="font-newsreader block text-[24px] font-bold leading-[1.15] tracking-[-0.015em] text-ink transition-colors duration-[120ms] group-hover:text-accent">
        <span
          className="float-left mr-2 mt-1 font-newsreader text-[52px] font-extrabold leading-[0.72] text-accent"
          aria-hidden
        >
          {initial}
        </span>
        {rest}
      </span>
      <span className="mt-3 block text-[11px] font-medium uppercase tracking-[0.09em] text-accent">
        {copy.feed.readSummary} →
      </span>
    </button>
  );
}

// Compact secondary row.
function CompactRow({
  item,
  index,
  onOpen,
}: {
  item: NewsItem;
  index: number;
  onOpen: (item: NewsItem) => void;
}) {
  return (
    <button
      onClick={() => onOpen(item)}
      style={{ animationDelay: `${index * 55}ms` }}
      className="fade-up group block w-full border-b-[0.5px] border-rule py-4 text-left last:border-b-0 active:bg-accent-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="mb-1 block">
        <MetaLine item={item} />
      </span>
      <span className="block text-[15.5px] font-medium leading-[1.4] text-ink transition-colors duration-[120ms] group-hover:text-accent">
        {item.title}
      </span>
      <span className="mt-1.5 block text-[11px] font-medium uppercase tracking-[0.09em] text-accent">
        {copy.feed.readSummary} →
      </span>
    </button>
  );
}

export function Feed({
  onOpenSummary,
  saved,
  interests,
  hasInterest,
  onToggleInterest,
  interestsSet,
}: FeedProps) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState(false);
  // The view selector (Latest / For You / Saved). Default "Latest".
  const [mode, setMode] = useState<Mode>("Latest");
  // FilterSheet selections — a single category + a market tone, both composing
  // with search. Live state; the sheet just edits these and closes.
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [sentiment, setSentiment] = useState<ToneFilter>("All");
  // Pure render state — filters the feed by title, composing with category + tone.
  const [query, setQuery] = useState("");
  // Whether the FilterSheet bottom sheet is open.
  const [sheetOpen, setSheetOpen] = useState(false);
  // For-You only: whether the inline interest picker is showing (vs the feed).
  const [pickerOpen, setPickerOpen] = useState(false);

  // Mode switch from the tabs. Entering For-You with nothing chosen yet opens the
  // interest picker; any other switch (or For-You with topics) shows the feed.
  // Always close the sheet so it can't linger into the Saved view.
  const handleSelectMode = (m: Mode) => {
    setMode(m);
    setSheetOpen(false);
    setPickerOpen(m === "For You" && !interestsSet);
  };
  // Tracks whether we've ever loaded, so a failed *background* refresh never
  // blanks a feed we already have on screen.
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchNews()
        .then(({ items: next }) => {
          if (cancelled) return;
          loadedRef.current = true;
          setItems(next);
          setError(false);
        })
        .catch(() => {
          // Only surface an error on the very first load; a transient poll/refresh
          // failure keeps the last good feed (and its relative times) on screen.
          if (!cancelled && !loadedRef.current) setError(true);
        });
    };

    load();

    // MiniPay has no pull-to-refresh / reload button, so keep the feed fresh on its
    // own: poll every 90s while visible, and re-fetch the instant the app regains
    // focus after the user has been idle or backgrounded.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 90_000);
    const onFocus = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (error) {
    return (
      <p className="px-4 py-10 text-[14px] text-ink-muted">{copy.feed.error}</p>
    );
  }

  if (items === null) {
    return (
      <div className="px-4 py-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-b-[0.5px] border-rule py-4 last:border-b-0">
            <div className="h-3 w-1/3 animate-pulse rounded bg-accent-soft" />
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-rule" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="px-4 py-10 text-[14px] text-ink-muted">{copy.feed.empty}</p>
    );
  }

  const onSaved = mode === "Saved";
  const onForYou = mode === "For You";
  const onLatest = mode === "Latest";
  // Show the picker when For-You is active and either the user opened it (Edit /
  // fresh entry) or there's nothing chosen yet (a safety net — For-You with no
  // topics can only ever be the picker).
  const showPicker = onForYou && (pickerOpen || !interestsSet);
  // The slim search + Filter toolbar acts on a live feed: keep it in the For-You
  // feed view, but hide it in the Saved list and while the picker is open.
  const showToolbar = !onSaved && !showPicker;
  // Count of active sheet filters for the Filter button badge. Category only
  // applies in Latest (For-You replaces it with the chosen interests); tone always.
  const activeFilterCount =
    (onLatest && category !== "All" ? 1 : 0) + (sentiment !== "All" ? 1 : 0);

  // Saved view shows the bookmarked list as-is (bypassing category/tone/search).
  // Otherwise compose: keep items matching the category (a single chosen one, or —
  // under For-You — any of the chosen interests) AND tone AND the search query
  // (case-insensitive title match). Either way, the first survivor becomes the lead
  // and the rest render as compact rows — identical layout.
  const q = query.trim().toLowerCase();
  const visible = onSaved
    ? saved
    : items.filter((item) => {
        const inCategory = onForYou
          ? interests.includes(categoryOf(item))
          : category === "All" || categoryOf(item) === category;
        const inSentiment = sentiment === "All" || sentimentOf(item) === sentiment;
        const inSearch = q === "" || item.title.toLowerCase().includes(q);
        return inCategory && inSentiment && inSearch;
      });

  const [lead, ...rest] = visible;

  const emptyMessage = onSaved
    ? copy.feed.savedEmpty
    : onForYou
      ? q || sentiment !== "All"
        ? copy.feed.noMatches
        : copy.feed.forYouEmpty
      : q || category !== "All" || sentiment !== "All"
        ? copy.feed.noMatches
        : copy.feed.empty;

  return (
    <div>
      <StatRibbon headlines={items.length} />

      {/* View selector — Latest · For You · Saved. */}
      <ModeTabs
        active={mode}
        onSelect={handleSelectMode}
        savedCount={saved.length}
      />

      {/* Slim search + Filter row — live-feed views only (not Saved / picker). */}
      {showToolbar && (
        <Toolbar
          query={query}
          onQuery={setQuery}
          onOpenFilter={() => setSheetOpen(true)}
          activeCount={activeFilterCount}
        />
      )}

      {showPicker ? (
        <InterestPicker
          hasInterest={hasInterest}
          onToggle={onToggleInterest}
          onDone={() => setPickerOpen(false)}
          isSet={interestsSet}
        />
      ) : (
        <>
          {/* For-You feed: contextual topics strip + Edit affordance. */}
          {onForYou && (
            <ForYouHeader
              interests={interests}
              onEdit={() => setPickerOpen(true)}
            />
          )}

          {visible.length === 0 ? (
            <p className="px-4 py-10 text-[14px] text-ink-muted">{emptyMessage}</p>
          ) : (
            <>
              {/* Featured lead story — editorial hierarchy above the compact list. */}
              <LeadStory item={lead} index={0} onOpen={onOpenSummary} />

              <ul className="px-4">
                {rest.map((item, i) => (
                  <li key={item.id}>
                    <CompactRow
                      item={item}
                      index={i + 1}
                      onOpen={onOpenSummary}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {/* Category + Tone selectors, parked off-screen until "Filter" opens them.
          In For-You the Category section is hidden (interests are the category). */}
      {sheetOpen && (
        <FilterSheet
          category={category}
          onCategory={setCategory}
          tone={sentiment}
          onTone={setSentiment}
          showCategory={onLatest}
          onClear={() => {
            setCategory("All");
            setSentiment("All");
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}
