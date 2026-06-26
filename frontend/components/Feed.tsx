"use client";

// The free headline list. Everyone sees full headlines; tapping one opens the
// AI summary (which the backend gates by free quota / on-chain subscription).
// Editorial styling mirrors Celiq's news rows: uppercase meta + serif headline.
//
// Decoration only (no behavior change): a calm stat ribbon, a featured lead story
// with a serif drop cap, and a subtle fade-up reveal on the rows. All motion is
// disabled under prefers-reduced-motion (see globals.css).
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchNews, type NewsItem } from "@/lib/api";
import { categoryOf, CATEGORIES, type Category } from "@/lib/category";
import { sentimentOf, SENTIMENTS, type Sentiment } from "@/lib/sentiment";
import { copy } from "@/lib/copy";
import { formatRelative } from "@/lib/time";

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

// Horizontal, scrollable filter chip bar. Two leading, visually-distinct
// "special" chips come first — accent-toned "For You" (personalized) then
// gold-toned "Saved" (with a count) — followed by "All" plus only the categories
// actually present in the current items. The topic chips mirror the
// SubscribeSheet token selector styling (active = accent, inactive = strong-rule
// outline); the special chips are set apart by a leading glyph + their own tint.
type Filter = Category | "All" | "Saved" | "For You";

function FilterBar({
  present,
  active,
  onSelect,
  savedCount,
}: {
  present: Category[];
  active: Filter;
  onSelect: (f: Filter) => void;
  savedCount: number;
}) {
  const chips: Filter[] = ["All", ...present];
  const savedActive = active === "Saved";
  const forYouActive = active === "For You";
  return (
    <div
      role="tablist"
      aria-label={copy.feed.filterAria}
      className="flex gap-2 overflow-x-auto border-b-[0.5px] border-rule px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* Leading, personalized For-You chip — accent-toned (a soft accent outline
          when idle so it reads as "special", solid accent when active). */}
      <button
        type="button"
        role="tab"
        aria-selected={forYouActive}
        aria-label={copy.feed.forYouAria}
        onClick={() => onSelect("For You")}
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-[0.5px] px-3 py-1.5 text-[12px] font-medium transition-colors duration-[120ms] ${
          forYouActive
            ? "border-accent bg-accent-soft text-ink"
            : "border-accent/40 text-accent hover:border-accent"
        }`}
      >
        <SparkGlyph filled={forYouActive} />
        {copy.feed.forYouFilter}
      </button>
      {/* Leading, visually-distinct Saved chip — gold-toned, with a live count. */}
      <button
        type="button"
        role="tab"
        aria-selected={savedActive}
        aria-label={copy.feed.savedAria}
        onClick={() => onSelect("Saved")}
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-[0.5px] px-3 py-1.5 text-[12px] font-medium transition-colors duration-[120ms] ${
          savedActive
            ? "border-gold bg-gold/[0.12] text-ink"
            : "border-rule-strong text-ink-2 hover:text-ink"
        }`}
      >
        <BookmarkGlyph filled={savedActive} />
        {copy.feed.savedFilter}
        {savedCount > 0 && (
          <span className="font-plex-mono num text-[11px] text-ink-muted">
            {savedCount}
          </span>
        )}
      </button>
      {chips.map((chip) => {
        const isActive = chip === active;
        return (
          <button
            key={chip}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(chip)}
            className={`shrink-0 whitespace-nowrap border-[0.5px] px-3 py-1.5 text-[12px] font-medium transition-colors duration-[120ms] ${
              isActive
                ? "border-accent bg-accent-soft text-ink"
                : "border-rule-strong text-ink-2 hover:text-ink"
            }`}
          >
            {chip === "All" ? copy.feed.filterAll : chip}
          </button>
        );
      })}
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

type SentimentFilter = Sentiment | "All";

