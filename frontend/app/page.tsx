"use client";

// Home: feed + summary sheet + paywall + subscribe sheet, wired to MiniPay state.
import { useState } from "react";
import { useMiniPay } from "@/hooks/useMiniPay";
import { useSubscription } from "@/hooks/useSubscription";
import { useCenyBalance } from "@/hooks/useCenyBalance";
import { Feed } from "@/components/Feed";
import { Masthead } from "@/components/Masthead";
import { SummaryCard } from "@/components/SummaryCard";
import { Paywall } from "@/components/Paywall";
import { SubscribeSheet } from "@/components/SubscribeSheet";
import { copy } from "@/lib/copy";
import { formatCeny } from "@/lib/contract";
import { shortAddress } from "@/lib/viem";
import type { NewsItem } from "@/lib/api";

export default function HomePage() {
  const { address, isMiniPay, isLoading, preferred } = useMiniPay();
  const { isActive, expiry, refresh: refreshSub } = useSubscription(address);
  const { balance: cenyBalance, refresh: refreshCeny } = useCenyBalance(address);

  const [openItem, setOpenItem] = useState<NewsItem | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);

  // Outside MiniPay: zero-click connect is impossible → show fallback (no Connect button).
  if (!isLoading && !isMiniPay) {
    return <OpenInMiniPay />;
  }

  return (
    <div>
      {/* Newspaper masthead: double rule + date + edition + launch-promo strip. */}
      <Masthead />

      {/* Section label + subscription state.
          Never a raw 0x as the primary identifier (kept in title attr only). */}
      <div className="border-b-[0.5px] border-rule px-4 pb-3 pt-4">
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-accent">
          {/* Live pulse dot = "live news". */}
          <span className="live-dot" aria-hidden />
          <span>{copy.feed.title}</span>
          {/* CENY reward balance pill — subtle, accent-toned, hidden at zero. */}
          {address && cenyBalance > 0n && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 normal-case tracking-normal text-accent">
              <span aria-hidden>◆</span>
              <span className="font-plex-mono num">{formatCeny(cenyBalance)}</span>{" "}
              {copy.reward.unit}
            </span>
          )}
        </div>
        <h1
          className="font-newsreader mt-1 text-[26px] font-bold leading-[1.1] tracking-[-0.02em] text-ink"
          style={{ textWrap: "balance" }}
        >
          Today&apos;s headlines
        </h1>
        {address && (
          <p className="mt-2 text-[12px] text-ink-2">
            {isActive ? (
              <span className="font-medium text-accent">
                {copy.subscribe.activeTitle}
                {expiry ? (
                  <span className="font-plex-mono num text-ink-muted">
                    {" "}
                    · {copy.subscribe.activeUntil} {formatDate(expiry)}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-ink-muted" title={shortAddress(address)}>
                {copy.paywall.freeNote}
              </span>
            )}
          </p>
        )}
      </div>

      <Feed onOpenSummary={(item) => setOpenItem(item)} />

      {openItem && (
        <SummaryCard
          key={openItem.id}
          item={openItem}
          address={address}
          onClose={() => setOpenItem(null)}
          onGated={() => {
            setOpenItem(null);
            // Already-active users shouldn't be gated, but guard anyway.
            if (!isActive) setShowPaywall(true);
          }}
        />
      )}

      {showPaywall && (
        <Paywall
          onClose={() => setShowPaywall(false)}
          onSubscribe={() => {
            setShowPaywall(false);
            setShowSubscribe(true);
          }}
        />
      )}

      {showSubscribe && address && (
        <SubscribeSheet
          address={address}
          preferred={preferred}
          onClose={() => setShowSubscribe(false)}
          onSubscribed={() => {
            refreshSub();
            // Subscribe mints a CENY reward — re-read so the pill updates.
            refreshCeny();
          }}
        />
      )}
    </div>
  );
}

// Fallback shown when not running inside MiniPay (never a Connect Wallet button).
function OpenInMiniPay() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-accent">
        MiniCeliq
      </p>
      <h1 className="font-newsreader text-[24px] font-bold leading-[1.15] tracking-[-0.015em] text-ink">
        {copy.openInMiniPay.title}
      </h1>
      <p className="mt-3 max-w-xs text-[15px] leading-[1.55] text-ink-2">
        {copy.openInMiniPay.body}
      </p>
      <a
        href="https://link.minipay.xyz/discover"
        className="mt-6 bg-ink px-6 py-3 text-[14px] font-semibold text-warm no-underline transition-colors hover:bg-accent"
      >
        {copy.openInMiniPay.cta}
      </a>
    </div>
  );
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
