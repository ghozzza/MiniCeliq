"use client";

// Shown when a free user runs out of daily AI summaries. Routes into SubscribeSheet.
// No crypto jargon — copy comes from lib/copy. Editorial Celiq styling.
import { copy } from "@/lib/copy";

interface PaywallProps {
  onSubscribe: () => void;
  onClose: () => void;
}

export function Paywall({ onSubscribe, onClose }: PaywallProps) {
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
          MiniCeliq Plus
        </p>
        <h2 className="font-newsreader text-[22px] font-bold leading-[1.15] tracking-[-0.015em] text-ink">
          {copy.paywall.title}
        </h2>
        <p className="mt-2 text-[15px] leading-[1.55] text-ink-2">
          {copy.paywall.body}
        </p>

        <button
          onClick={onSubscribe}
          className="mt-5 w-full bg-ink py-3 text-[14px] font-semibold text-warm transition-colors active:bg-accent"
        >
          {copy.paywall.cta}
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full py-3 text-[14px] font-medium text-ink-muted"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
