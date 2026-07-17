import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, Users as UsersIcon,
  Search, TrendingUp, TrendingDown, Activity, Wallet, Gamepad2,
  ShieldAlert, Crown, RefreshCw, Loader2, CheckCircle2, XCircle,
  DollarSign, Coins, Sparkles, Database, AlertCircle, Info,
} from "lucide-react";
import {
  getSummary, listUsers, listTransactions, walletAdjust,
  approveWithdrawal, rejectWithdrawal, getAnalytics, getGameStats,
  type AdminSummary, type AdminUser, type AdminTx, type AnalyticsDay, type GameStatRow,
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
  const n = Number(v || 0);
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
    <div className="flex justify-between">
      <span style={{ color: "var(--a-text-mute)" }}>{label}</span>
      <span className="text-white font-semibold">{value}</span>
    </div>
  );
}

function symFor(c: string) { return c === "dollar" ? "$" : c === "rupee" ? "₹" : c === "star" ? "★" : ""; }

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
          {items.map((t) => (
            <tr key={t._id}>
              <td>{fmtDate(t.createdAt)}</td>
              <td>#{t.telegramId}</td>
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
          ))}
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
  type, title, allowActions,
}: { type: "deposit" | "withdraw"; title: string; allowActions?: boolean }) {
  const [status, setStatus] = useState<string>("");
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
    setBusy(id);
    try { await approveWithdrawal(id); load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  };
  const reject = async (id: string) => {
    const reason = prompt("Reason for rejection?") || "Rejected by admin";
    setBusy(id);
    try { await rejectWithdrawal(id, reason); load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  };

  return (
    <Section eyebrow={type.toUpperCase() + "S"} title={title}
      right={<button className="a-btn a-btn-sm" onClick={load}><RefreshCw size={12} /> Refresh</button>}>
      <div className="flex gap-2 mb-3">
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
                {allowActions && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t._id}>
                  <td>{fmtDate(t.createdAt)}</td>
                  <td>#{t.telegramId}</td>
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
                  {type === "withdraw" && (
                    <td style={{ color: "var(--a-text-dim)" }}>
                      {t.cryptoAddress ? <span title={t.cryptoAddress}>{t.cryptoAddress.slice(0, 8)}…{t.cryptoAddress.slice(-6)}</span> : "—"}
                      {t.withdrawalNetwork && <span className="a-chip ml-2">{t.withdrawalNetwork}</span>}
                    </td>
                  )}
                  <td style={{ color: "var(--a-text-dim)" }}>{t.description || "—"}</td>
                  {allowActions && (
                    <td>
                      {t.status === "pending" ? (
                        <div className="flex gap-1">
                          <button disabled={busy === t._id} className="a-btn a-btn-sm" onClick={() => approve(t._id)} title="Approve">
                            <CheckCircle2 size={12} style={{ color: "var(--a-green)" }} />
                          </button>
                          <button disabled={busy === t._id} className="a-btn a-btn-sm" onClick={() => reject(t._id)} title="Reject">
                            <XCircle size={12} style={{ color: "var(--a-red)" }} />
                          </button>
                        </div>
                      ) : <span style={{ color: "var(--a-text-mute)" }}>—</span>}
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={allowActions ? (type === "withdraw" ? 7 : 6) : (type === "withdraw" ? 6 : 5)}
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
export function WithdrawalsPage() { return <TxFilterPage type="withdraw" title="Withdrawals" allowActions />; }

/* ============= Wallet Adjust ============= */

export function WalletAdjustPage() {
  const [targetUserId, setTargetUserId] = useState("");
  const [currency, setCurrency] = useState<"dollar" | "rupee" | "star">("dollar");
  const [balanceType, setBalanceType] = useState<"deposit" | "winning">("deposit");
  const [amount, setAmount] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    const amt = Number(amount);
    if (!targetUserId.trim() || !Number.isFinite(amt) || amt === 0) {
      setErr("Enter a valid Telegram ID and non-zero amount");
      return;
    }
    setBusy(true);
    try {
      const r = await walletAdjust({ targetUserId: targetUserId.trim(), currency, amount: amt, balanceType, note });
      setMsg(`✅ Adjusted. New balances: $${r.balance.dollarBalance} · ₹${r.balance.rupeeBalance} · ★${r.balance.starBalance}`);
      setAmount("0"); setNote("");
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Section eyebrow="TREASURY" title="Adjust user wallet">
      <form onSubmit={submit} className="a-card max-w-2xl">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="a-label">Target Telegram ID</label>
            <input className="a-input" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} placeholder="e.g. 6965488457" />
          </div>
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
            <label className="a-label">Amount (use negative to deduct)</label>
            <input className="a-input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="a-label">Note (optional)</label>
            <input className="a-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / reference" />
          </div>
        </div>
        {err && <div className="mt-3 text-[13px]" style={{ color: "#ff9b9b" }}>{err}</div>}
        {msg && <div className="mt-3 text-[13px]" style={{ color: "var(--a-green)" }}>{msg}</div>}
        <div className="flex justify-end mt-4">
          <button disabled={busy} className="a-btn a-btn-primary">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Coins size={12} />} Apply adjustment
          </button>
        </div>
      </form>
    </Section>
  );
}

/* ============= Games ============= */

export function GamesPage() {
  const [data, setData] = useState<GameStatRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
              <th>Bets (★)</th><th>Wins (★)</th><th>Total bets</th><th>Total wins</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((g) => (
              <tr key={g.game}>
                <td className="text-white font-semibold">{g.game}</td>
                <td>${g.bets.dollar.toFixed(2)}</td>
                <td>${g.wins.dollar.toFixed(2)}</td>
                <td>₹{g.bets.rupee.toFixed(2)}</td>
                <td>₹{g.wins.rupee.toFixed(2)}</td>
                <td>★{g.bets.star.toFixed(0)}</td>
                <td>★{g.wins.star.toFixed(0)}</td>
                <td>{g.betCount}</td>
                <td>{g.winCount}</td>
              </tr>
            ))}
            {(!data || data.length === 0) && (
              <tr><td colSpan={9} className="text-center py-6" style={{ color: "var(--a-text-dim)" }}>No game bets recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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

export function BannersPage()          { return <NotConnected title="Banners" note="Banner CRUD ke liye backend mein Banner model + endpoints add karne honge." />; }
export function ModeratorsPage()       { return <NotConnected title="Moderators" note="Sirf ek admin abhi supported hai (env se). Multi-admin/roles enable karne ke liye AdminUser model chahiye." />; }
export function SupportPage()          { return <NotConnected title="Support tickets" note="Support ticket collection abhi backend mein nahi hai." />; }
export function AnnouncementsPage()    { return <NotConnected title="Announcements" note="Announcements collection abhi backend mein nahi hai." />; }
export function ForgottenPasswordsPage(){return <NotConnected title="Forgotten passwords" note="Password reset requests track karne ke liye alag collection chahiye." />; }
export function SpareWalletPage()      { return <NotConnected title="Spare wallet (Wingo/K3/…)" note="Ye games/wallet abhi is app ka part nahi hain." />; }
export function DailyAnalyticsPage()   { return <NotConnected title="Daily analytics (Wingo/K3/…)" note="Ye analytics category abhi tracked nahi hai. Overall daily data ke liye Analytics page dekhein." />; }
export function BonusIncomeReportPage(){ return <NotConnected title="Bonus & income report" note="Bonus/commission tracking backend mein enable karne ke baad connect ho jayega." />; }
export function FinancialsReportPage() { return <NotConnected title="Financials report" note="Aggregated financial report ke liye extra endpoint add karna hoga (abhi Dashboard aur Analytics real-time totals dete hain)." />; }
export function UserThemePage()        { return <NotConnected title="User theme" note="Per-user theme setting collection chahiye." />; }
export function DepositPlansPage()     { return <NotConnected title="Deposit plans" note="MLM deposit plans backend mein nahi hai." />; }
export function BetPlansPage()         { return <NotConnected title="Bet plans" note="MLM bet plans backend mein nahi hai." />; }
export function SalaryIncomePage()     { return <NotConnected title="Salary income" note="MLM salary system backend mein nahi hai." />; }
export function RankSystemPage()       { return <NotConnected title="Rank system" note="MLM rank system backend mein nahi hai." />; }
export function SystemControlsPage()   { return <NotConnected title="System controls" note="Global system flags collection add karne ke baad connect hoga." />; }
export function SiteLogoPage()         { return <NotConnected title="Site & logo" note="Site config Setting model use kar sakta hai — chahiye to add kar dete hain." />; }
export function BonusSettingsPage()    { return <NotConnected title="Bonus settings" note="Bonus rules Setting model mein add karne ke baad connect hoga." />; }
export function AviatorBucketPage()    { return <NotConnected title="Aviator bucket" note="Legacy /admin-legacy panel mein Aviator controls hain (profit %, manual crash queue). Yahaan integrate karna ho to batayein." />; }
export function CronManagementPage()   { return <NotConnected title="Cron management" note="Backend cron jobs abhi manage karne ke liye endpoint nahi hai." />; }
export function GiftCodesPage()        { return <NotConnected title="Gift codes" note="GiftCode collection abhi backend mein nahi hai." />; }
export function SettingsPage()         { return <NotConnected title="Settings" note="Generic Setting collection exist karta hai but read/write UI abhi enable nahi kiya — chahiye to jodenge." />; }
export function DepositTypePage()      { return <NotConnected title="Deposit type / min" note="Configurable deposit types collection chahiye." />; }
export function WithdrawLimitPage()    { return <NotConnected title="Withdraw limit" note="Configurable withdraw limits collection chahiye." />; }
