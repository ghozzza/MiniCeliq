"use client";

// Bottom-sheet style card that shows an AI summary for a tapped headline.
// If the server gates the request (free quota used), the parent shows the Paywall.
// Editorial styling: serif article title, uppercase meta, thin rules.
import { useEffect, useState } from "react";
import { fetchSummary, type NewsItem } from "@/lib/api";
import { copy } from "@/lib/copy";
import { formatPublished } from "@/lib/time";

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
  const [copied, setCopied] = useState(false);

  const hasUrl = Boolean(item.url && item.url !== "#");

  // No "open in browser": MiniPay's webview opens external links IN PLACE (replacing
  // the mini app, with no way back), so we never navigate out. Copying the link lets
  // the user open the original in their own browser later, without leaving MiniCeliq.
  async function copyLink() {
    if (!hasUrl) return;
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

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
      className="fixed inset-0 z-40 flex items-end bg-ink/40"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="mx-auto w-full max-w-md rounded-t-2xl border-t-[0.5px] border-rule-strong bg-card p-5 pb-7 shadow-[0_-8px_24px_rgba(10,37,64,0.10)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-rule-strong" />

        <p className="mb-1 text-[11px] uppercase tracking-[0.09em] text-accent">
          {copy.summary.title}
        </p>
        <h2 className="font-newsreader text-[20px] font-bold leading-[1.2] tracking-[-0.015em] text-ink">
          {item.title}
        </h2>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] uppercase tracking-[0.09em] text-ink-muted">
          <span>{item.source}</span>
          {item.publishedAt && (
            <>
              <span aria-hidden>·</span>
              <span className="font-plex-mono num normal-case tracking-normal">
                {formatPublished(item.publishedAt)}
              </span>
            </>
          )}
        </p>

        <div className="mt-4 min-h-20 border-t-[0.5px] border-rule pt-4 text-[15px] leading-[1.6] text-ink-2">
          {error ? (
            <p className="text-neg">{copy.summary.error}</p>
          ) : summary === null ? (
            <p className="animate-pulse text-ink-muted">
              {copy.summary.generating}
            </p>
          ) : (
            <p>{summary}</p>
          )}
        </div>

        {summary !== null && !error && (
          <p className="mt-3 text-[11px] text-ink-muted">
            {copy.summary.poweredBy}
          </p>
        )}

        {hasUrl && (
          <button
            onClick={copyLink}
            className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.09em] text-accent transition-colors active:text-ink"
          >
            {copied ? "Original link copied ✓" : "Copy original link"}
          </button>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full border-[0.5px] border-rule-strong bg-warm py-3 text-[14px] font-medium text-ink-2 transition-colors active:bg-rule"
        >
          Close
        </button>
      </div>
    </div>
  );
}
