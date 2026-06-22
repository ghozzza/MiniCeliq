// Terms of Service (Server Component) — required for MiniPay listing.
// Placeholder legal copy; replace with reviewed text before launch.
// Editorial Celiq styling.
import type { Metadata } from "next";
import { APP_NAME } from "@/lib/copy";

export const metadata: Metadata = {
  title: `Terms — ${APP_NAME}`,
};

export default function TermsPage() {
  return (
    <article className="px-4 py-7">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-accent">
        Legal
      </div>
      <h1 className="font-newsreader mt-1 text-[28px] font-bold leading-[1.08] tracking-[-0.02em] text-ink">
        Terms of Service
      </h1>
      <p className="font-plex-mono num mt-2 text-[11px] uppercase tracking-[0.06em] text-ink-muted">
        Last updated: 2026-06-22
      </p>

      <Section title="1. The service">
        {APP_NAME} provides a curated stablecoin and macro news feed with
        AI-generated summaries. A premium tier unlocks unlimited summaries and a
        daily brief, paid as a recurring subscription in stablecoins.
      </Section>

      <Section title="2. Subscriptions and payments">
        Subscriptions are recorded on-chain. Payments are made directly from your
        wallet to a treasury address; {APP_NAME} never holds your funds. A launch
        promotional price may apply for a limited time and reverts automatically
        afterward. All sales are final once a transaction is confirmed on-chain.
      </Section>

      <Section title="3. Independence from MiniPay">
        {APP_NAME} is an independent application and is not operated by, or
        affiliated with, MiniPay. MiniPay provides the wallet environment only.
      </Section>

      <Section title="4. No financial advice">
        Content and AI summaries are for information only and are not financial,
        investment, or legal advice. Verify any information before acting on it.
      </Section>

      <Section title="5. Availability">
        The service is provided “as is” without warranties. We aim to keep it
        available but do not guarantee uninterrupted operation.
      </Section>

      <Section title="6. Contact">
        For questions, use the in-app Support link.
      </Section>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 border-t-[0.5px] border-rule pt-4">
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 text-[14px] leading-[1.6] text-ink-2">{children}</p>
    </section>
  );
}
