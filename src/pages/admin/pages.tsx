import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, Users as UsersIcon,
  Search, TrendingUp, TrendingDown, Activity,
  RefreshCw, Loader2, CheckCircle2, XCircle,
  Coins, Database, AlertCircle, Info,
} from "lucide-react";
import {
  getSummary, listUsers, listTransactions, walletAdjust,
  approveWithdrawal, rejectWithdrawal, approveDeposit, rejectDeposit,
  getAnalytics, getGameStats, getGameAnalytics,
  getUpiConfig, saveUpiConfig,
  type AdminSummary, type AdminUser, type AdminTx, type AnalyticsDay,
  type GameStatRow, type GameAnalytics, type UpiConfig,
} from "@/lib/adminApi";

/* ============= Shared primitives ============= */

export function StatCard({
  label, value, hint, icon, tone = "teal",
}: { label: string; value: string; hint?: string; icon: ReactNode; tone?: "teal"|"blue"|"purple"|"pink"|"red"|"green"|"yellow" }) {
  const toneColor: Record<string,string> = {
    teal: "var(--a-teal)", blue: "var(--a-blue)", purple: "var(--a-purple)",
    pink: "var(--a-pink)", red: "var(--a-red)", green: "var(--a-green)", yellow: "var(--a-yellow)",
  };
  return (
    <div className="a-card">
      <div className="flex items-start justify-between">
        <div className="a-stat-label">{label}</div>
        <div className="h-8 w-8 rounded-lg flex items-center justify-center"
             style={{ background: `color-mix(in oklab, ${toneColor[tone]} 12%, transparent)`, color: toneColor[tone] }}>
          {icon}
        </div>
      </div>
      <div className="a-stat-num mt-2">{value}</div>
      {hint && <div className="a-stat-hint">{hint}</div>}
    </div>
  );
}

