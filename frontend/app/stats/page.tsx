"use client";

// Read-only stats page (no wallet required) — MiniPay listing requirement.
// Surfaces usage + on-chain metrics from the backend /api/stats endpoint.
import { useEffect, useState } from "react";
import { fetchStats, type StatsResult } from "@/lib/api";

export default function StatsPage() {
  const [stats, setStats] = useState<StatsResult | null>(null);

  useEffect(() => {
    fetchStats().then(setStats);
  }, []);

  return (
    <div className="px-4 py-6">
      <h1 className="text-lg font-bold text-gray-900">Stats</h1>
      <p className="mt-1 text-sm text-gray-500">
        Live usage and on-chain activity for MiniCeliq.
      </p>

      {stats === null ? (
        <p className="mt-6 text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          {stats.mock && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Showing placeholder numbers — live analytics connect once the
              backend and contract are deployed.
            </p>
          )}

          <Section title="Usage">
            <Stat label="Daily active users" value={fmt(stats.usage.dau)} />
            <Stat label="Monthly active users" value={fmt(stats.usage.mau)} />
            <Stat
              label="D7 retention"
              value={pct(stats.usage.retentionD7)}
            />
          </Section>

          <Section title="On-chain">
            <Stat
              label="Subscriptions (lifetime)"
              value={fmt(stats.onchain.txLifetime)}
            />
            <Stat
              label="Unique subscribers"
              value={fmt(stats.onchain.uniqueSubscribers)}
            />
            <Stat
              label="Volume"
              value={`$${fmt(stats.onchain.volumeUsd)}`}
            />
            <Stat
              label="Network fees paid"
              value={`$${fmt(stats.onchain.networkFeesUsd)}`}
            />
            <Stat
              label="Failed-tx rate"
              value={pct(stats.onchain.failedTxRate)}
            />
          </Section>

          {stats.updatedAt && (
            <p className="mt-6 text-[11px] text-gray-400">
              Updated {new Date(stats.updatedAt).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
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
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </h2>
      <dl className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-100">
        {children}
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-3">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
