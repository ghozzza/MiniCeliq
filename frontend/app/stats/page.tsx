"use client";

// Read-only stats page (no wallet required) — MiniPay listing requirement.
// Surfaces on-chain metrics from the backend /api/stats endpoint (aggregated
// from indexed Subscribed events). Usage analytics (DAU/MAU/retention) connect
// via web analytics in a later milestone.
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
        On-chain activity for MiniCeliq.
      </p>

      {stats === null ? (
        <p className="mt-6 text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          {!stats.available && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No on-chain activity yet — these numbers go live once the contract is
              deployed and the first subscriptions land.
            </p>
          )}

          <Section title="On-chain">
            <Stat label="Unique subscribers" value={fmt(stats.subscriberCount)} />
            <Stat
              label="Subscriptions (lifetime)"
              value={fmt(stats.totalSubscriptions)}
            />
            <Stat label="Active days" value={fmt(stats.txPerDay.length)} />
          </Section>

          <Section title="Volume by stablecoin">
            {stats.volumeByToken.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400">No volume yet.</div>
            ) : (
              stats.volumeByToken.map((v) => (
                <Stat
                  key={v.token}
                  label={shortToken(v.token)}
                  value={`${fmt(v.count)} tx`}
                />
              ))
            )}
          </Section>

          <p className="mt-6 text-[11px] text-gray-400">
            Usage analytics (DAU / MAU / retention) connect via web analytics in a
            later milestone.
          </p>
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

function shortToken(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
