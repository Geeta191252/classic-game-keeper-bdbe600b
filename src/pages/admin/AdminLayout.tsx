import { useState, useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity, Users, Gamepad2, Image as ImageIcon, ShieldCheck, MessageSquare,
  Megaphone, KeyRound, Wallet, ArrowDownToLine, ArrowUpFromLine, Coins,
  BarChart3, PiggyBank, LineChart, Network, DollarSign, Palette, TrendingUp,
  Target, CalendarClock, Crown, ShieldAlert, Type, Gift, Plane, Clock, Ticket,
  Settings, Layers, MinusCircle, UserCircle2, ChevronLeft, ChevronRight,
  Bell, Search, Sparkles, type LucideIcon,
} from "lucide-react";
import "@/styles/admin.css";

type Item = { to: string; label: string; icon: LucideIcon };
type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    label: "Operations",
    items: [
      { to: "/admin/dashboard", label: "Dashboard", icon: Activity },
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/games", label: "Games", icon: Gamepad2 },
      { to: "/admin/banners", label: "Banners", icon: ImageIcon },
      { to: "/admin/moderators", label: "Moderators", icon: ShieldCheck },
      { to: "/admin/support", label: "Support", icon: MessageSquare },
      { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
      { to: "/admin/forgotten-passwords", label: "Forgotten Passwords", icon: KeyRound },
    ],
  },
  {
    label: "Financial",
    items: [
      { to: "/admin/deposits", label: "Deposits", icon: ArrowDownToLine },
      { to: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
      { to: "/admin/wallet-adjust", label: "Wallet Adjust", icon: Coins },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/admin/spare-wallet", label: "Spare Wallet (Wingo, K3, …)", icon: PiggyBank },
      { to: "/admin/daily-analytics", label: "Daily Analytics (Wingo, K…)", icon: LineChart },
      { to: "/admin/bonus-income-report", label: "Bonus & Income Report", icon: Network },
      { to: "/admin/financials-report", label: "Financials Report", icon: DollarSign },
      { to: "/admin/user-theme", label: "User Theme", icon: Palette },
    ],
  },
  {
    label: "MLM Plans",
    items: [
      { to: "/admin/plans/deposit", label: "Deposit Plans", icon: TrendingUp },
      { to: "/admin/plans/bet", label: "Bet Plans", icon: Target },
      { to: "/admin/plans/salary", label: "Salary Income", icon: CalendarClock },
      { to: "/admin/plans/rank", label: "Rank System", icon: Crown },
    ],
  },
  {
    label: "Configuration",
    items: [
      { to: "/admin/system-controls", label: "System Controls", icon: ShieldAlert },
      { to: "/admin/site-logo", label: "Site & Logo", icon: Type },
      { to: "/admin/bonus-settings", label: "Bonus Settings", icon: Gift },
      { to: "/admin/aviator-bucket", label: "Aviator Bucket", icon: Plane },
      { to: "/admin/cron", label: "Cron Management", icon: Clock },
      { to: "/admin/gift-codes", label: "Gift Codes", icon: Ticket },
      { to: "/admin/settings", label: "Settings", icon: Settings },
      { to: "/admin/deposit-type", label: "Deposit Type/Min", icon: Layers },
      { to: "/admin/withdraw-limit", label: "Withdraw Limit", icon: MinusCircle },
      { to: "/admin/profile", label: "Profile", icon: UserCircle2 },
    ],
  },
];

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();

  const activeCrumb = useMemo(() => {
    for (const g of GROUPS) {
      const found = g.items.find((i) => i.to === pathname);
      if (found) return { group: g.label, page: found.label };
    }
    return { group: "Operations", page: "Dashboard" };
  }, [pathname]);

  return (
    <div className="admin-scope">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside
          className="flex flex-col shrink-0 border-r"
          style={{
            width: collapsed ? 72 : 272,
            transition: "width 0.2s",
            background: "linear-gradient(180deg, rgba(8,13,24,0.95), rgba(5,8,15,0.95))",
            borderColor: "var(--a-border)",
          }}
        >
          <div className="flex items-center justify-between p-4">
            {!collapsed && (
              <div className="flex items-center gap-2">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,#4de3d3,#4aa8ff)" }}
                >
                  <Sparkles size={16} color="#04070d" />
                </div>
                <div className="a-eyebrow">THEKINGGAME</div>
              </div>
            )}
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="h-9 w-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(30,42,68,0.6)", border: "1px solid var(--a-border-strong)" }}
              aria-label="Toggle sidebar"
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto a-scroll pb-6">
            {GROUPS.map((g) => (
              <div key={g.label}>
                {!collapsed && <div className="a-sb-group">{g.label}</div>}
                {g.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <NavLink
                      key={it.to}
                      to={it.to}
                      className={({ isActive }) => `a-sb-item ${isActive ? "active" : ""}`}
                      title={it.label}
                    >
                      <Icon size={16} className="a-sb-icon" />
                      {!collapsed && <span className="truncate">{it.label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </div>

          {!collapsed && (
            <div className="m-3 p-3 rounded-2xl" style={{ background: "rgba(20,28,46,0.6)", border: "1px solid var(--a-border)" }}>
              <div className="text-[13px] font-semibold text-white">Live safeguards</div>
              <div className="text-[11px] mt-1" style={{ color: "var(--a-text-mute)" }}>
                4 anomaly rules auto-applied across treasury.
              </div>
            </div>
          )}
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between px-8 py-6">
            <div>
              <div className="a-eyebrow">THEKINGGAME</div>
              <div className="flex items-center gap-3 mt-1">
                <div className="a-title">{activeCrumb.page}</div>
                <span className="a-chip a-chip-live">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--a-teal)" }} />
                  Live
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl"
                   style={{ background: "rgba(10,15,26,0.7)", border: "1px solid var(--a-border)" }}>
                <Search size={14} style={{ color: "var(--a-text-mute)" }} />
                <input className="bg-transparent outline-none text-[13px] w-56 placeholder:text-[var(--a-text-mute)]"
                       placeholder="Search console…" />
              </div>
              <button className="h-10 w-10 rounded-xl flex items-center justify-center"
                      style={{ background: "rgba(20,28,46,0.6)", border: "1px solid var(--a-border)" }}>
                <Bell size={16} />
              </button>
              <div className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full"
                   style={{ background: "rgba(20,28,46,0.6)", border: "1px solid var(--a-border)" }}>
                <div className="text-right leading-tight">
                  <div className="text-[12px] font-semibold text-white">Admin</div>
                  <div className="text-[10px]" style={{ color: "var(--a-text-mute)" }}>Owner</div>
                </div>
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-bold"
                     style={{ background: "linear-gradient(135deg,#4de3d3,#4aa8ff)", color: "#04070d" }}>
                  A
                </div>
              </div>
            </div>
          </header>

          <main className="px-8 pb-12 flex-1"><Outlet /></main>
        </div>
      </div>
    </div>
  );
}
