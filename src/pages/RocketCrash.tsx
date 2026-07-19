import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  ArrowLeft, ArrowUpRight, ArrowDownLeft, Wallet, User, Settings, Trophy, History,
  Volume2, VolumeX, Bell, Shield, HelpCircle, LogOut, Copy, Check, Plus, Minus,
  Rocket, Users, Sparkles, TrendingUp, ChevronRight, Home as HomeIcon, Zap, Star,
  Crown, Award, Gem, Info,
} from "lucide-react";
import { toast } from "sonner";

// ───────────────────────── TYPES ─────────────────────────
type Screen =
  | "splash" | "home" | "waiting" | "live" | "win" | "crash"
  | "wallet" | "deposit" | "withdraw" | "history" | "profile" | "settings" | "leaderboard";

type Phase = "betting" | "flying" | "crashed";
type Tx = { id: string; type: "deposit" | "withdraw" | "win" | "bet"; amount: number; when: string; status: "done" | "pending" };
type Player = { id: string; name: string; avatar: string; bet: number; cashout: number | null; win: number };

// ───────────────────────── COLORS ─────────────────────────
const C = {
  bg0: "#05060f",
  bg1: "#0a0e24",
  neonBlue: "#3aa4ff",
  neonPurple: "#a855f7",
  neonOrange: "#f97316",
  neonGreen: "#22c55e",
  gold: "#eab308",
};

// ───────────────────────── SHARED UI ─────────────────────────
const glass = "backdrop-blur-xl bg-white/[0.04] border border-white/10";
const glassStrong = "backdrop-blur-2xl bg-white/[0.06] border border-white/15";

