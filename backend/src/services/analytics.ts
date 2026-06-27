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
    // THROW (don't swallow) so the indexer aborts this run and the resume cursor
    // stays behind the gap — otherwise a transient write failure on a chunk with
    // events, followed by a later successful chunk, would advance the cursor past
    // the dropped events and lose them permanently (audit M2).
    throw new Error(`event upsert failed: ${error.message}`);
  }
  return rows.length;
}

const CURSOR_TABLE = "indexer_cursor";

// Read the dedicated last-fully-scanned block for a named indexer (audit L2).
// Returns null when Supabase is absent, the table doesn't exist yet (pre-migration),
// or no cursor has been written — callers fall back to the event-derived resume.
export async function getScannedBlock(name: string): Promise<number | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db
    .from(CURSOR_TABLE)
    .select("last_scanned_block")
    .eq("name", name)
    .maybeSingle();
  if (error || !data) return null;
  return Number(data.last_scanned_block);
}

// Persist the last-fully-scanned block for a named indexer. Best-effort: a write
// failure (e.g. table missing pre-migration) is logged, not thrown — the indexer
// still made forward progress in-memory and the event-derived cursor is the fallback.
export async function setScannedBlock(name: string, block: number): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db
    .from(CURSOR_TABLE)
    .upsert({ name, last_scanned_block: block, updated_at: new Date().toISOString() }, {
      onConflict: "name",
    });
  if (error) {
    console.warn(`[STATS] cursor write failed (${name}=${block}): ${error.message}`);
  }
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
// Page size for the stats scan. PostgREST caps a single response at its
// db-max-rows (default 1000), so we MUST paginate with .range() to avoid silently
// under-counting once the contract has >1000 events (audit M3).
const STATS_PAGE = 1000;

export async function getStats(): Promise<StatsPayload> {
  const db = supabase();
  if (!db) return EMPTY_STATS;

  // Pull every event row via explicit range pagination (loop until a short page).
  const data: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += STATS_PAGE) {
    const { data: page, error } = await db
      .from(EVENTS_TABLE)
      .select("user_address, token_address, amount, block_time")
      .order("block_number", { ascending: true })
      .range(offset, offset + STATS_PAGE - 1);
    if (error) {
      console.warn(`[STATS] aggregate read failed at offset ${offset}: ${error.message}`);
      return offset === 0 ? EMPTY_STATS : data.length ? buildStats(data) : EMPTY_STATS;
    }
    if (!page || page.length === 0) break;
    data.push(...page);
    if (page.length < STATS_PAGE) break;
  }

  if (data.length === 0) return EMPTY_STATS;
  return buildStats(data);
}

// Roll up the full event row set in memory into the /stats payload.
function buildStats(data: Array<Record<string, unknown>>): StatsPayload {
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
