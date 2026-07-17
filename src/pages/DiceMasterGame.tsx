import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Volume2, VolumeX, Trophy, X, Diamond, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { playBetSound, playSpinSound, playWinSound, playLoseSound, playCountdownBeep, playResultReveal, startBgMusic, stopBgMusic } from "@/hooks/useGameSounds";
import { useBalanceContext } from "@/contexts/BalanceContext";
import { reportGameResult, type CurrencyType } from "@/lib/telegram";
import GameCurrencyChips from "@/components/GameCurrencyChips";
import { GameCurrencyMode, INR_RATE, modeToWallet, toNativeAmount } from "@/lib/gameCurrency";

const DICE_FACES = [
  { value: 1, dots: "⚀", multiplier: 0 },
  { value: 2, dots: "⚁", multiplier: 0.5 },
  { value: 3, dots: "⚂", multiplier: 1.5 },
  { value: 4, dots: "⚃", multiplier: 2 },
  { value: 5, dots: "⚄", multiplier: 5 },
  { value: 6, dots: "⚅", multiplier: 10 },
];

const BET_PRESETS = [1, 3, 5, 10, 50];

type GamePhase = "betting" | "rolling" | "result";

const DiceMasterGame = () => {
  const navigate = useNavigate();
  const [soundOn, setSoundOn] = useState(true);
  const soundRef = useRef(true);
  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);
  const { dollarBalance, starBalance, dollarWinning, starWinning, refreshBalance } = useBalanceContext();
  const [localDollarAdj, setLocalDollarAdj] = useState(0);
  const [localStarAdj, setLocalStarAdj] = useState(0);
  const gameDollarBalance = dollarBalance + dollarWinning + localDollarAdj;
  const gameStarBalance = starBalance + starWinning + localStarAdj;
  const [currencyMode, setCurrencyMode] = useState<GameCurrencyMode>("USD");
  const activeWallet = modeToWallet(currencyMode);
  const setActiveWallet = (w: "dollar" | "star") => setCurrencyMode(w === "star" ? "STAR" : "USD");
  const [selectedBet, setSelectedBet] = useState(1);
  
  const [phase, setPhase] = useState<GamePhase>("betting");
  const [rollingDice, setRollingDice] = useState([1, 1]);
  const [resultDice, setResultDice] = useState([1, 1]);
  const [winAmount, setWinAmount] = useState(0);
  const [totalLost, setTotalLost] = useState(0);
  const [results, setResults] = useState<number[]>([]);
  const [round, setRound] = useState(1);
  const [resultTimer, setResultTimer] = useState(3);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (soundOn) startBgMusic();
    else stopBgMusic();
    return () => { stopBgMusic(); };
  }, [soundOn]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
    };
  }, []);

  // INR is a display layer over the dollar wallet, so balance/bet compare
  // in display units (INR shows $ balance × 85).
  const nativeBalance = activeWallet === "dollar" ? gameDollarBalance : gameStarBalance;
  const currentBalance = currencyMode === "INR" ? nativeBalance * INR_RATE : nativeBalance;

  const rollDice = () => {
    if (phase !== "betting" || currentBalance < selectedBet) return;

    // Bet in native wallet units (INR display → $ backend)
    const nativeBet = toNativeAmount(selectedBet, currencyMode);
    if (activeWallet === "dollar") setLocalDollarAdj(p => p - nativeBet);
    else setLocalStarAdj(p => p - nativeBet);

    if (soundRef.current) playBetSound();
    setPhase("rolling");

    // Animate dice rolling
    rollIntervalRef.current = setInterval(() => {
      setRollingDice([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);
    }, 80);

    setTimeout(() => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);

      // Pick ONE result multiplier using weighted odds — house always wins
      const outcomes = [
        { multiplier: 0,   weight: 55 },   // 0x  — total loss ~55%
        { multiplier: 0.5, weight: 25 },   // 0.5x — lose half ~25%
        { multiplier: 1.5, weight: 12 },   // 1.5x — small win ~12%
        { multiplier: 2,   weight: 5 },    // 2x  — ~5%
        { multiplier: 5,   weight: 2.5 },  // 5x  — ~2.5%
        { multiplier: 10,  weight: 0.5 },  // 10x — ~0.5%
      ];
      const totalWeight = outcomes.reduce((s, o) => s + o.weight, 0);
      let r = Math.random() * totalWeight;
      let chosenMult = 0;
      for (const o of outcomes) {
        r -= o.weight;
        if (r <= 0) { chosenMult = o.multiplier; break; }
      }

      // Map multiplier back to a die face value for display
      const resultFace = DICE_FACES.find(f => f.multiplier === chosenMult)!;
      const d1 = resultFace.value;
      const d2 = Math.floor(Math.random() * d1) + 1; // second die ≤ first so max = d1

      setResultDice([d1, d2]);
      setRollingDice([d1, d2]);
      if (soundRef.current) playResultReveal();

      setResults(prev => [chosenMult, ...prev].slice(0, 12));
      setRound(r2 => r2 + 1);

      const prize = Math.round(selectedBet * chosenMult * 100) / 100;
      if (chosenMult > 0) {
        setWinAmount(prize);
        setTotalLost(0);
        if (prize > 0 && soundRef.current) playWinSound();
      } else {
        setWinAmount(0);
        setTotalLost(selectedBet);
        if (soundRef.current) playLoseSound();
      }
      // Report result to backend in NATIVE wallet units
      reportGameResult({ betAmount: toNativeAmount(selectedBet, currencyMode), winAmount: toNativeAmount(prize, currencyMode), currency: activeWallet, game: "dice-master" })
        .then(() => { setLocalDollarAdj(0); setLocalStarAdj(0); refreshBalance(); }).catch(console.error);

      setPhase("result");
      setResultTimer(3);
      timerRef.current = setInterval(() => {
        setResultTimer(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setPhase("betting");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, 2000);
  };

  const renderDie = (value: number, size: number = 80, isRolling = false) => {
    const dotPositions: Record<number, [number, number][]> = {
      1: [[0.5, 0.5]],
      2: [[0.25, 0.25], [0.75, 0.75]],
      3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
      4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
      5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
      6: [[0.25, 0.2], [0.75, 0.2], [0.25, 0.5], [0.75, 0.5], [0.25, 0.8], [0.75, 0.8]],
    };
    const dots = dotPositions[value] || [];
    const dotSize = size * 0.14;

    return (
      <motion.div
        animate={isRolling ? { rotate: [0, 360], scale: [1, 1.1, 1] } : {}}
        transition={isRolling ? { duration: 0.3, repeat: Infinity } : {}}
        className="rounded-2xl relative shadow-xl"
        style={{
          width: size, height: size,
          background: "linear-gradient(145deg, hsl(0 0% 100%), hsl(0 0% 92%))",
          border: "3px solid hsl(0 0% 80%)",
          boxShadow: "inset 0 2px 4px hsla(0 0% 100% / 0.5), 0 4px 12px hsla(0 0% 0% / 0.2)",
        }}
      >
        {dots.map(([x, y], i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: dotSize, height: dotSize,
              left: x * size - dotSize / 2,
              top: y * size - dotSize / 2,
              background: "radial-gradient(circle, hsl(0 0% 15%), hsl(0 0% 25%))",
              boxShadow: "inset 0 1px 2px hsla(0 0% 0% / 0.3)",
            }}
          />
        ))}
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col overflow-y-auto" style={{ background: "linear-gradient(180deg, hsl(140 40% 25%) 0%, hsl(150 50% 15%) 100%)" }}>
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-2" style={{ background: "hsla(140, 40%, 30%, 0.5)" }}>
        <div className="flex items-center gap-1">
          {[
            { icon: Home, action: () => navigate("/") },
            { icon: soundOn ? Volume2 : VolumeX, action: () => setSoundOn(p => !p) },
          ].map((item, i) => (
            <button key={i} onClick={item.action} className="h-9 w-9 rounded-lg border-2 flex items-center justify-center"
              style={{ borderColor: "hsla(140, 40%, 50%, 0.5)", background: "hsla(140, 40%, 40%, 0.3)" }}>
              <item.icon className="h-4 w-4" style={{ color: "hsl(140, 20%, 85%)" }} />
            </button>
          ))}
        </div>
        <GameCurrencyChips mode={currencyMode} onChange={setCurrencyMode} disabled={phase !== "betting"} />
        <div className="rounded-lg px-3 py-1.5 text-right" style={{ background: "hsla(0, 0%, 100%, 0.85)" }}>
          <p className="text-[10px] leading-tight" style={{ color: "hsl(0, 0%, 50%)" }}>Round</p>
          <p className="font-bold text-sm leading-tight" style={{ color: "hsl(0, 0%, 20%)" }}>#{round}</p>
        </div>
      </div>

      {/* Game Title */}
      <div className="text-center pt-4 pb-2">
        <h1 className="text-2xl font-bold" style={{ color: "hsl(45, 90%, 70%)" }}>🎲 Dice Master</h1>
        <p className="text-xs mt-1" style={{ color: "hsl(140, 20%, 70%)" }}>Pick a number, roll the dice!</p>
      </div>

      {/* Dice Display */}
      <div className="flex items-center justify-center gap-6 py-6">
        {phase === "rolling" ? (
          <>
            {renderDie(rollingDice[0], 90, true)}
            {renderDie(rollingDice[1], 90, true)}
          </>
        ) : phase === "result" ? (
          <>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
              {renderDie(resultDice[0], 90)}
            </motion.div>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.1 }}>
              {renderDie(resultDice[1], 90)}
            </motion.div>
          </>
        ) : (
          <>
            {renderDie(1, 90)}
            {renderDie(6, 90)}
          </>
        )}
      </div>

      {/* Result message */}
      <AnimatePresence>
        {phase === "result" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center mb-4">
            {winAmount > 0 ? (
              <p className="text-xl font-bold" style={{ color: "hsl(50, 90%, 65%)" }}>🎉 {(winAmount / selectedBet).toFixed(1)}X — Won {winAmount}!</p>
            ) : (
              <p className="text-xl font-bold" style={{ color: "hsl(0, 70%, 65%)" }}>💨 0X — Lost {totalLost}</p>
            )}
            <p className="text-xs mt-1" style={{ color: "hsl(0, 0%, 70%)" }}>Next spin in {resultTimer}s</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Multiplier Info */}
      <div className="px-4 mb-2">
        <div className="rounded-xl p-3" style={{ background: "hsla(0, 0%, 0%, 0.3)" }}>
          <p className="text-xs font-bold mb-2 text-center" style={{ color: "hsl(0, 0%, 90%)" }}>🎯 Multipliers</p>
          <div className="grid grid-cols-6 gap-2">
            {DICE_FACES.map((face) => (
              <div key={face.value} className="flex flex-col items-center rounded-lg py-2" style={{ background: "hsla(0, 0%, 100%, 0.08)" }}>
                {renderDie(face.value, 28)}
                <span className="text-[9px] font-bold mt-1" style={{ color: "hsl(50, 90%, 65%)" }}>{face.multiplier}X</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bet Amount */}
      <div className="px-4">
        {/* +/- Control */}
        <div className="rounded-2xl p-2 mb-2" style={{ background: "hsla(0, 0%, 15%, 0.9)" }}>
          <div className="flex items-center justify-between rounded-xl overflow-hidden" style={{ background: "hsla(0, 0%, 25%, 0.8)" }}>
            <button
              onClick={() => { if (phase !== "betting") return; setSelectedBet(prev => Math.max(1, prev - 1)); }}
              disabled={phase !== "betting"}
              className="w-14 h-12 flex items-center justify-center text-2xl font-bold" style={{ color: "hsl(0, 0%, 70%)" }}>−</button>
            <div className="flex-1 text-center">
              <span className="text-xl font-bold" style={{ color: "hsl(50, 90%, 60%)" }}>
                {activeWallet === "dollar" ? `$${selectedBet.toFixed(2)}` : `${selectedBet.toFixed(2)} ⭐`}
              </span>
            </div>
            <button
              onClick={() => { if (phase !== "betting") return; setSelectedBet(prev => prev + 1); }}
              disabled={phase !== "betting"}
              className="w-14 h-12 flex items-center justify-center text-2xl font-bold" style={{ color: "hsl(0, 0%, 70%)" }}>+</button>
          </div>
          {/* Preset buttons */}
          <div className="grid grid-cols-4 gap-2 mt-2">
            {BET_PRESETS.map((bet) => (
              <button key={bet} onClick={() => phase === "betting" && setSelectedBet(prev => prev + bet)}
                className={`rounded-xl py-2.5 text-sm font-bold transition-all ${phase !== "betting" ? "opacity-50" : ""}`}
                style={{
                  background: selectedBet === bet ? "hsl(0, 65%, 50%)" : "hsla(0, 0%, 30%, 0.8)",
                  color: selectedBet === bet ? "hsl(0, 0%, 100%)" : "hsl(0, 0%, 80%)",
                  border: selectedBet === bet ? "1px solid hsl(50, 90%, 55%)" : "1px solid hsla(0, 0%, 40%, 0.5)",
                }}>
                {activeWallet === "dollar" ? `$${bet}` : `${bet} ⭐`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Roll Button */}
      <div className="px-4 mt-3">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={rollDice}
          disabled={phase !== "betting" || currentBalance < selectedBet}
          className="w-full py-4 rounded-2xl text-lg font-bold transition-all"
          style={{
            background: phase === "betting"
              ? "linear-gradient(135deg, hsl(45, 90%, 55%), hsl(35, 85%, 45%))"
              : "hsla(0, 0%, 50%, 0.3)",
            color: phase === "betting" ? "hsl(0, 0%, 10%)" : "hsl(0, 0%, 60%)",
          }}
        >
          {phase === "betting"
            ? `🎲 Roll Dice - Bet ${activeWallet === "dollar" ? "$" : ""}${selectedBet}${activeWallet === "star" ? " ⭐" : ""}`
            : phase === "rolling" ? "Rolling..." : `Next in ${resultTimer}s`}
        </motion.button>
      </div>

      {/* Wallet toggle */}
      <div className="px-4 mt-3 flex gap-2 items-center">
        <div className="flex-1 rounded-full px-3 py-2.5 flex items-center justify-center gap-1.5 border-2"
          style={{
            background: "hsla(0, 0%, 100%, 0.9)",
            borderColor: activeWallet === "star" ? "hsl(45, 90%, 50%)" : "hsl(140, 60%, 45%)",
          }}>
          {activeWallet === "star" ? (
            <>
              <span className="text-[10px] font-semibold" style={{ color: "hsl(0, 0%, 45%)" }}>Stars</span>
              <span className="text-base">⭐</span>
              <span className="font-bold text-sm" style={{ color: "hsl(45, 90%, 45%)" }}>{gameStarBalance.toLocaleString()}</span>
            </>
          ) : (
            <>
              <span className="text-[10px] font-semibold" style={{ color: "hsl(0, 0%, 45%)" }}>Balance</span>
              <span className="text-base">💲</span>
              <span className="font-bold text-sm" style={{ color: "hsl(0, 0%, 15%)" }}>{gameDollarBalance.toLocaleString()}</span>
            </>
          )}
        </div>
        <button
          onClick={() => {
            if (phase !== "betting") return;
            setActiveWallet(activeWallet === "dollar" ? "star" : "dollar");
          }}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 transition-all active:scale-90"
          style={{
            background: "hsla(0, 0%, 100%, 0.95)",
            borderColor: "hsl(45, 80%, 55%)",
            opacity: phase !== "betting" ? 0.4 : 1,
          }}>
          <span className="text-xs">🔄</span>
        </button>
      </div>

      {/* Results History */}
      <div className="px-4 mt-3 mb-6">
        <div className="rounded-2xl p-3" style={{ background: "hsla(140, 40%, 20%, 0.8)" }}>
          <span className="text-xs font-bold" style={{ color: "hsl(0, 0%, 90%)" }}>Results History</span>
          <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-hide">
            {results.length > 0 ? results.map((sum, i) => (
              <div key={i} className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 border" style={{ borderColor: "hsla(140, 40%, 50%, 0.3)" }}>
                <span className="text-sm font-bold" style={{ color: "hsl(140, 40%, 25%)" }}>{sum}</span>
              </div>
            )) : (
              <p className="text-xs" style={{ color: "hsla(0, 0%, 100%, 0.5)" }}>Roll the dice to see results...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiceMasterGame;
