"use client";

// Reads on-chain subscription status for the current user.
// This is the gate that unlocks premium summaries after a successful subscribe.
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { readExpiry, readIsActive } from "@/lib/contract";

export interface SubscriptionState {
  isActive: boolean;
  expiry: number | null; // unix seconds, null if never subscribed
  refresh: () => Promise<void>;
}

// Pure read: resolves to safe defaults when there is no address / no contract.
async function readStatus(
  address: Address | null,
): Promise<{ active: boolean; expiry: number | null }> {
  if (!address) return { active: false, expiry: null };
  const [active, exp] = await Promise.all([
    readIsActive(address),
    readExpiry(address),
  ]);
  return { active, expiry: exp > 0n ? Number(exp) : null };
}

export function useSubscription(address: Address | null): SubscriptionState {
  const [isActive, setIsActive] = useState(false);
  const [expiry, setExpiry] = useState<number | null>(null);

  // Fetch on address change. setState lives inside the .then callback (async),
  // so the effect never updates state synchronously.
  useEffect(() => {
    let cancelled = false;
    readStatus(address)
      .then(({ active, expiry: exp }) => {
        if (cancelled) return;
        setIsActive(active);
        setExpiry(exp);
      })
      .catch(() => {
        if (!cancelled) {
          setIsActive(false);
          setExpiry(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Exposed manual re-read (e.g. right after a successful subscribe tx).
  const refresh = useCallback(async () => {
    try {
      const { active, expiry: exp } = await readStatus(address);
      setIsActive(active);
      setExpiry(exp);
    } catch {
      setIsActive(false);
      setExpiry(null);
    }
  }, [address]);

  return { isActive, expiry, refresh };
}