export function Section({
  eyebrow, title, right, children,
}: { eyebrow?: string; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="flex items-end justify-between mb-3">
        <div>
          {eyebrow && <div className="a-eyebrow a-eyebrow-dim">{eyebrow}</div>}
          <div className="text-white text-[18px] font-bold mt-1">{title}</div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function LoadingBlock({ label = "Loading real data…" }: { label?: string }) {
  return (
    <div className="a-card flex items-center gap-3 py-10 justify-center" style={{ color: "var(--a-text-dim)" }}>
      <Loader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="a-card" style={{ border: "1px solid rgba(255,80,80,0.3)" }}>
      <div className="flex items-center gap-2 text-[13px]" style={{ color: "#ffb0b0" }}>
        <AlertCircle size={16} /> {message}
      </div>
      {onRetry && (
        <button className="a-btn a-btn-sm mt-3" onClick={onRetry}>
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  );
}

function NotConnected({ title, note }: { title: string; note?: string }) {
  return (
    <div className="a-card text-center py-12">
      <div className="mx-auto h-12 w-12 rounded-2xl flex items-center justify-center mb-4"
           style={{ background: "rgba(74,168,255,0.12)", color: "var(--a-blue)" }}>
        <Database size={22} />
      </div>
      <div className="text-white text-[16px] font-bold">{title}</div>
      <div className="text-[13px] mt-2 max-w-md mx-auto" style={{ color: "var(--a-text-dim)" }}>
        {note || "Ye feature aapke backend/database mein abhi enabled nahi hai. Jab actual data source ban jaayega, yeh page automatic connect ho jayega — koi dummy data yahan nahi dikhayenge."}
      </div>
      <div className="mt-4 text-[11px] inline-flex items-center gap-1" style={{ color: "var(--a-text-mute)" }}>
        <Info size={12} /> Only real data shown across admin panel
      </div>
    </div>
  );
}

function money(v: number | undefined | null, sym = "") {
  const n = Math.abs(Number(v || 0));
  return `${sym}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function fmtDate(v?: string) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
function userName(u: Pick<AdminUser, "firstName" | "lastName" | "username" | "telegramId">) {
  const n = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return n || u.username || `User #${u.telegramId}`;
}

/* ============= Dashboard ============= */

export function Dashboard() {
  const [data, setData] = useState<AdminSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true); setErr(null);
    getSummary().then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <LoadingBlock />;
  if (err) return <ErrorBlock message={err} onRetry={load} />;
  if (!data) return null;

  return (
    <>
      <Section eyebrow="OVERVIEW" title="Realtime intelligence" right={
        <button className="a-btn a-btn-sm" onClick={load}><RefreshCw size={12} /> Refresh</button>
      }>
        <div className="grid md:grid-cols-4 gap-4">
          <StatCard label="Total users" value={String(data.totals.users)} hint="ALL TIME" icon={<UsersIcon size={16} />} tone="blue" />
          <StatCard label="Active (24h)" value={String(data.totals.activeUsers)} hint="LAST 24 HOURS" icon={<Activity size={16} />} tone="teal" />
          <StatCard label="Pending withdrawals" value={String(data.totals.pendingWithdrawals)} hint="AWAITING APPROVAL" icon={<ArrowUpFromLine size={16} />} tone="yellow" />
          <StatCard label="Pending deposits" value={String(data.totals.pendingDeposits)} hint="AWAITING APPROVAL" icon={<ArrowDownToLine size={16} />} tone="pink" />
        </div>
      </Section>

      <Section eyebrow="TREASURY" title="Currency totals (completed)">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="a-card">
            <div className="a-stat-label">Dollar wallet</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
              <Kv label="Deposits" value={money(data.deposits.dollar, "$")} />
              <Kv label="Withdrawals" value={money(data.withdrawals.dollar, "$")} />
              <Kv label="Bets" value={money(data.bets.dollar, "$")} />
              <Kv label="Wins" value={money(data.wins.dollar, "$")} />
              <Kv label="User balances" value={money(data.balances.dollar, "$")} />
              <Kv label="User winnings" value={money(data.balances.dollarW, "$")} />
            </div>
          </div>
          <div className="a-card">
            <div className="a-stat-label">Rupee wallet</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
              <Kv label="Deposits" value={money(data.deposits.rupee, "₹")} />
              <Kv label="Withdrawals" value={money(data.withdrawals.rupee, "₹")} />
              <Kv label="Bets" value={money(data.bets.rupee, "₹")} />
              <Kv label="Wins" value={money(data.wins.rupee, "₹")} />
              <Kv label="User balances" value={money(data.balances.rupee, "₹")} />
              <Kv label="User winnings" value={money(data.balances.rupeeW, "₹")} />
            </div>
          </div>
          <div className="a-card">
            <div className="a-stat-label">Star wallet</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
              <Kv label="Deposits" value={money(data.deposits.star, "★")} />
              <Kv label="Withdrawals" value={money(data.withdrawals.star, "★")} />
              <Kv label="Bets" value={money(data.bets.star, "★")} />
              <Kv label="Wins" value={money(data.wins.star, "★")} />
              <Kv label="User balances" value={money(data.balances.star, "★")} />
              <Kv label="User winnings" value={money(data.balances.starW, "★")} />
            </div>
          </div>
        </div>
      </Section>

      <Section eyebrow="ACTIVITY" title="Recent transactions">
        <TxTable items={data.recent as AdminTx[]} />
      </Section>
    </>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px] uppercase tracking-wide truncate" style={{ color: "var(--a-text-mute)" }}>{label}</span>
      <span className="text-white font-semibold text-[14px] tabular-nums truncate" title={value}>{value}</span>
    </div>
  );
}

function symFor(c: string) { return c === "dollar" ? "$" : c === "rupee" ? "₹" : c === "star" ? "★" : ""; }

function txUserLabel(t: AdminTx) {
  const u = t.user;
  if (u) {
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
    const primary = name || u.username || `User #${t.telegramId}`;
    const sub = u.username ? `@${u.username}` : `#${t.telegramId}`;
    return { primary, sub };
  }
  return { primary: `User #${t.telegramId}`, sub: `#${t.telegramId}` };
}

function TxTable({ items }: { items: AdminTx[] }) {
  if (!items.length) return <div className="a-card text-center py-8" style={{ color: "var(--a-text-dim)" }}>No transactions yet.</div>;
  return (
    <div className="a-card overflow-x-auto">
      <table className="a-table w-full">
        <thead>
          <tr>
            <th>Time</th><th>User</th><th>Type</th><th>Amount</th><th>Status</th><th>Note</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => {
            const u = txUserLabel(t);
            return (
              <tr key={t._id}>
                <td>{fmtDate(t.createdAt)}</td>
                <td>
                  <div className="text-white font-medium">{u.primary}</div>
                  <div className="text-[11px]" style={{ color: "var(--a-text-mute)" }}>{u.sub}</div>
                </td>
                <td><span className="a-chip">{t.type}</span></td>
                <td>{symFor(t.currency)}{Number(t.amount || 0).toLocaleString()}</td>
                <td>
                  <span className="a-chip" style={{
                    background: t.status === "completed" ? "rgba(52,211,153,0.14)" :
                                t.status === "pending" ? "rgba(255,196,0,0.14)" :
                                "rgba(255,80,80,0.14)",
                    color: t.status === "completed" ? "var(--a-green)" :
                           t.status === "pending" ? "var(--a-yellow)" :
                           "var(--a-red)",
                  }}>{t.status}</span>
                </td>
                <td style={{ color: "var(--a-text-dim)" }}>{t.game || t.description || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ============= Users ============= */

export function UsersPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ users: AdminUser[]; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true); setErr(null);
    listUsers({ search: q, limit: 100 }).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [q]);

  return (
    <>
      <Section eyebrow="USERS" title={`Registered users${data ? ` (${data.total})` : ""}`}
        right={<button className="a-btn a-btn-sm" onClick={load}><RefreshCw size={12} /> Refresh</button>}>
        <div className="flex gap-2 mb-3">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
               style={{ background: "rgba(10,15,26,0.7)", border: "1px solid var(--a-border)" }}>
            <Search size={14} style={{ color: "var(--a-text-mute)" }} />
            <input
              className="bg-transparent outline-none text-[13px] w-full placeholder:text-[var(--a-text-mute)]"
              placeholder="Search by name, username, or Telegram ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setQ(search.trim())}
            />
          </div>
          <button className="a-btn" onClick={() => setQ(search.trim())}>Search</button>
          {q && <button className="a-btn" onClick={() => { setSearch(""); setQ(""); }}>Clear</button>}
        </div>

        {loading ? <LoadingBlock /> : err ? <ErrorBlock message={err} onRetry={load} /> : (
          <div className="a-card overflow-x-auto">
            <table className="a-table w-full">
              <thead>
                <tr><th>User</th><th>Telegram ID</th><th>$ balance</th><th>₹ balance</th><th>★ balance</th><th>Winnings</th><th>Joined</th></tr>
              </thead>
              <tbody>
                {(data?.users || []).map((u) => (
                  <tr key={u._id}>
                    <td>
                      <div className="text-white font-semibold">{userName(u)}</div>
                      {u.username && <div className="text-[11px]" style={{ color: "var(--a-text-mute)" }}>@{u.username}</div>}
                    </td>
                    <td>#{u.telegramId}</td>
                    <td>${Number(u.dollarBalance || 0).toFixed(2)}</td>
                    <td>₹{Number(u.rupeeBalance || 0).toFixed(2)}</td>
                    <td>★{Number(u.starBalance || 0).toFixed(0)}</td>
                    <td style={{ color: "var(--a-text-dim)" }}>
                      ${Number(u.dollarWinning || 0).toFixed(2)} · ₹{Number(u.rupeeWinning || 0).toFixed(2)} · ★{Number(u.starWinning || 0).toFixed(0)}
                    </td>
                    <td style={{ color: "var(--a-text-dim)" }}>{fmtDate(u.createdAt)}</td>
                  </tr>
                ))}
                {data?.users.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-6" style={{ color: "var(--a-text-dim)" }}>No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

/* ============= Deposits / Withdrawals shared ============= */

function TxFilterPage({
  type, title,
}: { type: "deposit" | "withdraw"; title: string }) {
  const [status, setStatus] = useState<string>("pending");
  const [items, setItems] = useState<AdminTx[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true); setErr(null);
    listTransactions({ type, status: status || undefined, limit: 100 })
      .then((d) => setItems(d.items))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const approve = async (id: string) => {
    if (!confirm(`Approve this ${type}?`)) return;
    setBusy(id);
    try {
      if (type === "withdraw") await approveWithdrawal(id);
      else await approveDeposit(id);
      load();
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  };
  const reject = async (id: string) => {
    const reason = prompt("Reason for rejection?") || "Rejected by admin";
    setBusy(id);
    try {
      if (type === "withdraw") await rejectWithdrawal(id, reason);
      else await rejectDeposit(id, reason);
      load();
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  };

  const colCount = type === "withdraw" ? 7 : 6;

  return (
    <Section eyebrow={type.toUpperCase() + "S"} title={title}
      right={<button className="a-btn a-btn-sm" onClick={load}><RefreshCw size={12} /> Refresh</button>}>
      <div className="flex gap-2 mb-3 flex-wrap">
        {["", "pending", "completed", "failed", "refunded"].map((s) => (
          <button key={s || "all"}
            className={`a-btn a-btn-sm ${status === s ? "a-btn-primary" : ""}`}
            onClick={() => setStatus(s)}>
            {s || "All"}
          </button>
        ))}
      </div>
      {loading ? <LoadingBlock /> : err ? <ErrorBlock message={err} onRetry={load} /> : (
        <div className="a-card overflow-x-auto">
          <table className="a-table w-full">
            <thead>
              <tr>
                <th>Time</th><th>User</th><th>Amount</th><th>Status</th>
                {type === "withdraw" && <th>Address / Network</th>}
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const u = txUserLabel(t);
                return (
                  <tr key={t._id}>
                    <td>{fmtDate(t.createdAt)}</td>
                    <td>
                      <div className="text-white font-medium">{u.primary}</div>
                      <div className="text-[11px]" style={{ color: "var(--a-text-mute)" }}>{u.sub}</div>
                      {t.user && (
                        <div className="text-[10px] mt-0.5" style={{ color: "var(--a-text-mute)" }}>
                          ${Number(t.user.dollarBalance || 0).toFixed(2)} · ₹{Number(t.user.rupeeBalance || 0).toFixed(2)} · ★{Number(t.user.starBalance || 0).toFixed(0)}
                        </div>
                      )}
                    </td>
                    <td className="font-semibold">{symFor(t.currency)}{Number(t.amount || 0).toLocaleString()}</td>
                    <td>
                      <span className="a-chip" style={{
                        background: t.status === "completed" ? "rgba(52,211,153,0.14)" :
                                    t.status === "pending" ? "rgba(255,196,0,0.14)" :
                                    "rgba(255,80,80,0.14)",
                        color: t.status === "completed" ? "var(--a-green)" :
                               t.status === "pending" ? "var(--a-yellow)" :
                               "var(--a-red)",
                      }}>{t.status}</span>
                    </td>
                    {type === "withdraw" && (
                      <td style={{ color: "var(--a-text-dim)" }}>
                        {t.cryptoAddress ? <span title={t.cryptoAddress}>{t.cryptoAddress.slice(0, 8)}…{t.cryptoAddress.slice(-6)}</span> : "—"}
                        {t.withdrawalNetwork && <span className="a-chip ml-2">{t.withdrawalNetwork}</span>}
                      </td>
                    )}
                    <td style={{ color: "var(--a-text-dim)" }}>{t.description || "—"}</td>
                    <td>
                      {t.status === "pending" ? (
                        <div className="flex gap-1">
                          <button disabled={busy === t._id} className="a-btn a-btn-sm" onClick={() => approve(t._id)} title="Approve">
                            <CheckCircle2 size={12} style={{ color: "var(--a-green)" }} /> Approve
                          </button>
                          <button disabled={busy === t._id} className="a-btn a-btn-sm" onClick={() => reject(t._id)} title="Reject">
                            <XCircle size={12} style={{ color: "var(--a-red)" }} /> Reject
                          </button>
                        </div>
                      ) : <span style={{ color: "var(--a-text-mute)" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={colCount}
                  className="text-center py-6" style={{ color: "var(--a-text-dim)" }}>No records.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

export function DepositsPage() { return <TxFilterPage type="deposit" title="Deposits" />; }
export function WithdrawalsPage() { return <TxFilterPage type="withdraw" title="Withdrawals" />; }

/* ============= Wallet Adjust ============= */

export function WalletAdjustPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  const [currency, setCurrency] = useState<"dollar" | "rupee" | "star">("dollar");
  const [balanceType, setBalanceType] = useState<"deposit" | "winning">("deposit");
  const [mode, setMode] = useState<"add" | "deduct" | "set">("add");
  const [amount, setAmount] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!q) { setUsers([]); return; }
    setSearching(true); setSearchErr(null);
    listUsers({ search: q, limit: 25 })
      .then((d) => setUsers(d.users))
      .catch((e) => setSearchErr(e.message))
      .finally(() => setSearching(false));
  }, [q]);

  const currentBalance = (u: AdminUser | null) => {
    if (!u) return 0;
    const field = balanceType === "winning"
      ? (currency === "dollar" ? "dollarWinning" : currency === "rupee" ? "rupeeWinning" : "starWinning")
      : (currency === "dollar" ? "dollarBalance" : currency === "rupee" ? "rupeeBalance" : "starBalance");
    return Number((u as any)[field] || 0);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    if (!selected) { setErr("Select a user first"); return; }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) { setErr("Enter a non-negative amount"); return; }
    let delta = amt;
    if (mode === "deduct") delta = -amt;
    if (mode === "set") delta = amt - currentBalance(selected);
    if (delta === 0) { setErr("No change to apply"); return; }
    setBusy(true);
    try {
      const r = await walletAdjust({
        targetUserId: selected.telegramId, currency, amount: delta, balanceType, note,
      });
      setMsg(`Saved. New balances: $${r.balance.dollarBalance} · ₹${r.balance.rupeeBalance} · ★${r.balance.starBalance}`);
      // update selected user snapshot
      setSelected({ ...selected,
        dollarBalance: r.balance.dollarBalance, rupeeBalance: r.balance.rupeeBalance, starBalance: r.balance.starBalance,
        dollarWinning: r.balance.dollarWinning ?? selected.dollarWinning,
        rupeeWinning: r.balance.rupeeWinning ?? selected.rupeeWinning,
        starWinning: r.balance.starWinning ?? selected.starWinning,
      });
      setAmount("0"); setNote("");
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Section eyebrow="TREASURY" title="Adjust user wallet">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="a-card">
          <div className="text-white font-bold text-[15px] mb-3">1. Find user</div>
          <div className="flex gap-2 mb-3">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
                 style={{ background: "rgba(10,15,26,0.7)", border: "1px solid var(--a-border)" }}>
              <Search size={14} style={{ color: "var(--a-text-mute)" }} />
              <input
                className="bg-transparent outline-none text-[13px] w-full placeholder:text-[var(--a-text-mute)]"
                placeholder="Name, username, or Telegram ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setQ(search.trim())}
              />
            </div>
            <button className="a-btn" onClick={() => setQ(search.trim())}>Search</button>
          </div>
          {searching ? <div className="text-[12px]" style={{ color: "var(--a-text-mute)" }}>Searching…</div>
            : searchErr ? <div className="text-[12px]" style={{ color: "#ff9b9b" }}>{searchErr}</div>
            : (
              <div className="max-h-64 overflow-y-auto">
                {users.map((u) => (
                  <button key={u._id} type="button"
                    onClick={() => setSelected(u)}
                    className="w-full text-left px-3 py-2 rounded-lg mb-1 flex items-center justify-between"
                    style={{
                      background: selected?._id === u._id ? "rgba(74,168,255,0.15)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${selected?._id === u._id ? "var(--a-blue)" : "var(--a-border)"}`,
                    }}>
                    <div>
                      <div className="text-white text-[13px] font-medium">{userName(u)}</div>
                      <div className="text-[11px]" style={{ color: "var(--a-text-mute)" }}>
                        {u.username ? `@${u.username} · ` : ""}#{u.telegramId}
                      </div>
                    </div>
                    <div className="text-[11px] text-right" style={{ color: "var(--a-text-dim)" }}>
                      ${Number(u.dollarBalance||0).toFixed(2)}<br/>
                      ₹{Number(u.rupeeBalance||0).toFixed(2)} · ★{Number(u.starBalance||0).toFixed(0)}
                    </div>
                  </button>
                ))}
                {q && !users.length && <div className="text-[12px] text-center py-4" style={{ color: "var(--a-text-mute)" }}>No users found.</div>}
                {!q && <div className="text-[12px] text-center py-4" style={{ color: "var(--a-text-mute)" }}>Search to load users.</div>}
              </div>
            )}
        </div>

        <form onSubmit={submit} className="a-card">
          <div className="text-white font-bold text-[15px] mb-3">2. Edit balance</div>
          {selected ? (
            <div className="mb-3 p-3 rounded-lg" style={{ background: "rgba(74,168,255,0.08)", border: "1px solid var(--a-border)" }}>
              <div className="text-white font-semibold text-[14px]">{userName(selected)}</div>
              <div className="text-[11px]" style={{ color: "var(--a-text-mute)" }}>
                {selected.username ? `@${selected.username} · ` : ""}#{selected.telegramId}
              </div>
              <div className="text-[12px] mt-2 grid grid-cols-3 gap-2">
                <div>Dep $ <b className="text-white">{Number(selected.dollarBalance||0).toFixed(2)}</b></div>
                <div>Dep ₹ <b className="text-white">{Number(selected.rupeeBalance||0).toFixed(2)}</b></div>
                <div>Dep ★ <b className="text-white">{Number(selected.starBalance||0).toFixed(0)}</b></div>
                <div>Win $ <b className="text-white">{Number(selected.dollarWinning||0).toFixed(2)}</b></div>
                <div>Win ₹ <b className="text-white">{Number(selected.rupeeWinning||0).toFixed(2)}</b></div>
                <div>Win ★ <b className="text-white">{Number(selected.starWinning||0).toFixed(0)}</b></div>
              </div>
            </div>
          ) : (
            <div className="text-[12px] mb-3" style={{ color: "var(--a-text-mute)" }}>Select a user from the search results on the left.</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="a-label">Currency</label>
              <select className="a-select" value={currency} onChange={(e) => setCurrency(e.target.value as any)}>
                <option value="dollar">Dollar ($)</option>
                <option value="rupee">Rupee (₹)</option>
                <option value="star">Star (★)</option>
              </select>
            </div>
            <div>
              <label className="a-label">Bucket</label>
              <select className="a-select" value={balanceType} onChange={(e) => setBalanceType(e.target.value as any)}>
                <option value="deposit">Deposit balance</option>
                <option value="winning">Winning balance</option>
              </select>
            </div>
            <div>
              <label className="a-label">Action</label>
              <select className="a-select" value={mode} onChange={(e) => setMode(e.target.value as any)}>
                <option value="add">Add (+)</option>
                <option value="deduct">Deduct (−)</option>
                <option value="set">Set exact value</option>
              </select>
            </div>
            <div>
              <label className="a-label">Amount</label>
              <input className="a-input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="a-label">Note (optional)</label>
              <input className="a-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / reference" />
            </div>
          </div>
          {selected && (
            <div className="mt-3 text-[12px]" style={{ color: "var(--a-text-dim)" }}>
              Current: <b className="text-white">{symFor(currency)}{currentBalance(selected).toFixed(2)}</b>
            </div>
          )}
          {err && <div className="mt-3 text-[13px]" style={{ color: "#ff9b9b" }}>{err}</div>}
          {msg && <div className="mt-3 text-[13px]" style={{ color: "var(--a-green)" }}>{msg}</div>}
          <div className="flex justify-end mt-4">
            <button disabled={busy || !selected} className="a-btn a-btn-primary">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Coins size={12} />} Apply
            </button>
          </div>
        </form>
      </div>
    </Section>
  );
}

/* ============= Games (with per-game analytics drill-down) ============= */

function GameAnalyticsPanel({ game, onClose }: { game: string; onClose: () => void }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<GameAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true); setErr(null);
    getGameAnalytics(game, days).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [days]);

  return (
    <div className="a-card mt-3" style={{ border: "1px solid var(--a-blue)" }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="a-eyebrow a-eyebrow-dim">GAME ANALYTICS</div>
          <div className="text-white text-[16px] font-bold capitalize">{game}</div>
        </div>
        <div className="flex gap-1">
          {[7, 14, 30, 90].map((n) => (
            <button key={n} className={`a-btn a-btn-sm ${days === n ? "a-btn-primary" : ""}`} onClick={() => setDays(n)}>{n}d</button>
          ))}
          <button className="a-btn a-btn-sm" onClick={load}><RefreshCw size={12} /></button>
          <button className="a-btn a-btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
      {loading ? <LoadingBlock /> : err ? <ErrorBlock message={err} onRetry={load} /> : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <StatCard label="Total bets" value={String(data.totals.betCount)} icon={<TrendingDown size={16} />} tone="yellow" />
            <StatCard label="Total wins" value={String(data.totals.winCount)} icon={<TrendingUp size={16} />} tone="teal" />
            <StatCard label="Bet volume"
              value={`$${data.totals.bet.dollar.toFixed(2)} · ₹${data.totals.bet.rupee.toFixed(2)} · ★${data.totals.bet.star.toFixed(0)}`}
              icon={<Coins size={16} />} tone="blue" />
            <StatCard label="Win payout"
              value={`$${data.totals.win.dollar.toFixed(2)} · ₹${data.totals.win.rupee.toFixed(2)} · ★${data.totals.win.star.toFixed(0)}`}
              icon={<Coins size={16} />} tone="green" />
          </div>
          <div className="overflow-x-auto">
            <table className="a-table w-full">
              <thead>
                <tr><th>Day</th><th>Bets ($)</th><th>Wins ($)</th><th>Bets (₹)</th><th>Wins (₹)</th><th>Bets (★)</th><th>Wins (★)</th><th># Bets</th><th># Wins</th></tr>
              </thead>
              <tbody>
                {data.series.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>${d.bet.dollar.toFixed(2)}</td>
                    <td>${d.win.dollar.toFixed(2)}</td>
                    <td>₹{d.bet.rupee.toFixed(2)}</td>
                    <td>₹{d.win.rupee.toFixed(2)}</td>
                    <td>★{d.bet.star.toFixed(0)}</td>
                    <td>★{d.win.star.toFixed(0)}</td>
                    <td>{d.betCount}</td>
                    <td>{d.winCount}</td>
                  </tr>
                ))}
                {!data.series.length && (
                  <tr><td colSpan={9} className="text-center py-6" style={{ color: "var(--a-text-dim)" }}>No activity in this window.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function GamesPage() {
  const [data, setData] = useState<GameStatRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openGame, setOpenGame] = useState<string | null>(null);

  const load = () => {
    setLoading(true); setErr(null);
    getGameStats().then((d) => setData(d.games)).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <LoadingBlock />;
  if (err) return <ErrorBlock message={err} onRetry={load} />;

  return (
    <Section eyebrow="GAMES" title="Per-game bet / win totals"
      right={<button className="a-btn a-btn-sm" onClick={load}><RefreshCw size={12} /> Refresh</button>}>
      <div className="a-card overflow-x-auto">
        <table className="a-table w-full">
          <thead>
            <tr>
              <th>Game</th><th>Bets ($)</th><th>Wins ($)</th><th>Bets (₹)</th><th>Wins (₹)</th>
              <th>Bets (★)</th><th>Wins (★)</th><th>Total bets</th><th>Total wins</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((g) => (
              <tr key={g.game}>
                <td className="text-white font-semibold capitalize">{g.game}</td>
                <td>${g.bets.dollar.toFixed(2)}</td>
                <td>${g.wins.dollar.toFixed(2)}</td>
                <td>₹{g.bets.rupee.toFixed(2)}</td>
                <td>₹{g.wins.rupee.toFixed(2)}</td>
                <td>★{g.bets.star.toFixed(0)}</td>
                <td>★{g.wins.star.toFixed(0)}</td>
                <td>{g.betCount}</td>
                <td>{g.winCount}</td>
                <td>
                  <button className="a-btn a-btn-sm"
                    onClick={() => setOpenGame(openGame === g.game ? null : g.game)}>
                    <Activity size={12} /> {openGame === g.game ? "Hide" : "Analytics"}
                  </button>
                </td>
              </tr>
            ))}
            {(!data || data.length === 0) && (
              <tr><td colSpan={10} className="text-center py-6" style={{ color: "var(--a-text-dim)" }}>No game bets recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {openGame && <GameAnalyticsPanel game={openGame} onClose={() => setOpenGame(null)} />}
    </Section>
  );
}

/* ============= Analytics ============= */

export function AnalyticsPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AnalyticsDay[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true); setErr(null);
    getAnalytics(days).then((d) => setData(d.series)).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [days]);

  const totals = useMemo(() => {
    const t = { dep: 0, wd: 0, bet: 0, win: 0 };
    (data || []).forEach((d) => {
      t.dep += (d.deposit?.dollar || 0) + (d.deposit?.rupee || 0) + (d.deposit?.star || 0);
      t.wd += (d.withdraw?.dollar || 0) + (d.withdraw?.rupee || 0) + (d.withdraw?.star || 0);
      t.bet += (d.bet?.dollar || 0) + (d.bet?.rupee || 0) + (d.bet?.star || 0);
      t.win += (d.win?.dollar || 0) + (d.win?.rupee || 0) + (d.win?.star || 0);
    });
    return t;
  }, [data]);

  return (
    <>
      <Section eyebrow="ANALYTICS" title={`Activity — last ${days} days`}
        right={
          <div className="flex gap-1">
            {[7, 14, 30, 90].map((n) => (
              <button key={n} className={`a-btn a-btn-sm ${days === n ? "a-btn-primary" : ""}`} onClick={() => setDays(n)}>{n}d</button>
            ))}
            <button className="a-btn a-btn-sm" onClick={load}><RefreshCw size={12} /></button>
          </div>
        }>
        <div className="grid md:grid-cols-4 gap-4">
          <StatCard label="Deposits (all)" value={money(totals.dep)} icon={<ArrowDownToLine size={16} />} tone="green" />
          <StatCard label="Withdrawals (all)" value={money(totals.wd)} icon={<ArrowUpFromLine size={16} />} tone="red" />
          <StatCard label="Bets (all)" value={money(totals.bet)} icon={<TrendingDown size={16} />} tone="yellow" />
          <StatCard label="Wins (all)" value={money(totals.win)} icon={<TrendingUp size={16} />} tone="teal" />
        </div>
        {loading ? <LoadingBlock /> : err ? <ErrorBlock message={err} onRetry={load} /> : (
          <div className="a-card mt-4 overflow-x-auto">
            <table className="a-table w-full">
              <thead>
                <tr><th>Day</th><th>Deposits</th><th>Withdrawals</th><th>Bets</th><th>Wins</th></tr>
              </thead>
              <tbody>
                {(data || []).map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>${(d.deposit?.dollar||0).toFixed(2)} · ₹{(d.deposit?.rupee||0).toFixed(2)} · ★{(d.deposit?.star||0).toFixed(0)}</td>
                    <td>${(d.withdraw?.dollar||0).toFixed(2)} · ₹{(d.withdraw?.rupee||0).toFixed(2)} · ★{(d.withdraw?.star||0).toFixed(0)}</td>
                    <td>${(d.bet?.dollar||0).toFixed(2)} · ₹{(d.bet?.rupee||0).toFixed(2)} · ★{(d.bet?.star||0).toFixed(0)}</td>
                    <td>${(d.win?.dollar||0).toFixed(2)} · ₹{(d.win?.rupee||0).toFixed(2)} · ★{(d.win?.star||0).toFixed(0)}</td>
                  </tr>
                ))}
                {(!data || data.length === 0) && (
                  <tr><td colSpan={5} className="text-center py-6" style={{ color: "var(--a-text-dim)" }}>No completed transactions in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

/* ============= Profile ============= */

export function ProfilePage() {
  const email = "admin@gmail.com";
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="a-card md:col-span-1 text-center">
        <div className="h-24 w-24 rounded-2xl mx-auto flex items-center justify-center text-[36px] font-bold" style={{ background:"linear-gradient(135deg,#4de3d3,#4aa8ff)", color:"#04070d" }}>A</div>
        <div className="text-white text-[16px] font-bold mt-3">Admin</div>
        <div className="text-[12px]" style={{ color: "var(--a-text-dim)" }}>{email}</div>
        <span className="a-chip a-chip-admin mt-3 inline-flex">super-admin</span>
      </div>
      <div className="md:col-span-2 a-card">
        <div className="text-white text-[14px] font-semibold mb-3">Account details</div>
        <div className="text-[13px]" style={{ color: "var(--a-text-dim)" }}>
          Admin credentials are set via backend env variables <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code>.
          To change them, update the Koyeb service environment variables and restart the service.
        </div>
        <div className="mt-4 text-[12px]" style={{ color: "var(--a-text-mute)" }}>
          Session token is stored locally (30-day expiry). Logout clears it from this device.
        </div>
      </div>
    </div>
  );
}

/* ============= Feature-not-connected placeholders (all remaining pages) ============= */

/* ============= Static visual clones (match target admin panel) =============
   These pages mirror the target admin panel UI 1:1. When the corresponding
   backend endpoints are wired, swap the static values for live data. */

function PageHeader({ icon, title, subtitle, right, tone = "teal" }:
  { icon?: ReactNode; title: string; subtitle?: string; right?: ReactNode; tone?: string }) {
  const bg: Record<string,string> = {
    teal: "linear-gradient(135deg,#4de3d3,#33d69f)",
    blue: "linear-gradient(135deg,#4aa8ff,#6a5bff)",
    purple: "linear-gradient(135deg,#a06bff,#ff6ea8)",
    orange: "linear-gradient(135deg,#f6a24a,#ff6a4a)",
    green: "linear-gradient(135deg,#33d69f,#4de3d3)",
    yellow: "linear-gradient(135deg,#f6c453,#f6a24a)",
    pink: "linear-gradient(135deg,#ff6ea8,#a06bff)",
    red: "linear-gradient(135deg,#ff5b6a,#ff6a4a)",
  };
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
               style={{ background: bg[tone] || bg.teal, color: "#04070d" }}>
            {icon}
          </div>
        )}
        <div>
          <div className="text-white text-[26px] font-bold leading-tight">{title}</div>
          {subtitle && <div className="text-[13px] mt-1" style={{ color: "var(--a-text-dim)" }}>{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

const saveBtn = (label = "Save Changes") => (
  <button className="a-btn a-btn-primary">
    <Database size={14} /> {label}
  </button>
);

/* ---------- Banners ---------- */
export function BannersPage() {
  return (
    <div>
      <div className="a-card mb-6">
        <div className="text-white font-bold text-[18px] mb-4">Upload New Banner</div>
        <div className="a-label">Banner Image</div>
        <button className="a-btn mb-4"><Database size={14}/> Choose Image</button>
        <div className="a-label">Alt Text</div>
        <input className="a-input" placeholder="Enter banner description" />
        <label className="flex items-center gap-2 mt-4 text-[13px]">
          <input type="checkbox" defaultChecked /> Active (visible on home page)
        </label>
        <button className="a-btn a-btn-primary mt-4" style={{ background: "#3b82f6", color: "#fff" }}>Upload Banner</button>
      </div>
      <div className="a-card">
        <div className="text-white font-bold text-[18px] mb-4">All Banners (0)</div>
        <div className="text-center py-10 text-[13px]" style={{ color: "var(--a-text-mute)" }}>No banners uploaded yet.</div>
      </div>
    </div>
  );
}

/* ---------- Moderators ---------- */
export function ModeratorsPage() {
  return (
    <div>
      <PageHeader title="Moderators" right={<button className="a-btn a-btn-primary" style={{background:"#3b82f6",color:"#fff"}}>+ Add Moderator</button>} />
      <div className="a-card">
        <div className="a-eyebrow a-eyebrow-dim">MODERATORS</div>
        <div className="flex items-center justify-between mt-1 mb-4">
          <div className="text-white text-[18px] font-bold">Moderator Management</div>
          <div className="text-[12px]" style={{ color: "var(--a-text-mute)" }}>Total: 1 moderator</div>
        </div>
        <input className="a-input mb-4" placeholder="Search by name, email, or phone…" />
        <table className="a-table">
          <thead><tr><th>Moderator</th><th>Phone</th><th>Roles</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            <tr>
              <td><div className="text-white font-medium">Admin</div><div className="text-[11px]" style={{color:"var(--a-text-mute)"}}>admin@gmail.com</div></td>
              <td>—</td>
              <td><span className="a-chip a-chip-role">admin</span></td>
              <td><span className="a-chip a-chip-active">active</span></td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Support ---------- */
export function SupportPage() {
  return (
    <div className="a-card">
      <div className="a-eyebrow a-eyebrow-dim">SUPPORT</div>
      <div className="flex items-center justify-between mt-1 mb-4">
        <div className="text-white text-[18px] font-bold">Support Tickets</div>
        <div className="text-[12px]" style={{ color: "var(--a-text-mute)" }}>Total: 0 tickets</div>
      </div>
      <div className="flex gap-3 mb-4">
        <input className="a-input" placeholder="Search by ticket ID, title, user email, phone, or name…" />
        <button className="a-btn shrink-0"><Search size={14}/> Filters</button>
      </div>
      <table className="a-table">
        <thead><tr><th>Ticket ID</th><th>User</th><th>Title</th><th>Type</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody><tr><td colSpan={7} className="text-center py-8" style={{color:"var(--a-text-mute)"}}>No support tickets found</td></tr></tbody>
      </table>
    </div>
  );
}

/* ---------- Announcements ---------- */
export function AnnouncementsPage() {
  return (
    <div>
      <div className="a-card mb-6">
        <div className="text-white font-bold text-[18px] mb-4">Create New Announcement</div>
        <div className="a-label">Title</div>
        <input className="a-input mb-4" placeholder="Enter announcement title" />
        <div className="a-label">Message</div>
        <textarea className="a-textarea mb-4" rows={4} placeholder="Enter announcement message" />
        <div className="a-label">Priority (Higher = shown first)</div>
        <input className="a-input mb-2" defaultValue="0" />
        <div className="text-[11px] mb-4" style={{color:"var(--a-text-mute)"}}>Higher priority announcements appear first. Default is 0.</div>
        <label className="flex items-center gap-2 text-[13px] mb-4"><input type="checkbox" defaultChecked/> Active (visible on web side)</label>
        <button className="a-btn" style={{background:"#3b82f6",color:"#fff"}}>Create Announcement</button>
      </div>
      <div className="a-card">
        <div className="text-white font-bold text-[18px] mb-4">All Announcements (0)</div>
        <div className="text-center py-8 text-[13px]" style={{color:"var(--a-text-mute)"}}>No announcements yet.</div>
      </div>
    </div>
  );
}

/* ---------- Forgotten Passwords / Contact Requests ---------- */
export function ForgottenPasswordsPage() {
  return (
    <div className="a-card">
      <div className="a-eyebrow a-eyebrow-dim">CONTACT</div>
      <div className="text-white text-[18px] font-bold mt-1 mb-4">Contact Requests</div>
      <div className="flex gap-3 mb-4">
        <input className="a-input" placeholder="Search by name, email, or mobile…" />
        <button className="a-btn shrink-0">Filters</button>
      </div>
      <table className="a-table">
        <thead><tr><th>Name</th><th>Contact</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
        <tbody><tr><td colSpan={5} className="text-center py-8" style={{color:"var(--a-text-mute)"}}>No contact requests found</td></tr></tbody>
      </table>
    </div>
  );
}

/* ---------- Spare Wallet ---------- */
export function SpareWalletPage() {
  return (
    <div>
      <div className="a-eyebrow mb-2">TODAY · WINGO, K3, K5</div>
      <div className="a-card mb-4" style={{ borderColor: "rgba(246,164,74,0.35)", background: "linear-gradient(180deg, rgba(60,40,20,0.4), rgba(20,15,10,0.6))" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[12px]" style={{color:"var(--a-text-dim)"}}>Current spare wallet (today)</div>
            <div className="text-[32px] font-bold text-white mt-2">₹0</div>
            <div className="text-[11px] mt-2" style={{color:"var(--a-text-mute)"}}>Wins are paid from this balance only · Resets at midnight IST</div>
          </div>
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{background:"rgba(246,164,74,0.2)",color:"#f6a24a"}}><Coins size={22}/></div>
        </div>
      </div>
      <div className="a-card mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-white font-semibold">Spare target today</div>
          <div className="text-[12px]" style={{color:"var(--a-text-dim)"}}>0% / 30% goal</div>
        </div>
        <div className="a-bar-track"><div className="a-bar-fill" style={{ width: "0%" }} /></div>
        <div className="text-right text-[11px] mt-2" style={{color:"var(--a-text-mute)"}}>Target spare ₹0</div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Today's bet amount" value="₹0" icon={<TrendingUp size={16}/>} tone="teal"/>
        <StatCard label="Today's in spare" value="₹0" icon={<Coins size={16}/>} tone="yellow"/>
        <StatCard label="Today's payout" value="₹0" icon={<TrendingDown size={16}/>} tone="green"/>
      </div>
      <div className="a-eyebrow mb-2">ALL TIME (LIFETIME)</div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total bet" value="₹0" icon={<TrendingUp size={16}/>} tone="blue"/>
        <StatCard label="Total in spare" value="₹0" icon={<Coins size={16}/>} tone="yellow"/>
        <StatCard label="Total payout" value="₹0" icon={<TrendingDown size={16}/>} tone="green"/>
      </div>
    </div>
  );
}

/* ---------- Daily Analytics (Bucket) ---------- */
export function DailyAnalyticsPage() {
  return (
    <div>
      <PageHeader title="Daily Analytics (Wingo, K3, K5)" subtitle="Bucket amount, daily bets, payouts, profit and history — all timestamps in IST"
        right={<span className="a-chip"><Activity size={12}/> IST (Asia/Kolkata)</span>} />
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Bucket amount (Spare)" value="0" icon={<Coins size={16}/>} tone="yellow"/>
        <StatCard label="Total bet (all time)" value="0" icon={<TrendingUp size={16}/>} tone="blue"/>
        <StatCard label="Total payout (all time)" value="0" icon={<TrendingDown size={16}/>} tone="teal"/>
        <StatCard label="Complete profit (all time)" value="0" hint="Target profit %: 30%" icon={<TrendingUp size={16}/>} tone="green"/>
      </div>
      <div className="a-card">
        <div className="flex items-center gap-2 mb-1">
          <Activity size={16} style={{color:"var(--a-teal)"}}/>
          <div className="text-white font-bold text-[16px]">Daily history (IST)</div>
        </div>
        <div className="text-[12px] mb-4" style={{color:"var(--a-text-mute)"}}>Snapshot saved at daily clear (00:05 IST). Date = day for which stats are recorded.</div>
        <table className="a-table">
          <thead><tr><th>Date (IST)</th><th>Daily bet</th><th>Daily payout</th><th>Daily profit</th><th>Spare before reset</th><th>Spare after reset</th><th>Saved at (IST)</th></tr></thead>
          <tbody><tr><td colSpan={7} className="text-center py-8" style={{color:"var(--a-text-mute)"}}>No history yet</td></tr></tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Bonus & Income Report ---------- */
export function BonusIncomeReportPage() {
  const stats = [
    { label: "SIGNUP BONUS", v: "₹0.00", n: "0", tone: "blue" },
    { label: "FIRST DEPOSIT BONUS", v: "₹0.00", n: "0", tone: "pink" },
    { label: "REFERRAL DEPOSIT BONUS", v: "₹0.00", n: "0", tone: "green" },
    { label: "RANK REWARD", v: "₹0.00", n: "0", tone: "orange" },
    { label: "GIFT CODE", v: "₹0.00", n: "0", tone: "red" },
  ] as const;
  return (
    <div>
      <PageHeader title="Bonus & Income Report" subtitle="Complete MLM and bonus overview"
        right={<div className="flex gap-2"><button className="a-btn" style={{background:"#33d69f",color:"#04070d"}}>Download Excel</button><button className="a-btn" style={{background:"#ff5b6a",color:"#fff"}}>Download PDF</button></div>} />
      <div className="a-card mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-white text-[18px] font-bold">MLM & Bonus Report</div>
            <div className="text-[13px]" style={{color:"var(--a-text-dim)"}}>Complete overview of all bonuses and MLM incomes</div>
          </div>
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{background:"linear-gradient(135deg,#a06bff,#ff6ea8)"}}><TrendingUp size={16} color="#fff"/></div>
        </div>
        <div className="a-eyebrow a-eyebrow-dim mb-3">🎁 Bonus Statistics</div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {stats.map(s=>(
            <div key={s.label} className="a-card a-card-tight">
              <div className="flex items-start justify-between">
                <div className="a-stat-label" style={{letterSpacing:"0.16em",textTransform:"uppercase",fontSize:11}}>{s.label}</div>
                <div className="h-7 w-7 rounded-lg" style={{background:`var(--a-${s.tone==="orange"?"yellow":s.tone})`,opacity:0.9}}/>
              </div>
              <div className="text-white text-[22px] font-bold mt-2">{s.v}</div>
              <div className="flex items-center justify-between mt-3 pt-3 text-[11px]" style={{borderTop:"1px solid var(--a-border)",color:"var(--a-text-mute)"}}>
                <span>Total Count</span><span className="text-white font-semibold">{s.n}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="a-eyebrow a-eyebrow-dim mb-3">📈 Income Statistics</div>
        <div className="grid grid-cols-3 gap-4">
          {["RECHARGE LEVEL","TRADE LEVEL","SALARY (DAILY)","SALARY (WEEKLY)","SALARY (MONTHLY)"].map(l=>(
            <div key={l} className="a-card a-card-tight">
              <div className="a-stat-label" style={{letterSpacing:"0.16em",textTransform:"uppercase",fontSize:11}}>{l} INCOME</div>
              <div className="text-white text-[22px] font-bold mt-2">₹0.00</div>
              <div className="flex items-center justify-between mt-3 pt-3 text-[11px]" style={{borderTop:"1px solid var(--a-border)",color:"var(--a-text-mute)"}}>
                <span>Total Count</span><span className="text-white font-semibold">0</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="a-card">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-white text-[18px] font-bold">Users Breakdown</div>
            <div className="text-[13px]" style={{color:"var(--a-text-dim)"}}>Detailed bonus and MLM income per user</div>
          </div>
        </div>
        <input className="a-input mb-4" placeholder="Search users…"/>
        <div className="text-center py-8 text-[13px]" style={{color:"var(--a-text-mute)"}}>No MLM data yet</div>
      </div>
    </div>
  );
}

/* ---------- Financials Report ---------- */
export function FinancialsReportPage() {
  return (
    <div>
      <PageHeader title="Financials Report" subtitle="Complete financial overview"
        right={<div className="flex gap-2"><button className="a-btn" style={{background:"#33d69f",color:"#04070d"}}>Download Excel</button><button className="a-btn" style={{background:"#ff5b6a",color:"#fff"}}>Download PDF</button></div>} />
      <div className="a-card mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-white text-[18px] font-bold">Financials Report</div>
            <div className="text-[13px]" style={{color:"var(--a-text-dim)"}}>Complete financial overview of deposits and withdrawals</div>
          </div>
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{background:"linear-gradient(135deg,#33d69f,#4de3d3)"}}><Coins size={16} color="#04070d"/></div>
        </div>
        <div className="text-white font-semibold mb-3">User Transactions</div>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatCard label="TOTAL USER DEPOSITS" value="₹0.00" hint="All user deposits received · Count 0" icon={<ArrowDownToLine size={16}/>} tone="green"/>
          <StatCard label="TOTAL USER WITHDRAWALS" value="₹0.00" hint="All user withdrawals processed · Count 0" icon={<ArrowUpFromLine size={16}/>} tone="red"/>
        </div>
        <div className="text-white font-semibold mb-3">Admin Wallet Adjustments</div>
        <div className="grid grid-cols-4 gap-4">
          {["ADMIN CREDITS - MAIN","ADMIN CREDITS - GAMING","ADMIN DEBITS - MAIN","ADMIN DEBITS - GAMING"].map((l,i)=>(
            <div key={l} className="a-card a-card-tight">
              <div className="a-stat-label" style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.14em"}}>{l}</div>
              <div className="text-white text-[22px] font-bold mt-2">₹0.00</div>
              <div className="text-[11px] mt-1" style={{color:"var(--a-text-mute)"}}>{i<2?"Total admin credits":"Total admin debits"}</div>
              <div className="flex items-center justify-between mt-3 pt-3 text-[11px]" style={{borderTop:"1px solid var(--a-border)",color:"var(--a-text-mute)"}}>
                <span>Count</span><span className="text-white font-semibold">0</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="a-card">
        <div className="a-eyebrow a-eyebrow-dim mb-1">FINANCIALS REPORT</div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-white text-[18px] font-bold">Users Breakdown</div>
            <div className="text-[13px]" style={{color:"var(--a-text-dim)"}}>Detailed financial transactions per user</div>
          </div>
          <div className="text-[12px]" style={{color:"var(--a-text-mute)"}}>Total: 0 users</div>
        </div>
        <input className="a-input mb-4" placeholder="Search users…"/>
        <div className="text-center py-8 text-[13px]" style={{color:"var(--a-text-mute)"}}>No records yet</div>
      </div>
    </div>
  );
}

/* ---------- User Theme ---------- */
export function UserThemePage() {
  const themes = [
    { name: "Orange Red", g: "linear-gradient(135deg,#e67302,#ee0a24)", p:"#e67302", s:"#ee0a24", active: true },
    { name: "Blue Purple", g: "linear-gradient(135deg,#3b82f6,#8b5cf6)", p:"#3b82f6", s:"#8b5cf6" },
    { name: "Green Teal",  g: "linear-gradient(135deg,#10b981,#14b8a6)", p:"#10b981", s:"#14b8a6" },
    { name: "Purple Pink", g: "linear-gradient(135deg,#a855f7,#ec4899)", p:"#a855f7", s:"#ec4899" },
    { name: "Light Golden",g: "linear-gradient(135deg,#c78f2e,#c9a75d)", p:"#c78f2e", s:"#c9a75d" },
    { name: "Dark Golden", g: "linear-gradient(135deg,#c78f2e,#c9a75d)", p:"#c78f2e", s:"#c9a75d" },
  ];
  return (
    <div>
      <PageHeader title="User Theme Management" tone="pink" />
      <div className="a-card mb-6">
        <div className="a-eyebrow a-eyebrow-dim">USER THEME MANAGEMENT</div>
        <div className="text-white text-[18px] font-bold mt-1">Select Active Theme</div>
        <div className="text-[13px] mt-2" style={{color:"var(--a-text-dim)"}}>Choose a theme that will be visible to all users in the web application. The selected theme will be applied globally.</div>
        <div className="text-[13px] mt-3">Current Active Theme: <span className="text-white font-semibold">Orange Red</span></div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {themes.map(t=>(
          <div key={t.name} className="a-card" style={t.active ? { borderColor: "rgba(77,227,211,0.5)" } : {}}>
            <div className="h-24 rounded-xl" style={{ background: t.g }} />
            <div className="mt-3 text-white font-semibold">{t.name}</div>
            <div className="text-[12px]" style={{color:"var(--a-text-mute)"}}>{t.active ? "Currently Active" : "Click to activate"}</div>
            <div className="flex flex-col gap-1 mt-3 text-[12px]">
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{background:t.p}}/> Primary: {t.p}</div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{background:t.s}}/> Secondary: {t.s}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="a-card">
        <div className="text-white text-[16px] font-bold mb-3">Theme Preview</div>
        <div className="h-24 rounded-xl flex items-center justify-center text-white text-[22px] font-bold" style={{ background: themes[0].g }}>Orange Red</div>
        <div className="grid grid-cols-2 gap-4 mt-4 text-[12px]" style={{color:"var(--a-text-dim)"}}>
          <div>Gradient From<div className="text-white mt-1">#e67302</div></div>
          <div>Gradient To<div className="text-white mt-1">#ee0a24</div></div>
        </div>
      </div>
    </div>
  );
}

/* ---------- MLM Plans ---------- */
function PlanCard({ title, subtitle, chip, chipTone, levels, minLabel, minValue, borderTone }:
  { title: string; subtitle: string; chip: string; chipTone: string; levels: Array<{n:number;p:string}>; minLabel: string; minValue: string; borderTone: string }) {
  return (
    <div className="a-card" style={{ borderColor: borderTone }}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-white text-[18px] font-bold flex items-center gap-2">{title} <span style={{color:"#f6c453"}}>★</span></div>
          <div className="text-[13px]" style={{color:"var(--a-text-dim)"}}>{subtitle}</div>
        </div>
        <button className="h-8 w-8 rounded-lg flex items-center justify-center" style={{background:"rgba(30,42,68,0.6)",border:"1px solid var(--a-border)"}}><TrendingUp size={12}/></button>
      </div>
      <div className="flex gap-2 mb-4">
        <span className="a-chip" style={{color:chipTone,borderColor:chipTone,background:`${chipTone}20`}}>{chip}</span>
        <span className="a-chip a-chip-active">Active</span>
      </div>
      <div className="rounded-xl p-3" style={{background:"rgba(10,15,26,0.5)",border:"1px solid var(--a-border)"}}>
        <div className="text-[11px] mb-1" style={{color:"var(--a-text-mute)"}}>Levels Configuration</div>
        <div className="text-white font-bold mb-2">{levels.length} Levels</div>
        {levels.map(l=>(
          <div key={l.n} className="flex justify-between text-[12px] py-0.5">
            <span style={{color:"var(--a-text-dim)"}}>Level {l.n}:</span>
            <span style={{color:chipTone,fontWeight:600}}>{l.p}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[13px] mt-4">
        <span style={{color:"var(--a-text-dim)"}}>{minLabel}:</span>
        <span className="text-white font-semibold">{minValue}</span>
      </div>
    </div>
  );
}

export function DepositPlansPage() {
  return (
    <div>
      <PageHeader icon={<TrendingUp size={18}/>} title="Deposit Reward Plans" subtitle="Manage commission plans for deposit rewards" tone="green"/>
      <div className="grid grid-cols-3 gap-4">
        <PlanCard title="test" subtitle="test1" chip="Deposit Plan" chipTone="#33d69f" borderTone="rgba(51,214,159,0.4)"
          levels={[{n:1,p:"3%"},{n:2,p:"5%"},{n:3,p:"2%"},{n:4,p:"0%"},{n:5,p:"0%"}]} minLabel="Min Deposit" minValue="₹100" />
      </div>
    </div>
  );
}

export function BetPlansPage() {
  return (
    <div>
      <PageHeader icon={<Activity size={18}/>} title="Bet Reward Plans" subtitle="Manage commission plans for bet rewards" tone="blue"/>
      <div className="grid grid-cols-3 gap-4">
        <PlanCard title="star" subtitle="test" chip="Bet Plan" chipTone="#4aa8ff" borderTone="rgba(74,168,255,0.4)"
          levels={[{n:1,p:"10%"},{n:2,p:"5%"},{n:3,p:"2%"}]} minLabel="Min Bet" minValue="₹100" />
      </div>
    </div>
  );
}

function TierRow({ p, r, i }: { p: string; r: string; i: string }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end mb-3">
      <div><div className="a-label">Active Players</div><input className="a-input" defaultValue={p}/></div>
      <div><div className="a-label">Min Recharge (₹)</div><input className="a-input" defaultValue={r}/></div>
      <div><div className="a-label">Income (₹)</div><input className="a-input" defaultValue={i}/></div>
      <button className="a-btn" style={{background:"rgba(255,91,106,0.15)",color:"#ff5b6a",borderColor:"rgba(255,91,106,0.3)"}}>🗑</button>
    </div>
  );
}

export function SalaryIncomePage() {
  return (
    <div>
      <PageHeader icon={<TrendingUp size={18}/>} title="Salary Income Plans" subtitle="Configure salary income tiers for daily, weekly, and monthly periods" tone="purple"
        right={<button className="a-btn" style={{background:"#33d69f",color:"#04070d"}}>💾 Save All Settings</button>} />
      {[
        { name: "Daily Salary Income", rows: [["2","2000","150"],["5","5000","350"],["10","10000","1000"]]},
        { name: "Weekly Salary Income", rows: [["5","5000","1000"],["10","10000","2000"]]},
        { name: "Monthly Salary Income", rows: [["5","5000","5000"],["10","10000","10000"]]},
      ].map(g=>(
        <div key={g.name} className="a-card mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-white font-bold text-[16px]">{g.name}</div>
            <button className="a-btn a-btn-sm">+ Add Tier</button>
          </div>
          {g.rows.map((r,i)=>(<TierRow key={i} p={r[0]} r={r[1]} i={r[2]}/>))}
        </div>
      ))}
    </div>
  );
}

export function RankSystemPage() {
  const ranks = [
    ["Bronze","10000","5","3"],["Silver","100000","10","2"],["Gold","150000","15","1.5"],
    ["Star","300000","20","1"],["Diamond","500000","25","1"],
  ];
  return (
    <div>
      <PageHeader icon={<TrendingUp size={18}/>} title="Rank System" subtitle="Configure rank definitions with turnover, referrals, and bonus percentages" tone="yellow"
        right={<div className="flex gap-2"><button className="a-btn">+ Add Rank</button><button className="a-btn" style={{background:"#33d69f",color:"#04070d"}}>💾 Save All Settings</button></div>} />
      <div className="a-card">
        {ranks.map((r,i)=>(
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 mb-3">
            <div><div className="a-label">Rank Name</div><input className="a-input" defaultValue={r[0]}/></div>
            <div><div className="a-label">Turnover (₹)</div><input className="a-input" defaultValue={r[1]}/></div>
            <div><div className="a-label">Direct Referrals</div><input className="a-input" defaultValue={r[2]}/></div>
            <div><div className="a-label">Bonus %</div><input className="a-input" defaultValue={r[3]}/></div>
            <div className="flex items-end"><button className="a-btn" style={{background:"rgba(255,91,106,0.15)",color:"#ff5b6a",borderColor:"rgba(255,91,106,0.3)"}}>🗑</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- System Controls ---------- */
function ControlCard({ title, note, on = true, tone = "blue" }:
  { title: string; note: string; on?: boolean; tone?: string }) {
  const bg: Record<string,string> = { blue:"#4aa8ff", teal:"#4de3d3", purple:"#a06bff", orange:"#f6a24a", red:"#ff5b6a" };
  return (
    <div className="a-card">
      <div className="flex items-start justify-between mb-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{background:bg[tone],color:"#fff"}}><Activity size={16}/></div>
        <div className={`a-toggle ${on?"on":""}`}/>
      </div>
      <div className="text-white font-bold">{title}</div>
      <div className="text-[12px] mt-1 mb-3" style={{color:"var(--a-text-dim)"}}>{note}</div>
      <span className={`a-chip ${on?"a-chip-active":"a-chip-danger"}`}>● {on?"Enabled":"Disabled"}</span>
    </div>
  );
}
export function SystemControlsPage() {
  return (
    <div>
      <PageHeader title="System Controls" subtitle="Manage platform features, access, and system settings" tone="teal"
        right={<button className="a-btn" style={{background:"#3b82f6",color:"#fff"}}>💾 Save Changes</button>} />
      <div className="grid grid-cols-3 gap-4">
        <ControlCard title="User Registration" note="Allow new users to register" tone="teal" />
        <ControlCard title="User Login" note="Allow users to login" tone="blue" />
        <ControlCard title="Games" note="Enable all games" tone="purple" />
        <ControlCard title="TRX Game" note="Enable or disable TRX Turbo Desk game" tone="orange" />
        <ControlCard title="Deposits" note="Allow users to deposit" tone="red" />
        <ControlCard title="Withdrawals" note="Allow users to withdraw" tone="teal" />
        <ControlCard title="Maintenance Mode" note="Put platform in maintenance mode" on={false} tone="red" />
      </div>
    </div>
  );
}

/* ---------- Site & Logo ---------- */
export function SiteLogoPage() {
  return (
    <div>
      <PageHeader title="Site & Logo" subtitle="Upload a logo. It will be used in the admin panel and on the web app (login, header, home)." tone="blue"/>
      <div className="a-card">
        <div className="text-white font-semibold">Current logo</div>
        <div className="text-[13px] mt-1 mb-4" style={{color:"var(--a-text-dim)"}}>No logo uploaded. Logo is shown only when uploaded to S3 (sidebar, login, web, favicon).</div>
        <button className="a-btn" style={{background:"linear-gradient(135deg,#f6a24a,#ff6a4a)",color:"#fff",border:"none"}}>⬆ Upload new logo</button>
      </div>
    </div>
  );
}

/* ---------- Bonus Settings ---------- */
export function BonusSettingsPage() {
  return (
    <div>
      <PageHeader title="Bonus Settings" subtitle="Configure all bonus, reward, and commission settings"
        right={<button className="a-btn" style={{background:"#33d69f",color:"#04070d"}}>💾 Save All Settings</button>} />
      <div className="flex gap-6 border-b mb-6" style={{borderColor:"var(--a-border)"}}>
        <div className="pb-3 text-[13px] font-semibold" style={{color:"var(--a-teal)",borderBottom:"2px solid var(--a-teal)"}}>🎁 Signup Bonus</div>
        <div className="pb-3 text-[13px]" style={{color:"var(--a-text-dim)"}}>↗ Welcome Deposit</div>
        <div className="pb-3 text-[13px]" style={{color:"var(--a-text-dim)"}}>👥 Referral Bonus</div>
      </div>
      <div className="a-card">
        <div className="text-white text-[16px] font-bold mb-4">Signup Bonus Configuration</div>
        <label className="flex items-center gap-2 text-[13px] mb-4"><input type="checkbox" defaultChecked/> Enable Signup Bonus</label>
        <div className="a-label">Bonus Amount (₹)</div>
        <input className="a-input" defaultValue="30"/>
        <div className="text-[12px] mt-2" style={{color:"var(--a-text-mute)"}}>Amount credited to Gaming Wallet on signup</div>
      </div>
    </div>
  );
}

/* ---------- Aviator Bucket ---------- */
export function AviatorBucketPage() {
  return (
    <div>
      <PageHeader title="Aviator Bucket Settings" subtitle="Min/max bet, profit pool and game status for Aviator (crash) game"
        right={<button className="a-btn" style={{background:"#33d69f",color:"#04070d"}}>💾 Save Changes</button>} />
      <div className="a-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{background:"linear-gradient(135deg,#33d69f,#4de3d3)"}}>✈</div>
          <div>
            <div className="text-white font-bold">Aviator Settings</div>
            <div className="text-[12px]" style={{color:"var(--a-text-dim)"}}>These values control the crash game: min/max bet, profit pool (house edge bucket), and game status.</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><div className="a-label">Game Status (avi_status)</div><select className="a-select"><option>Enabled (Y)</option><option>Disabled (N)</option></select><div className="text-[11px] mt-1" style={{color:"var(--a-text-mute)"}}>Y = game available, N = game disabled</div></div>
          <div><div className="a-label">Min Bet Amount</div><input className="a-input" defaultValue="10"/><div className="text-[11px] mt-1" style={{color:"var(--a-text-mute)"}}>Minimum bet per round (e.g. 10)</div></div>
          <div><div className="a-label">Max Bet Amount</div><input className="a-input" defaultValue="8000"/><div className="text-[11px] mt-1" style={{color:"var(--a-text-mute)"}}>Maximum bet per round (e.g. 8000)</div></div>
          <div><div className="a-label">Profit Pool (aviator_profit_pool)</div><input className="a-input" defaultValue="49.2"/><div className="text-[11px] mt-1" style={{color:"var(--a-text-mute)"}}>House profit pool / bucket (used for crash logic)</div></div>
        </div>
        <div className="mt-4 p-3 rounded-xl" style={{background:"rgba(74,168,255,0.06)",border:"1px solid rgba(74,168,255,0.25)"}}>
          <div className="text-[13px] font-semibold" style={{color:"var(--a-blue)"}}>ⓘ Bucket settings</div>
          <div className="text-[12px] mt-1" style={{color:"var(--a-text-dim)"}}>Changes apply immediately. Min/max bet are validated when users place bets. Profit pool affects house edge calculation for crash multiplier.</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Cron Management ---------- */
function CronCard({ title, when, note }: { title: string; when: string; note: string }) {
  return (
    <div className="a-card">
      <div className="text-white font-bold text-[16px]">{title}</div>
      <div className="text-[12px] mt-2 mb-3 flex items-start gap-1" style={{color:"var(--a-text-dim)"}}>📅 {when}</div>
      <div className="text-[13px] mb-4" style={{color:"var(--a-text-dim)"}}>{note}</div>
      <button className="a-btn w-full justify-center" style={{background:"linear-gradient(135deg,#4de3d3,#4aa8ff)",color:"#04070d",border:"none"}}>▶ Run Now</button>
    </div>
  );
}
export function CronManagementPage() {
  return (
    <div>
      <PageHeader icon={<Activity size={18}/>} title="Cron Job Management" subtitle="Manage and trigger automated salary distribution jobs" tone="blue"/>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <CronCard title="Daily Salary Distribution" when="Once per IST calendar day (runs shortly after server start if missed at midnight)" note="Distributes daily salary to eligible users based on direct-downline activity and tiers (daily + weekly + monthly qualification required)."/>
        <CronCard title="Weekly Salary Distribution" when="Once per IST Sunday (any time that Sunday)" note="Distributes weekly salary based on direct-downline performance over the past week (daily + weekly + monthly qualification required)."/>
        <CronCard title="Monthly Salary Distribution" when="Once per IST calendar month (if the 1st is missed, runs when the server is up)" note="Distributes monthly salary based on direct-downline performance over the past calendar month (daily + weekly + monthly qualification required)."/>
      </div>
      <div className="a-card">
        <div className="text-white font-bold mb-3">Salary Distribution Rules:</div>
        <ul className="text-[13px] space-y-2" style={{color:"var(--a-text-dim)"}}>
          <li><span className="text-white font-semibold">Direct team only:</span> Active players and deposits count only from level-1 referrals (direct downline), not deeper levels.</li>
          <li><span className="text-white font-semibold">Triple qualification:</span> A payout runs only if the user qualifies for admin tiers on daily, weekly, and monthly salary for the IST windows aligned with that job.</li>
          <li><span className="text-white font-semibold">Daily Salary:</span> Direct downlines must bet at least once on the counted day AND deposit rules meet the tier for that day.</li>
          <li><span className="text-white font-semibold">Weekly Salary:</span> Direct downlines must bet at least once on EACH of the 7 days AND meet per-day deposit rules for the week.</li>
          <li><span className="text-white font-semibold">Monthly Salary:</span> Direct downlines must bet at least once on EACH of the 30 days AND meet per-day deposit rules for the month.</li>
        </ul>
      </div>
    </div>
  );
}

/* ---------- Gift Codes ---------- */
export function GiftCodesPage() {
  return (
    <div>
      <PageHeader icon={<Coins size={18}/>} title="Gift Code Management" subtitle="Create and manage gift codes for users" tone="teal"
        right={<button className="a-btn" style={{background:"linear-gradient(135deg,#4de3d3,#4aa8ff)",color:"#04070d",border:"none"}}>+ Create Gift Code</button>} />
      <div className="a-card">
        <div className="text-white font-bold text-[16px] mb-4">All Gift Codes</div>
        <table className="a-table">
          <thead><tr><th>Code</th><th>Amount/User</th><th>Redemptions</th><th>Expires</th><th>Status</th><th>Notification</th></tr></thead>
          <tbody>
            <tr>
              <td className="text-white font-semibold">NEWUSER</td>
              <td>₹10</td>
              <td>0 / 10</td>
              <td>—</td>
              <td><span className="a-chip a-chip-active">Active</span></td>
              <td>🔕</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Settings (Security & Wallet) ---------- */
export function SettingsPage() {
  const [cfg, setCfg] = useState<UpiConfig>({
    upiId: "", payeeName: "", qrImageUrl: "", isEnabled: false, exchangeRate: 85,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    getUpiConfig()
      .then((c) => { if (alive) setCfg({
        upiId: c.upiId || "", payeeName: c.payeeName || "", qrImageUrl: c.qrImageUrl || "",
        isEnabled: !!c.isEnabled, exchangeRate: Number(c.exchangeRate) || 85,
      }); })
      .catch((e) => setMsg({ tone: "err", text: e.message || "Failed to load" }))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const save = async () => {
    setMsg(null);
    if (!cfg.upiId.trim()) { setMsg({ tone: "err", text: "UPI ID is required" }); return; }
    setSaving(true);
    try {
      const r = await saveUpiConfig(cfg);
      setCfg(r.config);
      setMsg({ tone: "ok", text: "UPI settings saved." });
    } catch (e: any) {
      setMsg({ tone: "err", text: e.message || "Save failed" });
    } finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader title="UPI Payment Settings" subtitle="Manual UPI deposits — users pay to your UPI ID, admin approves in Deposits" tone="teal"/>

      {loading ? (
        <div className="a-card flex items-center gap-2 text-white/70 text-[13px]">
          <Loader2 className="h-4 w-4 animate-spin"/> Loading…
        </div>
      ) : (
        <div className="a-card mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-white font-bold text-[16px]">Manual UPI Deposit</div>
              <div className="text-[12px]" style={{ color: "var(--a-text-dim)" }}>
                Toggle to show / hide UPI deposit option in user wallet
              </div>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer text-[13px] text-white">
              <input type="checkbox" checked={cfg.isEnabled}
                onChange={(e) => setCfg({ ...cfg, isEnabled: e.target.checked })}/>
              {cfg.isEnabled ? "Enabled" : "Disabled"}
            </label>
          </div>

          <div className="a-label">UPI ID (VPA)</div>
          <input className="a-input mb-3" placeholder="yourname@okhdfcbank"
            value={cfg.upiId}
            onChange={(e) => setCfg({ ...cfg, upiId: e.target.value })}/>

          <div className="a-label">Payee Name (shown in UPI app)</div>
          <input className="a-input mb-3" placeholder="Royal King Games"
            value={cfg.payeeName}
            onChange={(e) => setCfg({ ...cfg, payeeName: e.target.value })}/>

          <div className="a-label">QR Image URL (optional — leave blank to auto-generate)</div>
          <input className="a-input mb-3" placeholder="https://…/qr.png"
            value={cfg.qrImageUrl}
            onChange={(e) => setCfg({ ...cfg, qrImageUrl: e.target.value })}/>

          <div className="a-label">1 USDT = ? INR (exchange rate)</div>
          <input className="a-input mb-4" type="number" min={1} step={0.01}
            value={cfg.exchangeRate}
            onChange={(e) => setCfg({ ...cfg, exchangeRate: Number(e.target.value) || 0 })}/>

          <div className="flex items-center gap-3">
            <button className="a-btn" disabled={saving}
              onClick={save}
              style={{ background: "linear-gradient(135deg,#33d69f,#0ea5e9)", color: "#04070d", border: "none", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "💾 Save UPI Settings"}
            </button>
            {msg && (
              <span className="text-[12px]" style={{ color: msg.tone === "ok" ? "#33d69f" : "#ef4444" }}>
                {msg.text}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="a-card">
        <div className="a-eyebrow a-eyebrow-dim">HOW IT WORKS</div>
        <ol className="text-[12px] mt-2 space-y-1 pl-4 list-decimal" style={{ color: "var(--a-text-dim)" }}>
          <li>User opens Wallet → taps <b>Pay with UPI / QR Code</b>.</li>
          <li>User pays to your UPI ID above and enters the 12-digit UTR / Transaction ID.</li>
          <li>Request appears in <b>Deposits</b> page as pending.</li>
          <li>You verify the UTR in your bank/UPI app and click <b>Approve</b> — balance is instantly credited to the user's ₹ wallet.</li>
        </ol>
      </div>
    </div>
  );
}


/* ---------- Deposit Type ---------- */
function DepositMethodCard({ title, desc, steps, tone, on = true }:
  { title: string; desc: string; steps: string[]; tone: string; on?: boolean }) {
  return (
    <div className="a-card mb-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{background:tone,color:"#fff"}}>💳</div>
          <div>
            <div className="text-white font-bold text-[16px]">{title}</div>
            <div className="text-[13px] mt-1" style={{color:"var(--a-text-dim)"}}>{desc}</div>
          </div>
        </div>
        <div className={`a-toggle ${on?"on":""}`}/>
      </div>
      <div className="rounded-xl p-3 mt-3" style={{background:"rgba(74,168,255,0.06)",border:"1px solid rgba(74,168,255,0.25)"}}>
        <div className="text-[13px] font-semibold mb-2" style={{color:"var(--a-blue)"}}>ⓘ How it works:</div>
        <ul className="text-[12px] space-y-1 pl-4 list-disc" style={{color:"var(--a-text-dim)"}}>
          {steps.map((s,i)=><li key={i}>{s}</li>)}
        </ul>
      </div>
      <div className="mt-3"><span className="a-chip a-chip-active">● Enabled</span></div>
    </div>
  );
}
export function DepositTypePage() {
  return (
    <div>
      <PageHeader title="Deposit Type" subtitle="Configure available deposit payment methods for users"
        right={<button className="a-btn" style={{background:"#3b82f6",color:"#fff"}}>💾 Save Changes</button>} />
      <DepositMethodCard title="Manual Pay" tone="#4aa8ff"
        desc="When enabled, users can deposit funds using manual UPI transfer. This is the primary payment method that must be enabled before other methods can be used."
        steps={["User selects Manual Pay as payment method","User enters deposit amount","System provides UPI QR code or payment details","User completes payment via UPI transfer","Admin manually verifies and approves deposit"]}/>
      <DepositMethodCard title="USDT BEP20" tone="#f6a24a"
        desc="When enabled, users can deposit funds using USDT (BEP20) cryptocurrency. Users will send USDT to a provided wallet address and the deposit will be automatically verified."
        steps={["User selects USDT BEP20 as payment method","User enters USDT amount (minimum $10)","System provides BEP20 wallet address","User sends USDT to the address","System automatically verifies and processes deposit"]}/>
    </div>
  );
}

/* Deposit minimum & Withdraw limit share visual style */
export function WithdrawLimitPage() {
  return (
    <div>
      <PageHeader icon={<TrendingDown size={18}/>} title="Withdraw Limit" subtitle="Set min/max and rules for user withdrawals. These apply to the user web panel (withdraw page) and are enforced by the server." tone="orange"
        right={<button className="a-btn" style={{background:"#33d69f",color:"#04070d"}}>💾 Save & Apply</button>} />
      <div className="a-card">
        <div className="text-white font-bold text-[16px] mb-4">Min, max & daily limit (applied on user panel)</div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div><div className="a-label">Minimum (₹)</div><input className="a-input" defaultValue="300"/><div className="text-[11px] mt-1" style={{color:"var(--a-text-mute)"}}>Users cannot withdraw below this.</div></div>
          <div><div className="a-label">Maximum per withdrawal (₹)</div><input className="a-input" placeholder="0 = no limit"/><div className="text-[11px] mt-1" style={{color:"var(--a-text-mute)"}}>0 = no limit.</div></div>
          <div><div className="a-label">Daily limit (₹)</div><input className="a-input" placeholder="0 = no limit"/><div className="text-[11px] mt-1" style={{color:"var(--a-text-mute)"}}>Max total per user per day. 0 = no cap.</div></div>
        </div>
        <div className="rounded-xl p-3" style={{background:"rgba(10,15,26,0.5)",border:"1px solid var(--a-border)"}}>
          <div className="text-white font-semibold mb-2">Summary</div>
          <ul className="text-[13px] space-y-1 pl-4 list-disc" style={{color:"var(--a-text-dim)"}}>
            <li>Min: ₹300</li><li>Max per withdrawal: No limit</li><li>Daily limit: No limit</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ============= Aviator Fun Control ============= */
import {
  getAviatorFunOverview, getAviatorFunProfit, setAviatorFunProfit,
  addAviatorFunManual, removeAviatorFunManual, clearAviatorFunManual,
  forceCrashAviatorFun, resetAviatorFunLedger,
  type AviatorFunOverview, type AviatorFunCurrency, type AviatorFunPoolOverview,
} from "@/lib/adminApi";
import { Plane, Zap, RotateCcw, Trash2, Plus } from "lucide-react";

const CURRENCIES: Array<{ key: AviatorFunCurrency; label: string; symbol: string }> = [
  { key: "dollar", label: "USD", symbol: "$" },
  { key: "rupee", label: "INR", symbol: "₹" },
  { key: "star", label: "STAR", symbol: "★" },
];

function PhaseBadge({ phase }: { phase: string }) {
  const color = phase === "flying" ? "#33d69f" : phase === "crashed" ? "#ff6b6b" : "#4aa8ff";
  return (
    <span className="a-chip" style={{ background: `color-mix(in oklab, ${color} 20%, transparent)`, color, borderColor: color }}>
      {phase.toUpperCase()}
    </span>
  );
}

function AviatorFunPoolCard({
  currencyKey, symbol, label, pool, onAdd, onRemove, onClear, onForce, onReset,
}: {
  currencyKey: AviatorFunCurrency; symbol: string; label: string; pool: AviatorFunPoolOverview;
  onAdd: (v: number) => void; onRemove: (i: number) => void; onClear: () => void;
  onForce: () => void; onReset: () => void;
}) {
  const [newVal, setNewVal] = useState("");
  return (
    <div className="a-card">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--a-text-mute)" }}>{label} pool</div>
          <div className="text-white font-bold text-[18px] flex items-center gap-2 mt-0.5">
            Round #{pool.roundNumber} <PhaseBadge phase={pool.phase} />
            {pool.manualOverride && <span className="a-chip" style={{ background: "rgba(255,193,7,0.15)", color: "#ffc107", borderColor: "#ffc107" }}>MANUAL</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px]" style={{ color: "var(--a-text-mute)" }}>MULTIPLIER</div>
          <div className="text-[22px] font-bold" style={{ color: pool.phase === "crashed" ? "#ff6b6b" : "#33d69f" }}>
            {pool.multiplier.toFixed(2)}x
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3 text-center">
        <div className="rounded-lg p-2" style={{ background: "rgba(10,15,26,0.5)" }}>
          <div className="text-[10px]" style={{ color: "var(--a-text-mute)" }}>Round Pool</div>
          <div className="text-white font-semibold text-[13px]">{symbol}{pool.totalPool.toFixed(2)}</div>
        </div>
        <div className="rounded-lg p-2" style={{ background: "rgba(10,15,26,0.5)" }}>
          <div className="text-[10px]" style={{ color: "var(--a-text-mute)" }}>Paid Out</div>
          <div className="text-white font-semibold text-[13px]">{symbol}{pool.totalPaidOut.toFixed(2)}</div>
        </div>
        <div className="rounded-lg p-2" style={{ background: "rgba(10,15,26,0.5)" }}>
          <div className="text-[10px]" style={{ color: "var(--a-text-mute)" }}>Cum Pool</div>
          <div className="text-white font-semibold text-[13px]">{symbol}{pool.cumPool.toFixed(2)}</div>
        </div>
        <div className="rounded-lg p-2" style={{ background: "rgba(10,15,26,0.5)" }}>
          <div className="text-[10px]" style={{ color: "var(--a-text-mute)" }}>House Net</div>
          <div className="font-semibold text-[13px]" style={{ color: pool.houseNet >= 0 ? "#33d69f" : "#ff6b6b" }}>
            {symbol}{pool.houseNet.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="a-label mb-1">Manual crash queue (next: {pool.manualQueue[0] ? `${pool.manualQueue[0]}x` : "—"})</div>
        <div className="flex gap-2 mb-2">
          <input className="a-input flex-1" placeholder="e.g. 1.50" value={newVal}
                 onChange={(e) => setNewVal(e.target.value)} />
          <button className="a-btn" style={{ background: "#4aa8ff", color: "#04070d" }}
                  onClick={() => { const n = Number(newVal); if (n > 0) { onAdd(n); setNewVal(""); } }}>
            <Plus size={14} /> Add
          </button>
          <button className="a-btn" style={{ background: "rgba(255,107,107,0.15)", color: "#ff6b6b", border: "1px solid #ff6b6b" }}
                  onClick={onClear} disabled={!pool.manualQueue.length}>
            <Trash2 size={14} /> Clear
          </button>
        </div>
        {pool.manualQueue.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pool.manualQueue.map((v, i) => (
              <button key={i} onClick={() => onRemove(i)} className="a-chip" title="Click to remove"
                      style={{ background: "rgba(74,168,255,0.15)", color: "#4aa8ff", borderColor: "#4aa8ff" }}>
                {i + 1}. {v}x ×
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        <button className="a-btn flex-1" style={{ background: "rgba(255,193,7,0.15)", color: "#ffc107", border: "1px solid #ffc107" }}
                onClick={onForce} disabled={pool.phase !== "flying"} title="Crash the current flying round now">
          <Zap size={14} /> Force Crash
        </button>
        <button className="a-btn flex-1" style={{ background: "rgba(180,180,180,0.15)", color: "var(--a-text-mute)", border: "1px solid var(--a-border-strong)" }}
                onClick={onReset} title="Reset cumulative ledger for this pool">
          <RotateCcw size={14} /> Reset Ledger
        </button>
      </div>

      <div className="mb-2">
        <div className="a-label mb-1">History (latest {pool.history.length})</div>
        <div className="flex flex-wrap gap-1">
          {pool.history.map((h, i) => (
            <span key={i} className="a-chip"
                  style={{ background: h >= 2 ? "rgba(51,214,159,0.15)" : "rgba(255,107,107,0.15)",
                           color: h >= 2 ? "#33d69f" : "#ff6b6b", borderColor: h >= 2 ? "#33d69f" : "#ff6b6b" }}>
              {h.toFixed(2)}x
            </span>
          ))}
          {!pool.history.length && <span className="text-[11px]" style={{ color: "var(--a-text-mute)" }}>No rounds yet.</span>}
        </div>
      </div>

      <div>
        <div className="a-label mb-1">Live bets ({pool.totalPlayers})</div>
        <div className="rounded-lg overflow-hidden" style={{ background: "rgba(10,15,26,0.5)", border: "1px solid var(--a-border)" }}>
          {pool.bets.length === 0 && (
            <div className="p-3 text-[12px]" style={{ color: "var(--a-text-mute)" }}>No active bets.</div>
          )}
          {pool.bets.map((b) => (
            <div key={b.key} className="flex items-center justify-between px-3 py-2 border-b"
                 style={{ borderColor: "var(--a-border)" }}>
              <div className="text-[12px] text-white">
                <span className="font-semibold">{b.firstName || "Player"}</span>
                <span style={{ color: "var(--a-text-mute)" }}> · #{b.userId} · slot {b.slot}</span>
              </div>
              <div className="text-[12px] font-semibold text-white">
                {symbol}{b.amount.toFixed(2)}
                {b.cashedOutAt ? (
                  <span style={{ color: "#33d69f" }}> → {b.cashedOutAt}x = {symbol}{b.winAmount.toFixed(2)}</span>
                ) : (
                  <span style={{ color: "var(--a-text-mute)" }}> · flying</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AviatorFunControlPage() {
  const [overview, setOverview] = useState<AviatorFunOverview["overview"] | null>(null);
  const [profit, setProfit] = useState<number | null>(null);
  const [profitInput, setProfitInput] = useState<string>("");
  const [profitDirty, setProfitDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const results = await Promise.allSettled([getAviatorFunOverview(), getAviatorFunProfit()]);
    const ov = results[0];
    const pf = results[1];
    if (ov.status === "fulfilled" && ov.value?.overview) {
      setOverview(ov.value.overview);
    }
    if (pf.status === "fulfilled" && typeof pf.value?.percent === "number") {
      setProfit(pf.value.percent);
      if (!profitDirty) setProfitInput(String(pf.value.percent));
    }
    const firstErr = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (firstErr && ov.status === "rejected" && pf.status === "rejected") {
      setError((firstErr.reason as Error)?.message || "Failed to load Aviator Fun data");
    } else {
      setError(null);
    }
    setLoaded(true);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profitDirty]);

  const saveProfit = async () => {
    const n = Number(profitInput);
    if (isNaN(n) || n < 0 || n > 95) { setError("Profit must be a number between 0 and 95"); return; }
    setSaving(true);
    try {
      const res = await setAviatorFunProfit(n);
      setProfit(res.percent ?? n);
      setProfitInput(String(res.percent ?? n));
      setProfitDirty(false);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const profitDisplay = profit === null ? "—" : `${profit}%`;

  return (
    <div>
      <PageHeader icon={<Plane size={18} />} title="Aviator Fun Control"
        subtitle="Independent from real Aviator. Manage house edge, force crashes, and preview live rounds across all three currency pools."
        tone="teal"
        right={<button className="a-btn" onClick={load}><RefreshCw size={14}/> Refresh</button>} />

      {error && (
        <div className="a-card mb-4" style={{ borderColor: "#ff6b6b" }}>
          <div className="text-[13px]" style={{ color: "#ff6b6b" }}>⚠ {error}</div>
          <div className="text-[11px] mt-1" style={{ color: "var(--a-text-mute)" }}>
            Backend endpoint <code>/api/admin/aviator-fun/*</code> unreachable. Ensure the Node backend is deployed and reachable at <code>VITE_API_BASE_URL</code>.
          </div>
        </div>
      )}

      <div className="a-card mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-white font-bold text-[16px]">House profit target</div>
            <div className="text-[12px]" style={{ color: "var(--a-text-mute)" }}>
              Currently <span className="text-white font-semibold">{profitDisplay}</span>. Applies to all new rounds across every currency pool.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="a-input w-24 text-center"
              type="number" min={0} max={95}
              placeholder="50"
              value={profitInput}
              onChange={(e) => { setProfitInput(e.target.value); setProfitDirty(true); }}
            />
            <span className="text-white">%</span>
            <button className="a-btn" style={{ background: "#33d69f", color: "#04070d" }}
                    onClick={saveProfit} disabled={saving || !profitInput}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save
            </button>
          </div>
        </div>
      </div>

      {!overview && !loaded ? (
        <div className="a-card flex items-center gap-2 text-[13px]" style={{ color: "var(--a-text-mute)" }}>
          <Loader2 className="animate-spin" size={16} /> Loading pools…
        </div>
      ) : !overview ? (
        <div className="a-card text-[13px]" style={{ color: "var(--a-text-mute)" }}>
          No pool data available yet. Waiting for backend…
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {CURRENCIES.map((c) => {
            const raw = overview[c.key];
            const pool: AviatorFunPoolOverview = {
              roundNumber: raw?.roundNumber ?? 0,
              phase: raw?.phase ?? "betting",
              multiplier: Number(raw?.multiplier ?? 1),
              timeLeft: raw?.timeLeft ?? 0,
              totalPool: Number(raw?.totalPool ?? 0),
              totalPaidOut: Number(raw?.totalPaidOut ?? 0),
              cumPool: Number(raw?.cumPool ?? 0),
              cumPaid: Number(raw?.cumPaid ?? 0),
              houseNet: Number(raw?.houseNet ?? 0),
              totalPlayers: raw?.totalPlayers ?? 0,
              manualQueue: Array.isArray(raw?.manualQueue) ? raw!.manualQueue : [],
              manualOverride: !!raw?.manualOverride,
              crashAt: raw?.crashAt ?? null,
              history: Array.isArray(raw?.history) ? raw!.history : [],
              bets: Array.isArray(raw?.bets) ? raw!.bets : [],
            };
            return (
              <AviatorFunPoolCard
                key={c.key} currencyKey={c.key} symbol={c.symbol} label={c.label}
                pool={pool}
                onAdd={async (v) => { await addAviatorFunManual(c.key, v); load(); }}
                onRemove={async (i) => { await removeAviatorFunManual(c.key, i); load(); }}
                onClear={async () => { await clearAviatorFunManual(c.key); load(); }}
                onForce={async () => { await forceCrashAviatorFun(c.key); load(); }}
                onReset={async () => { if (confirm("Reset cumulative ledger for " + c.label + " pool?")) { await resetAviatorFunLedger(c.key); load(); } }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

