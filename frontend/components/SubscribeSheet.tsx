"use client";

// The subscribe flow: pick plan + stablecoin, read live currentPrice (promo-aware),
// then run two legacy txs (approve → subscribe) with feeCurrency set per token.
//
// MiniPay rules: no signing, no permit, no CELO, correct decimals, Deposit deeplink
// on low balance, MiniPay-compliant copy.
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, type Address } from "viem";
import { copy } from "@/lib/copy";
import {
  CONTRACT_CONFIGURED,
  PLAN_MONTHLY,
  PLAN_YEARLY,
  type Plan,
  approve,
  readAllowance,
  readCurrentPrice,
  subscribe,
  waitForSuccess,
} from "@/lib/contract";
import {
  STABLECOINS,
  goToDeposit,
  type Stablecoin,
  type StablecoinBalance,
} from "@/lib/stablecoins";
import { activeChain } from "@/lib/viem";

interface SubscribeSheetProps {
  address: Address;
  // Highest-balance stablecoin from useMiniPay; null = no balance.
  preferred: StablecoinBalance | null;
  onClose: () => void;
  // Re-read isActive after success.
  onSubscribed: () => void;
}

type FlowStatus = "idle" | "approving" | "subscribing" | "success" | "error";

// Regular (non-promo) price label per plan, used only for the "was" strike-through.
// We always charge currentPrice() from the contract; this is display-only.
function regularLabel(plan: Plan): string {
  return plan === PLAN_MONTHLY ? "$5" : "$50";
}

