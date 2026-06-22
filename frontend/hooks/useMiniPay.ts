"use client";

// Zero-click connect for MiniPay.
//
// MiniPay rule: when window.ethereum.isMiniPay === true, auto-read the address
// (no "Connect Wallet" button). Outside MiniPay we expose isMiniPay=false so the
// UI can show an "Open in MiniPay" fallback instead.
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { getWalletClient } from "@/lib/viem";
import {
  getPreferredStablecoin,
  type StablecoinBalance,
} from "@/lib/stablecoins";

export interface MiniPayState {
  address: Address | null;
  isMiniPay: boolean;
  isLoading: boolean;
  // The user's highest-balance stablecoin (null = no balance → Deposit).
  preferred: StablecoinBalance | null;
  // Re-read balances (e.g. after a top-up). All state updates happen post-await.
  refreshBalances: () => Promise<void>;
}

export function useMiniPay(): MiniPayState {
  const [address, setAddress] = useState<Address | null>(null);
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [preferred, setPreferred] = useState<StablecoinBalance | null>(null);

  // Imperative refresh (no synchronous setState — only updates after the await).
  const refreshBalances = useCallback(async () => {
    if (!address) return;
    try {
      setPreferred(await getPreferredStablecoin(address));
    } catch {
      setPreferred(null);
    }
  }, [address]);

  // Detect MiniPay and auto-read the address on mount. All setState calls run
  // after an await (or in an async callback), so no synchronous cascade.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (typeof window === "undefined" || !window.ethereum) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      const mp = window.ethereum.isMiniPay === true;
      if (!cancelled) setIsMiniPay(mp);

      if (mp) {
        try {
          const client = getWalletClient();
          const [addr] = await client.getAddresses();
          if (cancelled) return;
          setAddress(addr ?? null);
          // Load balances inline so we never need a second effect that calls a
          // synchronous-setState helper.
          if (addr) {
            const pref = await getPreferredStablecoin(addr);
            if (!cancelled) setPreferred(pref);
          }
        } catch {
          if (!cancelled) setAddress(null);
        }
      }
      if (!cancelled) setIsLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  return { address, isMiniPay, isLoading, preferred, refreshBalances };
}
