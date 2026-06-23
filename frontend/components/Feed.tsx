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
import { copy } from "@/lib/copy";
import { formatRelative } from "@/lib/time";

interface FeedProps {
  onOpenSummary: (item: NewsItem) => void;
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

// Horizontal, scrollable filter chip bar. "All" plus only the categories that
// are actually present in the current items. Mirrors the SubscribeSheet token
// selector chip styling (active = accent, inactive = strong-rule outline).
type Filter = Category | "All";

function FilterBar({
  present,
  active,
  onSelect,
}: {
  present: Category[];
  active: Filter;
  onSelect: (f: Filter) => void;
}) {
  const chips: Filter[] = ["All", ...present];
  return (
    <div
      role="tablist"
      aria-label={copy.feed.filterAria}
      className="flex gap-2 overflow-x-auto border-b-[0.5px] border-rule px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
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

// Editorial source · category · time meta line. Time is compact + relative
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

export function Feed({ onOpenSummary }: FeedProps) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("All");
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

  // The rendered list: all items, or just those in the selected category. The
  // first item of the filtered list becomes the lead story.
  const filtered = useMemo<NewsItem[]>(() => {
    if (!items) return [];
    if (filter === "All") return items;
    return items.filter((item) => categoryOf(item) === filter);
  }, [items, filter]);

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

  // If a refetch dropped the only story of the active category, the chip is gone
  // — fall back to "All" so we never render an empty filtered list.
  const activeFilter: Filter =
    filter !== "All" && !present.includes(filter) ? "All" : filter;
  const visible = activeFilter === "All" ? items : filtered;

  const [lead, ...rest] = visible;

  return (
    <div>
      <StatRibbon headlines={items.length} />

      {/* Topic filter chips — only categories present in the current feed. */}
      <FilterBar present={present} active={activeFilter} onSelect={setFilter} />

      {visible.length === 0 ? (
        <p className="px-4 py-10 text-[14px] text-ink-muted">{copy.feed.empty}</p>
      ) : (
        <>
          {/* Featured lead story — editorial hierarchy above the compact list. */}
          <LeadStory item={lead} index={0} onOpen={onOpenSummary} />

          <ul className="px-4">
            {rest.map((item, i) => (
              <li key={item.id}>
                <CompactRow item={item} index={i + 1} onOpen={onOpenSummary} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
