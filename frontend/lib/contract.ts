// NewsSubscription contract interface + the approve→subscribe flow.
//
// Signatures here are FROZEN — backend/contract agents share them. Do not change
// without coordinating across all three sub-projects.
//
// MiniPay rules baked in here:
// - Subscribe is TWO legacy txs (no permit — MiniPay can't sign typed data):
//     1) approve(contract, currentPrice) on the chosen stablecoin
//     2) subscribe(plan, token)
// - Each tx sets `feeCurrency` (CIP-64) to the chosen stablecoin's fee-currency
//   address. We NEVER set maxFeePerGas / maxPriorityFeePerGas.
import {
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
} from "viem";
import { getPublicClient, getWalletClient } from "@/lib/viem";
import type { Stablecoin } from "@/lib/stablecoins";

// Default 0x0…0 keeps the build green before the real address is provided.
export const SUBSCRIPTION_CONTRACT = (process.env
  .NEXT_PUBLIC_SUBSCRIPTION_CONTRACT ??
  "0x0000000000000000000000000000000000000000") as Address;

// True once a real (non-zero) contract address is configured.
export const CONTRACT_CONFIGURED =
  SUBSCRIPTION_CONTRACT.toLowerCase() !==
  "0x0000000000000000000000000000000000000000";

// plan 0 = monthly, plan 1 = yearly.
export type Plan = 0 | 1;
export const PLAN_MONTHLY: Plan = 0;
export const PLAN_YEARLY: Plan = 1;

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
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint64" }],
  },
] as const;

// ---- Reads ----

// On-chain subscription status — the gate every premium feature uses.
export async function readIsActive(user: Address): Promise<boolean> {
  if (!CONTRACT_CONFIGURED) return false;
  const client = getPublicClient();
  return client.readContract({
    address: SUBSCRIPTION_CONTRACT,
    abi: NEWS_SUBSCRIPTION_ABI,
    functionName: "isActive",
    args: [user],
  });
}

// Effective price right now (promo-aware + time-boxed on-chain). The sheet shows this.
export async function readCurrentPrice(
  token: Address,
  plan: Plan,
): Promise<bigint> {
  if (!CONTRACT_CONFIGURED) return 0n;
  const client = getPublicClient();
  return client.readContract({
    address: SUBSCRIPTION_CONTRACT,
    abi: NEWS_SUBSCRIPTION_ABI,
    functionName: "currentPrice",
    args: [token, plan],
  });
}

// Unix expiry (seconds). 0 = never subscribed.
export async function readExpiry(user: Address): Promise<bigint> {
  if (!CONTRACT_CONFIGURED) return 0n;
  const client = getPublicClient();
  return client.readContract({
    address: SUBSCRIPTION_CONTRACT,
    abi: NEWS_SUBSCRIPTION_ABI,
    functionName: "subscriptionExpiry",
    args: [user],
  });
}

// Current ERC20 allowance the contract has on the chosen token for this user.
export async function readAllowance(
  token: Address,
  owner: Address,
): Promise<bigint> {
  const client = getPublicClient();
  return client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, SUBSCRIPTION_CONTRACT],
  });
}

// ---- Writes (two legacy txs, feeCurrency set per token) ----

// Tx 1: approve the contract to pull exactly `amount` of the chosen stablecoin.
export async function approve(
  account: Address,
  token: Stablecoin,
  amount: bigint,
): Promise<Hex> {
  const wallet = getWalletClient();
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [SUBSCRIPTION_CONTRACT, amount],
  });
  // Legacy CIP-64 tx: feeCurrency set, no EIP-1559 fields.
  return wallet.sendTransaction({
    account,
    chain: null,
    to: token.address,
    data,
    feeCurrency: token.feeCurrency,
  });
}

// Tx 2: subscribe — the contract pulls the price straight to the treasury.
export async function subscribe(
  account: Address,
  plan: Plan,
  token: Stablecoin,
): Promise<Hex> {
  const wallet = getWalletClient();
  const data = encodeFunctionData({
    abi: NEWS_SUBSCRIPTION_ABI,
    functionName: "subscribe",
    args: [plan, token.address],
  });
  return wallet.sendTransaction({
    account,
    chain: null,
    to: SUBSCRIPTION_CONTRACT,
    data,
    feeCurrency: token.feeCurrency,
  });
}

// Wait for a tx to land; returns true on success.
export async function waitForSuccess(hash: Hex): Promise<boolean> {
  const client = getPublicClient();
  const receipt = await client.waitForTransactionReceipt({ hash });
  return receipt.status === "success";
}