const NeonBg = ({ intense = false }: { intense?: boolean }) => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden">
    <div className="absolute inset-0" style={{
      background: `radial-gradient(60% 45% at 15% 10%, ${C.neonPurple}55, transparent 60%),
                   radial-gradient(55% 40% at 85% 25%, ${C.neonBlue}55, transparent 60%),
                   radial-gradient(40% 35% at 50% 100%, ${C.neonOrange}44, transparent 70%),
                   linear-gradient(180deg, ${C.bg1}, ${C.bg0})`,
    }} />
    <div className="absolute inset-0 rc-stars opacity-90" style={{ animation: `rc-star-drift ${intense ? 30 : 90}s linear infinite` }} />
    <div className="absolute inset-0 rc-stars opacity-40" style={{ animation: `rc-star-drift ${intense ? 60 : 160}s linear infinite`, filter: "blur(0.5px)", transform: "scale(1.5)" }} />
    {/* floating particles */}
    {Array.from({ length: 14 }).map((_, i) => (
      <motion.div key={i} className="absolute rounded-full"
        style={{
          width: 3 + (i % 3), height: 3 + (i % 3),
          left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`,
          background: i % 3 === 0 ? C.neonBlue : i % 3 === 1 ? C.neonPurple : C.neonOrange,
          boxShadow: `0 0 12px currentColor`, color: i % 3 === 0 ? C.neonBlue : i % 3 === 1 ? C.neonPurple : C.neonOrange,
        }}
        animate={{ y: [0, -30, 0], opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 4 + (i % 5), repeat: Infinity, delay: i * 0.3 }}
      />
    ))}
    <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)" }} />
  </div>
);

const NeonButton = ({
  children, onClick, variant = "gold", size = "md", disabled, className = "",
}: { children: React.ReactNode; onClick?: () => void; variant?: "gold" | "green" | "blue" | "purple" | "red" | "ghost"; size?: "sm" | "md" | "lg"; disabled?: boolean; className?: string; }) => {
  const gradients: Record<string, string> = {
    gold: "linear-gradient(180deg,#fde047,#eab308 60%,#854d0e)",
    green: "linear-gradient(180deg,#4ade80,#22c55e 55%,#14532d)",
    blue: "linear-gradient(180deg,#60a5fa,#3aa4ff 55%,#1e40af)",
    purple: "linear-gradient(180deg,#c084fc,#a855f7 55%,#581c87)",
    red: "linear-gradient(180deg,#f87171,#ef4444 55%,#7f1d1d)",
    ghost: "rgba(255,255,255,0.06)",
  };
  const glows: Record<string, string> = {
    gold: "rgba(234,179,8,0.55)", green: "rgba(34,197,94,0.55)", blue: "rgba(58,164,255,0.55)",
    purple: "rgba(168,85,247,0.55)", red: "rgba(239,68,68,0.55)", ghost: "transparent",
  };
  const sizes: Record<string, string> = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm", lg: "px-5 py-3.5 text-base" };
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl font-black uppercase tracking-wider disabled:opacity-50 ${sizes[size]} ${className}`}
      style={{
        background: gradients[variant],
        color: variant === "gold" ? "#111" : "#fff",
        border: variant === "ghost" ? "1px solid rgba(255,255,255,0.15)" : `1px solid rgba(255,255,255,0.25)`,
        boxShadow: `0 8px 20px ${glows[variant]}, inset 0 1px 0 rgba(255,255,255,0.35)`,
        textShadow: variant === "gold" ? "0 1px 0 rgba(255,255,255,0.4)" : "0 1px 2px rgba(0,0,0,0.5)",
      }}
    >{children}</motion.button>
  );
};

const StatCard = ({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) => (
  <div className={`${glass} rounded-2xl p-3 flex items-center gap-3`}>
    {icon && <div className="w-10 h-10 rounded-xl flex items-center justify-center"
      style={{ background: `linear-gradient(180deg,${C.neonBlue}66,${C.neonPurple}55)`, boxShadow: `0 4px 12px ${C.neonBlue}55` }}>
      {icon}
    </div>}
    <div className="min-w-0 flex-1">
      <div className="text-[10px] uppercase tracking-wider text-white/50 font-black">{label}</div>
      <div className="text-sm font-black text-white truncate">{value}</div>
    </div>
  </div>
);

const TopBar = ({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between px-4 pt-3 pb-2 relative z-10">
    {onBack ? (
      <button onClick={onBack} className={`w-10 h-10 rounded-xl ${glass} flex items-center justify-center active:scale-90 transition`}>
        <ArrowLeft className="h-5 w-5" />
      </button>
    ) : <div className="w-10 h-10" />}
    <h1 className="text-lg font-black uppercase tracking-wider" style={{
      background: "linear-gradient(180deg,#fff,#dbeafe)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      filter: "drop-shadow(0 2px 8px rgba(58,164,255,0.4))",
    }}>{title}</h1>
    <div className="w-10 h-10 flex items-center justify-center">{right}</div>
  </div>
);

// ───────────────────────── 3D ROCKET ─────────────────────────
const Rocket3D = ({ scale = 1, flame = 1 }: { scale?: number; flame?: number }) => (
  <div className="relative" style={{ width: 120 * scale, height: 180 * scale }}>
    <svg viewBox="0 0 120 180" width="100%" height="100%" style={{ filter: `drop-shadow(0 12px 24px ${C.neonBlue}55) drop-shadow(0 0 20px ${C.neonOrange}66)` }}>
      <defs>
        <linearGradient id="rBody" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e5e7eb" /><stop offset=".5" stopColor="#fff" /><stop offset="1" stopColor="#9ca3af" />
        </linearGradient>
        <linearGradient id="rNose" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ef4444" /><stop offset="1" stopColor="#7f1d1d" />
        </linearGradient>
        <radialGradient id="rWin" cx=".4" cy=".4"><stop offset="0" stopColor="#93c5fd" /><stop offset="1" stopColor="#1e3a8a" /></radialGradient>
      </defs>
      {/* nose cone */}
      <path d="M60 5 L85 55 L35 55 Z" fill="url(#rNose)" />
      {/* body */}
      <rect x="35" y="55" width="50" height="70" rx="6" fill="url(#rBody)" />
      {/* window */}
      <circle cx="60" cy="80" r="12" fill="url(#rWin)" stroke="#0f172a" strokeWidth="2" />
      <circle cx="56" cy="76" r="3" fill="#fff" opacity=".7" />
      {/* stripe */}
      <rect x="35" y="100" width="50" height="6" fill="#ef4444" />
      {/* fins */}
      <path d="M35 105 L15 145 L35 130 Z" fill="url(#rNose)" />
      <path d="M85 105 L105 145 L85 130 Z" fill="url(#rNose)" />
      {/* nozzle */}
      <rect x="45" y="125" width="30" height="14" rx="3" fill="#374151" />
      <rect x="47" y="128" width="26" height="8" rx="2" fill="#111827" />
    </svg>
    {/* flame */}
    <div className="absolute left-1/2 -translate-x-1/2" style={{ top: "78%", width: 60 * scale, height: 120 * scale * flame }}>
      <motion.div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(180deg,#fef08a,#fbbf24 20%,#f97316 55%,#b91c1c 88%,transparent)",
          clipPath: "polygon(50% 0%, 90% 20%, 100% 50%, 80% 85%, 50% 100%, 20% 85%, 0% 50%, 10% 20%)",
          filter: `drop-shadow(0 0 24px ${C.neonOrange})`,
        }}
        animate={{ scaleY: [1, 1.12, 0.94, 1.08, 1] }} transition={{ duration: 0.2, repeat: Infinity }}
      />
      <motion.div
        className="absolute" style={{ inset: "0 25% 20% 25%", background: "linear-gradient(180deg,#fff,#fde047 40%,#f59e0b,transparent)", clipPath: "polygon(50% 0%,80% 30%,70% 85%,50% 100%,30% 85%,20% 30%)" }}
        animate={{ scaleY: [1, 1.15, 0.9, 1.1, 1] }} transition={{ duration: 0.18, repeat: Infinity }}
      />
    </div>
  </div>
);

// ───────────────────────── MOCK PLAYERS ─────────────────────────
const MOCK_NAMES = ["AstroKing", "NovaX", "LunarWolf", "CrashMaster", "StarLord", "OrbitPro", "MeteorX", "GalaxyQ", "Zenith", "Cosmo7", "PhoenixR", "NebulaAce"];
const genPlayers = (n: number): Player[] => Array.from({ length: n }).map((_, i) => ({
  id: `p${i}`, name: MOCK_NAMES[i % MOCK_NAMES.length] + (i > 11 ? i : ""),
  avatar: MOCK_NAMES[i % MOCK_NAMES.length].slice(0, 2).toUpperCase(),
  bet: [50, 100, 200, 500, 1000, 2000, 5000][i % 7],
  cashout: null, win: 0,
}));

// ═════════════════════════════════════════════════════════
// MAIN COMPONENT — Rocket Crash
// ═════════════════════════════════════════════════════════
const RocketCrash = () => {
  const [screen, setScreen] = useState<Screen>("splash");
  const [balance, setBalance] = useState(5000);
  const [soundOn, setSoundOn] = useState(true);

  // ── GAME STATE ─────────────────────
  const [phase, setPhase] = useState<Phase>("betting");
  const [multiplier, setMultiplier] = useState(1);
  const [countdown, setCountdown] = useState(5);
  const [crashAt, setCrashAt] = useState(0);
  const [roundId, setRoundId] = useState(100482);
  const [onlinePlayers, setOnlinePlayers] = useState(2341);
  const [history, setHistory] = useState<number[]>([2.34, 1.05, 5.67, 1.42, 12.3, 1.89, 3.21, 2.05]);
  const [players, setPlayers] = useState<Player[]>(genPlayers(8));

  // ── BET STATE ──────────────────────
  const [betAmount, setBetAmount] = useState(100);
  const [autoCashout, setAutoCashout] = useState(2.0);
  const [autoBet, setAutoBet] = useState(false);
  const [myBet, setMyBet] = useState<{ amount: number; cashout: number | null; win: number } | null>(null);

  // ── TX/PROFILE ────────────────────
  const [txs, setTxs] = useState<Tx[]>([
    { id: "t1", type: "deposit", amount: 2000, when: "Today · 14:32", status: "done" },
    { id: "t2", type: "win", amount: 850, when: "Today · 13:11", status: "done" },
    { id: "t3", type: "bet", amount: 200, when: "Today · 13:10", status: "done" },
    { id: "t4", type: "withdraw", amount: 1500, when: "Yesterday", status: "pending" },
  ]);

  // ── SPLASH → HOME ──────────────────
  useEffect(() => {
    if (screen === "splash") {
      const t = setTimeout(() => setScreen("home"), 2400);
      return () => clearTimeout(t);
    }
  }, [screen]);

  // ── GAME LOOP (runs only when game screens are active) ──
  const isGameScreen = screen === "waiting" || screen === "live" || screen === "win" || screen === "crash";
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const multRef = useRef(multiplier); multRef.current = multiplier;
  const crashRef = useRef(crashAt);  crashRef.current = crashAt;
  const myBetRef = useRef(myBet);    myBetRef.current = myBet;

  useEffect(() => {
    if (!isGameScreen) return;
    let raf: number, lastTs = performance.now();
    let cdAccum = 0;

    const tick = (ts: number) => {
      const dt = (ts - lastTs) / 1000; lastTs = ts;

      if (phaseRef.current === "betting") {
        cdAccum += dt;
        if (cdAccum >= 1) {
          cdAccum = 0;
          setCountdown((c) => {
            if (c <= 1) {
              // start flying
              const target = 1 + Math.pow(Math.random(), 1.5) * 15;
              setCrashAt(target);
              setMultiplier(1);
              setPhase("flying");
              setScreen((s) => (s === "waiting" ? "live" : s));
              return 5;
            }
            return c - 1;
          });
        }
      } else if (phaseRef.current === "flying") {
        const growth = 0.06 * multRef.current;
        const next = multRef.current + growth * dt;
        setMultiplier(next);
        if (next >= crashRef.current) {
          setPhase("crashed");
          // resolve my bet
          if (myBetRef.current && !myBetRef.current.cashout) {
            setScreen("crash");
          }
          setHistory((h) => [+crashRef.current.toFixed(2), ...h].slice(0, 12));
          setTimeout(() => {
            setPhase("betting");
            setCountdown(5);
            setMyBet(null);
            setRoundId((r) => r + 1);
            setPlayers(genPlayers(6 + Math.floor(Math.random() * 6)));
            if (myBetRef.current?.cashout || !myBetRef.current) {
              setScreen((s) => (s === "crash" || s === "win" ? "live" : s));
            }
          }, 3500);
        }
        // auto cashout
        if (myBetRef.current && !myBetRef.current.cashout && autoBet && next >= autoCashout) {
          doCashout(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isGameScreen, autoBet, autoCashout]);

  // fluctuate online count
  useEffect(() => {
    const id = setInterval(() => setOnlinePlayers((n) => n + Math.floor(Math.random() * 21) - 10), 2000);
    return () => clearInterval(id);
  }, []);

  const doBet = () => {
    if (phase !== "betting") return toast.error("Wait for next round");
    if (myBet) return toast.error("Bet already placed");
    if (betAmount > balance) return toast.error("Insufficient balance");
    if (betAmount < 10) return toast.error("Min ₹10");
    setBalance((b) => b - betAmount);
    setMyBet({ amount: betAmount, cashout: null, win: 0 });
    setTxs((t) => [{ id: `b${Date.now()}`, type: "bet", amount: betAmount, when: "Just now", status: "done" }, ...t]);
    toast.success(`Bet ₹${betAmount} placed`);
  };

  const doCashout = (atMult?: number) => {
    if (!myBet || myBet.cashout || phase !== "flying") return;
    const m = atMult ?? multiplier;
    const win = +(myBet.amount * m).toFixed(2);
    setMyBet({ ...myBet, cashout: m, win });
    setBalance((b) => b + win);
    setTxs((t) => [{ id: `w${Date.now()}`, type: "win", amount: win, when: "Just now", status: "done" }, ...t]);
    setScreen("win");
    toast.success(`Won ₹${win.toFixed(2)} @ ${m.toFixed(2)}x`);
  };

  // ═══════════════════ SCREEN: SPLASH ═══════════════════
  const Splash = () => (
    <div className="relative min-h-screen flex flex-col items-center justify-center">
      <NeonBg intense />
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8 }}>
        <motion.div animate={{ y: [0, -12, 0], rotate: [-2, 2, -2] }} transition={{ duration: 3, repeat: Infinity }}>
          <Rocket3D scale={1.4} flame={1.2} />
        </motion.div>
      </motion.div>
      <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
        className="text-5xl font-black italic mt-6 tracking-tighter" style={{
          background: `linear-gradient(180deg,#fff,${C.neonBlue},${C.neonPurple})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          filter: `drop-shadow(0 4px 24px ${C.neonBlue}88)`,
        }}>ROCKET<span style={{ color: C.neonOrange, WebkitTextFillColor: C.neonOrange }}>X</span></motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
        className="text-white/60 text-xs uppercase tracking-[0.4em] mt-2">Crash · Fly · Win</motion.p>
      <motion.div initial={{ width: 0 }} animate={{ width: 140 }} transition={{ delay: 1, duration: 1.4 }}
        className="mt-10 h-1 rounded-full" style={{ background: `linear-gradient(90deg,${C.neonBlue},${C.neonPurple},${C.neonOrange})`, boxShadow: `0 0 20px ${C.neonBlue}` }} />
    </div>
  );

  // ═══════════════════ SCREEN: HOME ═══════════════════
  const Home = () => (
    <div className="relative min-h-screen pb-24">
      <NeonBg />
      <div className="relative z-10 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-white"
              style={{ background: `linear-gradient(135deg,${C.neonPurple},${C.neonBlue})`, boxShadow: `0 4px 14px ${C.neonPurple}66` }}>P</div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/50 font-black">Welcome back</div>
              <div className="text-sm font-black text-white">Player_2341</div>
            </div>
          </div>
          <button onClick={() => setScreen("settings")} className={`w-10 h-10 rounded-xl ${glass} flex items-center justify-center`}>
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {/* Balance hero card */}
        <div className={`${glassStrong} rounded-3xl p-5 mt-4 relative overflow-hidden`}>
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: `radial-gradient(circle, ${C.gold}66, transparent 70%)` }} />
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-black">Total Balance</div>
          <div className="text-4xl font-black text-white mt-1" style={{ filter: `drop-shadow(0 2px 12px ${C.gold}88)` }}>₹{balance.toLocaleString()}</div>
          <div className="flex gap-2 mt-4">
            <NeonButton variant="green" size="md" className="flex-1" onClick={() => setScreen("deposit")}>+ Deposit</NeonButton>
            <NeonButton variant="ghost" size="md" className="flex-1" onClick={() => setScreen("withdraw")}>Withdraw</NeonButton>
          </div>
        </div>

        {/* Featured game */}
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-black mb-2">Featured</div>
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => { setPhase("betting"); setCountdown(5); setScreen("waiting"); }}
            className={`w-full rounded-3xl relative overflow-hidden ${glassStrong} p-5`}>
            <div className="absolute -bottom-6 -right-4 opacity-90"><Rocket3D scale={0.9} /></div>
            <div className="relative z-10 text-left max-w-[60%]">
              <div className="text-[9px] uppercase tracking-[0.3em] text-white/60 font-black">Live now</div>
              <h2 className="text-2xl font-black italic mt-1" style={{
                background: `linear-gradient(90deg,#fff,${C.neonBlue})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>Rocket<span style={{ color: C.neonOrange, WebkitTextFillColor: C.neonOrange }}>X</span></h2>
              <p className="text-white/60 text-xs mt-1">Fly high. Cash out before it crashes.</p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black"
                style={{ background: `${C.neonGreen}33`, border: `1px solid ${C.neonGreen}`, color: C.neonGreen }}>
                <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> {onlinePlayers.toLocaleString()} playing
              </div>
            </div>
          </motion.button>
        </div>

        {/* Quick tiles */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[
            { i: <Trophy className="h-5 w-5" />, l: "Leaderboard", s: "leaderboard" as const, c: C.gold },
            { i: <History className="h-5 w-5" />, l: "History", s: "history" as const, c: C.neonBlue },
            { i: <Wallet className="h-5 w-5" />, l: "Wallet", s: "wallet" as const, c: C.neonGreen },
            { i: <User className="h-5 w-5" />, l: "Profile", s: "profile" as const, c: C.neonPurple },
          ].map((t) => (
            <button key={t.l} onClick={() => setScreen(t.s)}
              className={`${glass} rounded-2xl p-3 flex flex-col items-center gap-1.5 active:scale-95 transition`}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${t.c}22`, color: t.c, boxShadow: `0 4px 12px ${t.c}44` }}>{t.i}</div>
              <div className="text-[9px] font-black text-white/80 uppercase">{t.l}</div>
            </button>
          ))}
        </div>

        {/* Recent history chips */}
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-black mb-2">Recent Crashes</div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {history.map((h, i) => {
              const hot = h >= 2, mega = h >= 5;
              return (
                <div key={i} className="px-2.5 py-1.5 rounded-lg text-[11px] font-black whitespace-nowrap"
                  style={{
                    background: mega ? `linear-gradient(180deg,${C.gold},#7c4a05)` : hot ? `linear-gradient(180deg,${C.neonGreen},#14532d)` : `linear-gradient(180deg,#475569,#1e293b)`,
                    boxShadow: `0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)`,
                    color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                  }}>{h.toFixed(2)}x</div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className={`fixed bottom-0 left-0 right-0 z-20 ${glassStrong} border-t border-white/10 mx-auto max-w-md`}>
        <div className="flex justify-around py-2">
          {[
            { i: <HomeIcon className="h-5 w-5" />, l: "Home", s: "home" as const },
            { i: <Wallet className="h-5 w-5" />, l: "Wallet", s: "wallet" as const },
            { i: <Trophy className="h-5 w-5" />, l: "Ranks", s: "leaderboard" as const },
            { i: <User className="h-5 w-5" />, l: "Profile", s: "profile" as const },
          ].map((n) => {
            const active = screen === n.s;
            return (
              <button key={n.l} onClick={() => setScreen(n.s)} className="flex flex-col items-center gap-0.5 px-4 py-1">
                <div style={{ color: active ? C.neonBlue : "#94a3b8", filter: active ? `drop-shadow(0 0 8px ${C.neonBlue})` : "none" }}>{n.i}</div>
                <div className="text-[9px] font-black uppercase" style={{ color: active ? C.neonBlue : "#64748b" }}>{n.l}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ═══════════════════ SCREEN: LIVE GAME + WAITING ═══════════════════
  const multMv = useMotionValue(1);
  const multSpring = useSpring(multMv, { stiffness: 150, damping: 22, mass: 0.5 });
  const multText = useTransform(multSpring, (v) => `${v.toFixed(2)}x`);
  useEffect(() => { multMv.set(multiplier); }, [multiplier, multMv]);

  const progress = phase === "flying" ? Math.min(1, Math.log(Math.max(1, multiplier)) / Math.log(15)) : 0;
  const rocketBottomPct = phase === "crashed" ? 130 : phase === "flying" ? 10 + progress * 55 : 8;

  const LiveGame = ({ waiting = false }: { waiting?: boolean }) => (
    <div className="relative min-h-screen pb-4">
      <NeonBg intense />
      <TopBar
        title="RocketX Live"
        onBack={() => setScreen("home")}
        right={<button onClick={() => setSoundOn((s) => !s)} className={`w-10 h-10 rounded-xl ${glass} flex items-center justify-center`}>
          {soundOn ? <Volume2 className="h-4 w-4 text-sky-300" /> : <VolumeX className="h-4 w-4 text-white/40" />}
        </button>}
      />

      {/* Top mini stats */}
      <div className="relative z-10 px-4 grid grid-cols-3 gap-2">
        <StatCard label="Balance" value={`₹${balance.toLocaleString()}`} icon={<Wallet className="h-4 w-4 text-white" />} />
        <StatCard label="Round" value={`#${roundId}`} icon={<Zap className="h-4 w-4 text-white" />} />
        <StatCard label="Online" value={onlinePlayers.toLocaleString()} icon={<Users className="h-4 w-4 text-white" />} />
      </div>

      {/* Stage */}
      <div className="relative z-10 px-3 mt-3">
        <div className={`relative overflow-hidden rounded-[32px] ${glassStrong}`} style={{ aspectRatio: "9/11" }}>
          {/* moving nebula inside stage */}
          <div className="absolute inset-0 rc-stars opacity-80" style={{ animation: `rc-star-drift ${phase === "flying" ? 6 : 30}s linear infinite` }} />
          <div className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
            style={{ background: `radial-gradient(60% 60% at 50% 100%, ${C.neonOrange}44, ${C.neonPurple}22 45%, transparent 75%)` }} />

          {/* Multiplier / Countdown */}
          <div className="absolute inset-x-0 top-[14%] text-center pointer-events-none z-10">
            <AnimatePresence mode="wait">
              {phase === "betting" && (
                <motion.div key="cd" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/60 font-black mb-1">Next round in</div>
                  <div className="text-[90px] font-black leading-none italic" style={{
                    background: `linear-gradient(180deg,${C.gold},#7c4a05)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    filter: `drop-shadow(0 8px 24px ${C.gold}88)`,
                  }}>{countdown}</div>
                </motion.div>
              )}
              {phase === "flying" && (
                <motion.div key="fly" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <motion.div className="text-[80px] font-black leading-none italic" style={{
                    background: `linear-gradient(180deg,#fff,${C.gold},#7c4a05)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    filter: `drop-shadow(0 6px 22px ${C.gold}aa)`,
                  }}>{multText}</motion.div>
                  <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-[11px] font-black text-emerald-50"
                    style={{ background: `linear-gradient(180deg,${C.neonGreen},#14532d)`, boxShadow: `0 6px 16px ${C.neonGreen}66` }}>
                    <Sparkles className="h-3 w-3" /> FLYING HIGH
                  </div>
                </motion.div>
              )}
              {phase === "crashed" && (
                <motion.div key="cr" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <div className="text-[10px] text-red-300 font-black uppercase tracking-[0.3em] mb-1">💥 Crashed</div>
                  <div className="text-[76px] font-black italic leading-none" style={{
                    background: "linear-gradient(180deg,#fecaca,#ef4444,#7f1d1d)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    filter: "drop-shadow(0 6px 22px rgba(239,68,68,0.7))",
                  }}>{crashAt.toFixed(2)}x</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Rocket */}
          <motion.div className="absolute left-1/2 pointer-events-none" style={{ x: "-50%", width: "36%" }}
            animate={{
              bottom: `${rocketBottomPct}%`,
              y: phase === "betting" ? [0, -10, 0, 6, 0] : 0,
              rotate: phase === "flying" ? [-3, 3, -2, 2, -3] : 0,
            }}
            transition={{
              bottom: { duration: 0.4, ease: "linear" },
              y: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
              rotate: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
            }}>
            <Rocket3D scale={1} flame={phase === "flying" ? 1 + progress * 0.6 : 0.75} />
          </motion.div>

          {/* Round tag */}
          <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-xl text-[10px] font-black ${glass}`}>
            <div className="text-[8px] text-emerald-300/80 uppercase tracking-wider">Round</div>
            <div className="text-emerald-200">#{roundId}</div>
          </div>
          <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1.5 ${glass}`}>
            <Users className="h-3 w-3 text-white/70" />
            <div>
              <div className="text-white leading-tight">{onlinePlayers.toLocaleString()}</div>
              <div className="text-[8px] text-white/50 uppercase leading-tight">Live</div>
            </div>
          </div>
        </div>
      </div>

      {/* History chips */}
      <div className="relative z-10 flex gap-1.5 px-4 mt-3 overflow-x-auto scrollbar-hide pb-1">
        {history.slice(0, 10).map((h, i) => (
          <div key={i} className="px-2.5 py-1 rounded-lg text-[11px] font-black text-white whitespace-nowrap"
            style={{
              background: h >= 5 ? `linear-gradient(180deg,${C.gold},#7c4a05)` : h >= 2 ? `linear-gradient(180deg,${C.neonGreen},#14532d)` : `linear-gradient(180deg,#475569,#1e293b)`,
              boxShadow: `0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)`,
            }}>{h.toFixed(2)}x</div>
        ))}
      </div>

      {/* Controls */}
      <div className="relative z-10 px-3 mt-3 grid grid-cols-2 gap-2">
        <div className={`${glass} rounded-2xl p-2.5`}>
          <div className="text-[9px] text-white/60 font-black uppercase tracking-wider text-center mb-1.5">Bet Amount</div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setBetAmount((v) => Math.max(10, v - 50))} className={`w-8 h-9 rounded-lg ${glass} flex items-center justify-center active:scale-90`}><Minus className="h-3.5 w-3.5" /></button>
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(Math.max(0, +e.target.value || 0))}
              className="flex-1 bg-transparent text-center text-base font-black outline-none w-0" />
            <button onClick={() => setBetAmount((v) => v + 50)} className={`w-8 h-9 rounded-lg ${glass} flex items-center justify-center active:scale-90`}><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-1.5">
            {[100, 500, 1000, 5000].map((p) => (
              <button key={p} onClick={() => setBetAmount(p)} className="text-[9px] font-black py-1 rounded-md transition"
                style={{
                  background: betAmount === p ? `linear-gradient(180deg,${C.neonGreen},#14532d)` : "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: betAmount === p ? `0 4px 10px ${C.neonGreen}66` : "none",
                }}>₹{p}</button>
            ))}
          </div>
        </div>
        <div className={`${glass} rounded-2xl p-2.5`}>
          <div className="text-[9px] text-white/60 font-black uppercase tracking-wider text-center mb-1.5">Auto Cashout</div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setAutoCashout((v) => Math.max(1.1, +(v - 0.1).toFixed(2)))} className={`w-8 h-9 rounded-lg ${glass} flex items-center justify-center active:scale-90`}><Minus className="h-3.5 w-3.5" /></button>
            <div className="flex-1 text-center text-base font-black">{autoCashout.toFixed(2)}x</div>
            <button onClick={() => setAutoCashout((v) => +(v + 0.1).toFixed(2))} className={`w-8 h-9 rounded-lg ${glass} flex items-center justify-center active:scale-90`}><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-1.5">
            {[1.5, 2, 3, 5].map((p) => (
              <button key={p} onClick={() => setAutoCashout(p)} className="text-[9px] font-black py-1 rounded-md"
                style={{
                  background: autoCashout === p ? `linear-gradient(180deg,${C.neonGreen},#14532d)` : "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}>{p.toFixed(2)}x</button>
            ))}
          </div>
        </div>
      </div>

      {/* Auto bet toggle */}
      <div className="relative z-10 px-3 mt-2">
        <div className={`${glass} rounded-2xl p-2.5 flex items-center justify-between`}>
          <div className="text-[10px] text-white/70 font-black uppercase tracking-wider">Auto Bet</div>
          <button onClick={() => setAutoBet((v) => !v)} className="relative w-14 h-7 rounded-full"
            style={{ background: autoBet ? `linear-gradient(180deg,${C.neonGreen},#14532d)` : "linear-gradient(180deg,#374151,#111)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)" }}>
            <div className="absolute top-0.5 w-6 h-6 rounded-full bg-white" style={{ transform: autoBet ? "translateX(28px)" : "translateX(2px)", boxShadow: "0 2px 4px rgba(0,0,0,0.5)", transition: "transform 0.2s" }} />
          </button>
          <div className="text-[11px] font-black text-white/70">@ {autoCashout.toFixed(2)}x</div>
        </div>
      </div>

      {/* Action button */}
      <div className="relative z-10 px-3 mt-3">
        {myBet && !myBet.cashout && phase === "flying" ? (
          <NeonButton variant="gold" size="lg" className="w-full py-5 text-lg" onClick={() => doCashout()}>
            CASH OUT ₹{(myBet.amount * multiplier).toFixed(2)}
          </NeonButton>
        ) : myBet && myBet.cashout ? (
          <div className={`${glass} rounded-2xl py-4 text-center font-black text-lg`} style={{ background: `linear-gradient(180deg,${C.neonGreen}88,#14532d88)` }}>
            ✓ Won ₹{myBet.win.toFixed(2)} @ {myBet.cashout.toFixed(2)}x
          </div>
        ) : myBet ? (
          <div className={`${glass} rounded-2xl py-4 text-center font-black text-lg`} style={{ background: "linear-gradient(180deg,rgba(239,68,68,0.4),rgba(127,29,29,0.4))" }}>
            Waiting for takeoff...
          </div>
        ) : (
          <NeonButton variant="gold" size="lg" className="w-full py-5 text-lg" onClick={doBet} disabled={phase !== "betting"}>
            {phase === "betting" ? `BET ₹${betAmount}` : "WAIT FOR NEXT ROUND"}
          </NeonButton>
        )}
      </div>

      {/* Live players panel */}
      <div className="relative z-10 px-3 mt-3">
        <div className={`${glass} rounded-2xl overflow-hidden`}>
          <div className="grid grid-cols-4 gap-1 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white/50 border-b border-white/5">
            <div>Players ({players.length + (myBet ? 1 : 0)})</div>
            <div className="text-center">Bet</div>
            <div className="text-center">Cash Out</div>
            <div className="text-right">Win</div>
          </div>
          <div className="max-h-52 overflow-y-auto scrollbar-hide">
            {myBet && (
              <div className="grid grid-cols-4 gap-1 px-3 py-2 text-[11px] font-bold items-center" style={{ background: "rgba(34,197,94,0.1)" }}>
                <div className="flex items-center gap-1.5 truncate">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black" style={{ background: `linear-gradient(135deg,${C.neonPurple},${C.neonBlue})` }}>YOU</div>
                </div>
                <div className="text-center">₹{myBet.amount}</div>
                <div className="text-center" style={{ color: myBet.cashout ? C.neonGreen : "#94a3b8" }}>{myBet.cashout ? `${myBet.cashout.toFixed(2)}x` : "—"}</div>
                <div className="text-right" style={{ color: myBet.cashout ? C.neonGreen : "#64748b" }}>{myBet.cashout ? `₹${myBet.win.toFixed(2)}` : "—"}</div>
              </div>
            )}
            {players.map((p) => (
              <div key={p.id} className="grid grid-cols-4 gap-1 px-3 py-2 text-[11px] font-semibold items-center border-t border-white/5">
                <div className="flex items-center gap-1.5 truncate">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background: `linear-gradient(135deg,${C.neonBlue}88,${C.neonPurple}88)` }}>{p.avatar}</div>
                  <span className="truncate text-white/80">{p.name}</span>
                </div>
                <div className="text-center text-white/70">₹{p.bet}</div>
                <div className="text-center text-white/40">—</div>
                <div className="text-right text-white/40">—</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ═══════════════════ WIN / CRASH OVERLAYS ═══════════════════
  const WinScreen = () => (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6">
      <NeonBg intense />
      {Array.from({ length: 20 }).map((_, i) => (
        <motion.div key={i} className="absolute" style={{ left: `${(i * 47) % 100}%`, top: "50%" }}
          initial={{ y: 0, opacity: 1, rotate: 0 }} animate={{ y: [0, -300 - (i % 5) * 50], opacity: [1, 0], rotate: 360 }} transition={{ duration: 2, delay: i * 0.05, repeat: Infinity, repeatDelay: 1 }}>
          <Star className="h-4 w-4" style={{ color: [C.gold, C.neonBlue, C.neonPurple, C.neonGreen][i % 4], filter: `drop-shadow(0 0 8px currentColor)` }} />
        </motion.div>
      ))}
      <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", damping: 12 }}>
        <div className="w-32 h-32 rounded-full flex items-center justify-center relative"
          style={{ background: `linear-gradient(135deg,${C.gold},#7c4a05)`, boxShadow: `0 20px 60px ${C.gold}88, inset 0 4px 0 rgba(255,255,255,0.4)` }}>
          <Trophy className="h-16 w-16 text-white" />
        </div>
      </motion.div>
      <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="text-3xl font-black uppercase tracking-wider mt-6" style={{ color: C.gold, filter: `drop-shadow(0 4px 20px ${C.gold})` }}>You Won!</motion.h2>
      <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, type: "spring" }}
        className="text-6xl font-black italic mt-3" style={{
          background: `linear-gradient(180deg,#fff,${C.gold})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          filter: `drop-shadow(0 6px 24px ${C.gold})`,
        }}>+₹{myBet?.win.toFixed(2) ?? "0.00"}</motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-2 text-white/60 text-sm">
        Cashed out at <span className="font-black text-white">{myBet?.cashout?.toFixed(2)}x</span>
      </motion.div>
      <div className="flex gap-2 mt-8 w-full max-w-xs">
        <NeonButton variant="ghost" size="lg" className="flex-1" onClick={() => setScreen("home")}>Home</NeonButton>
        <NeonButton variant="gold" size="lg" className="flex-1" onClick={() => setScreen("live")}>Play Again</NeonButton>
      </div>
    </div>
  );

  const CrashScreen = () => (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6">
      <NeonBg />
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
        <div className="w-32 h-32 rounded-full flex items-center justify-center relative"
          style={{ background: "linear-gradient(135deg,#ef4444,#7f1d1d)", boxShadow: "0 20px 60px rgba(239,68,68,0.6), inset 0 4px 0 rgba(255,255,255,0.3)" }}>
          <div className="text-6xl">💥</div>
        </div>
      </motion.div>
      <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="text-3xl font-black uppercase tracking-wider mt-6 text-red-400" style={{ filter: "drop-shadow(0 4px 20px rgba(239,68,68,0.6))" }}>Crashed</motion.h2>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
        className="text-5xl font-black italic mt-3" style={{
          background: "linear-gradient(180deg,#fecaca,#ef4444,#7f1d1d)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>{crashAt.toFixed(2)}x</motion.div>
      <div className="mt-4 text-white/60 text-sm">Lost ₹{myBet?.amount ?? 0}</div>
      <div className="flex gap-2 mt-8 w-full max-w-xs">
        <NeonButton variant="ghost" size="lg" className="flex-1" onClick={() => setScreen("home")}>Home</NeonButton>
        <NeonButton variant="red" size="lg" className="flex-1" onClick={() => setScreen("live")}>Try Again</NeonButton>
      </div>
    </div>
  );

  // ═══════════════════ WALLET / DEPOSIT / WITHDRAW ═══════════════════
  const WalletScr = () => (
    <div className="relative min-h-screen pb-6">
      <NeonBg />
      <TopBar title="Wallet" onBack={() => setScreen("home")} />
      <div className="relative z-10 px-4">
        <div className={`${glassStrong} rounded-3xl p-5 relative overflow-hidden`}>
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full" style={{ background: `radial-gradient(circle,${C.gold}55,transparent 70%)` }} />
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-black">Available Balance</div>
          <div className="text-5xl font-black text-white mt-2" style={{ filter: `drop-shadow(0 4px 16px ${C.gold}88)` }}>₹{balance.toLocaleString()}</div>
          <div className="text-xs text-white/50 mt-1">≈ ${(balance / 83).toFixed(2)} USD</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={() => setScreen("deposit")} className={`${glass} rounded-2xl p-4 flex items-center gap-3 active:scale-95`}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${C.neonGreen}33`, color: C.neonGreen, boxShadow: `0 4px 12px ${C.neonGreen}55` }}><ArrowDownLeft className="h-5 w-5" /></div>
            <div className="text-left"><div className="text-sm font-black">Deposit</div><div className="text-[10px] text-white/50">Add funds</div></div>
          </button>
          <button onClick={() => setScreen("withdraw")} className={`${glass} rounded-2xl p-4 flex items-center gap-3 active:scale-95`}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${C.neonBlue}33`, color: C.neonBlue, boxShadow: `0 4px 12px ${C.neonBlue}55` }}><ArrowUpRight className="h-5 w-5" /></div>
            <div className="text-left"><div className="text-sm font-black">Withdraw</div><div className="text-[10px] text-white/50">Cash out</div></div>
          </button>
        </div>
        <button onClick={() => setScreen("history")} className={`${glass} w-full rounded-2xl p-4 flex items-center justify-between mt-2 active:scale-95`}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${C.neonPurple}33`, color: C.neonPurple }}><History className="h-5 w-5" /></div>
            <div className="text-left"><div className="text-sm font-black">Transaction History</div><div className="text-[10px] text-white/50">All activity</div></div>
          </div>
          <ChevronRight className="h-4 w-4 text-white/40" />
        </button>
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-black mb-2">Recent</div>
          <div className={`${glass} rounded-2xl overflow-hidden`}>
            {txs.slice(0, 4).map((t, i) => <TxRow t={t} key={t.id} last={i === Math.min(3, txs.length - 1)} />)}
          </div>
        </div>
      </div>
    </div>
  );

  const [depositAmt, setDepositAmt] = useState(500);
  const [depositMethod, setDepositMethod] = useState<"upi" | "card" | "crypto">("upi");
  const Deposit = () => (
    <div className="relative min-h-screen pb-6">
      <NeonBg />
      <TopBar title="Deposit" onBack={() => setScreen("wallet")} />
      <div className="relative z-10 px-4">
        <div className={`${glassStrong} rounded-3xl p-5 text-center`}>
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-black">You will deposit</div>
          <div className="text-5xl font-black text-white mt-2" style={{ filter: `drop-shadow(0 4px 16px ${C.neonGreen}88)` }}>₹{depositAmt.toLocaleString()}</div>
          <div className="grid grid-cols-4 gap-2 mt-4">
            {[100, 500, 1000, 5000].map((a) => (
              <button key={a} onClick={() => setDepositAmt(a)} className="py-2 rounded-xl text-[11px] font-black transition"
                style={{
                  background: depositAmt === a ? `linear-gradient(180deg,${C.neonGreen},#14532d)` : "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  boxShadow: depositAmt === a ? `0 4px 12px ${C.neonGreen}66` : "none",
                }}>₹{a}</button>
            ))}
          </div>
          <input type="number" value={depositAmt} onChange={(e) => setDepositAmt(+e.target.value || 0)}
            className={`w-full mt-3 ${glass} rounded-xl px-4 py-3 text-center text-lg font-black bg-transparent outline-none`} />
        </div>
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-black mb-2">Method</div>
          <div className="grid grid-cols-3 gap-2">
            {(["upi", "card", "crypto"] as const).map((m) => (
              <button key={m} onClick={() => setDepositMethod(m)}
                className={`${glass} rounded-2xl p-3 flex flex-col items-center gap-1 active:scale-95`}
                style={depositMethod === m ? { border: `1px solid ${C.neonGreen}`, boxShadow: `0 4px 16px ${C.neonGreen}44` } : {}}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${C.neonBlue}22`, color: C.neonBlue }}>
                  {m === "upi" ? "🇮🇳" : m === "card" ? "💳" : "₿"}
                </div>
                <div className="text-[10px] font-black uppercase">{m}</div>
              </button>
            ))}
          </div>
        </div>
        <NeonButton variant="green" size="lg" className="w-full mt-5"
          onClick={() => {
            if (depositAmt < 100) return toast.error("Min ₹100");
            setBalance((b) => b + depositAmt);
            setTxs((t) => [{ id: `d${Date.now()}`, type: "deposit", amount: depositAmt, when: "Just now", status: "done" }, ...t]);
            toast.success(`Deposited ₹${depositAmt}`);
            setScreen("wallet");
          }}>Deposit Now</NeonButton>
      </div>
    </div>
  );

  const [wdAmt, setWdAmt] = useState(500);
  const Withdraw = () => (
    <div className="relative min-h-screen pb-6">
      <NeonBg />
      <TopBar title="Withdraw" onBack={() => setScreen("wallet")} />
      <div className="relative z-10 px-4">
        <div className={`${glassStrong} rounded-3xl p-5 text-center`}>
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-black">Withdraw amount</div>
          <div className="text-5xl font-black text-white mt-2" style={{ filter: `drop-shadow(0 4px 16px ${C.neonBlue}88)` }}>₹{wdAmt.toLocaleString()}</div>
          <div className="text-xs text-white/50 mt-1">Available: ₹{balance.toLocaleString()}</div>
          <input type="number" value={wdAmt} onChange={(e) => setWdAmt(+e.target.value || 0)}
            className={`w-full mt-4 ${glass} rounded-xl px-4 py-3 text-center text-lg font-black bg-transparent outline-none`} />
        </div>
        <div className={`${glass} rounded-2xl p-4 mt-3`}>
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-black mb-2">Bank / UPI ID</div>
          <input placeholder="your@upi" className={`w-full ${glass} rounded-xl px-4 py-3 bg-transparent outline-none`} />
        </div>
        <div className={`${glass} rounded-2xl p-3 mt-2 flex items-start gap-2`}>
          <Info className="h-4 w-4 text-white/50 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-white/60">Withdrawals processed within 2–24 hours. Min ₹300.</div>
        </div>
        <NeonButton variant="blue" size="lg" className="w-full mt-5"
          onClick={() => {
            if (wdAmt < 300) return toast.error("Min ₹300");
            if (wdAmt > balance) return toast.error("Insufficient balance");
            setBalance((b) => b - wdAmt);
            setTxs((t) => [{ id: `w${Date.now()}`, type: "withdraw", amount: wdAmt, when: "Just now", status: "pending" }, ...t]);
            toast.success(`Withdrawal requested`);
            setScreen("wallet");
          }}>Request Withdrawal</NeonButton>
      </div>
    </div>
  );

  // ═══════════════════ TX HISTORY ═══════════════════
  const TxRow = ({ t, last }: { t: Tx; last?: boolean }) => {
    const meta: Record<Tx["type"], { color: string; icon: React.ReactNode; sign: string }> = {
      deposit: { color: C.neonGreen, icon: <ArrowDownLeft className="h-4 w-4" />, sign: "+" },
      win: { color: C.gold, icon: <Trophy className="h-4 w-4" />, sign: "+" },
      withdraw: { color: C.neonBlue, icon: <ArrowUpRight className="h-4 w-4" />, sign: "-" },
      bet: { color: "#ef4444", icon: <Rocket className="h-4 w-4" />, sign: "-" },
    };
    const m = meta[t.type];
    return (
      <div className={`flex items-center gap-3 px-4 py-3 ${last ? "" : "border-b border-white/5"}`}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${m.color}22`, color: m.color, boxShadow: `0 4px 12px ${m.color}33` }}>{m.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black capitalize">{t.type}</div>
          <div className="text-[10px] text-white/50">{t.when}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-black" style={{ color: m.color }}>{m.sign}₹{t.amount.toLocaleString()}</div>
          <div className="text-[9px] uppercase font-black" style={{ color: t.status === "done" ? C.neonGreen : C.gold }}>{t.status}</div>
        </div>
      </div>
    );
  };
  const HistoryScr = () => (
    <div className="relative min-h-screen pb-6">
      <NeonBg />
      <TopBar title="History" onBack={() => setScreen("wallet")} />
      <div className="relative z-10 px-4">
        <div className={`${glass} rounded-2xl overflow-hidden`}>
          {txs.map((t, i) => <TxRow key={t.id} t={t} last={i === txs.length - 1} />)}
          {txs.length === 0 && <div className="p-8 text-center text-white/40 text-sm">No transactions yet</div>}
        </div>
      </div>
    </div>
  );

  // ═══════════════════ PROFILE ═══════════════════
  const [copied, setCopied] = useState(false);
  const Profile = () => (
    <div className="relative min-h-screen pb-6">
      <NeonBg />
      <TopBar title="Profile" onBack={() => setScreen("home")} />
      <div className="relative z-10 px-4">
        <div className={`${glassStrong} rounded-3xl p-5 text-center`}>
          <div className="w-24 h-24 mx-auto rounded-3xl flex items-center justify-center text-3xl font-black text-white relative"
            style={{ background: `linear-gradient(135deg,${C.neonPurple},${C.neonBlue})`, boxShadow: `0 12px 32px ${C.neonPurple}66` }}>
            P
            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg,${C.gold},#7c4a05)`, boxShadow: `0 4px 12px ${C.gold}66` }}>
              <Crown className="h-4 w-4 text-white" />
            </div>
          </div>
          <div className="text-xl font-black text-white mt-3">Player_2341</div>
          <div className="text-xs text-white/50 mt-1">VIP · Level 12</div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div><div className="text-lg font-black" style={{ color: C.gold }}>142</div><div className="text-[9px] uppercase text-white/50">Games</div></div>
            <div><div className="text-lg font-black" style={{ color: C.neonGreen }}>68%</div><div className="text-[9px] uppercase text-white/50">Win Rate</div></div>
            <div><div className="text-lg font-black" style={{ color: C.neonBlue }}>₹24k</div><div className="text-[9px] uppercase text-white/50">Won</div></div>
          </div>
        </div>
        <div className={`${glass} rounded-2xl p-4 mt-3 flex items-center justify-between`}>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/50 font-black">Referral Code</div>
            <div className="text-sm font-black font-mono mt-0.5">RCKT-P2341</div>
          </div>
          <button onClick={() => { navigator.clipboard.writeText("RCKT-P2341"); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className={`px-3 py-2 rounded-xl ${glass} active:scale-95`}>
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        {[
          { i: <Trophy className="h-5 w-5" />, l: "Leaderboard", s: "leaderboard" as const, c: C.gold },
          { i: <History className="h-5 w-5" />, l: "History", s: "history" as const, c: C.neonBlue },
          { i: <Settings className="h-5 w-5" />, l: "Settings", s: "settings" as const, c: C.neonPurple },
        ].map((r) => (
          <button key={r.l} onClick={() => setScreen(r.s)} className={`${glass} w-full rounded-2xl p-4 flex items-center justify-between mt-2 active:scale-95`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${r.c}22`, color: r.c }}>{r.i}</div>
              <div className="text-sm font-black">{r.l}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-white/40" />
          </button>
        ))}
        <button className={`${glass} w-full rounded-2xl p-4 flex items-center gap-3 mt-2 active:scale-95`}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}><LogOut className="h-5 w-5" /></div>
          <div className="text-sm font-black text-red-400">Log Out</div>
        </button>
      </div>
    </div>
  );

  // ═══════════════════ SETTINGS ═══════════════════
  const [notif, setNotif] = useState(true);
  const Settings_ = () => {
    const Row = ({ icon, label, right, color = C.neonBlue }: { icon: React.ReactNode; label: string; right?: React.ReactNode; color?: string }) => (
      <div className={`${glass} rounded-2xl p-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}22`, color }}>{icon}</div>
          <div className="text-sm font-black">{label}</div>
        </div>
        {right ?? <ChevronRight className="h-4 w-4 text-white/40" />}
      </div>
    );
    const Toggle = ({ on, onChange }: { on: boolean; onChange: () => void }) => (
      <button onClick={onChange} className="relative w-12 h-6 rounded-full"
        style={{ background: on ? `linear-gradient(180deg,${C.neonGreen},#14532d)` : "linear-gradient(180deg,#374151,#111)" }}>
        <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white" style={{ transform: on ? "translateX(26px)" : "translateX(2px)", transition: "transform 0.2s" }} />
      </button>
    );
    return (
      <div className="relative min-h-screen pb-6">
        <NeonBg />
        <TopBar title="Settings" onBack={() => setScreen("profile")} />
        <div className="relative z-10 px-4 space-y-2">
          <Row icon={soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />} label="Sound Effects" right={<Toggle on={soundOn} onChange={() => setSoundOn(!soundOn)} />} />
          <Row icon={<Bell className="h-5 w-5" />} label="Notifications" right={<Toggle on={notif} onChange={() => setNotif(!notif)} />} color={C.neonPurple} />
          <Row icon={<Shield className="h-5 w-5" />} label="Privacy & Security" color={C.neonGreen} />
          <Row icon={<HelpCircle className="h-5 w-5" />} label="Help & Support" color={C.gold} />
          <div className={`${glass} rounded-2xl p-4 text-center text-[11px] text-white/50 mt-4`}>RocketX v1.0.0 · Made with 🚀</div>
        </div>
      </div>
    );
  };

  // ═══════════════════ LEADERBOARD ═══════════════════
  const Leaderboard = () => {
    const ranks = MOCK_NAMES.slice(0, 10).map((n, i) => ({
      name: n, win: 25000 - i * 2100 + (i % 3) * 340, mult: (12.4 - i * 0.8).toFixed(2),
    }));
    return (
      <div className="relative min-h-screen pb-6">
        <NeonBg />
        <TopBar title="Leaderboard" onBack={() => setScreen("home")} right={<Trophy className="h-5 w-5" style={{ color: C.gold }} />} />
        <div className="relative z-10 px-4">
          {/* Top 3 podium */}
          <div className="grid grid-cols-3 gap-2 items-end mt-2">
            {[1, 0, 2].map((idx) => {
              const r = ranks[idx]; const heights = ["h-24", "h-32", "h-20"]; const colors = [C.neonBlue, C.gold, C.neonPurple];
              const iconColors = ["#c0c0c0", C.gold, "#cd7f32"];
              return (
                <div key={idx} className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white mb-2 relative"
                    style={{ background: `linear-gradient(135deg,${colors[idx === 0 ? 1 : idx === 1 ? 0 : 2]}88,#000)`, boxShadow: `0 8px 20px ${colors[idx === 0 ? 1 : idx === 1 ? 0 : 2]}66` }}>
                    {r.name.slice(0, 2)}
                    {idx === 0 && <Crown className="h-5 w-5 absolute -top-4" style={{ color: C.gold, filter: `drop-shadow(0 0 8px ${C.gold})` }} />}
                  </div>
                  <div className="text-[10px] font-black text-white truncate w-full text-center">{r.name}</div>
                  <div className={`${glass} ${heights[idx === 0 ? 1 : idx === 1 ? 0 : 2]} w-full rounded-t-2xl flex flex-col items-center justify-end pb-2 mt-1`}
                    style={{ background: `linear-gradient(180deg,${iconColors[idx === 0 ? 1 : idx === 1 ? 0 : 2]}44,transparent)` }}>
                    <div className="text-[10px] font-black" style={{ color: iconColors[idx === 0 ? 1 : idx === 1 ? 0 : 2] }}>#{idx === 0 ? 2 : idx === 1 ? 1 : 3}</div>
                    <div className="text-xs font-black text-white">₹{r.win.toLocaleString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Rest */}
          <div className={`${glass} rounded-2xl overflow-hidden mt-4`}>
            {ranks.slice(3).map((r, i) => (
              <div key={r.name} className={`flex items-center gap-3 px-4 py-3 ${i === ranks.length - 4 ? "" : "border-b border-white/5"}`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white/70 text-sm" style={{ background: "rgba(255,255,255,0.05)" }}>{i + 4}</div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white" style={{ background: `linear-gradient(135deg,${C.neonBlue}88,${C.neonPurple}88)` }}>{r.name.slice(0, 2)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black truncate">{r.name}</div>
                  <div className="text-[10px] text-white/50">Best: {r.mult}x</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black" style={{ color: C.gold }}>₹{r.win.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════ RENDER ═══════════════════
  return (
    <div className="min-h-screen w-full bg-black flex justify-center overflow-hidden" style={{ color: "#fff" }}>
      <div className="w-full max-w-md min-h-screen relative overflow-hidden" style={{ background: C.bg0 }}>
        <AnimatePresence mode="wait">
          <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            {screen === "splash" && <Splash />}
            {screen === "home" && <Home />}
            {screen === "waiting" && <LiveGame waiting />}
            {screen === "live" && <LiveGame />}
            {screen === "win" && <WinScreen />}
            {screen === "crash" && <CrashScreen />}
            {screen === "wallet" && <WalletScr />}
            {screen === "deposit" && <Deposit />}
            {screen === "withdraw" && <Withdraw />}
            {screen === "history" && <HistoryScr />}
            {screen === "profile" && <Profile />}
            {screen === "settings" && <Settings_ />}
            {screen === "leaderboard" && <Leaderboard />}
          </motion.div>
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes rc-star-drift {
          from { background-position: 0 0, 0 0, 0 0; }
          to   { background-position: 0 -2000px, 0 -1400px, 0 -900px; }
        }
        .rc-stars {
          background-image:
            radial-gradient(1px 1px at 20px 30px, #fff, transparent),
            radial-gradient(1.5px 1.5px at 120px 200px, rgba(255,255,255,0.85), transparent),
            radial-gradient(1px 1px at 220px 90px, rgba(180,210,255,0.9), transparent),
            radial-gradient(2px 2px at 300px 350px, #fff, transparent),
            radial-gradient(1px 1px at 80px 500px, rgba(255,255,255,0.7), transparent),
            radial-gradient(1.5px 1.5px at 250px 620px, rgba(200,220,255,0.9), transparent),
            radial-gradient(1px 1px at 40px 780px, rgba(255,255,255,0.8), transparent),
            radial-gradient(2px 2px at 320px 900px, #fff, transparent);
          background-size: 400px 1000px;
          background-repeat: repeat;
        }
      `}</style>
    </div>
  );
};

export default RocketCrash;
