// Event indexer cron task (README §7, §12). Scans the chain for `Subscribed`
// events in CHUNKED `eth_getLogs` calls (≤45k blocks per request — Celo/most
// RPCs cap getLogs at 50k; 45k leaves headroom) and persists decoded rows into
// Supabase for `/stats`.
//
// Resume strategy: start from max(last-indexed block + 1, EVENT_INDEXER_FROM_BLOCK)
// and walk forward to the current head. Gated in the scheduler on the chain being
// configured AND Supabase being present (no point indexing into nothing).
// Never throws to the scheduler.

import { parseAbiItem, type Log } from "viem";
import { publicClient, contractAddress } from "../lib/viem";
import { env } from "../config/env";
import { supabase } from "../lib/supabase";
import { storeEvents, getLastIndexedBlock } from "../services/analytics";
import type { SubscribedEvent } from "../types";

// Chunk size for eth_getLogs. Stay under the common 50k-block RPC cap (README §12).
const CHUNK_BLOCKS = 45_000n;

// Standalone event ABI item so viem can build the topic filter + decode args.
// Signature MUST match the contract (verified against NewsSubscription.sol).
const SUBSCRIBED_EVENT = parseAbiItem(
  "event Subscribed(address indexed user, uint8 indexed plan, address indexed token, uint256 amount, uint64 newExpiry)"
);

type SubscribedLog = Log<bigint, number, false, typeof SUBSCRIBED_EVENT, true>;

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
    if (!client) return new Date().toISOString();
    try {
      const block = await client.getBlock({ blockNumber });
      const iso = new Date(Number(block.timestamp) * 1000).toISOString();
      cache.set(blockNumber, iso);
      return iso;
    } catch {
      return new Date().toISOString();
    }
  };
}

export async function runEventIndexer(): Promise<void> {
  if (!isIndexerRunnable()) {
    console.log("[EVENT_INDEXER] skipped — chain or Supabase not configured.");
    return;
  }

  const client = publicClient();
  const address = contractAddress();
  if (!client || !address) return;

  try {
    const head = await client.getBlockNumber();

    const lastIndexed = await getLastIndexedBlock();
    const resumeFrom =
      lastIndexed !== null
        ? BigInt(lastIndexed) + 1n
        : BigInt(env.EVENT_INDEXER_FROM_BLOCK);

    if (resumeFrom > head) {
      console.log(`[EVENT_INDEXER] up to date (head=${head}).`);
      return;
    }

    const resolveTime = await blockTimeResolver();
    let from = resumeFrom;
    let totalStored = 0;

    while (from <= head) {
      const to = from + CHUNK_BLOCKS - 1n > head ? head : from + CHUNK_BLOCKS - 1n;

      const logs = (await client.getLogs({
        address,
        event: SUBSCRIBED_EVENT,
        fromBlock: from,
        toBlock: to,
      })) as SubscribedLog[];

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
  }
}
