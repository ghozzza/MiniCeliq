// Event indexer cron task (README §7, §12). Scans the chain for `Subscribed`
// events in CHUNKED `eth_getLogs` calls and persists decoded rows into Supabase
// for `/stats`.
//
// Chunk size (EVENT_INDEXER_CHUNK_BLOCKS, default 5000): forno — the default RPC
// — caps eth_getLogs at a 5000-BLOCK range and returns a -32602 ERROR for
// anything larger. The previous hardcoded 45k chunk made every getLogs call fail;
// the error was swallowed by the try/catch below and NOTHING was ever indexed.
//
// Resilience per chunk: try the primary RPC (with retries/backoff), then each
// fallback RPC, then — only if BLOCK_EXPLORER_API_KEY is set — the explorer logs
// API. A chunk that exhausts every source ABORTS the run (re-tried next tick from
// the same resume point) rather than silently leaving a gap.
//
// Resume strategy: start from max(last-indexed block + 1, EVENT_INDEXER_FROM_BLOCK)
// and walk forward to the current head. Gated in the scheduler on the chain being
// configured AND Supabase being present. Never throws to the scheduler.

import { parseAbiItem, type Log, type PublicClient } from "viem";
import { publicClient, contractAddress, fallbackClients } from "../lib/viem";
import {
  fetchSubscribedLogsFromExplorer,
  type NormalizedSubscribedLog,
} from "../lib/explorerLogs";
import { env, hasBlockExplorer } from "../config/env";
import { supabase } from "../lib/supabase";
import {
  storeEvents,
  getLastIndexedBlock,
  getScannedBlock,
  setScannedBlock,
} from "../services/analytics";
import type { SubscribedEvent } from "../types";

// Named cursor for this indexer's last fully-scanned block (audit L2).
const CURSOR_NAME = "subscribed";

// In-flight guard: cron fires every N minutes, but a backfill / idle re-scan can
// outrun the interval. A second concurrent run would just hammer the RPCs over
// the same range, so we skip it (audit L2).
let running = false;

// Standalone event ABI item so viem can build the topic filter + decode args.
// Signature MUST match the contract (verified against NewsSubscription.sol).
const SUBSCRIBED_EVENT = parseAbiItem(
  "event Subscribed(address indexed user, uint8 indexed plan, address indexed token, uint256 amount, uint64 newExpiry)"
);

type SubscribedLog = Log<bigint, number, false, typeof SUBSCRIBED_EVENT, true>;

// Per-RPC retry policy for a single chunk (transient errors / rate limits).
const MAX_ATTEMPTS_PER_RPC = 3;
const RETRY_BASE_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function isIndexerRunnable(): boolean {
  return Boolean(publicClient() && contractAddress() && supabase());
}

// Resolve a block's timestamp → ISO string. Cached per-run to avoid refetching
// the same block for events that share it.
async function blockTimeResolver() {
  const client = publicClient();
  const cache = new Map<bigint, string>();
  return async (blockNumber: bigint): Promise<string> => {
    const hit = cache.get(blockNumber);
    if (hit) return hit;
    if (!client) throw new Error("no client to resolve block time");
    // THROW on failure rather than falling back to wall-clock `now()`: a wrong
    // block_time silently mis-buckets txPerDay in /stats. Aborting the chunk lets
    // it retry next tick with a correct timestamp (audit N1).
    const block = await client.getBlock({ blockNumber });
    const iso = new Date(Number(block.timestamp) * 1000).toISOString();
    cache.set(blockNumber, iso);
    return iso;
  };
}

