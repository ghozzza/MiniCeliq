"use client";

// localStorage-backed favorite-topics store ("interests") powering the For-You
// feed.
//
// Mirrors useBookmarks.ts exactly: the source of truth is lifted to HomePage (a
// single instance — see app/page.tsx) so the picker and the feed read the same
// set in the same tick. We listen for the cross-tab `storage` event so a second
// open tab stays in sync; that event never fires in the tab that wrote, so there
// is no echo loop, and `toggle` stays the single writer.
import { useCallback, useEffect, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/category";

const STORAGE_KEY = "miniceliq:interests";

export interface InterestsState {
  interests: Category[];
  hasInterest: (c: Category) => boolean;
  toggle: (c: Category) => void;
  // True once at least one topic is chosen — drives the picker-vs-feed branch.
  isSet: boolean;
}

// Read the store defensively: SSR/no-window, missing key, malformed JSON, or a
// non-array payload all degrade to an empty list rather than throwing. We keep
// only values that are still known categories (drops anything renamed/removed
// since the last write) and return them in canonical CATEGORIES order.
function readStore(): Category[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return CATEGORIES.filter((c) => parsed.includes(c));
  } catch {
    return [];
  }
}

function writeStore(values: Category[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    /* quota exceeded / storage disabled — in-memory state still reflects it */
  }
}

export function useInterests(): InterestsState {
  // Start empty so the server render and the first client render match (no
  // hydration mismatch); hydrate from localStorage in an effect on mount.
  const [interests, setInterests] = useState<Category[]>([]);

  useEffect(() => {
    setInterests(readStore());

    // Cross-tab sync only: the native `storage` event fires in OTHER tabs, never
    // the one that called setItem, so re-reading here can't loop. We read but
    // never write back in this listener, keeping `toggle` the single writer.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEY) setInterests(readStore());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const hasInterest = useCallback(
    (c: Category) => interests.includes(c),
    [interests],
  );

  // The single mutation point: flip membership, re-canonicalize the order via
  // CATEGORIES (so the stored set is deterministic), then persist. The write
  // lives inside the functional updater so it always sees the latest list, and
  // it triggers no React state updates (so it can't loop).
  const toggle = useCallback((c: Category) => {
    setInterests((prev) => {
      const exists = prev.includes(c);
      const nextSet = exists ? prev.filter((x) => x !== c) : [...prev, c];
      const next = CATEGORIES.filter((x) => nextSet.includes(x));
      writeStore(next);
      return next;
    });
  }, []);

  return { interests, hasInterest, toggle, isSet: interests.length > 0 };
}
