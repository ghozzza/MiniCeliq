// AI-summary gating logic (services/summaryQuota). The on-chain `isActive` read
// and Supabase are mocked, so the test is fully offline and exercises only the
// gate's branching: premium (unlimited) vs. free daily quota.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Force the in-memory quota path (no live Supabase calls).
vi.mock("../lib/supabase", () => ({ supabase: () => null }));
// Mock the chain read so we control the premium/free decision deterministically.
vi.mock("../services/chain", () => ({
  isActive: vi.fn(),
  isChainConfigured: vi.fn(),
}));

import { isActive, isChainConfigured } from "../services/chain";
import { checkQuota, recordView } from "../services/summaryQuota";

const mockIsActive = vi.mocked(isActive);
const mockIsChainConfigured = vi.mocked(isChainConfigured);

describe("summary quota gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grants UNLIMITED when the address is on-chain active (premium)", async () => {
    mockIsChainConfigured.mockReturnValue(true);
    mockIsActive.mockResolvedValue(true);

    const q = await checkQuota("0x1111111111111111111111111111111111111111", "art-premium");

    expect(q.unlimited).toBe(true);
    expect(q.allowed).toBe(true);
    expect(mockIsActive).toHaveBeenCalledOnce();
  });

  it("falls back to the FREE daily quota when not active", async () => {
    mockIsChainConfigured.mockReturnValue(true);
    mockIsActive.mockResolvedValue(false);

    const q = await checkQuota("0x2222222222222222222222222222222222222222", "art-1");

    expect(q.unlimited).toBe(false);
    expect(q.used).toBe(0);
    expect(q.allowed).toBe(true);
    expect(q.limit).toBeGreaterThanOrEqual(1);
  });

  it("blocks a new article once the daily limit is reached, but re-views stay free", async () => {
    mockIsChainConfigured.mockReturnValue(true);
    mockIsActive.mockResolvedValue(false);
    const addr = "0x3333333333333333333333333333333333333333";

    const { limit } = await checkQuota(addr, "seed");
    // Consume the whole daily allowance with distinct articles.
    for (let i = 0; i < limit; i++) {
      await recordView(addr, `art-${i}`);
    }

    const blocked = await checkQuota(addr, "art-new");
    expect(blocked.used).toBe(limit);
    expect(blocked.allowed).toBe(false);

    // Re-summarizing an already-counted article is always free.
    const review = await checkQuota(addr, "art-0");
    expect(review.alreadyViewed).toBe(true);
    expect(review.allowed).toBe(true);
  });

  it("treats the address as free (never premium) when the chain is unconfigured", async () => {
    mockIsChainConfigured.mockReturnValue(false);

    const q = await checkQuota("0x4444444444444444444444444444444444444444", "art-1");

    expect(q.unlimited).toBe(false);
    expect(mockIsActive).not.toHaveBeenCalled();
  });
});
