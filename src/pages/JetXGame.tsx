import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Minus, Plus, Rocket, Trophy } from "lucide-react";
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
import GameCurrencyChips from "@/components/GameCurrencyChips";
import { GameCurrencyMode, modeToWallet, toNativeAmount, toDisplayAmount, currencySymbol } from "@/lib/gameCurrency";
import gameJetx from "@/assets/game-jetx.jpg";

type Phase = "betting" | "flying" | "crashed";

const PRESETS: Record<CurrencyType, number[]> = {
  dollar: [1, 5, 10, 25, 50, 100],
  rupee: [10, 50, 100, 500, 1000, 2500],
  star: [10, 25, 50, 100, 250, 500],
};

const JetXGame = () => {
  const navigate = useNavigate();
  const { dollarBalance, rupeeBalance, starBalance, dollarWinning, rupeeWinning, starWinning, refreshBalance } = useBalanceContext();
  const tgUser = getTelegramUser();

  const [currency, setCurrency] = useState<CurrencyType>("dollar");
  const [currencyMode, setCurrencyMode] = useState<GameCurrencyMode>("USD");
  useEffect(() => {
    setCurrency(modeToWallet(currencyMode));
    setBetAmount(currencyMode === "INR" ? 10 : currencyMode === "STAR" ? 10 : 1);
  }, [currencyMode]);
  const [phase, setPhase] = useState<Phase>("betting");
  const [multiplier, setMultiplier] = useState(1);
  const [crashAt, setCrashAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [history, setHistory] = useState<number[]>([]);
  const [roundNumber, setRoundNumber] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  const [betAmount, setBetAmount] = useState(1);
  const [myBet, setMyBet] = useState<{ amount: number; cashedOutAt: number | null; winAmount: number } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [cashing, setCashing] = useState(false);

  const lastPhaseRef = useRef<Phase>("betting");
  const lastRoundRef = useRef(0);

  const totalBal = currency === "dollar" ? dollarBalance + dollarWinning : currency === "rupee" ? rupeeBalance + rupeeWinning : starBalance + starWinning;
  const displayBalance = toDisplayAmount(totalBal, currencyMode);
  const modeSymbol = currencySymbol(currencyMode);
  const fmtMode = (v: number) => `${modeSymbol}${v.toFixed(2)}`;

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

        // New round → clear my bet
        if (s.roundNumber !== lastRoundRef.current) {
          lastRoundRef.current = s.roundNumber;
          setMyBet(null);
        }

        // On crash refresh balance (winners already credited server-side)
        if (lastPhaseRef.current !== s.phase && s.phase === "crashed") {
          refreshBalance();
        }
        lastPhaseRef.current = s.phase;
      } catch {
        /* silent */
      }
    };
    tick();
    const id = setInterval(tick, 300);
    return () => { cancel = true; clearInterval(id); };
  }, [currency, refreshBalance]);

  const canBet = phase === "betting" && !myBet && !placing;
  const canCashout = phase === "flying" && myBet && !myBet.cashedOutAt && !cashing;

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
      toast.success(`Bet ${fmtMode(betAmount)} placed`);
    } catch (e: any) {
      toast.error(e?.message || "Bet failed");
    } finally {
      setPlacing(false);
    }
  }, [canBet, betAmount, totalBal, tgUser, currency, currencyMode, modeSymbol, refreshBalance]);

  const handleCashout = useCallback(async () => {
    if (!canCashout) return;
    setCashing(true);
    try {
      const res = await cashOutJetX(tgUser?.id || "demo", currency);
      setMyBet((prev) => prev ? { ...prev, cashedOutAt: res.multiplier, winAmount: res.winAmount } : prev);
      refreshBalance();
      toast.success(`Won ${fmtMode(toDisplayAmount(res.winAmount, currencyMode))} @ ${res.multiplier.toFixed(2)}x`);
    } catch (e: any) {
      toast.error(e?.message || "Cashout failed");
    } finally {
      setCashing(false);
    }
  }, [canCashout, tgUser, currency, refreshBalance]);

  const multColor = useMemo(() => {
    if (phase === "crashed") return "hsl(0 90% 60%)";
    if (multiplier < 1.5) return "hsl(45 90% 55%)";
    if (multiplier < 3) return "hsl(25 95% 55%)";
    return "hsl(0 90% 60%)";
  }, [phase, multiplier]);

  return (
    <div className="min-h-screen text-white" style={{
      background: `radial-gradient(ellipse at top, hsl(0 60% 15%) 0%, hsl(0 0% 3%) 60%, hsl(0 0% 0%) 100%)`,
    }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button onClick={() => navigate("/")} className="p-2 rounded-full bg-white/5 active:scale-90 transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-red-400" />
          <span className="font-black text-lg tracking-wider">JETX</span>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-white/50">Balance</div>
          <div className="text-sm font-bold">{fmtMode(displayBalance)}</div>
        </div>
      </div>

      {/* Currency chips */}
      <div className="flex justify-center px-4 mt-3">
        <GameCurrencyChips mode={currencyMode} onChange={setCurrencyMode} disabled={phase !== "betting"} />
      </div>

      {/* History */}
      <div className="flex gap-1.5 px-4 mt-3 overflow-x-auto no-scrollbar">
        {history.slice(0, 12).map((h, i) => (
          <span
            key={i}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{
              background: h >= 2 ? "hsla(140, 70%, 45%, 0.2)" : "hsla(0, 70%, 55%, 0.2)",
              color: h >= 2 ? "hsl(140 70% 65%)" : "hsl(0 80% 70%)",
              border: `1px solid ${h >= 2 ? "hsla(140, 70%, 45%, 0.4)" : "hsla(0, 70%, 55%, 0.4)"}`,
            }}
          >
            {h.toFixed(2)}x
          </span>
        ))}
      </div>

      {/* Main stage */}
      <div className="relative mx-4 mt-4 rounded-2xl overflow-hidden border border-red-500/20" style={{ height: 260 }}>
        <img src={gameJetx} alt="JetX" className="absolute inset-0 w-full h-full object-cover opacity-40" loading="lazy" width={1024} height={1024} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent, hsla(0,0%,0%,0.6))" }} />

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            {phase === "betting" && (
              <motion.div key="b" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-center">
                <div className="text-xs text-white/60 uppercase tracking-widest mb-2">Next round in</div>
                <div className="text-6xl font-black text-white" style={{ textShadow: "0 0 30px hsla(0,80%,60%,0.8)" }}>
                  {countdown}s
                </div>
              </motion.div>
            )}
            {phase === "flying" && (
              <motion.div key="f" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="text-center">
                <motion.div
                  key={Math.floor(multiplier * 10)}
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 0.15 }}
                  className="text-7xl font-black tabular-nums"
                  style={{ color: multColor, textShadow: `0 0 40px ${multColor}` }}
                >
                  {multiplier.toFixed(2)}x
                </motion.div>
                <Rocket className="h-10 w-10 text-red-400 mx-auto mt-3 animate-pulse" style={{ filter: "drop-shadow(0 0 12px hsl(0 90% 60%))" }} />
              </motion.div>
            )}
            {phase === "crashed" && (
              <motion.div key="c" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="text-center">
                <div className="text-xs text-red-400 font-black uppercase tracking-widest mb-2">💥 Crashed</div>
                <div className="text-6xl font-black" style={{ color: "hsl(0 90% 60%)", textShadow: "0 0 40px hsl(0 90% 60%)" }}>
                  {(crashAt ?? multiplier).toFixed(2)}x
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="absolute top-2 left-2 text-[10px] text-white/50">Round #{roundNumber}</div>
        <div className="absolute top-2 right-2 text-[10px] text-white/50 flex items-center gap-1">
          <Trophy className="h-3 w-3" /> {totalPlayers} players
        </div>
      </div>

      {/* Bet controls */}
      <div className="px-4 mt-4 pb-8">
        <div className="rounded-2xl p-4 border border-red-500/20 bg-white/[0.02]">
          <div className="text-[11px] text-white/50 uppercase tracking-wider mb-2">Bet amount</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setBetAmount((v) => Math.max(1, +(v - 1).toFixed(2)))}
              className="p-3 rounded-lg bg-white/5 active:scale-90"><Minus className="h-4 w-4" /></button>
            <input
              type="number"
              inputMode="decimal"
              value={betAmount}
              onChange={(e) => setBetAmount(Math.max(0, Number(e.target.value) || 0))}
              className="flex-1 bg-white/5 rounded-lg text-center text-xl font-black py-2 outline-none border border-white/10 focus:border-red-500/50"
            />
            <button onClick={() => setBetAmount((v) => +(v + 1).toFixed(2))}
              className="p-3 rounded-lg bg-white/5 active:scale-90"><Plus className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-6 gap-1.5 mt-3">
            {PRESETS[currency].map((p) => (
              <button
                key={p}
                onClick={() => setBetAmount(p)}
                className="text-[11px] font-bold py-1.5 rounded-md bg-white/5 hover:bg-white/10"
              >
                {modeSymbol}{p}
              </button>
            ))}
          </div>

          {/* Action button */}
          <div className="mt-4">
            {canCashout ? (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleCashout}
                disabled={cashing}
                className="w-full py-4 rounded-xl font-black text-lg"
                style={{
                  background: "linear-gradient(135deg, hsl(140 70% 45%), hsl(160 70% 40%))",
                  boxShadow: "0 8px 24px hsla(140, 70%, 45%, 0.4)",
                }}
              >
                CASH OUT {fmtMode(myBet!.amount * 0.98 * multiplier)}
              </motion.button>
            ) : myBet?.cashedOutAt ? (
              <div className="w-full py-4 rounded-xl font-black text-center text-lg"
                style={{ background: "hsla(140, 70%, 45%, 0.15)", color: "hsl(140 70% 65%)" }}>
                ✓ Won {fmtMode(toDisplayAmount(myBet.winAmount, currencyMode))} @ {myBet.cashedOutAt.toFixed(2)}x
              </div>
            ) : myBet ? (
              <div className="w-full py-4 rounded-xl font-black text-center text-lg"
                style={{ background: "hsla(0, 70%, 55%, 0.15)", color: "hsl(0 80% 70%)" }}>
                {phase === "crashed" ? `💥 Lost ${fmtMode(myBet.amount)}` : `Waiting to fly...`}
              </div>
            ) : (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleBet}
                disabled={!canBet}
                className="w-full py-4 rounded-xl font-black text-lg disabled:opacity-50"
                style={{
                  background: canBet
                    ? "linear-gradient(135deg, hsl(0 80% 55%), hsl(15 85% 55%))"
                    : "hsla(0, 0%, 100%, 0.05)",
                  boxShadow: canBet ? "0 8px 24px hsla(0, 80%, 55%, 0.4)" : "none",
                }}
              >
                {placing ? "Placing..." : phase === "betting" ? `BET ${fmtMode(betAmount)}` : "Wait for next round"}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JetXGame;
