// Telegram WebApp API helper for Mini App environment

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    start_param?: string;
  };
  ready: () => void;
  close: () => void;
  expand: () => void;
  openInvoice: (url: string, callback?: (status: string) => void) => void;
  openTelegramLink: (url: string) => void;
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
  showPopup: (params: {
    title?: string;
    message: string;
    buttons?: Array<{ id?: string; type?: string; text?: string }>;
  }, callback?: (buttonId: string) => void) => void;
  platform: string;
  version: string;
}

export const getTelegram = (): TelegramWebApp | null => {
  return window.Telegram?.WebApp || null;
};

export const isTelegramMiniApp = (): boolean => {
  // Check if Telegram WebApp object exists (initData can be empty in some cases)
  return !!window.Telegram?.WebApp;
};

export const getTelegramUser = () => {
  return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
};

// Backend API base URL - change this to your Koyeb deployment URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`;

export type CurrencyType = "dollar" | "rupee" | "star";
export type ActionType = "deposit" | "withdraw";

export interface BalancePayload {
  dollarBalance: number;
  rupeeBalance: number;
  starBalance: number;
  dollarWinning: number;
  rupeeWinning: number;
  starWinning: number;
}

const balanceKeys: Array<keyof BalancePayload> = [
  "dollarBalance",
  "rupeeBalance",
  "starBalance",
  "dollarWinning",
  "rupeeWinning",
  "starWinning",
];

export const isBalancePayload = (data: unknown): data is BalancePayload => {
  if (!data || typeof data !== "object") return false;
  return balanceKeys.every((key) => typeof (data as Record<string, unknown>)[key] === "number");
};

const publishBalancePayload = <T>(data: T): T => {
  if (isBalancePayload(data)) {
    window.dispatchEvent(new CustomEvent<BalancePayload>("game:balance", { detail: data }));
  }
  return data;
};

interface InvoiceResponse {
  invoiceUrl: string;
}

/**
 * Request an invoice URL from your Koyeb backend
 * Backend should create a Telegram payment invoice via Bot API
 */
export const requestInvoice = async (
  action: ActionType,
  currency: CurrencyType,
  amount: number
): Promise<string> => {
  const tg = getTelegram();
  const userId = tg?.initDataUnsafe?.user?.id || "demo";

  const res = await fetch(`${API_BASE_URL}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      currency,
      amount,
      initData: tg?.initData, // for server-side validation
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Failed to create ${action} invoice`);
  }

  return (data as InvoiceResponse).invoiceUrl;
};

/**
 * Open Telegram payment invoice
 */
export const openTelegramInvoice = (
  invoiceUrl: string,
  onResult: (status: "paid" | "cancelled" | "failed" | "pending") => void
) => {
  const tg = getTelegram();
  if (!tg) {
    throw new Error("Please open this app inside Telegram to make payments.");
  }

  tg.openInvoice(invoiceUrl, (status) => {
    onResult(status as "paid" | "cancelled" | "failed" | "pending");
  });
};

/**
 * Combined: request invoice from backend + open in Telegram
 */
export const initiatePayment = async (
  action: ActionType,
  currency: CurrencyType,
  amount: number,
  onResult: (status: string) => void
) => {
  try {
    const invoiceUrl = await requestInvoice(action, currency, amount);
    openTelegramInvoice(invoiceUrl, onResult);
  } catch (error) {
    console.error("Payment error:", error);
    throw error;
  }
};

/**
 * Fetch user balance from backend
 */
