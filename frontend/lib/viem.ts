// Centralized viem clients + chain selection.
//
// MiniPay rules baked in here:
// - Only viem supports the `feeCurrency` (CIP-64) field, so viem is mandatory.
// - We NEVER set maxFeePerGas / maxPriorityFeePerGas (legacy txs only) — callers
//   pass `feeCurrency` instead; viem on a Celo chain produces a CIP-64 legacy tx.
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { celo, celoSepolia } from "viem/chains";

// `NEXT_PUBLIC_CHAIN` selects mainnet vs Sepolia testnet. Defaults to mainnet.
const CHAIN_ENV = (process.env.NEXT_PUBLIC_CHAIN ?? "celo").trim();

export const activeChain: Chain =
  CHAIN_ENV === "celoSepolia" ? celoSepolia : celo;

export const isTestnet = activeChain.id === celoSepolia.id;

// A read-only client over public RPC for contract reads (isActive, prices, balances).
export function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: activeChain,
    transport: http(),
  });
}

// A wallet client bound to the MiniPay-injected provider. Browser-only.
// Throws if no injected provider is present (caller should guard with isMiniPay).
export function getWalletClient(): WalletClient {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No injected wallet provider available.");
  }
  return createWalletClient({
    chain: activeChain,
    transport: custom(window.ethereum),
  });
}

// Truncate an address for use ONLY as a secondary hint — never as the primary
// identifier (MiniPay phone-first identity rule).
export function shortAddress(addr?: string | null): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
