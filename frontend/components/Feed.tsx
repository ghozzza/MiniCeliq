"use client";

// The free headline list. Everyone sees full headlines; tapping one opens the
// AI summary (which the backend gates by free quota / on-chain subscription).
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
    return <p className="px-4 py-8 text-sm text-gray-500">{copy.feed.error}</p>;
  }

  if (items === null) {
    return (
      <ul className="divide-y divide-gray-100">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="px-4 py-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
            <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-gray-100" />
          </li>
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return <p className="px-4 py-8 text-sm text-gray-500">{copy.feed.empty}</p>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {items.map((item) => (
        <li key={item.id}>
          <button
            onClick={() => onOpenSummary(item)}
            className="flex w-full flex-col items-start px-4 py-4 text-left active:bg-gray-50"
          >
            <span className="text-sm font-medium leading-snug text-gray-900">
              {item.title}
            </span>
            <span className="mt-1 flex items-center gap-2 text-xs text-gray-500">
              <span>{item.source}</span>
              {item.category && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                  {item.category}
                </span>
              )}
            </span>
            <span className="mt-1 text-[11px] font-medium text-emerald-700">
              {copy.feed.readSummary} →
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
