"use client";

// The free headline list. Everyone sees full headlines; tapping one opens the
// AI summary (which the backend gates by free quota / on-chain subscription).
// Editorial styling mirrors Celiq's news rows: uppercase meta + serif headline.
import { useEffect, useState } from "react";
import { fetchNews, type NewsItem } from "@/lib/api";
import { copy } from "@/lib/copy";

interface FeedProps {
  onOpenSummary: (item: NewsItem) => void;
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

  return (
    <ul className="px-4">
      {items.map((item) => (
        <li key={item.id}>
          <button
            onClick={() => onOpenSummary(item)}
            className="group block w-full border-b-[0.5px] border-rule py-4 text-left last:border-b-0 active:bg-accent-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.09em] text-ink-muted">
              <span>{item.source}</span>
              {item.category && (
                <>
                  <span aria-hidden>·</span>
                  <span>{item.category}</span>
                </>
              )}
            </span>
            <span className="block text-[15.5px] font-medium leading-[1.4] text-ink transition-colors duration-[120ms] group-hover:text-accent">
              {item.title}
            </span>
            <span className="mt-1.5 block text-[11px] font-medium uppercase tracking-[0.09em] text-accent">
              {copy.feed.readSummary} →
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
