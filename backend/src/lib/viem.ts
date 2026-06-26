// viem publicClient for Celo on-chain reads (README §8).
//
// MiniPay mandates viem (only SDK with native `feeCurrency` / CIP-64), but the
// BACKEND only ever READS the chain — no transactions, no signing, no
// feeCurrency here. We expose a read-only publicClient and the resolved chain
// metadata. The client is lazily built and returns null when CELO_RPC /
// SUBSCRIPTION_CONTRACT_ADDRESS are not configured, so the app boots without a
// chain wired up (callers return 503 — see services/chain.ts).

import {
  createPublicClient,
  http,
  getAddress,
  type PublicClient,
  type Chain,
} from "viem";
import { celo, celoSepolia } from "viem/chains";
import { env, hasChain } from "../config/env";

// README §8 — chain id 42220 (mainnet) / 11142220 (Sepolia testnet).
export function getChain(): Chain {
  return env.CELO_CHAIN === "celoSepolia" ? celoSepolia : celo;
}

let _client: PublicClient | null = null;

export function publicClient(): PublicClient | null {
  if (!hasChain()) return null;
  if (!_client) {
    _client = createPublicClient({
      chain: getChain(),
      transport: http(env.CELO_RPC),
    });
  }
  return _client;
}

let _fallbacks: PublicClient[] | null = null;

// Read-only fallback clients for the event indexer, built from CELO_RPC_FALLBACKS.
// Only used when the primary CELO_RPC throws on a getLogs chunk. The fallback
// defaults are Celo MAINNET RPCs, so they're only wired when CELO_CHAIN=celo —
// pointing a mainnet RPC at sepolia (or vice-versa) would return wrong data.
// The primary URL is excluded so we never just retry the same endpoint.
export function fallbackClients(): PublicClient[] {
  if (!hasChain()) return [];
  if (_fallbacks) return _fallbacks;

  const urls =
    env.CELO_CHAIN === "celo"
      ? env.CELO_RPC_FALLBACKS.split(",")
          .map((u) => u.trim())
          .filter((u) => u.length > 0 && u !== env.CELO_RPC)
      : [];

  const chain = getChain();
  _fallbacks = urls.map((url) =>
    createPublicClient({ chain, transport: http(url) })
  );
  return _fallbacks;
}

// EIP-55 trap (README §5): a hand-recased address breaks viem. `getAddress`
// normalizes any valid casing to the canonical checksum. Returns null on a
// malformed address rather than throwing, so route validation stays in control.
export function toChecksum(address: string): `0x${string}` | null {
  try {
    return getAddress(address);
  } catch {
    return null;
  }
}

// Resolved contract address as a checksummed 0x string, or null if unset.
export function contractAddress(): `0x${string}` | null {
  if (!env.SUBSCRIPTION_CONTRACT_ADDRESS) return null;
  return toChecksum(env.SUBSCRIPTION_CONTRACT_ADDRESS);
}
