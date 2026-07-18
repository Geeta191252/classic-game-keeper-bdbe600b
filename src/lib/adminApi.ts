// Admin API client — talks to the Node/Mongo backend on Koyeb.
// Token is stored in localStorage so it works in Chrome and Telegram mini app.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`;
const TOKEN_KEY = "admin_token";

export const getAdminToken = () => localStorage.getItem(TOKEN_KEY);
export const setAdminToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearAdminToken = () => localStorage.removeItem(TOKEN_KEY);
export const isAdminAuthed = () => !!getAdminToken();

async function adminFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })() : {};
  if (!res.ok) {
    if (res.status === 401) {
      clearAdminToken();
      // notify listeners so guards can redirect
      window.dispatchEvent(new Event("admin:unauthorized"));
    }
    throw new Error((data as any).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const adminLogin = async (email: string, password: string) => {
  const data = await adminFetch<{ token: string; admin: { email: string; role: string } }>(
    "/admin/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) }
  );
  setAdminToken(data.token);
  return data;
};

export const adminLogout = () => {
  clearAdminToken();
};

export const adminMe = () => adminFetch("/admin/auth/me");

// ---------- Dashboard ----------
export interface AdminSummary {
  totals: { users: number; activeUsers: number; transactions: number; pendingWithdrawals: number; pendingDeposits: number };
  deposits: { dollar: number; rupee: number; star: number };
  withdrawals: { dollar: number; rupee: number; star: number };
  bets: { dollar: number; rupee: number; star: number };
  wins: { dollar: number; rupee: number; star: number };
  balances: { dollar: number; rupee: number; star: number; dollarW: number; rupeeW: number; starW: number };
  recent: Array<any>;
}
export const getSummary = () => adminFetch<AdminSummary>("/admin/summary");

// ---------- Users ----------
export interface AdminUser {
  _id: string;
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  dollarBalance?: number;
  rupeeBalance?: number;
  starBalance?: number;
  dollarWinning?: number;
  rupeeWinning?: number;
  starWinning?: number;
  createdAt?: string;
  lastActive?: string;
  referralCount?: number;
}
export const listUsers = (params: { search?: string; limit?: number; skip?: number } = {}) => {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.skip) qs.set("skip", String(params.skip));
  return adminFetch<{ users: AdminUser[]; total: number; limit: number; skip: number }>(
    `/admin/users-list?${qs.toString()}`
  );
};

// ---------- Transactions ----------
export interface AdminTx {
  _id: string;
  telegramId: number;
  type: string;
  currency: string;
  amount: number;
  status: string;
  description?: string;
  game?: string;
  createdAt?: string;
  cryptoAddress?: string;
  withdrawalNetwork?: string;
  user?: {
    telegramId: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    dollarBalance?: number;
    rupeeBalance?: number;
    starBalance?: number;
  } | null;
}
export const listTransactions = (params: {
  type?: string; status?: string; currency?: string; telegramId?: number; limit?: number; skip?: number;
} = {}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  return adminFetch<{ items: AdminTx[]; total: number; limit: number; skip: number }>(
    `/admin/transactions-list?${qs.toString()}`
  );
};

// ---------- Wallet adjust ----------
export const walletAdjust = (payload: {
  targetUserId: number | string;
  currency: "dollar" | "rupee" | "star";
  amount: number;
  balanceType: "deposit" | "winning";
  note?: string;
}) => adminFetch<{ success: true; balance: Record<string, number> }>(
  "/admin/wallet-adjust",
  { method: "POST", body: JSON.stringify(payload) }
);

// ---------- Withdrawals ----------
export const approveWithdrawal = (transactionId: string) =>
  adminFetch("/admin/withdrawals/approve", { method: "POST", body: JSON.stringify({ transactionId }) });

export const rejectWithdrawal = (transactionId: string, reason?: string) =>
  adminFetch("/admin/withdrawals/reject", { method: "POST", body: JSON.stringify({ transactionId, reason }) });

// ---------- Deposits ----------
export const approveDeposit = (transactionId: string) =>
  adminFetch("/admin/deposits/approve", { method: "POST", body: JSON.stringify({ transactionId }) });

export const rejectDeposit = (transactionId: string, reason?: string) =>
  adminFetch("/admin/deposits/reject", { method: "POST", body: JSON.stringify({ transactionId, reason }) });

// ---------- Per-game analytics ----------
export interface GameAnalytics {
  game: string;
  days: number;
  totals: {
    bet: { dollar: number; rupee: number; star: number };
    win: { dollar: number; rupee: number; star: number };
    betCount: number;
    winCount: number;
  };
  series: Array<{
    day: string;
    bet: { dollar: number; rupee: number; star: number };
    win: { dollar: number; rupee: number; star: number };
    betCount: number;
    winCount: number;
  }>;
}
export const getGameAnalytics = (game: string, days = 7) =>
  adminFetch<GameAnalytics>(`/admin/game-analytics?game=${encodeURIComponent(game)}&days=${days}`);

// ---------- Analytics ----------
export interface AnalyticsDay {
  day: string;
  deposit?: Record<string, number>;
  withdraw?: Record<string, number>;
  bet?: Record<string, number>;
  win?: Record<string, number>;
}
export const getAnalytics = (days = 7) =>
  adminFetch<{ days: number; series: AnalyticsDay[] }>(`/admin/analytics?days=${days}`);

// ---------- Games ----------
export interface GameStatRow {
  game: string;
  bets: { dollar: number; rupee: number; star: number };
  wins: { dollar: number; rupee: number; star: number };
  betCount: number;
  winCount: number;
}
export const getGameStats = () => adminFetch<{ games: GameStatRow[] }>("/admin/game-stats");