export const fetchBalance = async (): Promise<BalancePayload & { referralCount: number }> => {
  const tg = getTelegram();
  const userId = tg?.initDataUnsafe?.user?.id;

  const res = await fetch(`${API_BASE_URL}/balance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: userId || "demo" }),
  });

  if (!res.ok) {
    throw new Error("Failed to fetch balance");
  }

  return publishBalancePayload(await res.json());
};

/**
 * Fetch transaction history from backend
 */
export const fetchTransactions = async (): Promise<Array<{
  type: string;
  game: string;
  amount: string;
  currency: string;
  time: string;
}>> => {
  const tg = getTelegram();
  const userId = tg?.initDataUnsafe?.user?.id;

  const res = await fetch(`${API_BASE_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: userId || "demo" }),
  });

  if (!res.ok) {
    throw new Error("Failed to fetch transactions");
  }

  const data = await res.json();
  // Backend returns { transactions: [...] }, extract the array
  return data.transactions || data;
};

/**
 * Fetch user winnings (only from game wins)
 */
export const fetchWinnings = async (): Promise<{ dollarWinnings: number; rupeeWinnings: number; starWinnings: number; dollarDeposits: number; rupeeDeposits: number; starDeposits: number }> => {
  const tg = getTelegram();
  const userId = tg?.initDataUnsafe?.user?.id;

  const res = await fetch(`${API_BASE_URL}/winnings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: userId || "demo" }),
  });

  if (!res.ok) {
    throw new Error("Failed to fetch winnings");
  }

  return res.json();
};

/**
 * Report game result to backend
 */
export const reportGameResult = async (data: {
  betAmount: number;
  winAmount: number;
  currency: CurrencyType;
  game: string;
}): Promise<BalancePayload> => {
  const tg = getTelegram();
  const userId = tg?.initDataUnsafe?.user?.id;

  const res = await fetch(`${API_BASE_URL}/game/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      ...data,
      initData: tg?.initData,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to report game result");
  }

  return publishBalancePayload(await res.json());
};

/**
 * Process referral if user opened app via invite link
 */
export const processReferral = async (): Promise<void> => {
  // ... keep existing code
};

// ============================================
// GREEDY KING MULTIPLAYER API
// ============================================

export interface GreedyKingState {
  roundNumber: number;
  phase: "betting" | "countdown" | "spinning" | "result";
  timeLeft: number;
  winnerIndex: number | null;
  fruitBets: Array<{
    totalAmount: number;
    playerCount: number;
    players: Array<{ name: string; amount: number }>;
  }>;
  totalPlayers: number;
  lastResults: string[];
}

export const fetchGreedyKingState = async (currency: CurrencyType): Promise<GreedyKingState> => {
  const res = await fetch(`${API_BASE_URL}/greedy-king/state?currency=${currency}`);
  if (!res.ok) throw new Error("Failed to fetch game state");
  return res.json();
};

