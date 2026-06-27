// Stablecoin registry + preferred-stablecoin selection + low-balance deeplink.
//
// MiniPay rules baked in here:
// - Only USDm / USDC / USDT are ever shown or used. CELO is never displayed or required.
// - Correct decimals: USDm 18, USDC/USDT 6.
// - `feeCurrency` (network fee) for USDC/USDT MUST use the ADAPTER address, not the
//   token address — passing the token address there makes the tx fail. USDm is its
//   own fee currency.
// - When the user holds zero across all three, redirect to the Deposit deeplink
//   instead of showing an error.
import { erc20Abi, formatUnits } from "viem";
import { getPublicClient } from "@/lib/viem";

export type StablecoinSymbol = "USDm" | "USDC" | "USDT";

export interface Stablecoin {
  symbol: StablecoinSymbol;
  // Token contract — used for balanceOf / approve / allowance.
  address: `0x${string}`;
  // Fee-currency contract — used ONLY in the tx `feeCurrency` field (CIP-64).
  feeCurrency: `0x${string}`;
  decimals: number;
}

// Celo Mainnet addresses (verified against README §8).
// NOTE: Sepolia token addresses differ — fetch from the live FeeCurrencyDirectory
// on testnet. For this MVP build the mainnet table is the canonical reference.
export const STABLECOINS: readonly Stablecoin[] = [
  {
    symbol: "USDm",
    address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    // USDm is 18-decimal: token == fee currency.
    feeCurrency: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    decimals: 18,
  },
  {
    symbol: "USDC",
    address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    // 6-decimal: fee currency MUST be the adapter, not the token.
    feeCurrency: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
    decimals: 6,
  },
  {
    symbol: "USDT",
    address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    feeCurrency: "0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72",
    decimals: 6,
  },
] as const;

// MiniPay Add Cash (Deposit) deeplink — used on low balance, never an error screen.
export const DEPOSIT_DEEPLINK =
  "https://link.minipay.xyz/add_cash?tokens=USDm,USDC,USDT";

export interface StablecoinBalance extends Stablecoin {
  balance: bigint;
  human: number;
}

// Read a single token's raw balance for a user. Used by the subscribe sheet to
// gate the Deposit redirect on the CURRENTLY SELECTED token, not just the
// preferred one (audit L3).
export async function getTokenBalance(
  user: `0x${string}`,
  token: Stablecoin,
): Promise<bigint> {
  const client = getPublicClient();
  return client.readContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [user],
  });
}

// Read all three balances for a user in one batch.
export async function getBalances(
  user: `0x${string}`,
): Promise<StablecoinBalance[]> {
  const client = getPublicClient();
  return Promise.all(
    STABLECOINS.map(async (token) => {
      const raw = await client.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [user],
      });
      return {
        ...token,
        balance: raw,
        human: Number(formatUnits(raw, token.decimals)),
      };
    }),
  );
}

// Pick the stablecoin the user holds the most of (MiniPay dynamic adaptation).
// Returns null when the user holds zero across all three → caller triggers Deposit.
export async function getPreferredStablecoin(
  user: `0x${string}`,
): Promise<StablecoinBalance | null> {
  const balances = await getBalances(user);
  const withFunds = balances.filter((b) => b.balance > 0n);
  if (withFunds.length === 0) return null;
  withFunds.sort((a, b) => b.human - a.human);
  return withFunds[0];
}

// Redirect the user to MiniPay's Deposit view (used when balance is too low).
export function goToDeposit(): void {
  if (typeof window !== "undefined") {
    window.location.href = DEPOSIT_DEEPLINK;
  }
}

// Lookup helper used by the subscribe sheet when the user re-picks a token.
export function getStablecoin(symbol: StablecoinSymbol): Stablecoin {
  const found = STABLECOINS.find((s) => s.symbol === symbol);
  if (!found) throw new Error(`Unknown stablecoin: ${symbol}`);
  return found;
}
