"use client";

// Bottom-sheet style card that shows an AI summary for a tapped headline.
// If the server gates the request (free quota used), the parent shows the Paywall.
// Editorial styling: serif article title, uppercase meta, thin rules.
import { useEffect, useState } from "react";
import { fetchSummary, type NewsItem } from "@/lib/api";
import { sentimentOf, type Sentiment } from "@/lib/sentiment";
import { copy } from "@/lib/copy";
import { formatPublished } from "@/lib/time";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

interface SummaryCardProps {
  item: NewsItem;
  address: string | null;
  // Saved-articles store (lifted to HomePage) — reflects + flips this article.
  isSaved: (id: string) => boolean;
  onToggleSave: (item: NewsItem) => void;
  onClose: () => void;
  // Called when the server reports the free quota is exhausted.
  onGated: () => void;
}

// Bookmark glyph — outline by default, filled when the article is saved.
function BookmarkGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
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

export function SummaryCard({
  item,
  address,
  isSaved,
  onToggleSave,
  onClose,
  onGated,
}: SummaryCardProps) {
  // Freeze the page behind the sheet (mounted only while open).
  useBodyScrollLock();

  const saved = isSaved(item.id);
  const [summary, setSummary] = useState<string | null>(null);
  // "What it means" implication block — present only when the loaded summary
  // carries one (absent on mock / legacy-cached summaries).
  const [artinya, setArtinya] = useState<string | null>(null);
  // LLM-classified tone for the loaded summary; null until it arrives.
  const [llmSentiment, setLlmSentiment] = useState<Sentiment | null>(null);
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

  // Native share opens the OS share sheet (it hands off cleanly and does NOT trap
  // MiniPay's webview the way an external <a> would). Where it's unavailable, fall
  // back to copying the link — same confirmation as the copy button.
  async function share() {
    if (!hasUrl) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: item.title, url: item.url });
      } catch {
        /* user dismissed the share sheet or it failed — no-op */
      }
      return;
    }
    await copyLink();
  }

  // Prefer the LLM's read of the body once the summary loads (more accurate than
  // the headline-keyword guess); fall back to sentimentOf(item) until then.
  const sentiment = llmSentiment ?? sentimentOf(item);
  const tone =
    sentiment === "Bullish"
      ? { text: "text-pos", dot: "bg-pos" }
      : sentiment === "Bearish"
        ? { text: "text-neg", dot: "bg-neg" }
        : { text: "text-ink-muted", dot: "bg-ink-muted" };

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
        setArtinya(res.artinya ?? null);
        setLlmSentiment(res.sentiment ?? null);
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
          <span aria-hidden>·</span>
          <span className={`inline-flex items-center gap-1 ${tone.text}`}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            {sentiment}
          </span>
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

        {/* "What it means" — the implication block (Celiq's "Artinya"), shown
            only once a summary with one has loaded. Thin top rule + accent kicker. */}
        {summary !== null && !error && artinya && (
          <div className="mt-4 border-t-[0.5px] border-rule pt-3">
            <p className="mb-1 text-[11px] uppercase tracking-[0.09em] text-accent">
              {copy.summary.whatItMeans}
            </p>
            <p className="text-[14px] leading-[1.6] text-ink-2">{artinya}</p>
          </div>
        )}

        {summary !== null && !error && (
          <p className="mt-3 text-[11px] text-ink-muted">
            {copy.summary.poweredBy}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {/* Save / Saved toggle — always available (even without an article URL). */}
          <button
            onClick={() => onToggleSave(item)}
            aria-pressed={saved}
            aria-label={saved ? copy.summary.unsaveAria : copy.summary.saveAria}
            className={`inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.09em] transition-colors active:text-ink ${
              saved ? "text-ink" : "text-accent"
            }`}
          >
            <BookmarkGlyph filled={saved} />
            {saved ? copy.summary.saved : copy.summary.save}
          </button>
          {hasUrl && (
            <>
              <button
                onClick={share}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.09em] text-accent transition-colors active:text-ink"
              >
                {copy.summary.share}
              </button>
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.09em] text-accent transition-colors active:text-ink"
              >
                {copied ? copy.summary.copied : copy.summary.copyLink}
              </button>
            </>
          )}
        </div>

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