export const placeGreedyKingBet = async (data: {
  userId: number | string;
  fruitIndex: number;
  amount: number;
  currency: CurrencyType;
  firstName?: string;
}): Promise<{ success: boolean } & Partial<BalancePayload>> => {
  const res = await fetch(`${API_BASE_URL}/greedy-king/bet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to place bet");
  }
  return publishBalancePayload(await res.json());
};

export const fetchMyGreedyKingBets = async (userId: number | string, currency: CurrencyType): Promise<{ myBets: number[]; roundNumber: number }> => {
  const res = await fetch(`${API_BASE_URL}/greedy-king/my-bets?userId=${userId}&currency=${currency}`);
  if (!res.ok) throw new Error("Failed to fetch bets");
  return res.json();
};

// ============================================
// JETX MULTIPLAYER API (PHP-exact crash logic)
// ============================================
export interface JetXState {
  roundNumber: number;
  phase: "betting" | "flying" | "crashed";
  multiplier: number;
  crashAt: number | null;
  timeLeft: number;
  bets: Array<{ user: string; amount: number; multiplier: number | null; cashout: number | null }>;
  totalPlayers: number;
  history: number[];
}

export const fetchJetXState = async (currency: CurrencyType): Promise<JetXState> => {
  const res = await fetch(`${API_BASE_URL}/jetx/state?currency=${currency}`);
  if (!res.ok) throw new Error("Failed to fetch jetx state");
  return res.json();
};

export const placeJetXBet = async (data: {
  userId: number | string;
  amount: number;
  currency: CurrencyType;
  firstName?: string;
}): Promise<{ success: boolean; roundNumber: number } & Partial<BalancePayload>> => {
  const res = await fetch(`${API_BASE_URL}/jetx/bet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to place bet");
  return publishBalancePayload(json);
};

export const cashOutJetX = async (userId: number | string, currency: CurrencyType): Promise<{ success: boolean; multiplier: number; winAmount: number } & Partial<BalancePayload>> => {
  const res = await fetch(`${API_BASE_URL}/jetx/cashout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, currency }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to cash out");
  return publishBalancePayload(json);
};

// ============================================
// AVIATOR MULTIPLAYER API
// ============================================
export interface AviatorState {
  roundNumber: number;
  phase: "betting" | "flying" | "crashed";
  multiplier: number;
  crashAt: number | null;
  timeLeft: number;
  bets: Array<{ user: string; amount: number; multiplier: number | null; cashout: number | null }>;
  totalPlayers: number;
  history: number[];
}

export const fetchAviatorState = async (currency: CurrencyType): Promise<AviatorState> => {
  const res = await fetch(`${API_BASE_URL}/aviator/state?currency=${currency}`);
  if (!res.ok) throw new Error("Failed to fetch aviator state");
  return res.json();
};

export const placeAviatorBet = async (data: {
  userId: number | string;
  amount: number;
  currency: CurrencyType;
  firstName?: string;
  slot?: 1 | 2;
}): Promise<{ success: boolean; roundNumber: number; slot: number } & Partial<BalancePayload>> => {
  const res = await fetch(`${API_BASE_URL}/aviator/bet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to place bet");
  return publishBalancePayload(json);
};

export const cashOutAviator = async (userId: number | string, currency: CurrencyType, slot: 1 | 2 = 1): Promise<{ success: boolean; multiplier: number; winAmount: number } & Partial<BalancePayload>> => {
  const res = await fetch(`${API_BASE_URL}/aviator/cashout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, currency, slot }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to cash out");
  return publishBalancePayload(json);
};

export const cancelAviatorBet = async (userId: number | string, currency: CurrencyType, slot: 1 | 2 = 1): Promise<{ success: boolean; refunded: number } & Partial<BalancePayload>> => {
  const res = await fetch(`${API_BASE_URL}/aviator/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, currency, slot }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to cancel bet");
  return publishBalancePayload(json);
};



// ============================================
// AVIATOR FUN (independent variant) API
// ============================================
export type AviatorFunState = AviatorState;

export const fetchAviatorFunState = async (currency: CurrencyType): Promise<AviatorFunState> => {
  const res = await fetch(`${API_BASE_URL}/aviator-fun/state?currency=${currency}`);
  if (!res.ok) throw new Error("Failed to fetch aviator-fun state");
  return res.json();
};

export const placeAviatorFunBet = async (data: {
  userId: number | string;
  amount: number;
  currency: CurrencyType;
  firstName?: string;
  slot?: 1 | 2;
}): Promise<{ success: boolean; roundNumber: number; slot: number } & Partial<BalancePayload>> => {
  const res = await fetch(`${API_BASE_URL}/aviator-fun/bet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to place bet");
  return publishBalancePayload(json);
};

export const cashOutAviatorFun = async (userId: number | string, currency: CurrencyType, slot: 1 | 2 = 1) => {
  const res = await fetch(`${API_BASE_URL}/aviator-fun/cashout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, currency, slot }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to cash out");
  return publishBalancePayload(json);
};

export const cancelAviatorFunBet = async (userId: number | string, currency: CurrencyType, slot: 1 | 2 = 1) => {
  const res = await fetch(`${API_BASE_URL}/aviator-fun/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, currency, slot }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to cancel bet");
  return publishBalancePayload(json);
};
