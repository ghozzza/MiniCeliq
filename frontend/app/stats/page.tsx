"use client";

// Read-only stats page (no wallet required) — MiniPay listing requirement.
// Surfaces on-chain metrics from the backend /api/stats endpoint (aggregated
// from indexed Subscribed events). Usage analytics (DAU/MAU/retention) connect
// via web analytics in a later milestone. Editorial Celiq styling.
import { useEffect, useState } from "react";
import { fetchStats, type StatsResult } from "@/lib/api";

export default function StatsPage() {
  const [stats, setStats] = useState<StatsResult | null>(null);

  useEffect(() => {
    fetchStats().then(setStats);
  }, []);

  return (
    <div className="px-4 py-7">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-accent">
        Stats
      </div>
      <h1
        className="font-newsreader mt-1 text-[28px] font-bold leading-[1.08] tracking-[-0.02em] text-ink"
        style={{ textWrap: "balance" }}
      >
        On-chain activity
      </h1>
      <p className="mt-2 text-[14px] leading-[1.55] text-ink-2">
        Live metrics for MiniCeliq, aggregated from on-chain subscriptions.
      </p>

      {stats === null ? (
        <p className="mt-6 text-[14px] text-ink-muted">Loading…</p>
      ) : (
        <>
          {!stats.available && (
            <p className="mt-5 border-[0.5px] border-rule bg-warm px-3 py-2.5 text-[12px] leading-[1.5] text-ink-2">
              No on-chain activity yet — these numbers go live once the contract
              is deployed and the first subscriptions land.
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
              <div className="px-3 py-3 text-[14px] text-ink-muted">
                No volume yet.
              </div>
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

          <p className="mt-6 text-[11px] leading-[1.5] text-ink-muted">
            Usage analytics (DAU / MAU / retention) connect via web analytics in
            a later milestone.
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
    <section className="mt-7">
      <h2 className="border-b-[1.5px] border-ink pb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-2">
        {title}
      </h2>
      <dl className="border-[0.5px] border-rule-strong border-t-0 bg-card">
        {children}
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b-[0.5px] border-rule px-3 py-3 last:border-b-0">
      <dt className="text-[14px] text-ink-2">{label}</dt>
      <dd className="font-plex-mono num text-[14px] font-medium text-ink">
        {value}
      </dd>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function shortToken(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
