"use client";

// Locks <body> scroll (and preserves/restores the exact scroll position) while
// the calling component is mounted. Used by the full-screen bottom sheets so the
// page behind them can't touch-scroll.
//
// position:fixed is the technique here because overflow:hidden alone does NOT stop
// touch-scroll in iOS / MiniPay's webview — the background still drifts under the
// sheet. Pinning the body with position:fixed + a negative top offset truly
// freezes it, then we restore the prior inline styles and scroll position on
// unmount (no layout jump). SSR-safe: bails out when there's no window.
import { useEffect } from "react";

export function useBodyScrollLock() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const scrollY = window.scrollY;
    const body = document.body;
    // Snapshot the inline styles we're about to overwrite so we can restore them
    // exactly (a nested/second lock won't clobber the original page values).
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);
}
