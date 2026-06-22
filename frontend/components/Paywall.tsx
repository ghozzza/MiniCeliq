"use client";

// Shown when a free user runs out of daily AI summaries. Routes into SubscribeSheet.
// No crypto jargon — copy comes from lib/copy.
import { copy } from "@/lib/copy";

interface PaywallProps {
  onSubscribe: () => void;
  onClose: () => void;
}

export function Paywall({ onSubscribe, onClose }: PaywallProps) {
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
        <h2 className="text-lg font-semibold text-gray-900">
          {copy.paywall.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {copy.paywall.body}
        </p>

        <button
          onClick={onSubscribe}
          className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white active:bg-emerald-700"
        >
          {copy.paywall.cta}
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-xl py-3 text-sm font-medium text-gray-500"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
