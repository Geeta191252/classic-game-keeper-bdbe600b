import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowLeft, HelpCircle, Volume2, Users, Minus, Plus, Wallet, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useBalanceContext } from "@/contexts/BalanceContext";
import {
  getTelegramUser,
  fetchJetXState,
  placeJetXBet,
  cashOutJetX,
  type CurrencyType,
  type JetXState,
} from "@/lib/telegram";
import { GameCurrencyMode, modeToWallet, toNativeAmount, toDisplayAmount, currencySymbol } from "@/lib/gameCurrency";
import rocketImg from "@/assets/jetx-rocket-v2.png";

type Phase = "betting" | "flying" | "crashed";

const PRESETS: Record<CurrencyType, number[]> = {
  dollar: [1, 5, 10, 50],
  rupee: [100, 500, 1000, 5000],
  star: [10, 50, 100, 500],
};

const CASHOUT_PRESETS = [1.5, 2, 2.45, 5];

const CHIP_COLORS = [
  { bg: "linear-gradient(180deg,#1e90ff,#0b5bbf)", ring: "#3aa4ff" },
  { bg: "linear-gradient(180deg,#22c55e,#166534)", ring: "#4ade80" },
  { bg: "linear-gradient(180deg,#14b8a6,#0f766e)", ring: "#2dd4bf" },
  { bg: "linear-gradient(180deg,#a855f7,#6b21a8)", ring: "#c084fc" },
  { bg: "linear-gradient(180deg,#eab308,#a16207)", ring: "#facc15" },
  { bg: "linear-gradient(180deg,#f97316,#9a3412)", ring: "#fb923c" },
  { bg: "linear-gradient(180deg,#ec4899,#9d174d)", ring: "#f472b6" },
];

