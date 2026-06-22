// Ambient type for the MiniPay-injected EIP-1193 provider.
// MiniPay sets `window.ethereum.isMiniPay === true`; we rely on this for
// zero-click connect detection (no "Connect Wallet" button inside MiniPay).
import type { EIP1193Provider } from "viem";

declare global {
  interface Window {
    ethereum?: EIP1193Provider & {
      // MiniPay-specific flag used for environment detection.
      isMiniPay?: boolean;
    };
  }
}

export {};
