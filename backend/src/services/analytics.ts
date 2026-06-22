// Analytics aggregation for `GET /api/stats` (README §7, §9 — Proof of Ship +
// MiniPay listing requirement). Reads indexed `Subscribed` events out of
// Supabase and rolls them up into subscriber count, tx/day, and volume per
// stablecoin. Placeholder-safe: when no data is indexed yet (no Supabase, or the
// indexer hasn't run) it returns an `available: false` envelope with zeros
// instead of erroring.

import { supabase } from "../lib/supabase";
import type { StatsPayload, SubscribedEvent } from "../types";

const EVENTS_TABLE = "subscribed_events";

// Persist a batch of decoded events (idempotent on tx_hash + log_index). Used by
// the event indexer cron. Returns the number of rows written.
export async function storeEvents(events: SubscribedEvent[]): Promise<number> {
  const db = supabase();
  if (!db || events.length === 0) return 0;

  const rows = events.map((e) => ({
    tx_hash: e.txHash,
    log_index: e.logIndex,
    block_number: e.blockNumber,
    user_address: e.user.toLowerCase(),
    plan: e.plan,
    token_address: e.token.toLowerCase(),
    amount: e.amount,
    new_expiry: e.newExpiry,
    block_time: e.timestamp,
  }));

  const { error } = await db
    .from(EVENTS_TABLE)
    .upsert(rows, { onConflict: "tx_hash,log_index" });
  if (error) {
    console.warn(`[STATS] event upsert failed: ${error.message}`);
    return 0;
  }
  return rows.length;
}

// Read the highest block number we've indexed so the indexer can resume from
// there. Returns null when Supabase is absent or the table is empty.
export async function getLastIndexedBlock(): Promise<number | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db
    .from(EVENTS_TABLE)
    .select("block_number")
    .order("block_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return Number(data.block_number);
}

const EMPTY_STATS: StatsPayload = {
  subscriberCount: 0,
  totalSubscriptions: 0,
  txPerDay: [],
  volumeByToken: [],
  available: false,
};

// Aggregate everything `/stats` needs. Pulls all event rows (subscription
// volume is low-cardinality for an early app) and rolls up in memory. Returns
// the placeholder envelope when there's nothing to aggregate.
export async function getStats(): Promise<StatsPayload> {
  const db = supabase();
  if (!db) return EMPTY_STATS;

  const { data, error } = await db
    .from(EVENTS_TABLE)
    .select("user_address, token_address, amount, block_time");

  if (error || !data || data.length === 0) {
    return EMPTY_STATS;
  }

  const uniqueSubscribers = new Set<string>();
  const txByDay = new Map<string, number>();
  const volByToken = new Map<string, { volume: bigint; count: number }>();

  for (const row of data) {
    uniqueSubscribers.add(String(row.user_address));

    const day = String(row.block_time).slice(0, 10);
    txByDay.set(day, (txByDay.get(day) ?? 0) + 1);

    const token = String(row.token_address);
    const prev = volByToken.get(token) ?? { volume: 0n, count: 0 };
    let amount = 0n;
    try {
      amount = BigInt(String(row.amount));
    } catch {
      amount = 0n;
    }
    volByToken.set(token, { volume: prev.volume + amount, count: prev.count + 1 });
  }

  return {
    subscriberCount: uniqueSubscribers.size,
    totalSubscriptions: data.length,
    txPerDay: Array.from(txByDay.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    volumeByToken: Array.from(volByToken.entries()).map(([token, v]) => ({
      token,
      volume: v.volume.toString(),
      count: v.count,
    })),
    available: true,
  };
}
