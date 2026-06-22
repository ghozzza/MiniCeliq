"use client";

// Bottom-sheet style card that shows an AI summary for a tapped headline.
// If the server gates the request (free quota used), the parent shows the Paywall.
import { useEffect, useState } from "react";
import { fetchSummary, type NewsItem } from "@/lib/api";
import { copy } from "@/lib/copy";

interface SummaryCardProps {
  item: NewsItem;
  address: string | null;
  onClose: () => void;
  // Called when the server reports the free quota is exhausted.
  onGated: () => void;
}

export function SummaryCard({
  item,
  address,
  onClose,
  onGated,
}: SummaryCardProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState(false);

  // Fetch on mount. The parent keys this component by item.id, so a new article
  // remounts fresh — no synchronous state reset needed here.
  useEffect(() => {
    let cancelled = false;
    fetchSummary(item.id, address)
      .then((res) => {
        if (cancelled) return;
        if (res.gated) {
          onGated();
          return;
        }
        setSummary(res.summary);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, address, onGated]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-white p-5 pb-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
        <h2 className="text-base font-semibold leading-snug text-gray-900">
          {item.title}
        </h2>
        <p className="mt-1 text-xs text-gray-500">{item.source}</p>

        <div className="mt-4 min-h-20 text-sm leading-relaxed text-gray-800">
          {error ? (
            <p className="text-red-600">{copy.summary.error}</p>
          ) : summary === null ? (
            <p className="animate-pulse text-gray-400">
              {copy.summary.generating}
            </p>
          ) : (
            <p>{summary}</p>
          )}
        </div>

        {summary !== null && !error && (
          <p className="mt-3 text-[11px] text-gray-400">
            {copy.summary.poweredBy}
          </p>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-gray-100 py-3 text-sm font-medium text-gray-700 active:bg-gray-200"
        >
          Close
        </button>
      </div>
    </div>
  );
}
