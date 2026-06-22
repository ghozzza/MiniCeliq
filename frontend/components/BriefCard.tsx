"use client";

// Morning Brief card — a once-daily AI digest of the day's top headlines, a perk
// for on-chain subscribers (sold to free users via a locked card).
//   - Subscriber + brief → an editorial card: accent kicker + date, serif body,
//     thin top rule (matches SummaryCard's styling language).
//   - Locked (free / not active) → an inviting card with an "Unlock" button.
//   - Loading → a slim skeleton. fetchBrief() returning null → render nothing.
import { useEffect, useState } from "react";
import { fetchBrief, type BriefResult } from "@/lib/api";
import { copy } from "@/lib/copy";

interface BriefCardProps {
  address: string | null;
  isActive: boolean;
  onSubscribe: () => void;
}

// "Sun, Jun 22" — compact, readable kicker date from the server's YYYY-MM-DD.
function formatBriefDate(day?: string): string {
  if (!day) return "";
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Render the brief body. Bullet/multi-line briefs split on newlines into stacked
// lines; a single paragraph renders as one block.
function BriefBody({ text }: { text: string }) {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return (
      <p className="font-newsreader text-[16px] leading-[1.6] text-ink-2">
        {text.trim()}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {lines.map((line, i) => {
        // Strip a leading bullet/dash/number marker; we render our own accent dot.
        const clean = line.replace(/^[-•*]\s*/, "").replace(/^\d+[.)]\s*/, "");
        return (
          <li
            key={i}
            className="font-newsreader flex gap-2 text-[15.5px] leading-[1.55] text-ink-2"
          >
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
            <span>{clean}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function BriefCard({ address, isActive, onSubscribe }: BriefCardProps) {
  const [data, setData] = useState<BriefResult | null | undefined>(undefined);

  // Fetch on mount + whenever address / active state changes (e.g. after a
  // successful subscribe the parent flips isActive → we re-fetch and unlock).
  useEffect(() => {
    let cancelled = false;
    setData(undefined); // back to loading on a re-fetch
    fetchBrief(address)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, isActive]);

  // Loading → slim skeleton.
  if (data === undefined) {
    return (
      <section className="border-b-[0.5px] border-rule px-4 py-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-accent-soft" />
        <div className="mt-3 h-3 w-full animate-pulse rounded bg-rule" />
        <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-rule" />
      </section>
    );
  }

  // Nothing to show (no API / network error) → render nothing.
  if (data === null) return null;

  // Locked: free / not active. Don't reveal a brief even if one slipped through.
  if (data.locked || !data.brief) {
    return (
      <section className="border-b-[0.5px] border-rule px-4 py-4">
        <div className="rounded-lg border-[0.5px] border-rule-strong bg-card p-4">
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
            <span aria-hidden>◆</span>
            <span>{copy.brief.lockedTitle}</span>
          </div>
          <p className="mt-2 text-[14px] leading-[1.5] text-ink-2">
            {copy.brief.lockedHint}
          </p>
          <button
            onClick={onSubscribe}
            className="mt-3 w-full bg-ink py-2.5 text-[13px] font-semibold text-warm transition-colors active:bg-accent"
          >
            {copy.brief.unlockCta}
          </button>
        </div>
      </section>
    );
  }

  // Subscriber + brief → editorial card.
  return (
    <section className="border-b-[0.5px] border-rule px-4 py-4">
      <div className="rounded-lg border-[0.5px] border-rule-strong bg-card p-4 shadow-[0_1px_3px_rgba(10,37,64,0.05)]">
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-accent">
          <span aria-hidden>◆</span>
          <span>{copy.brief.kicker}</span>
          {data.day && (
            <span className="ml-auto font-plex-mono num normal-case tracking-normal text-ink-muted">
              {formatBriefDate(data.day)}
            </span>
          )}
        </div>

        <div className="mt-3 border-t-[0.5px] border-rule pt-3">
          <BriefBody text={data.brief} />
        </div>

        <p className="mt-3 text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">
          {copy.brief.poweredBy}
        </p>
      </div>
    </section>
  );
}
