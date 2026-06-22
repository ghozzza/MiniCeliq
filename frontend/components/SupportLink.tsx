// In-app support link (MiniPay requires a reachable support channel).
// Target comes from NEXT_PUBLIC_SUPPORT_URL; falls back to a mailto.
import { copy } from "@/lib/copy";

const SUPPORT_URL =
  process.env.NEXT_PUBLIC_SUPPORT_URL ?? "mailto:support@miniceliq.app";

export function SupportLink({ className }: { className?: string }) {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={copy.support.aria}
      className={className ?? "text-sm text-emerald-700 hover:underline"}
    >
      {copy.support.label}
    </a>
  );
}
