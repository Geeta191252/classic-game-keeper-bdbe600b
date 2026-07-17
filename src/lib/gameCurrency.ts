// Shared currency helpers used across all game pages so that the
// $ / ₹ / ★ chips behave identically everywhere (like Aviator Fun).

export const INR_RATE = 85; // used only for UPI/legacy exchange displays

export type GameCurrencyMode = "USD" | "INR" | "STAR";
export type WalletKind = "dollar" | "rupee" | "star";

export const modeToWallet = (mode: GameCurrencyMode): WalletKind =>
  mode === "STAR" ? "star" : mode === "INR" ? "rupee" : "dollar";

// Convert a UI/display amount into the native wallet unit. INR is its own wallet.
export const toNativeAmount = (displayVal: number, mode: GameCurrencyMode): number =>
  displayVal;

// Convert a native wallet amount to what should be shown in the current mode.
export const toDisplayAmount = (nativeVal: number, mode: GameCurrencyMode): number =>
  nativeVal;

export const formatAmount = (val: number, mode: GameCurrencyMode): string => {
  if (mode === "STAR") return `★${Math.floor(val).toLocaleString()}`;
  if (mode === "INR") return `₹${val.toFixed(2)}`;
  return `$${val.toFixed(2)}`;
};

export const currencySymbol = (mode: GameCurrencyMode): string =>
  mode === "STAR" ? "★" : mode === "INR" ? "₹" : "$";
