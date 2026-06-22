// On-chain read service for the NewsSubscription contract (README §5, §7, §8).
//
// READ-ONLY. The backend never sends transactions. The minimal ABI below MUST
// match the deployed contract's signatures exactly (verified against
// contracts/src/NewsSubscription.sol):
//   - subscribe(uint8 plan, address token)
//   - isActive(address user) -> bool
//   - currentPrice(address token, uint8 plan) -> uint256
//   - subscriptionExpiry(address user) -> uint64   (public mapping getter)
//   - event Subscribed(address indexed user, uint8 indexed plan,
//                      address indexed token, uint256 amount, uint64 newExpiry)
//
// Every export degrades gracefully: when the chain is not configured
// (CELO_RPC / SUBSCRIPTION_CONTRACT_ADDRESS missing) the read functions throw an
// AppError(503) so routes return a clean "not configured" rather than crashing.

import { type Abi } from "viem";
import { publicClient, contractAddress, toChecksum } from "../lib/viem";
import { AppError } from "../lib/errors";
import type { SubscriptionStatus } from "../types";

// Minimal ABI — only the surface the backend reads/decodes. `subscribe` is
// included for completeness/signature-parity even though the BE never calls it.
export const NEWS_SUBSCRIPTION_ABI = [
  {
    type: "function",
    name: "subscribe",
    stateMutability: "nonpayable",
    inputs: [
      { name: "plan", type: "uint8" },
      { name: "token", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isActive",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "currentPrice",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "plan", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "subscriptionExpiry",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "event",
    name: "Subscribed",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "plan", type: "uint8", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newExpiry", type: "uint64", indexed: false },
    ],
    anonymous: false,
  },
] as const satisfies Abi;

// Resolve the configured client + address or fail with a 503. Centralized so
// every read shares the same not-configured behavior.
function requireChain(): {
  client: NonNullable<ReturnType<typeof publicClient>>;
  address: `0x${string}`;
} {
  const client = publicClient();
  const address = contractAddress();
  if (!client || !address) {
    throw new AppError(
      "On-chain reads not configured (CELO_RPC / SUBSCRIPTION_CONTRACT_ADDRESS)",
      503
    );
  }
  return { client, address };
}

export function isChainConfigured(): boolean {
  return Boolean(publicClient() && contractAddress());
}

// `isActive(address)` — the single read every gate uses (README §7). Validates
// + checksums the address before the call (viem rejects bad casing).
export async function isActive(userAddress: string): Promise<boolean> {
  const user = toChecksum(userAddress);
  if (!user) throw new AppError("Invalid address", 400);
  const { client, address } = requireChain();

  return (await client.readContract({
    address,
    abi: NEWS_SUBSCRIPTION_ABI,
    functionName: "isActive",
    args: [user],
  })) as boolean;
}

// `subscriptionExpiry(address)` -> unix seconds (uint64). 0 = never subscribed.
export async function subscriptionExpiry(userAddress: string): Promise<number> {
  const user = toChecksum(userAddress);
  if (!user) throw new AppError("Invalid address", 400);
  const { client, address } = requireChain();

  const expiry = (await client.readContract({
    address,
    abi: NEWS_SUBSCRIPTION_ABI,
    functionName: "subscriptionExpiry",
    args: [user],
  })) as bigint;

  return Number(expiry);
}

// `currentPrice(token, plan)` -> token-native amount (uint256), promo-aware.
// Returned as a string to avoid precision loss on large 18-decimal values.
export async function currentPrice(
  tokenAddress: string,
  plan: number
): Promise<string> {
  const token = toChecksum(tokenAddress);
  if (!token) throw new AppError("Invalid token address", 400);
  const { client, address } = requireChain();

  const amount = (await client.readContract({
    address,
    abi: NEWS_SUBSCRIPTION_ABI,
    functionName: "currentPrice",
    args: [token, plan],
  })) as bigint;

  return amount.toString();
}

// Combined status read for `GET /api/subscription/:address`. Single expiry read
// derives both `active` and `expiry` (matches the contract's own
// `isActive = expiry > now`), saving one RPC round-trip.
export async function getSubscriptionStatus(
  userAddress: string
): Promise<SubscriptionStatus> {
  const expiry = await subscriptionExpiry(userAddress);
  const nowSec = Math.floor(Date.now() / 1000);
  return { active: expiry > nowSec, expiry };
}
