"use client";

// Newspaper-style masthead for the in-app feed view: a thin double rule, today's
// date (formatted client-side), and an "Edition" issue label. Plus a slim,
// dismissible launch-promo strip in the gold accent. Pure editorial furniture —
// no data flow, no behavior change. Mirrors the Celiq app's masthead pattern.
import { useState } from "react";

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

export function Masthead() {
  const now = new Date();
  const [promoOpen, setPromoOpen] = useState(true);

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

      {/* Launch-promo strip (gold accent), dismissible per session. */}
      {promoOpen && (
        <div className="mt-3 flex items-center justify-between gap-3 border-l-2 border-gold bg-gold/[0.08] py-2 pl-3 pr-2">
          <p className="text-[12px] leading-snug text-ink-2">
            <span className="font-semibold uppercase tracking-[0.06em] text-gold">
              Launch promo
            </span>{" "}
            ·{" "}
            <span className="font-plex-mono num">$0.10/mo</span> until Jun 30
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