export function SubscribeSheet({
  address,
  preferred,
  onClose,
  onSubscribed,
}: SubscribeSheetProps) {
  const [plan, setPlan] = useState<Plan>(PLAN_MONTHLY);

  // Default the token to the user's preferred stablecoin; allow re-pick.
  const initialToken: Stablecoin =
    STABLECOINS.find((s) => s.symbol === preferred?.symbol) ?? STABLECOINS[0];
  const [token, setToken] = useState<Stablecoin>(initialToken);

  // The fetched price is stored together with the selection it belongs to. When
  // the user switches plan/token, the stored key no longer matches the current
  // selection, so `price` derives back to null (loading) WITHOUT a synchronous
  // reset inside the effect — which keeps the render path cascade-free.
  const [priced, setPriced] = useState<{ key: string; value: bigint } | null>(
    null,
  );
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectionKey = `${token.symbol}:${plan}`;
  const price = priced?.key === selectionKey ? priced.value : null;

  // Read the live, promo-aware price whenever plan or token changes. The only
  // setState happens after the awaited read (in .then), so no sync cascade.
  useEffect(() => {
    if (!CONTRACT_CONFIGURED) return;
    let cancelled = false;
    const key = `${token.symbol}:${plan}`;
    readCurrentPrice(token.address, plan)
      .then((p) => {
        if (!cancelled) setPriced({ key, value: p });
      })
      .catch(() => {
        // Leave the previous value stale; UI shows loading until a value lands.
      });
    return () => {
      cancelled = true;
    };
  }, [token, plan]);

  const humanPrice = useMemo(() => {
    if (price === null) return null;
    return Number(formatUnits(price, token.decimals));
  }, [price, token]);

  // Promo badge heuristic: charged price is meaningfully below the regular price.
  const isPromo = useMemo(() => {
    if (humanPrice === null) return false;
    const regular = plan === PLAN_MONTHLY ? 5 : 50;
    return humanPrice > 0 && humanPrice < regular;
  }, [humanPrice, plan]);

  const periodLabel = plan === PLAN_MONTHLY ? copy.subscribe.perMonth : copy.subscribe.perYear;

  const handleSubscribe = useCallback(async () => {
    if (!CONTRACT_CONFIGURED) return;
    setErrorMsg(null);

    // Re-read the exact price at submit time (avoids a stale promo at the cutoff).
    let amount: bigint;
    try {
      amount = await readCurrentPrice(token.address, plan);
    } catch {
      setStatus("error");
      setErrorMsg(copy.subscribe.error);
      return;
    }
    if (amount === 0n) {
      setStatus("error");
      setErrorMsg(copy.subscribe.notConfigured);
      return;
    }

    // Low balance in the chosen token → send to Deposit instead of failing.
    if (preferred && preferred.symbol === token.symbol && preferred.balance < amount) {
      goToDeposit();
      return;
    }

    try {
      // Tx 1: approve only if the current allowance is insufficient.
      const allowance = await readAllowance(token.address, address);
      if (allowance < amount) {
        setStatus("approving");
        const approveHash = await approve(address, token, amount);
        const ok = await waitForSuccess(approveHash);
        if (!ok) throw new Error("approve failed");
      }

      // Tx 2: subscribe.
      setStatus("subscribing");
      const subHash = await subscribe(address, plan, token);
      const ok = await waitForSuccess(subHash);
      if (!ok) throw new Error("subscribe failed");

      setStatus("success");
      onSubscribed();
    } catch {
      setStatus("error");
      setErrorMsg(copy.subscribe.error);
    }
  }, [address, plan, token, preferred, onSubscribed]);

  const busy = status === "approving" || status === "subscribing";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-ink/40"
      role="dialog"
      aria-modal="true"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="mx-auto w-full max-w-md rounded-t-2xl border-t-[0.5px] border-rule-strong bg-card p-5 pb-7 shadow-[0_-8px_24px_rgba(10,37,64,0.10)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-rule-strong" />

        {status === "success" ? (
          <div className="py-4 text-center">
            <h2 className="font-newsreader text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-ink">
              {copy.subscribe.success}
            </h2>
            <button
              onClick={onClose}
              className="mt-5 w-full bg-ink py-3 text-[14px] font-semibold text-warm transition-colors active:bg-accent"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="mb-1 text-[11px] uppercase tracking-[0.09em] text-accent">
              MiniCeliq Plus
            </p>
            <h2 className="font-newsreader text-[22px] font-bold leading-[1.15] tracking-[-0.015em] text-ink">
              {copy.subscribe.title}
            </h2>

            {/* Plan selector */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(
                [
                  { p: PLAN_MONTHLY, label: copy.subscribe.monthly },
                  { p: PLAN_YEARLY, label: copy.subscribe.yearly },
                ] as const
              ).map(({ p, label }) => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  disabled={busy}
                  className={`border-[0.5px] px-3 py-3 text-[14px] font-medium transition-colors duration-[120ms] ${
                    plan === p
                      ? "border-accent bg-accent-soft text-ink"
                      : "border-rule-strong text-ink-2 hover:border-rule-strong hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Token selector — preferred is pre-picked; user can change */}
            <p className="mt-4 text-[11px] uppercase tracking-[0.09em] text-ink-muted">
              {copy.subscribe.payWith}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {STABLECOINS.map((s) => (
                <button
                  key={s.symbol}
                  onClick={() => setToken(s)}
                  disabled={busy}
                  className={`font-plex-mono num border-[0.5px] px-2 py-2 text-[14px] font-medium transition-colors duration-[120ms] ${
                    token.symbol === s.symbol
                      ? "border-accent bg-accent-soft text-ink"
                      : "border-rule-strong text-ink-2 hover:text-ink"
                  }`}
                >
                  {s.symbol}
                </button>
              ))}
            </div>

            {/* Live price */}
            <div className="mt-5 flex items-baseline gap-2 border-t-[0.5px] border-rule pt-4">
              {isPromo && (
                <span className="font-plex-mono num text-[14px] text-ink-muted line-through">
                  {regularLabel(plan)}
                </span>
              )}
              <span className="font-plex-mono num text-[28px] font-medium leading-none tracking-[-0.01em] text-ink">
                {humanPrice === null
                  ? copy.loading
                  : `${formatPrice(humanPrice)} ${token.symbol}`}
              </span>
              {humanPrice !== null && (
                <span className="text-[12px] uppercase tracking-[0.09em] text-ink-muted">
                  {periodLabel}
                </span>
              )}
              {isPromo && (
                <span className="ml-auto bg-gold/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gold">
                  {copy.subscribe.promoBadge}
                </span>
              )}
            </div>

            <p className="mt-2 text-[11px] text-ink-muted">
              {copy.subscribe.networkFeeNote}
            </p>

            {!CONTRACT_CONFIGURED && (
              <p className="mt-3 border-[0.5px] border-rule bg-warm px-3 py-2 text-[12px] text-ink-2">
                {copy.subscribe.notConfigured}{" "}
                <span className="text-ink-muted">({activeChain.name})</span>
              </p>
            )}

            {errorMsg && (
              <p className="mt-3 text-[14px] text-neg">{errorMsg}</p>
            )}

            <button
              onClick={handleSubscribe}
              disabled={busy || !CONTRACT_CONFIGURED || humanPrice === null}
              className="mt-5 w-full bg-ink py-3 text-[14px] font-semibold text-warm transition-colors active:bg-accent disabled:opacity-50"
            >
              {status === "approving"
                ? copy.subscribe.stepApprove
                : status === "subscribing"
                  ? copy.subscribe.stepSubscribe
                  : copy.subscribe.confirm}
            </button>
            {!busy && (
              <button
                onClick={onClose}
                className="mt-2 w-full py-3 text-[14px] font-medium text-ink-muted"
              >
                Cancel
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Show up to 2 decimals, trimming trailing zeros (e.g. 0.10 -> "0.1", 5 -> "5").
function formatPrice(n: number): string {
  return Number(n.toFixed(2)).toString();
}
