"use client";

// Home: feed + summary sheet + paywall + subscribe sheet, wired to MiniPay state.
import { useEffect, useState } from "react";
import { useMiniPay } from "@/hooks/useMiniPay";
import { useSubscription } from "@/hooks/useSubscription";
import { useCenyBalance } from "@/hooks/useCenyBalance";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useInterests } from "@/hooks/useInterests";
import { Feed } from "@/components/Feed";
import { Masthead } from "@/components/Masthead";
import { BriefCard } from "@/components/BriefCard";
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
  // Single source of truth for saved articles — shared by the feed's Saved view
  // and the summary sheet's Save toggle, so a save from one reflects in the other.
  const { saved, isSaved, toggle: toggleSave } = useBookmarks();
  // Single source of truth for the For-You topics — read by the feed's filter and
  // the inline interest picker (consistent with how `saved` is lifted here).
  const {
    interests,
    hasInterest,
    toggle: toggleInterest,
    isSet: interestsSet,
  } = useInterests();

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

      {/* Renewal nudge — only in the final week of an active subscription. */}
      <RenewalNudge
        isActive={isActive}
        expiry={expiry}
        onRenew={() => setShowSubscribe(true)}
      />

      {/* Morning Brief — once-daily AI digest, a perk for subscribers. The card
          re-fetches when `isActive` flips, so it unlocks right after a subscribe. */}
      <BriefCard
        address={address}
        isActive={isActive}
        onSubscribe={() => setShowSubscribe(true)}
      />

      <Feed
        onOpenSummary={(item) => setOpenItem(item)}
        saved={saved}
        interests={interests}
        hasInterest={hasInterest}
        onToggleInterest={toggleInterest}
        interestsSet={interestsSet}
      />

      {openItem && (
        <SummaryCard
          key={openItem.id}
          item={openItem}
          address={address}
          isSaved={isSaved}
          onToggleSave={toggleSave}
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

// Gold-toned strip nudging an active subscriber to renew in their final week.
// Renewal stacks on-chain (the same subscribe flow extends the expiry), so the
// CTA simply reopens the SubscribeSheet. Hidden unless active AND ≤ 7 days out.
const RENEWAL_WINDOW_DAYS = 7;

function RenewalNudge({
  isActive,
  expiry,
  onRenew,
}: {
  isActive: boolean;
  expiry: number | null;
  onRenew: () => void;
}) {
  // Read "now" from state (set after mount) rather than calling Date.now() during
  // render — keeps render pure and avoids a server/client hydration mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
  }, [expiry]);

  if (!isActive || !expiry || now === null) return null;

  const secondsLeft = expiry - now;
  // Round up so the last partial day still reads "1 day", not "0 days".
  const daysLeft = Math.ceil(secondsLeft / 86_400);
  if (daysLeft <= 0 || daysLeft > RENEWAL_WINDOW_DAYS) return null;

  const dayWord = daysLeft === 1 ? copy.renewal.day : copy.renewal.days;

  return (
    <div className="px-4 pt-3">
      <div className="flex items-center justify-between gap-3 border-l-2 border-gold bg-gold/[0.08] py-2.5 pl-3 pr-2">
        <p className="text-[12.5px] leading-snug text-ink-2">
          {copy.renewal.expiresIn}{" "}
          <span className="font-plex-mono num font-semibold text-ink">
            {daysLeft}
          </span>{" "}
          {dayWord}
        </p>
        <button
          type="button"
          onClick={onRenew}
          className="shrink-0 bg-gold px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-warm transition-opacity active:opacity-80"
        >
          {copy.renewal.cta}
        </button>
      </div>
    </div>
  );
}
