"use client";

// localStorage-backed saved-articles store ("bookmarks").
//
// The source of truth is lifted to HomePage (a single instance — see app/page.tsx)
// so toggling a save from the summary sheet updates the feed's Saved view in the
// same tick. We still listen for the cross-tab `storage` event so a second open
// tab stays in sync; that event never fires in the tab that wrote, so there's no
// echo loop. Only the minimal NewsItem fields needed to render a saved row are
// persisted, so the Saved view survives an article rotating out of the live feed.
import { useCallback, useEffect, useState } from "react";
import type { NewsItem } from "@/lib/api";

const STORAGE_KEY = "miniceliq:bookmarks";

export interface BookmarksState {
  saved: NewsItem[];
  isSaved: (id: string) => boolean;
  toggle: (item: NewsItem) => void;
}

// Persist only what a saved row needs to render later, independent of the live
// feed (id, title, source, url, publishedAt, category).
function toSaved(item: NewsItem): NewsItem {
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    url: item.url,
    publishedAt: item.publishedAt,
    category: item.category,
  };
}

// Read the store defensively: SSR/no-window, missing key, malformed JSON, or a
// non-array payload all degrade to an empty list rather than throwing.
function readStore(): NewsItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Keep only well-formed entries (id + title are the minimum to render a row).
    return parsed.filter(
      (x): x is NewsItem =>
        !!x &&
        typeof (x as NewsItem).id === "string" &&
        typeof (x as NewsItem).title === "string",
    );
  } catch {
    return [];
  }
}

function writeStore(items: NewsItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota exceeded / storage disabled — in-memory state still reflects it */
  }
}

export function useBookmarks(): BookmarksState {
  // Start empty so the server render and the first client render match (no
  // hydration mismatch); hydrate from localStorage in an effect on mount.
  const [saved, setSaved] = useState<NewsItem[]>([]);

  useEffect(() => {
    setSaved(readStore());

    // Cross-tab sync only: the native `storage` event fires in OTHER tabs, never
    // the one that called setItem, so re-reading here can't loop. We read but
    // never write back in this listener, keeping `toggle` the single writer.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEY) setSaved(readStore());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isSaved = useCallback(
    (id: string) => saved.some((s) => s.id === id),
    [saved],
  );

  // The single mutation point: flip membership by id, then persist. The write
  // lives inside the functional updater so it always sees the latest list, and
  // it triggers no React state updates (so it can't loop).
  const toggle = useCallback((item: NewsItem) => {
    setSaved((prev) => {
      const exists = prev.some((s) => s.id === item.id);
      const next = exists
        ? prev.filter((s) => s.id !== item.id)
        : [toSaved(item), ...prev];
      writeStore(next);
      return next;
    });
  }, []);

  return { saved, isSaved, toggle };
}
