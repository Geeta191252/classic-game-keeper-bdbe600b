import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Volume2, VolumeX, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { playBetSound, playSpinSound, playWinSound, playLoseSound, playResultReveal, startBgMusic, stopBgMusic } from "@/hooks/useGameSounds";
import { useBalanceContext } from "@/contexts/BalanceContext";
import { reportGameResult } from "@/lib/telegram";
import GameCurrencyChips from "@/components/GameCurrencyChips";
import { GameCurrencyMode, INR_RATE, modeToWallet, toNativeAmount } from "@/lib/gameCurrency";

const SEGMENTS = [
  { label: "2X", multiplier: 2, color: "hsl(0, 70%, 55%)" },
  { label: "1.5X", multiplier: 1.5, color: "hsl(210, 70%, 55%)" },
  { label: "3X", multiplier: 3, color: "hsl(45, 90%, 55%)" },
  { label: "0X", multiplier: 0, color: "hsl(0, 0%, 30%)" },
  { label: "5X", multiplier: 5, color: "hsl(280, 60%, 55%)" },
  { label: "1.5X", multiplier: 1.5, color: "hsl(160, 60%, 45%)" },
  { label: "10X", multiplier: 10, color: "hsl(330, 70%, 50%)" },
  { label: "0X", multiplier: 0, color: "hsl(0, 0%, 40%)" },
  { label: "2X", multiplier: 2, color: "hsl(25, 80%, 55%)" },
  { label: "0.5X", multiplier: 0.5, color: "hsl(190, 60%, 45%)" },
  { label: "20X", multiplier: 20, color: "hsl(50, 95%, 50%)" },
  { label: "0X", multiplier: 0, color: "hsl(0, 0%, 35%)" },
];

const BET_PRESETS = [1, 3, 5, 10, 50];

type GamePhase = "betting" | "spinning" | "result";

