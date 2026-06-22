"use client";

// Home: feed + summary sheet + paywall + subscribe sheet, wired to MiniPay state.
import { useState } from "react";
import { useMiniPay } from "@/hooks/useMiniPay";
import { useSubscription } from "@/hooks/useSubscription";
import { Feed } from "@/components/Feed";
import { SummaryCard } from "@/components/SummaryCard";
import { Paywall } from "@/components/Paywall";
import { SubscribeSheet } from "@/components/SubscribeSheet";
import { copy } from "@/lib/copy";
import { shortAddress } from "@/lib/viem";
import type { NewsItem } from "@/lib/api";

export default function HomePage() {
  const { address, isMiniPay, isLoading, preferred } = useMiniPay();
  const { isActive, expiry, refresh: refreshSub } = useSubscription(address);

  const [openItem, setOpenItem] = useState<NewsItem | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);

  // Outside MiniPay: zero-click connect is impossible → show fallback (no Connect button).
  if (!isLoading && !isMiniPay) {
    return <OpenInMiniPay />;
  }

  return (
    <div>
      {/* Status strip: subscription state, never a raw 0x as the primary identifier */}
      <div className="flex items-center justify-between bg-emerald-50 px-4 py-2 text-xs">
        <span className="font-medium text-emerald-800">{copy.feed.title}</span>
        {address && (
          <span className="text-emerald-700">
            {isActive ? (
              <>
                {copy.subscribe.activeTitle}
                {expiry
                  ? ` · ${copy.subscribe.activeUntil} ${formatDate(expiry)}`
                  : ""}
              </>
            ) : (
              <span title={shortAddress(address)}>{copy.paywall.freeNote}</span>
            )}
          </span>
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
          }}
        />
      )}
    </div>
  );
}

// Fallback shown when not running inside MiniPay (never a Connect Wallet button).
function OpenInMiniPay() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <h1 className="text-lg font-semibold text-gray-900">
        {copy.openInMiniPay.title}
      </h1>
      <p className="mt-2 max-w-xs text-sm text-gray-500">
        {copy.openInMiniPay.body}
      </p>
      <a
        href="https://link.minipay.xyz/discover"
        className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white"
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