// Second filter dimension, kept visually distinct from the square topic chips:
// a leading "Tone" micro-label plus pill-shaped, color-coded chips (each with a
// tone dot). Composes with the category filter + search. Default "All".
function SentimentBar({
  active,
  onSelect,
}: {
  active: SentimentFilter;
  onSelect: (s: SentimentFilter) => void;
}) {
  const chips: SentimentFilter[] = ["All", ...SENTIMENTS];
  return (
    <div
      role="tablist"
      aria-label={copy.feed.sentimentAria}
      className="flex items-center gap-2 overflow-x-auto border-b-[0.5px] border-rule px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        {copy.feed.sentimentLabel}
      </span>
      {chips.map((chip) => {
        const isActive = chip === active;
        const tone = chip === "All" ? null : TONE[chip];
        const activeCls = tone
          ? `${tone.border} ${tone.softBg} ${tone.text}`
          : "border-accent bg-accent-soft text-ink";
        return (
          <button
            key={chip}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(chip)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[0.5px] px-2.5 py-1 text-[11px] font-medium transition-colors duration-[120ms] ${
              isActive ? activeCls : "border-rule-strong text-ink-2 hover:text-ink"
            }`}
          >
            {tone && (
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            )}
            {chip === "All" ? copy.feed.sentimentAll : chip}
          </button>
        );
      })}
    </div>
  );
}

// Compact, editorial headline search: a single thin-rule underlined field with a
// clear (×) affordance once there's text. Filters the feed by title (case-
// insensitive) and composes with the topic filter. Lightweight — no debounce
// (the list is small), search is pure render state.
function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="border-b-[0.5px] border-rule px-4 py-2.5">
      <div className="flex items-center gap-2 border-b-[0.5px] border-rule-strong pb-1.5">
        <input
          type="text"
          inputMode="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={copy.feed.searchPlaceholder}
          aria-label={copy.feed.searchAria}
          className="min-w-0 flex-1 bg-transparent text-[14px] leading-none text-ink placeholder:text-ink-muted focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={copy.feed.searchClear}
            className="-mr-1 shrink-0 px-1.5 py-0.5 text-[14px] leading-none text-ink-muted transition-colors active:text-ink"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

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
  const [filter, setFilter] = useState<Filter>("All");
  // Second filter dimension — market tone, composes with category + search.
  const [sentiment, setSentiment] = useState<SentimentFilter>("All");
  // Pure render state — filters the feed by title, composing with `filter`.
  const [query, setQuery] = useState("");
  // For-You only: whether the inline interest picker is showing (vs the feed).
  const [pickerOpen, setPickerOpen] = useState(false);

  // Filter selection from the chip bar. Entering For-You with nothing chosen yet
  // opens the picker; any other selection (or For-You with topics) shows the feed.
  const handleSelectFilter = (f: Filter) => {
    setFilter(f);
    setPickerOpen(f === "For You" && !interestsSet);
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

  // Categories actually present in the current feed, in canonical order. Chips
  // reflect this set, so a chip can never yield an empty list (defensive copy
  // below still handles it). Re-derives whenever a refetch swaps `items`.
  const present = useMemo<Category[]>(() => {
    if (!items) return [];
    const seen = new Set(items.map(categoryOf));
    return CATEGORIES.filter((c) => seen.has(c));
  }, [items]);

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

  // "Saved" and "For You" are always valid selections; for a category chip, fall
  // back to "All" if a refetch dropped the only story of that category (so the
  // topic filter never renders an empty list).
  const activeFilter: Filter =
    filter === "Saved" || filter === "For You"
      ? filter
      : filter !== "All" && !present.includes(filter)
        ? "All"
        : filter;

  const onSaved = activeFilter === "Saved";
  const onForYou = activeFilter === "For You";
  // Show the picker when For-You is active and either the user opened it (Edit /
  // fresh entry) or there's nothing chosen yet (a safety net — For-You with no
  // topics can only ever be the picker).
  const showPicker = onForYou && (pickerOpen || !interestsSet);
  // Search + tone act on a live feed: keep them in the For-You feed view, but hide
  // them in the Saved list and while the picker is open (no feed to filter yet).
  const showFilters = !onSaved && !showPicker;

  // Saved view shows the bookmarked list as-is (bypassing topic/tone/search).
  // Otherwise compose: keep items matching the active topic (a single category, or
  // — under For-You — any of the chosen interests) AND tone AND the search query
  // (case-insensitive title match). Either way, the first survivor becomes the lead
  // and the rest render as compact rows — identical layout.
  const q = query.trim().toLowerCase();
  const visible = onSaved
    ? saved
    : items.filter((item) => {
        const inCategory =
          activeFilter === "All"
            ? true
            : onForYou
              ? interests.includes(categoryOf(item))
              : categoryOf(item) === activeFilter;
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
      : q || activeFilter !== "All" || sentiment !== "All"
        ? copy.feed.noMatches
        : copy.feed.empty;

  return (
    <div>
      <StatRibbon headlines={items.length} />

      {/* Headline search + tone filter act on the live feed only — hidden in the
          Saved view and while the For-You picker is open. */}
      {showFilters && <SearchBar value={query} onChange={setQuery} />}

      {/* Topic filter chips — leading For-You + Saved chips, then categories. */}
      <FilterBar
        present={present}
        active={activeFilter}
        onSelect={handleSelectFilter}
        savedCount={saved.length}
      />

      {showFilters && <SentimentBar active={sentiment} onSelect={setSentiment} />}

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
    </div>
  );
}
