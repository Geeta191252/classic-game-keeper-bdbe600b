import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, HelpCircle, Volume2, Users, Minus, Plus, ChevronDown, Wallet, Info } from "lucide-react";
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
import rocketImg from "@/assets/jetx-rocket.png";
import spaceBg from "@/assets/jetx-space-bg.jpg";
import stageRef from "@/assets/jetx-stage.png.asset.json";

type Phase = "betting" | "flying" | "crashed";

const PRESETS: Record<CurrencyType, number[]> = {
  dollar: [1, 5, 10, 50],
  rupee: [100, 500, 1000, 5000],
  star: [10, 50, 100, 500],
};

const CASHOUT_PRESETS = [1.5, 2, 2.45, 5];

// History chip colors (cycled) — matches reference multi-color pills
const CHIP_COLORS = [
  { bg: "linear-gradient(180deg,#1e90ff,#0b5bbf)", ring: "#3aa4ff" }, // blue
  { bg: "linear-gradient(180deg,#22c55e,#166534)", ring: "#4ade80" }, // green
  { bg: "linear-gradient(180deg,#14b8a6,#0f766e)", ring: "#2dd4bf" }, // teal
  { bg: "linear-gradient(180deg,#a855f7,#6b21a8)", ring: "#c084fc" }, // purple
  { bg: "linear-gradient(180deg,#eab308,#a16207)", ring: "#facc15" }, // yellow
  { bg: "linear-gradient(180deg,#f97316,#9a3412)", ring: "#fb923c" }, // orange
  { bg: "linear-gradient(180deg,#ec4899,#9d174d)", ring: "#f472b6" }, // pink
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
  const autoBetRef = useRef(autoBet);
  autoBetRef.current = autoBet;
  const autoCashRef = useRef(autoCashout);
  autoCashRef.current = autoCashout;

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
        if (lastPhaseRef.current !== s.phase && s.phase === "crashed") {
          refreshBalance();
        }
        lastPhaseRef.current = s.phase;
      } catch { /* silent */ }
    };
    tick();
    const id = setInterval(tick, 300);
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
      await placeJetXBet({
        userId: tgUser?.id || "demo",
        amount: nativeBet,
        currency,
        firstName: tgUser?.first_name,
      });
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

  // Auto-cashout
  useEffect(() => {
    if (phase === "flying" && myBet && !myBet.cashedOutAt && autoBetRef.current && multiplier >= autoCashRef.current) {
      handleCashout();
    }
  }, [multiplier, phase, myBet, handleCashout]);

  const potentialWin = useMemo(() => myBet ? myBet.amount * 0.98 * multiplier : betAmount * 0.98 * multiplier, [myBet, betAmount, multiplier]);

  const currencyOptions: { mode: GameCurrencyMode; label: string }[] = [
    { mode: "INR", label: "₹" },
    { mode: "USD", label: "$" },
    { mode: "STAR", label: "★" },
  ];

  return (
    <div className="min-h-screen w-full text-white select-none" style={{ background: "#000" }}>
      {/* ── HEADER ─────────────────────────── */}
      <div className="relative px-3 pt-3 pb-2">
        <div className="flex items-start justify-between">
          {/* Back */}
          <button
            onClick={() => navigate("/")}
            className="w-11 h-11 rounded-2xl flex items-center justify-center active:scale-90 transition"
            style={{
              background: "linear-gradient(180deg,#1f2937,#0b1220)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 4px 0 #000, inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* 3D JetX Logo */}
          <div className="flex-1 flex justify-center -mt-1">
            <div className="relative">
              <h1
                className="text-[42px] font-black italic tracking-tight leading-none"
                style={{
                  fontFamily: "'Arial Black', system-ui, sans-serif",
                  background: "linear-gradient(180deg,#ffffff 0%,#e5e7eb 55%,#9ca3af 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textShadow: "0 4px 0 #4b5563, 0 6px 12px rgba(0,0,0,0.6)",
                  filter: "drop-shadow(0 3px 0 #374151)",
                }}
              >
                Jet<span style={{
                  background: "linear-gradient(180deg,#fde047 0%,#eab308 55%,#a16207 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 12px rgba(250,204,21,0.7))",
                }}>X</span>
              </h1>
            </div>
          </div>

          {/* Right buttons */}
          <div className="flex flex-col gap-1.5">
            <button className="px-2.5 h-9 rounded-xl flex items-center gap-1.5 text-[11px] font-bold"
              style={{
                background: "linear-gradient(180deg,#1e3a8a,#0c1d4a)",
                border: "1px solid #3b5fbf",
                boxShadow: "0 3px 0 #030712, inset 0 1px 0 rgba(255,255,255,0.15)",
              }}>
              <HelpCircle className="h-3.5 w-3.5 text-sky-300" />
              <span>How to play?</span>
            </button>
          </div>
        </div>

        {/* Wallet chip + volume */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-2xl"
            style={{
              background: "linear-gradient(180deg,#0b1220,#000)",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 3px 0 #000",
            }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(180deg,#22c55e,#166534)",
                boxShadow: "0 3px 0 #052e16, inset 0 1px 0 rgba(255,255,255,0.3)",
              }}>
              <Wallet className="h-4 w-4 text-white" />
            </div>
            <div className="pr-2">
              <div className="text-[13px] font-black leading-tight">{fmt(displayBalance)}</div>
              <div className="text-[9px] text-white/50 uppercase tracking-wider leading-tight">Main Balance</div>
            </div>
          </div>

          {/* Currency switch */}
          <div className="flex items-center gap-1 p-1 rounded-2xl"
            style={{
              background: "linear-gradient(180deg,#0b1220,#000)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
            {currencyOptions.map(o => (
              <button
                key={o.mode}
                onClick={() => setCurrencyMode(o.mode)}
                disabled={phase !== "betting"}
                className="w-8 h-8 rounded-xl font-black text-sm disabled:opacity-50"
                style={{
                  background: currencyMode === o.mode
                    ? "linear-gradient(180deg,#eab308,#a16207)"
                    : "linear-gradient(180deg,#1f2937,#0b1220)",
                  color: currencyMode === o.mode ? "#111" : "#fff",
                  boxShadow: currencyMode === o.mode
                    ? "0 2px 0 #713f12, inset 0 1px 0 rgba(255,255,255,0.4)"
                    : "0 2px 0 #000",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>

          <button className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(180deg,#1e3a8a,#0c1d4a)",
              border: "1px solid #3b5fbf",
              boxShadow: "0 3px 0 #030712",
            }}>
            <Volume2 className="h-4 w-4 text-sky-300" />
          </button>
        </div>
      </div>

      {/* ── STAGE ────────────────────────── */}
      <div className="px-3">
        <div className="relative rounded-[28px] overflow-hidden"
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 8px 0 #000, inset 0 1px 0 rgba(255,255,255,0.08)",
            aspectRatio: "973 / 630",
          }}>
          {/* Baked reference stage: space + rocket + clouds + flame (exact copy) */}
          <motion.img
            src={stageRef.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            animate={
              phase === "flying"
                ? { y: [0, -3, 0, 2, 0], scale: [1, 1.005, 1] }
                : phase === "crashed"
                ? { y: [0, 8, 16], opacity: [1, 0.7, 0.5] }
                : { y: 0, scale: 1 }
            }
            transition={
              phase === "flying"
                ? { duration: 0.4, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.6, ease: "easeOut" }
            }
            width={973}
            height={630}
          />

          {/* Round ID — overlays baked one (top-left) */}
          <div className="absolute top-[3%] left-[3%] px-2.5 py-1 rounded-xl text-[10px] font-black"
            style={{
              background: "linear-gradient(180deg,#0b1220,#000)",
              border: "1px solid rgba(34,197,94,0.4)",
              boxShadow: "0 2px 0 #000",
            }}>
            <div className="text-[8px] text-green-400 uppercase tracking-wider">Round ID</div>
            <div className="text-green-300">#{100000 + roundNumber}</div>
          </div>

          {/* Players — overlays baked one (top-right) */}
          <div className="absolute top-[3%] right-[3%] px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1.5"
            style={{
              background: "linear-gradient(180deg,#0b1220,#000)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 2px 0 #000",
            }}>
            <Users className="h-3 w-3 text-white/70" />
            <div>
              <div className="text-white leading-tight">{totalPlayers}</div>
              <div className="text-[8px] text-white/50 uppercase leading-tight">Playing</div>
            </div>
          </div>

          {/* Live multiplier — covers the baked "4.35x FLYING HIGH" text exactly */}
          <div className="absolute pointer-events-none"
            style={{ top: "26%", left: "8%", width: "42%" }}>
            <AnimatePresence mode="wait">
              {phase === "betting" && (
                <motion.div key="b" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <div className="text-[9px] text-white/70 uppercase tracking-[0.2em] mb-1 font-black">Next round in</div>
                  <div className="text-[64px] font-black leading-none italic"
                    style={{
                      fontFamily: "'Arial Black', sans-serif",
                      background: "linear-gradient(180deg,#fde047,#eab308,#a16207)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0 4px 0 #713f12) drop-shadow(0 0 20px rgba(250,204,21,0.6))",
                    }}>{countdown}</div>
                </motion.div>
              )}
              {phase === "flying" && (
                <motion.div key="f" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  {/* Solid black plate to mask the baked "4.35x" behind live value */}
                  <div className="text-[54px] font-black leading-none italic"
                    style={{
                      fontFamily: "'Arial Black', sans-serif",
                      background: "linear-gradient(180deg,#fef08a,#eab308,#854d0e)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0 5px 0 #451a03) drop-shadow(0 0 24px rgba(250,204,21,0.9)) drop-shadow(0 0 6px #000) drop-shadow(0 0 6px #000)",
                      WebkitTextStroke: "1px rgba(0,0,0,0.6)",
                    }}>{multiplier.toFixed(2)}x</div>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black text-green-100"
                    style={{
                      background: "linear-gradient(180deg,#22c55e,#166534)",
                      boxShadow: "0 3px 0 #052e16, inset 0 1px 0 rgba(255,255,255,0.3)",
                    }}>
                    FLYING HIGH! 🚀
                  </div>
                </motion.div>
              )}
              {phase === "crashed" && (
                <motion.div key="c" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <div className="text-[10px] text-red-300 font-black uppercase tracking-[0.2em] mb-1">💥 Crashed</div>
                  <div className="text-[54px] font-black italic leading-none"
                    style={{
                      fontFamily: "'Arial Black', sans-serif",
                      background: "linear-gradient(180deg,#fca5a5,#ef4444,#7f1d1d)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0 4px 0 #450a0a) drop-shadow(0 0 24px rgba(239,68,68,0.9)) drop-shadow(0 0 6px #000) drop-shadow(0 0 6px #000)",
                      WebkitTextStroke: "1px rgba(0,0,0,0.6)",
                    }}>{(crashAt ?? multiplier).toFixed(2)}x</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── HISTORY CHIPS ────────────────────── */}
      <div className="flex gap-1.5 px-3 mt-3 overflow-x-auto no-scrollbar pb-1">
        {history.slice(0, 8).map((h, i) => {
          const c = CHIP_COLORS[i % CHIP_COLORS.length];
          return (
            <div key={i} className="px-2.5 py-1 rounded-lg text-[11px] font-black text-white whitespace-nowrap"
              style={{
                background: c.bg,
                border: `1px solid ${c.ring}`,
                boxShadow: `0 3px 0 rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.3)`,
                textShadow: "0 1px 2px rgba(0,0,0,0.6)",
              }}>
              {h.toFixed(2)}x
            </div>
          );
        })}
      </div>

      {/* ── CONTROL PANELS ────────────────── */}
      <div className="px-3 mt-3 grid grid-cols-2 gap-2">
        {/* Bet amount */}
        <div className="rounded-2xl p-2.5"
          style={{
            background: "linear-gradient(180deg,#0f172a,#000)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 4px 0 #000",
          }}>
          <div className="text-[9px] text-white/60 font-black uppercase tracking-wider text-center mb-1.5">Bet Amount</div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setBetAmount(v => Math.max(1, +(v - (currencyMode === "INR" ? 100 : 1)).toFixed(2)))}
              className="w-8 h-9 rounded-lg flex items-center justify-center active:scale-90"
              style={{ background: "linear-gradient(180deg,#1f2937,#000)", boxShadow: "0 2px 0 #000" }}>
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              value={betAmount}
              onChange={e => setBetAmount(Math.max(0, Number(e.target.value) || 0))}
              className="flex-1 bg-transparent text-center text-base font-black outline-none w-0"
            />
            <button onClick={() => setBetAmount(v => +(v + (currencyMode === "INR" ? 100 : 1)).toFixed(2))}
              className="w-8 h-9 rounded-lg flex items-center justify-center active:scale-90"
              style={{ background: "linear-gradient(180deg,#1f2937,#000)", boxShadow: "0 2px 0 #000" }}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-1.5">
            {PRESETS[currency].map(p => (
              <button key={p} onClick={() => setBetAmount(p)}
                className="text-[9px] font-black py-1 rounded-md"
                style={{
                  background: betAmount === p
                    ? "linear-gradient(180deg,#22c55e,#166534)"
                    : "linear-gradient(180deg,#1f2937,#000)",
                  boxShadow: "0 2px 0 #000",
                }}>
                {modeSymbol}{p}
              </button>
            ))}
          </div>
        </div>

        {/* Auto cashout */}
        <div className="rounded-2xl p-2.5"
          style={{
            background: "linear-gradient(180deg,#0f172a,#000)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 4px 0 #000",
          }}>
          <div className="text-[9px] text-white/60 font-black uppercase tracking-wider text-center mb-1.5">Auto Cashout</div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setAutoCashout(v => Math.max(1.1, +(v - 0.1).toFixed(2)))}
              className="w-8 h-9 rounded-lg flex items-center justify-center active:scale-90"
              style={{ background: "linear-gradient(180deg,#1f2937,#000)", boxShadow: "0 2px 0 #000" }}>
              <Minus className="h-3.5 w-3.5" />
            </button>
            <div className="flex-1 text-center text-base font-black">{autoCashout.toFixed(2)}x</div>
            <button onClick={() => setAutoCashout(v => +(v + 0.1).toFixed(2))}
              className="w-8 h-9 rounded-lg flex items-center justify-center active:scale-90"
              style={{ background: "linear-gradient(180deg,#1f2937,#000)", boxShadow: "0 2px 0 #000" }}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-1.5">
            {CASHOUT_PRESETS.map(p => (
              <button key={p} onClick={() => setAutoCashout(p)}
                className="text-[9px] font-black py-1 rounded-md"
                style={{
                  background: autoCashout === p
                    ? "linear-gradient(180deg,#22c55e,#166534)"
                    : "linear-gradient(180deg,#1f2937,#000)",
                  boxShadow: "0 2px 0 #000",
                }}>
                {p.toFixed(2)}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Auto bet row */}
      <div className="px-3 mt-2">
        <div className="flex items-center justify-between rounded-2xl p-2.5"
          style={{
            background: "linear-gradient(180deg,#0f172a,#000)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 4px 0 #000",
          }}>
          <div className="text-[10px] text-white/70 font-black uppercase tracking-wider">Auto Bet</div>
          <button onClick={() => setAutoBet(v => !v)}
            className="relative w-14 h-7 rounded-full transition-colors"
            style={{
              background: autoBet ? "linear-gradient(180deg,#22c55e,#166534)" : "linear-gradient(180deg,#374151,#111)",
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)",
            }}>
            <div className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform"
              style={{ transform: autoBet ? "translateX(28px)" : "translateX(2px)", boxShadow: "0 2px 4px rgba(0,0,0,0.5)" }} />
          </button>
          <div className="flex items-center gap-1 text-[11px] font-black">
            <span className="text-white/60">×</span>
            <span>2.0</span>
            <Info className="h-3 w-3 text-white/40" />
          </div>
        </div>
      </div>

      {/* ── MAIN ACTION BUTTON ─────────────────── */}
      <div className="px-3 mt-3 pb-4">
        {canCashout ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleCashout}
            disabled={cashing}
            className="w-full py-4 rounded-2xl relative overflow-hidden"
            style={{
              background: "linear-gradient(180deg,#fef08a 0%,#facc15 30%,#eab308 70%,#a16207 100%)",
              boxShadow: "0 6px 0 #713f12, 0 12px 24px rgba(234,179,8,0.5), inset 0 2px 0 rgba(255,255,255,0.5)",
              border: "1px solid #fde047",
            }}
          >
            <div className="text-black font-black text-xl leading-tight" style={{ textShadow: "0 1px 0 rgba(255,255,255,0.4)" }}>CASH OUT</div>
            <div className="text-black font-black text-lg" style={{ textShadow: "0 1px 0 rgba(255,255,255,0.4)" }}>{fmt(potentialWin)}</div>
          </motion.button>
        ) : myBet?.cashedOutAt ? (
          <div className="w-full py-4 rounded-2xl text-center font-black text-lg"
            style={{
              background: "linear-gradient(180deg,#22c55e,#166534)",
              boxShadow: "0 6px 0 #052e16, inset 0 2px 0 rgba(255,255,255,0.3)",
            }}>
            ✓ Won {fmt(toDisplayAmount(myBet.winAmount, currencyMode))} @ {myBet.cashedOutAt.toFixed(2)}x
          </div>
        ) : myBet ? (
          <div className="w-full py-4 rounded-2xl text-center font-black text-lg"
            style={{
              background: "linear-gradient(180deg,#ef4444,#7f1d1d)",
              boxShadow: "0 6px 0 #450a0a, inset 0 2px 0 rgba(255,255,255,0.2)",
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
                ? "0 6px 0 #713f12, 0 12px 24px rgba(234,179,8,0.5), inset 0 2px 0 rgba(255,255,255,0.5)"
                : "0 4px 0 #000",
              border: canBet ? "1px solid #fde047" : "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div className={`font-black text-xl ${canBet ? "text-black" : "text-white/60"}`}
              style={canBet ? { textShadow: "0 1px 0 rgba(255,255,255,0.4)" } : {}}>
              {placing ? "PLACING..." : phase === "betting" ? `BET ${fmt(betAmount)}` : "WAIT FOR NEXT ROUND"}
            </div>
          </motion.button>
        )}
      </div>

      {/* ── PLAYERS TABLE ─────────────────── */}
      <div className="px-3 pb-8">
        <div className="rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(180deg,#0f172a,#000)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 4px 0 #000",
          }}>
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
