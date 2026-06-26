"use client";

// Newspaper-style masthead for the in-app feed view: a thin double rule, today's
// date (formatted client-side), and an "Edition" issue label. Plus a slim,
// dismissible launch-promo strip in the gold accent — shown ONLY while the
// on-chain launch promo is still live, with its real cutoff date read from the
// contract's `promoEndsAt` (never hardcoded, so it can't outlive the promo).
// Mirrors the Celiq app's masthead pattern.
import { useEffect, useState } from "react";
import { readPromoEndsAt } from "@/lib/contract";

// e.g. "Tuesday · Jun 22, 2026"
function formatToday(now: Date): string {
  const weekday = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
  }).format(now);
  const date = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(now);
  return `${weekday} · ${date}`;
}

// Stable issue number from the day-of-year, so it reads like a real edition.
function issueNumber(now: Date): string {
  const start = Date.UTC(now.getFullYear(), 0, 0);
  const diff = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - start;
  const dayOfYear = Math.floor(diff / 86_400_000);
  return String(dayOfYear).padStart(3, "0");
}

// e.g. "Jun 30" — the promo cutoff, derived from the on-chain unix timestamp.
function formatCutoff(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function Masthead() {
  const now = new Date();
  const [promoOpen, setPromoOpen] = useState(true);

  // On-chain promo cutoff (unix seconds) + a mount-time clock, both effect-backed
  // so render stays pure (no Date.now() / contract read during render). Mirrors
  // the useCenyBalance / RenewalNudge house pattern.
  const [promoEndsAt, setPromoEndsAt] = useState<number | null>(null);
  const [nowSeconds, setNowSeconds] = useState<number | null>(null);

  useEffect(() => {
    setNowSeconds(Math.floor(Date.now() / 1000));
    let cancelled = false;
    readPromoEndsAt()
      .then((ends) => {
        if (!cancelled) setPromoEndsAt(Number(ends));
      })
      .catch(() => {
        // Read failed → treat as "no promo" so the strip never falsely claims one.
        if (!cancelled) setPromoEndsAt(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The promo is live only when the contract reports a cutoff still in the future.
  // Computing the label inside the null-check lets TS narrow `promoEndsAt`, and
  // doubles as the visibility gate (null ⇒ render no strip).
  const cutoffLabel =
    promoEndsAt !== null &&
    nowSeconds !== null &&
    promoEndsAt > 0 &&
    nowSeconds < promoEndsAt
      ? formatCutoff(promoEndsAt)
      : null;

  return (
    <div className="px-4 pt-4">
      {/* Thin double rule above the masthead line. */}
      <div className="border-t-[0.5px] border-ink" />
      <div className="mt-[3px] border-t-[0.5px] border-ink" />

      <div className="flex items-center justify-between gap-3 py-2">
        <span className="font-plex-mono num text-[10.5px] uppercase tracking-[0.12em] text-ink-2">
          {formatToday(now)}
        </span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Edition · No. <span className="font-plex-mono num">{issueNumber(now)}</span>
        </span>
      </div>

      <div className="border-t-[0.5px] border-ink" />

      {/* Launch-promo strip (gold accent) — only while the on-chain promo is live,
          dismissible per session. Cutoff date comes from `promoEndsAt`, not a
          hardcoded string, so it disappears the moment the promo lapses. */}
      {promoOpen && cutoffLabel && (
        <div className="mt-3 flex items-center justify-between gap-3 border-l-2 border-gold bg-gold/[0.08] py-2 pl-3 pr-2">
          <p className="text-[12px] leading-snug text-ink-2">
            <span className="font-semibold uppercase tracking-[0.06em] text-gold">
              Launch promo
            </span>{" "}
            ·{" "}
            <span className="font-plex-mono num">$0.10/mo</span> until{" "}
            <span className="font-plex-mono num">{cutoffLabel}</span>
          </p>
          <button
            type="button"
            onClick={() => setPromoOpen(false)}
            aria-label="Dismiss promo"
            className="-mr-1 shrink-0 px-2 py-1 text-[14px] leading-none text-ink-muted transition-colors active:text-ink"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
