// OPTIONAL block-explorer fallback for the event indexer (README §12).
//
// forno's eth_getLogs has been unreliable for historical ranges; when EVERY RPC
// fails for a chunk AND a BLOCK_EXPLORER_API_KEY is configured, the indexer falls
// back to the Etherscan-v2 multichain logs API, which returns the same
// `Subscribed` events reliably. Fully gated: this module is never reached when
// the key is unset (see hasBlockExplorer()), so the indexer degrades gracefully
// without it.

import { parseAbiItem, decodeEventLog, toEventSelector } from "viem";
import { env } from "../config/env";
import { getChain } from "./viem";

const SUBSCRIBED_EVENT = parseAbiItem(
  "event Subscribed(address indexed user, uint8 indexed plan, address indexed token, uint256 amount, uint64 newExpiry)"
);
const SUBSCRIBED_TOPIC0 = toEventSelector(SUBSCRIBED_EVENT);

// Minimal log shape shared with the indexer — a structural subset of viem's
// decoded `Subscribed` log, so both the RPC path and this explorer path feed the
// same mapping code.
export interface NormalizedSubscribedLog {
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: string | null;
  args: {
    user?: string;
    plan?: number;
    token?: string;
    amount?: bigint;
    newExpiry?: bigint;
  };
}

interface ExplorerLog {
  topics: string[];
  data: string;
  blockNumber: string; // hex
  logIndex: string; // hex (may be "0x")
  transactionHash: string;
}

interface ExplorerResponse {
  status: string;
  message: string;
  result: ExplorerLog[] | string;
}

function hexToNumber(hex: string | undefined): number {
  if (!hex || hex === "0x") return 0;
  return Number(BigInt(hex));
}

// Fetch decoded `Subscribed` logs for [fromBlock, toBlock] via the explorer's
// logs API. Throws on a non-OK HTTP status or an explorer error so the caller can
// fall through; returns [] when the explorer reports "no records".
//
// Note: the Etherscan-v2 logs endpoint returns at most 1000 logs per call. The
// indexer's chunk size (default 5000 blocks) keeps subscription volume well under
// that for this app; widen-then-paginate would be the next step if that changes.
export async function fetchSubscribedLogsFromExplorer(
  address: string,
  fromBlock: bigint,
  toBlock: bigint
): Promise<NormalizedSubscribedLog[]> {
  const chainId = getChain().id;
  const url =
    `${env.BLOCK_EXPLORER_API_URL}?chainid=${chainId}&module=logs&action=getLogs` +
    `&address=${address}` +
    `&topic0=${SUBSCRIBED_TOPIC0}` +
    `&fromBlock=${fromBlock}&toBlock=${toBlock}` +
    `&apikey=${env.BLOCK_EXPLORER_API_KEY}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`explorer HTTP ${res.status}`);
  }

  const json = (await res.json()) as ExplorerResponse;

  if (!Array.isArray(json.result)) {
    // "No records found" is a legitimate empty result, not a failure.
    if (/no records/i.test(json.message)) return [];
    throw new Error(`explorer error: ${json.message} — ${String(json.result)}`);
  }

  return json.result.map((log) => {
    const decoded = decodeEventLog({
      abi: [SUBSCRIBED_EVENT],
      data: log.data as `0x${string}`,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    });
    const args = decoded.args as {
      user: string;
      plan: number;
      token: string;
      amount: bigint;
      newExpiry: bigint;
    };
    return {
      blockNumber: BigInt(log.blockNumber),
      logIndex: hexToNumber(log.logIndex),
      transactionHash: log.transactionHash,
      args,
    };
  });
}
