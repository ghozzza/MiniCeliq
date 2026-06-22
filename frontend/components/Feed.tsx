"use client";

// The free headline list. Everyone sees full headlines; tapping one opens the
// AI summary (which the backend gates by free quota / on-chain subscription).
// Editorial styling mirrors Celiq's news rows: uppercase meta + serif headline.
//
// Decoration only (no behavior change): a calm stat ribbon, a featured lead story
// with a serif drop cap, and a subtle fade-up reveal on the rows. All motion is
// disabled under prefers-reduced-motion (see globals.css).
import { useEffect, useState } from "react";
import { fetchNews, type NewsItem } from "@/lib/api";
import { copy } from "@/lib/copy";

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

// Editorial source · category meta line.
function MetaLine({ item }: { item: NewsItem }) {
  return (
    <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.09em] text-ink-muted">
      <span>{item.source}</span>
      {item.category && (
        <>
          <span aria-hidden>·</span>
          <span>{item.category}</span>
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

  useEffect(() => {
    let cancelled = false;
    fetchNews()
      .then(({ items }) => {
        if (!cancelled) setItems(items);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
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

  const [lead, ...rest] = items;

  return (
    <div>
      <StatRibbon headlines={items.length} />

      {/* Featured lead story — editorial hierarchy above the compact list. */}
      <LeadStory item={lead} index={0} onOpen={onOpenSummary} />

      <ul className="px-4">
        {rest.map((item, i) => (
          <li key={item.id}>
            <CompactRow item={item} index={i + 1} onOpen={onOpenSummary} />
          </li>
        ))}
      </ul>
    </div>
  );
}