const JetXGame = () => {
  const navigate = useNavigate();
  const { dollarBalance, rupeeBalance, starBalance, dollarWinning, rupeeWinning, starWinning, refreshBalance } = useBalanceContext();
  const tgUser = getTelegramUser();

  const [currencyMode, setCurrencyMode] = useState<GameCurrencyMode>("INR");
  const currency: CurrencyType = modeToWallet(currencyMode);

  const [phase, setPhase] = useState<Phase>("betting");
  const [multiplier, setMultiplier] = useState(1);
  const [crashAt, setCrashAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [history, setHistory] = useState<number[]>([]);
  const [roundNumber, setRoundNumber] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  const [betAmount, setBetAmount] = useState(500);
  const [autoCashout, setAutoCashout] = useState(2.45);
  const [autoBet, setAutoBet] = useState(false);
  const [myBet, setMyBet] = useState<{ amount: number; cashedOutAt: number | null; winAmount: number } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [cashing, setCashing] = useState(false);

  const lastPhaseRef = useRef<Phase>("betting");
  const lastRoundRef = useRef(0);
  const autoBetRef = useRef(autoBet); autoBetRef.current = autoBet;
  const autoCashRef = useRef(autoCashout); autoCashRef.current = autoCashout;

  useEffect(() => {
    setBetAmount(currencyMode === "INR" ? 500 : currencyMode === "STAR" ? 50 : 5);
  }, [currencyMode]);

  const totalBal =
    currency === "dollar" ? dollarBalance + dollarWinning :
    currency === "rupee" ? rupeeBalance + rupeeWinning :
    starBalance + starWinning;
  const displayBalance = toDisplayAmount(totalBal, currencyMode);
  const modeSymbol = currencySymbol(currencyMode);
  const fmt = (v: number) => `${modeSymbol}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  // ── Smoothed multiplier for buttery number animation
  const multMv = useMotionValue(1);
  const multSpring = useSpring(multMv, { stiffness: 120, damping: 22, mass: 0.6 });
  const multText = useTransform(multSpring, (v) => `${v.toFixed(2)}x`);
  useEffect(() => { multMv.set(multiplier); }, [multiplier, multMv]);

  // Poll server state
  useEffect(() => {
    let cancel = false;
    const tick = async () => {
      try {
        const s: JetXState = await fetchJetXState(currency);
        if (cancel) return;
        setPhase(s.phase);
        setMultiplier(s.multiplier);
        setCrashAt(s.crashAt);
        setCountdown(s.timeLeft);
        setHistory(s.history);
        setRoundNumber(s.roundNumber);
        setTotalPlayers(s.totalPlayers);
        if (s.roundNumber !== lastRoundRef.current) {
          lastRoundRef.current = s.roundNumber;
          setMyBet(null);
        }
        if (lastPhaseRef.current !== s.phase && s.phase === "crashed") refreshBalance();
        lastPhaseRef.current = s.phase;
      } catch { /* silent */ }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => { cancel = true; clearInterval(id); };
  }, [currency, refreshBalance]);

  const canBet = phase === "betting" && !myBet && !placing;
  const canCashout = phase === "flying" && !!myBet && !myBet.cashedOutAt && !cashing;

  const handleBet = useCallback(async () => {
    if (!canBet) return;
    if (betAmount <= 0) return toast.error("Enter amount");
    const nativeBet = toNativeAmount(betAmount, currencyMode);
    if (nativeBet > totalBal) return toast.error(`Insufficient ${modeSymbol} balance`);
    setPlacing(true);
    try {
      await placeJetXBet({ userId: tgUser?.id || "demo", amount: nativeBet, currency, firstName: tgUser?.first_name });
      setMyBet({ amount: betAmount, cashedOutAt: null, winAmount: 0 });
      refreshBalance();
      toast.success(`Bet ${fmt(betAmount)} placed`);
    } catch (e: any) {
      toast.error(e?.message || "Bet failed");
    } finally {
      setPlacing(false);
    }
  }, [canBet, betAmount, totalBal, tgUser, currency, currencyMode, modeSymbol]);

  const handleCashout = useCallback(async () => {
    if (!canCashout) return;
    setCashing(true);
    try {
      const res = await cashOutJetX(tgUser?.id || "demo", currency);
      setMyBet((prev) => prev ? { ...prev, cashedOutAt: res.multiplier, winAmount: res.winAmount } : prev);
      refreshBalance();
      toast.success(`Won ${fmt(toDisplayAmount(res.winAmount, currencyMode))} @ ${res.multiplier.toFixed(2)}x`);
    } catch (e: any) {
      toast.error(e?.message || "Cashout failed");
    } finally {
      setCashing(false);
    }
  }, [canCashout, tgUser, currency, currencyMode]);

  useEffect(() => {
    if (phase === "flying" && myBet && !myBet.cashedOutAt && autoBetRef.current && multiplier >= autoCashRef.current) {
      handleCashout();
    }
  }, [multiplier, phase, myBet, handleCashout]);

  const potentialWin = useMemo(() => (myBet ? myBet.amount : betAmount) * 0.98 * multiplier, [myBet, betAmount, multiplier]);

  const currencyOptions: { mode: GameCurrencyMode; label: string }[] = [
    { mode: "INR", label: "₹" },
    { mode: "USD", label: "$" },
    { mode: "STAR", label: "★" },
  ];

  // Rocket flight math
  const progress = phase === "flying" ? Math.min(1, Math.log(Math.max(1, multiplier)) / Math.log(15)) : 0;
  const rocketBottomPct = phase === "crashed" ? 130 : 8 + progress * 48;
  const flameHvh = phase === "flying" ? 12 + progress * 9 : phase === "betting" ? 8 : 7;

  return (
    <div
      className="min-h-screen w-full text-white select-none relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 20% 10%, #1a2a5a 0%, #0a0f24 40%, #04060f 100%)",
      }}
    >
      {/* ── Animated deep-space background (edge-to-edge) ── */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {/* Nebula wash */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 45% at 75% 25%, rgba(120,80,220,0.35), transparent 60%), radial-gradient(50% 40% at 15% 75%, rgba(30,120,220,0.35), transparent 65%), radial-gradient(35% 30% at 60% 85%, rgba(236,72,153,0.22), transparent 70%)",
            animation: "jetx-nebula-drift 14s ease-in-out infinite",
          }}
        />
        {/* Star layers */}
        <div
          className="absolute inset-0 jetx-stars opacity-90"
          style={{ animation: `jetx-stars-move ${phase === "flying" ? 12 : 40}s linear infinite` }}
        />
        <div
          className="absolute inset-0 jetx-stars opacity-50"
          style={{
            animation: `jetx-stars-move ${phase === "flying" ? 22 : 70}s linear infinite`,
            filter: "blur(0.5px)",
            transform: "scale(1.4)",
          }}
        />
        {/* Vignette */}
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)" }}
        />
      </div>

      {/* ── HEADER ── */}
      <div className="relative z-10 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => navigate("/")}
            className="w-11 h-11 rounded-2xl flex items-center justify-center active:scale-90 transition jetx-glass"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex-1 flex justify-center">
            <h1
              className="text-[40px] font-black italic tracking-tight leading-none"
              style={{
                fontFamily: "'Arial Black', system-ui, sans-serif",
                background: "linear-gradient(180deg,#ffffff 0%,#dbeafe 55%,#93a4c9 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 3px 10px rgba(120,150,255,0.35))",
              }}
            >
              Jet<span style={{
                background: "linear-gradient(180deg,#fde047 0%,#eab308 55%,#a16207 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 14px rgba(250,204,21,0.75))",
              }}>X</span>
            </h1>
          </div>

          <button className="w-11 h-11 rounded-2xl flex items-center justify-center jetx-glass">
            <HelpCircle className="h-5 w-5 text-sky-300" />
          </button>
        </div>

        {/* Wallet + currency + volume */}
        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-2xl jetx-glass">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(180deg,#22c55e,#166534)",
                boxShadow: "0 4px 10px rgba(34,197,94,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
              }}
            >
              <Wallet className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-[13px] font-black leading-tight">{fmt(displayBalance)}</div>
              <div className="text-[9px] text-white/50 uppercase tracking-wider leading-tight">Balance</div>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-2xl jetx-glass">
            {currencyOptions.map((o) => {
              const active = currencyMode === o.mode;
              return (
                <button
                  key={o.mode}
                  onClick={() => setCurrencyMode(o.mode)}
                  disabled={phase !== "betting"}
                  className="w-8 h-8 rounded-xl font-black text-sm disabled:opacity-50 transition"
                  style={{
                    background: active
                      ? "linear-gradient(180deg,#fde047,#a16207)"
                      : "transparent",
                    color: active ? "#111" : "#fff",
                    boxShadow: active
                      ? "0 4px 12px rgba(234,179,8,0.5), inset 0 1px 0 rgba(255,255,255,0.5)"
                      : "none",
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          <button className="w-11 h-11 rounded-2xl flex items-center justify-center jetx-glass">
            <Volume2 className="h-4 w-4 text-sky-300" />
          </button>
        </div>
      </div>

      {/* ── STAGE (edge-to-edge) ── */}
      <div className="relative z-10 mt-2">
        <div
          className="relative overflow-hidden mx-3 rounded-[28px] jetx-glass-strong"
          style={{ aspectRatio: "9 / 11" }}
        >
          {/* Inner star drift (parallax faster inside stage) */}
          <div
            className="absolute inset-0 jetx-stars opacity-80"
            style={{ animation: `jetx-stars-move ${phase === "flying" ? 6 : 30}s linear infinite` }}
          />
          {/* Aurora glow behind rocket */}
          <div
            className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 100%, rgba(249,115,22,0.35), rgba(168,85,247,0.15) 45%, transparent 75%)",
            }}
          />

          {/* Round ID */}
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-xl text-[10px] font-black jetx-glass">
            <div className="text-[8px] text-emerald-300/80 uppercase tracking-wider">Round</div>
            <div className="text-emerald-200">#{100000 + roundNumber}</div>
          </div>
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1.5 jetx-glass">
            <Users className="h-3 w-3 text-white/70" />
            <div>
              <div className="text-white leading-tight">{totalPlayers}</div>
              <div className="text-[8px] text-white/50 uppercase leading-tight">Live</div>
            </div>
          </div>

          {/* Multiplier / Countdown */}
          <div className="absolute left-1/2 -translate-x-1/2 top-[16%] w-full text-center pointer-events-none">
            <AnimatePresence mode="wait">
              {phase === "betting" && (
                <motion.div key="b" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="text-[10px] text-white/60 uppercase tracking-[0.28em] mb-1 font-black">Next round in</div>
                  <div
                    className="text-[84px] font-black leading-none italic"
                    style={{
                      fontFamily: "'Arial Black', sans-serif",
                      background: "linear-gradient(180deg,#fde047,#eab308,#7c4a05)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0 8px 24px rgba(250,204,21,0.5))",
                    }}
                  >
                    {countdown}
                  </div>
                </motion.div>
              )}
              {phase === "flying" && (
                <motion.div key="f" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <motion.div
                    className="text-[74px] font-black leading-none italic"
                    style={{
                      fontFamily: "'Arial Black', sans-serif",
                      background: "linear-gradient(180deg,#ffffff,#fde047,#eab308)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0 6px 22px rgba(250,204,21,0.7)) drop-shadow(0 0 12px rgba(255,255,255,0.35))",
                    }}
                  >
                    {multText}
                  </motion.div>
                  <div
                    className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-[11px] font-black text-emerald-50"
                    style={{
                      background: "linear-gradient(180deg,rgba(34,197,94,0.9),rgba(22,101,52,0.9))",
                      boxShadow: "0 6px 16px rgba(34,197,94,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
                    }}
                  >
                    FLYING HIGH 🚀
                  </div>
                </motion.div>
              )}
              {phase === "crashed" && (
                <motion.div key="c" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <div className="text-[10px] text-red-300 font-black uppercase tracking-[0.28em] mb-1">💥 Crashed</div>
                  <div
                    className="text-[74px] font-black italic leading-none"
                    style={{
                      fontFamily: "'Arial Black', sans-serif",
                      background: "linear-gradient(180deg,#fecaca,#ef4444,#7f1d1d)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0 6px 22px rgba(239,68,68,0.7))",
                    }}
                  >
                    {(crashAt ?? multiplier).toFixed(2)}x
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Rocket + flame */}
          <motion.div
            className="absolute pointer-events-none left-1/2"
            style={{ width: "46%", x: "-50%" }}
            animate={{
              bottom: `${rocketBottomPct}%`,
              x: phase === "flying" ? ["-52%", "-48%", "-51%", "-49%", "-50%"] : "-50%",
              y: phase === "betting" ? [0, -10, 0, 8, 0] : 0,
            }}
            transition={{
              bottom: { duration: 0.35, ease: "linear" },
              x: { duration: 1.2, repeat: Infinity, ease: "easeInOut" },
              y: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
            }}
          >
            <img
              src={rocketImg}
              alt="rocket"
              className="w-full block relative"
              style={{
                filter:
                  "drop-shadow(0 20px 30px rgba(0,0,0,0.75)) drop-shadow(0 0 26px rgba(120,180,255,0.35)) drop-shadow(0 0 14px rgba(249,115,22,0.35))",
              }}
            />
            {/* Flame plume — soft glowing 3D plume */}
            <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{ top: "92%", width: "58%", height: `${flameHvh}vh`, maxHeight: "62vh" }}
            >
              {/* wide ambient glow */}
              <motion.div
                style={{
                  position: "absolute", inset: "-15% -80% 5% -80%",
                  background:
                    "radial-gradient(ellipse at 50% 15%, rgba(251,191,36,0.65) 0%, rgba(249,115,22,0.35) 30%, rgba(234,88,12,0.15) 55%, transparent 75%)",
                  filter: "blur(24px)",
                }}
                animate={{ opacity: [0.75, 1, 0.8, 1] }}
                transition={{ duration: 0.35, repeat: Infinity }}
              />
              {/* outer orange plume */}
              <motion.div
                style={{
                  position: "absolute", inset: 0,
                  background:
                    "radial-gradient(ellipse at 50% 8%, #fde68a 0%, #fbbf24 18%, #f97316 45%, #ea580c 72%, rgba(194,65,12,0) 100%)",
                  clipPath: "polygon(50% 0%, 92% 12%, 100% 40%, 88% 72%, 62% 96%, 50% 100%, 38% 96%, 12% 72%, 0% 40%, 8% 12%)",
                  filter: "blur(6px) drop-shadow(0 0 30px rgba(249,115,22,0.85))",
                  transformOrigin: "top center",
                }}
                animate={{ scaleY: [1, 1.08, 0.95, 1.05, 1], scaleX: [1, 0.97, 1.04, 0.98, 1] }}
                transition={{ duration: 0.28, repeat: Infinity }}
              />
              {/* mid yellow plume */}
              <motion.div
                style={{
                  position: "absolute", top: 0, left: "18%", right: "18%", bottom: "8%",
                  background:
                    "radial-gradient(ellipse at 50% 8%, #ffffff 0%, #fef9c3 15%, #fde047 40%, #fbbf24 70%, rgba(251,191,36,0) 100%)",
                  clipPath: "polygon(50% 0%, 88% 15%, 96% 45%, 78% 78%, 55% 98%, 50% 100%, 45% 98%, 22% 78%, 4% 45%, 12% 15%)",
                  filter: "blur(3px)",
                  transformOrigin: "top center",
                }}
                animate={{ scaleY: [1, 1.1, 0.94, 1.06, 1] }}
                transition={{ duration: 0.22, repeat: Infinity }}
              />
              {/* bright white core */}
              <motion.div
                style={{
                  position: "absolute", top: "-2%", left: "34%", right: "34%", bottom: "38%",
                  background:
                    "radial-gradient(ellipse at 50% 10%, #ffffff 0%, #fef3c7 45%, rgba(253,224,71,0) 100%)",
                  filter: "blur(2px)",
                  transformOrigin: "top center",
                }}
                animate={{ scaleY: [1, 1.12, 0.9, 1.08, 1], opacity: [0.95, 1, 0.9, 1] }}
                transition={{ duration: 0.18, repeat: Infinity }}
              />
              {/* nozzle hotspot */}
              <motion.div
                style={{
                  position: "absolute", top: "-8%", left: "26%", right: "26%", height: "16%",
                  background: "radial-gradient(ellipse, #ffffff 0%, #fef3c7 40%, transparent 75%)",
                  filter: "blur(6px)",
                }}
                animate={{ opacity: [0.9, 1, 0.85, 1] }}
                transition={{ duration: 0.15, repeat: Infinity }}
              />
              {/* falling sparks */}
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  style={{
                    position: "absolute",
                    top: "20%",
                    left: `${20 + i * 15}%`,
                    width: 4, height: 4, borderRadius: "50%",
                    background: "#fde047",
                    boxShadow: "0 0 8px #fbbf24, 0 0 4px #ffffff",
                  }}
                  animate={{ y: [0, 60 + i * 10, 120], opacity: [1, 0.8, 0], x: [0, (i % 2 ? 8 : -8), (i % 2 ? 16 : -16)] }}
                  transition={{ duration: 0.9 + i * 0.15, repeat: Infinity, delay: i * 0.18, ease: "easeOut" }}
                />
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── HISTORY CHIPS ── */}
      <div className="relative z-10 flex gap-1.5 px-4 mt-3 overflow-x-auto scrollbar-hide pb-1">
        {history.slice(0, 10).map((h, i) => {
          const c = CHIP_COLORS[i % CHIP_COLORS.length];
          return (
            <div
              key={i}
              className="px-2.5 py-1 rounded-lg text-[11px] font-black text-white whitespace-nowrap"
              style={{
                background: c.bg,
                border: `1px solid ${c.ring}`,
                boxShadow: "0 4px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
                textShadow: "0 1px 2px rgba(0,0,0,0.6)",
              }}
            >
              {h.toFixed(2)}x
            </div>
          );
        })}
      </div>

      {/* ── CONTROL PANELS ── */}
      <div className="relative z-10 px-3 mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl p-2.5 jetx-glass">
          <div className="text-[9px] text-white/60 font-black uppercase tracking-wider text-center mb-1.5">Bet Amount</div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setBetAmount(v => Math.max(1, +(v - (currencyMode === "INR" ? 100 : 1)).toFixed(2)))}
              className="w-8 h-9 rounded-lg flex items-center justify-center active:scale-90 jetx-glass"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              value={betAmount}
              onChange={e => setBetAmount(Math.max(0, Number(e.target.value) || 0))}
              className="flex-1 bg-transparent text-center text-base font-black outline-none w-0"
            />
            <button
              onClick={() => setBetAmount(v => +(v + (currencyMode === "INR" ? 100 : 1)).toFixed(2))}
              className="w-8 h-9 rounded-lg flex items-center justify-center active:scale-90 jetx-glass"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-1.5">
            {PRESETS[currency].map(p => (
              <button
                key={p}
                onClick={() => setBetAmount(p)}
                className="text-[9px] font-black py-1 rounded-md transition"
                style={{
                  background: betAmount === p
                    ? "linear-gradient(180deg,#22c55e,#166534)"
                    : "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: betAmount === p ? "0 4px 10px rgba(34,197,94,0.4)" : "none",
                }}
              >
                {modeSymbol}{p}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-2.5 jetx-glass">
          <div className="text-[9px] text-white/60 font-black uppercase tracking-wider text-center mb-1.5">Auto Cashout</div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAutoCashout(v => Math.max(1.1, +(v - 0.1).toFixed(2)))}
              className="w-8 h-9 rounded-lg flex items-center justify-center active:scale-90 jetx-glass"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <div className="flex-1 text-center text-base font-black">{autoCashout.toFixed(2)}x</div>
            <button
              onClick={() => setAutoCashout(v => +(v + 0.1).toFixed(2))}
              className="w-8 h-9 rounded-lg flex items-center justify-center active:scale-90 jetx-glass"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-1.5">
            {CASHOUT_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setAutoCashout(p)}
                className="text-[9px] font-black py-1 rounded-md transition"
                style={{
                  background: autoCashout === p
                    ? "linear-gradient(180deg,#22c55e,#166534)"
                    : "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: autoCashout === p ? "0 4px 10px rgba(34,197,94,0.4)" : "none",
                }}
              >
                {p.toFixed(2)}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Auto bet row */}
      <div className="relative z-10 px-3 mt-2">
        <div className="flex items-center justify-between rounded-2xl p-2.5 jetx-glass">
          <div className="text-[10px] text-white/70 font-black uppercase tracking-wider">Auto Bet</div>
          <button
            onClick={() => setAutoBet(v => !v)}
            className="relative w-14 h-7 rounded-full transition-colors"
            style={{
              background: autoBet ? "linear-gradient(180deg,#22c55e,#166534)" : "linear-gradient(180deg,#374151,#111)",
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)",
            }}
          >
            <div
              className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform"
              style={{ transform: autoBet ? "translateX(28px)" : "translateX(2px)", boxShadow: "0 2px 4px rgba(0,0,0,0.5)" }}
            />
          </button>
          <div className="flex items-center gap-1 text-[11px] font-black">
            <span className="text-white/60">×</span>
            <span>2.0</span>
            <Info className="h-3 w-3 text-white/40" />
          </div>
        </div>
      </div>

      {/* Main action */}
      <div className="relative z-10 px-3 mt-3 pb-4">
        {canCashout ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleCashout}
            disabled={cashing}
            className="w-full py-4 rounded-2xl relative overflow-hidden"
            style={{
              background: "linear-gradient(180deg,#fef08a 0%,#facc15 30%,#eab308 70%,#a16207 100%)",
              boxShadow: "0 10px 24px rgba(234,179,8,0.55), inset 0 2px 0 rgba(255,255,255,0.55)",
              border: "1px solid #fde047",
            }}
          >
            <div className="text-black font-black text-xl leading-tight">CASH OUT</div>
            <div className="text-black font-black text-lg">{fmt(potentialWin)}</div>
          </motion.button>
        ) : myBet?.cashedOutAt ? (
          <div className="w-full py-4 rounded-2xl text-center font-black text-lg"
            style={{
              background: "linear-gradient(180deg,#22c55e,#166534)",
              boxShadow: "0 10px 24px rgba(34,197,94,0.4), inset 0 2px 0 rgba(255,255,255,0.3)",
            }}>
            ✓ Won {fmt(toDisplayAmount(myBet.winAmount, currencyMode))} @ {myBet.cashedOutAt.toFixed(2)}x
          </div>
        ) : myBet ? (
          <div className="w-full py-4 rounded-2xl text-center font-black text-lg"
            style={{
              background: "linear-gradient(180deg,#ef4444,#7f1d1d)",
              boxShadow: "0 10px 24px rgba(239,68,68,0.4), inset 0 2px 0 rgba(255,255,255,0.2)",
            }}>
            {phase === "crashed" ? `💥 Lost ${fmt(myBet.amount)}` : `Waiting for takeoff...`}
          </div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleBet}
            disabled={!canBet}
            className="w-full py-4 rounded-2xl relative overflow-hidden disabled:opacity-60"
            style={{
              background: canBet
                ? "linear-gradient(180deg,#fef08a 0%,#facc15 30%,#eab308 70%,#a16207 100%)"
                : "linear-gradient(180deg,#374151,#111)",
              boxShadow: canBet
                ? "0 10px 24px rgba(234,179,8,0.55), inset 0 2px 0 rgba(255,255,255,0.55)"
                : "0 4px 0 #000",
              border: canBet ? "1px solid #fde047" : "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div className={`font-black text-xl ${canBet ? "text-black" : "text-white/60"}`}>
              {placing ? "PLACING..." : phase === "betting" ? `BET ${fmt(betAmount)}` : "WAIT FOR NEXT ROUND"}
            </div>
          </motion.button>
        )}
      </div>

      {/* Players table */}
      <div className="relative z-10 px-3 pb-8">
        <div className="rounded-2xl overflow-hidden jetx-glass">
          <div className="grid grid-cols-4 gap-1 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white/50 border-b border-white/5">
            <div>Players ({totalPlayers})</div>
            <div className="text-center">Bet</div>
            <div className="text-center">Cash Out</div>
            <div className="text-right">Win</div>
          </div>
          {myBet ? (
            <div className="grid grid-cols-4 gap-1 px-3 py-2.5 text-[11px] font-bold items-center"
              style={{ background: "rgba(34,197,94,0.08)" }}>
              <div className="flex items-center gap-1.5 truncate">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{ background: "linear-gradient(180deg,#a855f7,#6b21a8)" }}>You</div>
              </div>
              <div className="text-center">{fmt(myBet.amount)}</div>
              <div className="text-center" style={{ color: myBet.cashedOutAt ? "#4ade80" : "#94a3b8" }}>
                {myBet.cashedOutAt ? `${myBet.cashedOutAt.toFixed(2)}x` : "—"}
              </div>
              <div className="text-right" style={{ color: myBet.cashedOutAt ? "#4ade80" : "#64748b" }}>
                {myBet.cashedOutAt ? fmt(toDisplayAmount(myBet.winAmount, currencyMode)) : "—"}
              </div>
            </div>
          ) : (
            <div className="px-3 py-6 text-center text-white/40 text-xs">No bets yet — place yours!</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JetXGame;
