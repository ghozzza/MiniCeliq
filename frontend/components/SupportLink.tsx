// In-app support link (MiniPay requires a reachable support channel).
// Target comes from NEXT_PUBLIC_SUPPORT_URL; falls back to a mailto.
import { copy } from "@/lib/copy";

const SUPPORT_URL =
  process.env.NEXT_PUBLIC_SUPPORT_URL ?? "mailto:ghoza60@gmail.com";

export function SupportLink({ className }: { className?: string }) {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={copy.support.aria}
      className={
        className ??
        "font-medium text-accent no-underline transition-colors duration-[120ms] hover:text-ink"
      }
    >
      {copy.support.label}
    </a>
  );
}