// getLogs against one client with bounded retries + exponential backoff. Throws
// the last error if all attempts fail (so the caller can try the next source).
async function getLogsWithRetry(
  client: PublicClient,
  address: `0x${string}`,
  from: bigint,
  to: bigint
): Promise<SubscribedLog[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_RPC; attempt++) {
    try {
      return (await client.getLogs({
        address,
        event: SUBSCRIBED_EVENT,
        fromBlock: from,
        toBlock: to,
      })) as SubscribedLog[];
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS_PER_RPC) {
        await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw lastErr;
}

// Fetch `Subscribed` logs for one chunk, trying every source in order:
// primary RPC → fallback RPCs → (optional) explorer API. A legitimate empty
// result (RPC returns []) short-circuits success — only THROWN errors advance to
// the next source. Throws only when every source fails.
async function fetchChunkLogs(
  address: `0x${string}`,
  from: bigint,
  to: bigint
): Promise<NormalizedSubscribedLog[]> {
  const primary = publicClient();
  const clients: PublicClient[] = primary
    ? [primary, ...fallbackClients()]
    : fallbackClients();

  let lastErr: unknown;
  for (const client of clients) {
    try {
      return await getLogsWithRetry(client, address, from, to);
    } catch (err) {
      lastErr = err;
      console.warn(
        `[EVENT_INDEXER] getLogs ${from}..${to} failed on an RPC: ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  }

  if (hasBlockExplorer()) {
    try {
      console.warn(
        `[EVENT_INDEXER] all RPCs failed for ${from}..${to}, trying explorer API.`
      );
      return await fetchSubscribedLogsFromExplorer(address, from, to);
    } catch (err) {
      lastErr = err;
      console.warn(
        `[EVENT_INDEXER] explorer fallback failed for ${from}..${to}: ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  }

  throw new Error(
    `all log sources failed for ${from}..${to}: ${
      lastErr instanceof Error ? lastErr.message : lastErr
    }`
  );
}

export async function runEventIndexer(): Promise<void> {
  if (!isIndexerRunnable()) {
    console.log("[EVENT_INDEXER] skipped — chain or Supabase not configured.");
    return;
  }
  if (running) {
    console.log("[EVENT_INDEXER] skipped — previous run still in progress.");
    return;
  }
  running = true;

  const client = publicClient();
  const address = contractAddress();
  if (!client || !address) {
    running = false;
    return;
  }

  const chunk = BigInt(env.EVENT_INDEXER_CHUNK_BLOCKS);

  try {
    const head = await client.getBlockNumber();

    // Resume from the dedicated scanned-block cursor when present (it advances on
    // every chunk, even empty ones); fall back to the max indexed event block for
    // back-compat (pre-migration), then to the configured FROM_BLOCK (audit L2).
    const persisted = await getScannedBlock(CURSOR_NAME);
    const lastEvent = persisted === null ? await getLastIndexedBlock() : null;
    const base = persisted ?? lastEvent;
    const resumeFrom =
      base !== null ? BigInt(base) + 1n : BigInt(env.EVENT_INDEXER_FROM_BLOCK);

    if (resumeFrom > head) {
      console.log(`[EVENT_INDEXER] up to date (head=${head}).`);
      return;
    }

    const resolveTime = await blockTimeResolver();
    let from = resumeFrom;
    let totalStored = 0;

    while (from <= head) {
      const to = from + chunk - 1n > head ? head : from + chunk - 1n;

      const logs = await fetchChunkLogs(address, from, to);

      if (logs.length > 0) {
        const events: SubscribedEvent[] = [];
        for (const log of logs) {
          if (log.blockNumber === null || log.logIndex === null) continue;
          const args = log.args;
          events.push({
            txHash: log.transactionHash ?? "",
            blockNumber: Number(log.blockNumber),
            logIndex: log.logIndex,
            user: args.user ?? "",
            plan: Number(args.plan ?? 0),
            token: args.token ?? "",
            amount: (args.amount ?? 0n).toString(),
            newExpiry: Number(args.newExpiry ?? 0n),
            timestamp: await resolveTime(log.blockNumber),
          });
        }
        totalStored += await storeEvents(events);
      }

      // Advance the durable cursor only AFTER the chunk is fully persisted (or was
      // empty). storeEvents throws on a write failure, so a failed chunk aborts the
      // run here and the cursor stays behind the gap — no silent event loss, and
      // empty ranges are never re-scanned next tick (audit M2 + L2).
      await setScannedBlock(CURSOR_NAME, Number(to));

      from = to + 1n;
    }

    console.log(
      `[EVENT_INDEXER] done — scanned ${resumeFrom}..${head}, stored=${totalStored}.`
    );
  } catch (err) {
    console.error(
      "[EVENT_INDEXER] failed:",
      err instanceof Error ? err.message : err
    );
  } finally {
    running = false;
  }
}