const CarnivalSpinGame = () => {
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
  const [selectedBet, setSelectedBet] = useState(1);
  const [phase, setPhase] = useState<GamePhase>("betting");
  const [wheelAngle, setWheelAngle] = useState(0);
  const [winAmount, setWinAmount] = useState(0);
  const [totalLost, setTotalLost] = useState(0);
  const [results, setResults] = useState<string[]>([]);
  const [round, setRound] = useState(1);
  const [resultTimer, setResultTimer] = useState(3);
  const [lastSegment, setLastSegment] = useState<typeof SEGMENTS[0] | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalRotationRef = useRef(0);

  useEffect(() => {
    if (soundOn) startBgMusic();
    else stopBgMusic();
    return () => { stopBgMusic(); };
  }, [soundOn]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const nativeBalance = activeWallet === "dollar" ? gameDollarBalance : gameStarBalance;
  const currentBalance = currencyMode === "INR" ? nativeBalance * INR_RATE : nativeBalance;

  const spin = () => {
    if (phase !== "betting" || currentBalance < selectedBet) return;

    const nativeBet = toNativeAmount(selectedBet, currencyMode);
    if (activeWallet === "dollar") setLocalDollarAdj(p => p - nativeBet);
    else setLocalStarAdj(p => p - nativeBet);

    if (soundRef.current) playBetSound();
    setPhase("spinning");
    if (soundRef.current) playSpinSound();

    // Rigged: higher chance of landing on 0X or low multipliers
    const weights = SEGMENTS.map(s => {
      if (s.multiplier === 0) return 50;
      if (s.multiplier === 0.5) return 20;
      if (s.multiplier <= 1.5) return 8;
      if (s.multiplier <= 2) return 3;
      if (s.multiplier <= 3) return 1;
      return 0.1;
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let winnerIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) { winnerIdx = i; break; }
    }

    const segAngle = 360 / SEGMENTS.length;
    const extraSpins = 5 + Math.floor(Math.random() * 3);
    // Calculate the absolute angle where the winning segment's center aligns with the top pointer
    const targetSegAngle = (360 - winnerIdx * segAngle - segAngle / 2 + 360) % 360;
    const currentMod = totalRotationRef.current % 360;
    const additionalRotation = (targetSegAngle - currentMod + 360) % 360;
    const targetAngle = totalRotationRef.current + extraSpins * 360 + additionalRotation;
    totalRotationRef.current = targetAngle;
    setWheelAngle(targetAngle);

    setTimeout(() => {
      const seg = SEGMENTS[winnerIdx];
      if (soundRef.current) playResultReveal();
      setLastSegment(seg);
      setResults(prev => [seg.label, ...prev].slice(0, 12));
      setRound(r => r + 1);

      const prize = Math.round(selectedBet * seg.multiplier * 100) / 100;
      if (seg.multiplier > 0) {
        setWinAmount(prize); // Show gross payout (bet × multiplier)
        setTotalLost(0);
        // Win goes to winning pool, not wallet

        if (prize > 0 && soundRef.current) playWinSound();
      } else {
        setWinAmount(0);
        setTotalLost(selectedBet);
        if (soundRef.current) playLoseSound();
      }
      // Report result to backend, then reset local adjustments since backend now has the real balance
      reportGameResult({ betAmount: toNativeAmount(selectedBet, currencyMode), winAmount: toNativeAmount(prize, currencyMode), currency: activeWallet, game: "carnival-spin" })
        .then(() => {
          setLocalDollarAdj(0);
          setLocalStarAdj(0);
          refreshBalance();
        }).catch(console.error);

      setPhase("result");
      setResultTimer(3);
      timerRef.current = setInterval(() => {
        setResultTimer(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setPhase("betting");
            setLastSegment(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, 4000);
  };

  const segmentAngle = 360 / SEGMENTS.length;

  return (
    <div className="min-h-screen flex flex-col overflow-y-auto" style={{ background: "linear-gradient(180deg, hsl(280 50% 25%) 0%, hsl(270 60% 12%) 100%)" }}>
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-2" style={{ background: "hsla(280, 40%, 35%, 0.5)" }}>
        <div className="flex items-center gap-1">
          {[
            { icon: Home, action: () => navigate("/") },
            { icon: soundOn ? Volume2 : VolumeX, action: () => setSoundOn(p => !p) },
          ].map((item, i) => (
            <button key={i} onClick={item.action} className="h-9 w-9 rounded-lg border-2 flex items-center justify-center"
              style={{ borderColor: "hsla(280, 40%, 55%, 0.5)", background: "hsla(280, 40%, 40%, 0.3)" }}>
              <item.icon className="h-4 w-4" style={{ color: "hsl(280, 20%, 85%)" }} />
            </button>
          ))}
        </div>
        <div className="rounded-lg px-3 py-1.5 text-right" style={{ background: "hsla(0, 0%, 100%, 0.85)" }}>
          <p className="text-[10px] leading-tight" style={{ color: "hsl(0, 0%, 50%)" }}>Round</p>
          <p className="font-bold text-sm leading-tight" style={{ color: "hsl(0, 0%, 20%)" }}>#{round}</p>
        </div>
        <GameCurrencyChips mode={currencyMode} onChange={setCurrencyMode} disabled={phase !== "betting"} />
      </div>

      {/* Title */}
      <div className="text-center pt-4 pb-2">
        <h1 className="text-2xl font-bold" style={{ color: "hsl(45, 90%, 70%)" }}>🎡 Carnival Spin</h1>
        <p className="text-xs mt-1" style={{ color: "hsl(280, 20%, 70%)" }}>Spin the wheel, win big prizes!</p>
      </div>

      {/* Wheel */}
      <div className="flex flex-col items-center px-4 pt-2">
        <div className="relative w-[280px] h-[280px]">
          {/* Pointer */}
          <div className="absolute top-[-12px] left-1/2 -translate-x-1/2 z-30 w-0 h-0"
            style={{ borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "18px solid hsl(45, 90%, 55%)" }} />

          {/* Spinning wheel */}
          <svg
            viewBox="0 0 300 300"
            className="w-full h-full drop-shadow-2xl"
            style={{
              transform: `rotate(${wheelAngle}deg)`,
              transition: phase === "spinning" ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
            }}
          >
            {SEGMENTS.map((seg, i) => {
              const startAngle = (i * segmentAngle - 90) * Math.PI / 180;
              const endAngle = ((i + 1) * segmentAngle - 90) * Math.PI / 180;
              const x1 = 150 + 140 * Math.cos(startAngle);
              const y1 = 150 + 140 * Math.sin(startAngle);
              const x2 = 150 + 140 * Math.cos(endAngle);
              const y2 = 150 + 140 * Math.sin(endAngle);
              const largeArc = segmentAngle > 180 ? 1 : 0;
              const midAngle = ((i + 0.5) * segmentAngle - 90) * Math.PI / 180;
              const tx = 150 + 95 * Math.cos(midAngle);
              const ty = 150 + 95 * Math.sin(midAngle);
              const textRotation = (i + 0.5) * segmentAngle;

              return (
                <g key={i}>
                  <path
                    d={`M 150 150 L ${x1} ${y1} A 140 140 0 ${largeArc} 1 ${x2} ${y2} Z`}
                    fill={seg.color}
                    stroke="hsla(0, 0%, 100%, 0.3)"
                    strokeWidth="1.5"
                  />
                  <text
                    x={tx} y={ty}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontWeight="bold"
                    fontSize="14"
                    transform={`rotate(${textRotation}, ${tx}, ${ty})`}
                  >
                    {seg.label}
                  </text>
                </g>
              );
            })}
            {/* Center circle */}
            <circle cx="150" cy="150" r="30" fill="hsl(0, 0%, 15%)" stroke="hsl(45, 90%, 55%)" strokeWidth="3" />
            <text x="150" y="150" textAnchor="middle" dominantBaseline="central" fill="hsl(45, 90%, 65%)" fontWeight="bold" fontSize="12">SPIN</text>
          </svg>

          {/* Decorative lights */}
          {Array.from({ length: 16 }).map((_, i) => {
            const angle = (i * 22.5) * Math.PI / 180;
            const x = 150 + 145 * Math.cos(angle);
            const y = 150 + 145 * Math.sin(angle);
            return (
              <motion.div
                key={i}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                className="absolute w-2 h-2 rounded-full"
                style={{
                  left: x * 280 / 300 - 4,
                  top: y * 280 / 300 - 4,
                  background: i % 2 === 0 ? "hsl(45, 90%, 65%)" : "hsl(0, 80%, 60%)",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Result */}
      <AnimatePresence>
        {phase === "result" && lastSegment && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center my-3">
          {winAmount > 0 ? (
              <p className="text-xl font-bold" style={{ color: "hsl(50, 90%, 65%)" }}>🎉 {lastSegment.label} — Won {winAmount}!</p>
            ) : (
              <p className="text-xl font-bold" style={{ color: "hsl(0, 70%, 65%)" }}>💨 {lastSegment.label} — Lost {totalLost}</p>
            )}
            <p className="text-xs mt-1" style={{ color: "hsl(0, 0%, 60%)" }}>Next spin in {resultTimer}s</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bet Amount */}
      <div className="px-4 mt-2">
        <div className="rounded-2xl p-2" style={{ background: "hsla(0, 0%, 15%, 0.9)" }}>
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
          <div className="grid grid-cols-4 gap-2 mt-2">
            {BET_PRESETS.map((bet) => (
              <button key={bet} onClick={() => phase === "betting" && setSelectedBet(prev => prev + bet)}
                className={`rounded-xl py-2.5 text-sm font-bold transition-all ${phase !== "betting" ? "opacity-50" : ""}`}
                style={{
                  background: selectedBet === bet ? "hsl(280, 60%, 50%)" : "hsla(0, 0%, 30%, 0.8)",
                  color: selectedBet === bet ? "hsl(0, 0%, 100%)" : "hsl(0, 0%, 80%)",
                  border: selectedBet === bet ? "1px solid hsl(50, 90%, 55%)" : "1px solid hsla(0, 0%, 40%, 0.5)",
                }}>
                {activeWallet === "dollar" ? `$${bet}` : `${bet} ⭐`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Spin Button */}
      <div className="px-4 mt-3">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={spin}
          disabled={phase !== "betting" || currentBalance < selectedBet}
          className="w-full py-4 rounded-2xl text-lg font-bold transition-all"
          style={{
            background: phase === "betting"
              ? "linear-gradient(135deg, hsl(280, 70%, 55%), hsl(320, 70%, 50%))"
              : "hsla(0, 0%, 50%, 0.3)",
            color: phase === "betting" ? "white" : "hsl(0, 0%, 60%)",
          }}
        >
          {phase === "betting" ? `🎡 Spin - Bet ${activeWallet === "dollar" ? "$" : ""}${selectedBet}${activeWallet === "star" ? " ⭐" : ""}` : phase === "spinning" ? "Spinning..." : `Next in ${resultTimer}s`}
        </motion.button>
      </div>

      {/* Wallet */}
      <div className="px-4 mt-3 flex gap-2 items-center">
        <div className="flex-1 rounded-full px-3 py-2.5 flex items-center justify-center gap-1.5 border-2"
          style={{
            background: "hsla(0, 0%, 100%, 0.9)",
            borderColor: activeWallet === "star" ? "hsl(45, 90%, 50%)" : "hsl(280, 60%, 55%)",
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
          onClick={() => phase === "betting" && setCurrencyMode(activeWallet === "dollar" ? "STAR" : "USD")}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 active:scale-90"
          style={{ background: "hsla(0, 0%, 100%, 0.95)", borderColor: "hsl(45, 80%, 55%)", opacity: phase !== "betting" ? 0.4 : 1 }}>
          <span className="text-xs">🔄</span>
        </button>
      </div>

      {/* Results */}
      <div className="px-4 mt-3 mb-6">
        <div className="rounded-2xl p-3" style={{ background: "hsla(280, 40%, 20%, 0.8)" }}>
          <span className="text-xs font-bold" style={{ color: "hsl(0, 0%, 90%)" }}>Results History</span>
          <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-hide">
            {results.length > 0 ? results.map((label, i) => (
              <div key={i} className="px-2 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 border" style={{ borderColor: "hsla(280, 40%, 50%, 0.3)" }}>
                <span className="text-xs font-bold" style={{ color: "hsl(280, 40%, 30%)" }}>{label}</span>
              </div>
            )) : (
              <p className="text-xs" style={{ color: "hsla(0, 0%, 100%, 0.5)" }}>Spin to see results...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CarnivalSpinGame;
