// Terms of Service (Server Component) — required for MiniPay listing.
// Placeholder legal copy; replace with reviewed text before launch.
import type { Metadata } from "next";
import { APP_NAME } from "@/lib/copy";

export const metadata: Metadata = {
  title: `Terms — ${APP_NAME}`,
};

export default function TermsPage() {
  return (
    <article className="prose prose-sm max-w-none px-4 py-6 text-gray-700">
      <h1 className="text-lg font-bold text-gray-900">Terms of Service</h1>
      <p className="mt-2 text-xs text-gray-400">Last updated: 2026-06-22</p>

      <h2 className="mt-5 text-sm font-semibold text-gray-900">1. The service</h2>
      <p className="mt-1 text-sm">
        {APP_NAME} provides a curated stablecoin and macro news feed with
        AI-generated summaries. A premium tier unlocks unlimited summaries and a
        daily brief, paid as a recurring subscription in stablecoins.
      </p>

      <h2 className="mt-5 text-sm font-semibold text-gray-900">
        2. Subscriptions and payments
      </h2>
      <p className="mt-1 text-sm">
        Subscriptions are recorded on-chain. Payments are made directly from your
        wallet to a treasury address; {APP_NAME} never holds your funds. A launch
        promotional price may apply for a limited time and reverts automatically
        afterward. All sales are final once a transaction is confirmed on-chain.
      </p>

      <h2 className="mt-5 text-sm font-semibold text-gray-900">
        3. Independence from MiniPay
      </h2>
      <p className="mt-1 text-sm">
        {APP_NAME} is an independent application and is not operated by, or
        affiliated with, MiniPay. MiniPay provides the wallet environment only.
      </p>

      <h2 className="mt-5 text-sm font-semibold text-gray-900">
        4. No financial advice
      </h2>
      <p className="mt-1 text-sm">
        Content and AI summaries are for information only and are not financial,
        investment, or legal advice. Verify any information before acting on it.
      </p>

      <h2 className="mt-5 text-sm font-semibold text-gray-900">
        5. Availability
      </h2>
      <p className="mt-1 text-sm">
        The service is provided “as is” without warranties. We aim to keep it
        available but do not guarantee uninterrupted operation.
      </p>

      <h2 className="mt-5 text-sm font-semibold text-gray-900">6. Contact</h2>
      <p className="mt-1 text-sm">
        For questions, use the in-app Support link.
      </p>
    </article>
  );
}
