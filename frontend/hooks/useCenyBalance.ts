"use client";

// Reads the CENY reward-token balance for the current user.
// Surfaced as a subtle pill in the masthead; refreshed after a successful subscribe.
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { readCenyBalance } from "@/lib/contract";

export interface CenyBalanceState {
  balance: bigint; // 18-decimal raw amount, 0n when none / token not configured
  refresh: () => Promise<void>;
}

export function useCenyBalance(address: Address | null): CenyBalanceState {
  const [balance, setBalance] = useState<bigint>(0n);

  // Fetch on address change. setState lives inside the .then callback (async),
  // so the effect never updates state synchronously.
  useEffect(() => {
    if (!address) {
      setBalance(0n);
      return;
    }
    let cancelled = false;
    readCenyBalance(address)
      .then((b) => {
        if (!cancelled) setBalance(b);
      })
      .catch(() => {
        if (!cancelled) setBalance(0n);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Exposed manual re-read (e.g. right after a successful subscribe mints CENY).
  const refresh = useCallback(async () => {
    if (!address) {
      setBalance(0n);
      return;
    }
    try {
      setBalance(await readCenyBalance(address));
    } catch {
      setBalance(0n);
    }
  }, [address]);

  return { balance, refresh };
}
