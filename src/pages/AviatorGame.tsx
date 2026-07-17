import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronDown, ClipboardList, Menu, MessageCircle, Plus, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBalanceContext } from "@/contexts/BalanceContext";
import { getTelegramUser, type CurrencyType, fetchAviatorState, placeAviatorBet, cashOutAviator, cancelAviatorBet, type AviatorState } from "@/lib/telegram";
import GameCurrencyChips from "@/components/GameCurrencyChips";
import { GameCurrencyMode } from "@/lib/gameCurrency";
import { toast } from "sonner";
import logoImg from "@/assets/aviator/logo.png";
import planeImg from "@/assets/aviator/plane.png";
import plane0 from "@/assets/aviator/plane-0.svg";
import plane1 from "@/assets/aviator/plane-1.svg";
import plane2 from "@/assets/aviator/plane-2.svg";
import plane3 from "@/assets/aviator/plane-3.svg";
import staticPlane from "@/assets/aviator/static-plane.png";
import rotateBg from "@/assets/aviator/bg-rotate-old.svg";
import xAxis from "@/assets/aviator/x-axis.png";
import yAxis from "@/assets/aviator/y-axis.png";
import spaceBg from "@/assets/aviator/space-bg.jpg";

type Phase = "betting" | "flying" | "crashed";

type BetRow = {
  user: string;
  amount: number;
  multiplier: number | null;
  cashout: number | null;
};


const PLANE_FRAMES = [plane0, plane1, plane2, plane3];

const PRESETS_BY_CURRENCY: Record<CurrencyType, number[]> = {
  dollar: [1, 5, 10, 25, 50, 100, 250],
  star: [10, 25, 50, 100, 250, 500, 1000],
};


const formatMoney = (value: number, currency: CurrencyType) => {
  if (currency === "star") return `★${Number(value.toFixed(2))}`;
  return `$${value.toFixed(2)}`;
};

const AviatorGame = () => {
  const navigate = useNavigate();
  const { dollarBalance, starBalance, dollarWinning, starWinning, refreshBalance } = useBalanceContext();
  const tgUser = getTelegramUser();

  const [currency, setCurrency] = useState<CurrencyType>("dollar");
  const [phase, setPhase] = useState<Phase>("betting");
  const [multiplier, setMultiplier] = useState(1);
  const [crashAt, setCrashAt] = useState(2);
  const [countdown, setCountdown] = useState(7);
  const [history, setHistory] = useState<number[]>([]);
  const [roundNumber, setRoundNumber] = useState<number>(0);
  const [serverBets, setServerBets] = useState<BetRow[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);

  const startTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const startAudioRef = useRef<HTMLAudioElement | null>(null);
  const crashAudioRef = useRef<HTMLAudioElement | null>(null);
  const cashoutAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const lastPhaseRef = useRef<Phase>("betting");
  const lastRoundRef = useRef<number>(0);

  const totalDollar = dollarBalance + dollarWinning;
  const totalStar = starBalance + starWinning;
  const balance = currency === "dollar" ? totalDollar : totalStar;
  const userName = tgUser?.first_name || tgUser?.username || "Player";

  const playSound = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => undefined);
  }, []);

  const unlockAudio = useCallback(() => {
    audioUnlockedRef.current = true;
  }, []);

  useEffect(() => {
    startAudioRef.current = new Audio("/sounds/aviator/game-start.mp3");
    crashAudioRef.current = new Audio("/sounds/aviator/plane-crash.mp3");
    cashoutAudioRef.current = new Audio("/sounds/aviator/cashout.mp3");
    [startAudioRef, crashAudioRef, cashoutAudioRef].forEach((ref) => {
      if (ref.current) {
        ref.current.preload = "auto";
        ref.current.volume = 0.7;
        ref.current.load();
      }
    });
    return () => {
      [startAudioRef, crashAudioRef, cashoutAudioRef].forEach((ref) => {
        if (ref.current) { ref.current.pause(); ref.current.src = ""; }
      });
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Smooth multiplier interpolation while flying (between server polls)
  useEffect(() => {
    if (phase !== "flying") {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const animate = (now: number) => {
      const elapsed = (now - startTimeRef.current) / 1000;
      const next = Math.pow(1.075, elapsed * 1.8);
      setMultiplier((prev) => (next > prev ? next : prev));
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase]);

  // Poll server for game state
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const s: AviatorState = await fetchAviatorState(currency);
        if (cancelled) return;

        if (s.roundNumber !== lastRoundRef.current) {
          lastRoundRef.current = s.roundNumber;
          setRoundNumber(s.roundNumber);
        }

        // Phase transitions
        if (s.phase !== lastPhaseRef.current) {
          if (s.phase === "flying") {
            // Rebase start time using server's current multiplier so RAF picks up smoothly
            const m0 = Math.max(1, s.multiplier || 1);
            const elapsedMs = (Math.log(m0) / Math.log(1.075) / 1.8) * 1000;
            startTimeRef.current = performance.now() - elapsedMs;
            setMultiplier(m0);
            playSound(startAudioRef.current);
          } else if (s.phase === "crashed") {
            if (startAudioRef.current) { startAudioRef.current.pause(); startAudioRef.current.currentTime = 0; }
            playSound(crashAudioRef.current);
          } else if (s.phase === "betting") {
            setMultiplier(1);
          }
          lastPhaseRef.current = s.phase;
        }

        setPhase(s.phase);
        setCountdown(s.timeLeft);
        setHistory(s.history || []);
        setServerBets(s.bets || []);
        setTotalPlayers(s.totalPlayers || 0);
        if (s.phase === "crashed" && s.crashAt) {
          setCrashAt(s.crashAt);
          setMultiplier(s.crashAt);
        } else if (s.phase === "flying") {
          // If client has drifted behind server, rebase startTimeRef to catch up smoothly.
          const localElapsed = (performance.now() - startTimeRef.current) / 1000;
          const localMult = Math.pow(1.075, localElapsed * 1.8);
          if (s.multiplier > localMult + 0.05) {
            const elapsedMs = (Math.log(s.multiplier) / Math.log(1.075) / 1.8) * 1000;
            startTimeRef.current = performance.now() - elapsedMs;
          }
        }
      } catch {
        // ignore transient errors
      }
    };
    poll();
    const id = window.setInterval(poll, 350);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [currency, playSound]);

  // Refresh balance after round ends
  useEffect(() => {
    if (phase === "crashed") refreshBalance();
  }, [phase, refreshBalance]);

  const progress = useMemo(() => {
    if (phase === "betting") return 0;
    return Math.min(Math.max(Math.pow((multiplier - 1) / 2.45, 0.58), 0.055), 0.97);
  }, [multiplier, phase]);

  const sX = 0;
  const sY = 100;
  const c1X = 28;
  const c1Y = 100;
  const c2X = 60;
  const c2Y = 40;
  const eX = 90;
  const eY = 12;
  const t = progress;
  const planeX = Math.pow(1 - t, 3) * sX + 3 * Math.pow(1 - t, 2) * t * c1X + 3 * (1 - t) * t * t * c2X + t * t * t * eX;
  const planeY = Math.pow(1 - t, 3) * sY + 3 * Math.pow(1 - t, 2) * t * c1Y + 3 * (1 - t) * t * t * c2Y + t * t * t * eY;
  const planeFrameIndex = Math.floor(multiplier * 8) % PLANE_FRAMES.length;

  const cp1xCur = sX + (c1X - sX) * t;
  const cp1yCur = sY + (c1Y - sY) * t;
  const cp2xCur = sX + (c1X - sX) * t + ((c2X - c1X) * t) * t;
  const cp2yCur = sY + (c1Y - sY) * t + ((c2Y - c1Y) * t) * t;
  const trailPath = `M ${sX} ${sY} C ${cp1xCur} ${cp1yCur}, ${cp2xCur} ${cp2yCur}, ${planeX} ${planeY}`;
  const trailFillPath = `${trailPath} L ${planeX} 100 L ${sX} 100 Z`;

  const displayedBets = serverBets;

  const roundColor = (value: number) => {
    if (value >= 10) return "hsl(280 88% 62%)";
    if (value >= 2) return "hsl(203 90% 58%)";
    return "hsl(0 74% 51%)";
  };


  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground" style={{ fontFamily: "Roboto, Inter, sans-serif" }}>
      
      <audio preload="auto" src="/sounds/aviator/game-start.mp3" />
      <audio preload="auto" src="/sounds/aviator/plane-crash.mp3" />
      <audio preload="auto" src="/sounds/aviator/cashout.mp3" />

      <header className="h-12 px-2 flex items-center justify-between border-b border-border bg-card">
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)} className="h-8 w-8 rounded-full bg-muted grid place-items-center" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button onClick={() => navigate("/")} className="h-9 flex items-center" aria-label="Home">
            <img src={logoImg} alt="Aviator" className="h-8 w-auto object-contain" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 rounded-full bg-[hsl(265_50%_8%)] border border-primary/40 flex overflow-hidden">
            <button
              onClick={() => setCurrency("dollar")}
              className={`px-2.5 flex items-center gap-1 text-[11px] font-black tracking-wide transition ${currency === "dollar" ? "bg-primary/40 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span>$</span>
              <span className="text-foreground">{totalDollar.toFixed(2)}</span>
            </button>
            <button
              onClick={() => setCurrency("star")}
              className={`px-2.5 flex items-center gap-1 text-[11px] font-black transition border-l border-primary/40 ${currency === "star" ? "bg-primary/40" : ""}`}
            >
              <span className="text-yellow-400 text-sm leading-none">★</span>
              <span className="text-foreground">{Math.floor(totalStar)}</span>
            </button>
          </div>
          <button onClick={() => navigate("/wallet")} className="h-8 w-8 rounded-full bg-primary text-primary-foreground grid place-items-center" aria-label="Wallet">
            <Plus className="h-4 w-4" />
          </button>
          <button className="h-8 w-8 rounded-full bg-muted grid place-items-center" aria-label="Menu">
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="h-[calc(100dvh-48px)] min-h-0 grid grid-cols-1 lg:grid-cols-[330px_1fr] gap-1 lg:gap-2 p-0 lg:p-2 bg-background">
        <aside className="hidden lg:flex flex-col rounded-lg bg-card border border-border overflow-hidden">
          <div className="h-11 grid grid-cols-2 text-sm font-bold border-b border-border">
            <button className="relative text-foreground">All Bets<span className="absolute left-5 right-5 bottom-0 h-0.5 bg-primary" /></button>
            <button className="text-muted-foreground">My Bets</button>
          </div>
          <div className="p-2 flex items-center justify-between text-xs font-bold">
            <span>TOTAL BETS : <span className="text-primary">{displayedBets.length}</span></span>
            <button className="px-2 py-1 rounded bg-muted text-muted-foreground">Previous hand</button>
          </div>
          <div className="grid grid-cols-[1.3fr_.7fr_.7fr_1fr] px-3 py-2 text-[11px] text-muted-foreground bg-muted font-bold">
            <span>User</span><span>Bet</span><span>Mult.</span><span>Cash out</span>
          </div>
          <div className="flex-1 overflow-hidden">
            {displayedBets.map((row, index) => (
              <div key={`${row.user}-${index}`} className="grid grid-cols-[1.3fr_.7fr_.7fr_1fr] items-center px-3 py-2 text-xs border-b border-border/70">
                <span className="font-semibold">{row.user}</span>
                <span>{row.amount}</span>
                <span className={row.multiplier ? "text-primary font-bold" : "text-muted-foreground"}>{row.multiplier ? `${row.multiplier.toFixed(2)}x` : "-"}</span>
                <span className={row.cashout ? "text-primary font-bold" : "text-muted-foreground"}>{row.cashout ? row.cashout.toFixed(2) : "-"}</span>
              </div>
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex flex-col gap-1 lg:gap-2 overflow-hidden">
          <div className="h-9 flex items-center justify-between lg:rounded-lg bg-card border-y lg:border border-border px-2">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {history.map((item, index) => (
                <span key={`${item}-${index}`} className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold bg-muted" style={{ color: roundColor(item) }}>
                  {item.toFixed(2)}x
                </span>
              ))}
            </div>
            <button className="ml-2 shrink-0 h-7 px-2 rounded bg-muted text-xs font-bold flex items-center gap-1 text-muted-foreground">
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>

          <div className="relative min-h-[310px] flex-1 lg:rounded-lg lg:border lg:border-border overflow-hidden bg-card">
            <img src={spaceBg} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/20" />
            
            {phase !== "betting" && (
              <div className="absolute inset-0 pointer-events-none">
                <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <defs>
                    <linearGradient id="aviatorStroke" x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(350 100% 45%)" />
                      <stop offset="100%" stopColor="hsl(350 100% 58%)" />
                    </linearGradient>
                    <linearGradient id="aviatorFill" x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(350 100% 45% / 0.08)" />
                      <stop offset="100%" stopColor="hsl(350 100% 45% / 0.34)" />
                    </linearGradient>
                  </defs>
                  <path d={trailFillPath} fill="url(#aviatorFill)" />
                  <path d={trailPath} stroke="url(#aviatorStroke)" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>

                <div
                  className="absolute z-30 pointer-events-none"
                  style={{ left: `${planeX}%`, top: `${planeY}%`, transform: "translate(-44%, -105%)" }}
                >
                  <motion.div
                    className="relative h-6 w-12 sm:h-8 sm:w-16 lg:h-10 lg:w-20 xl:h-12 xl:w-24"
                    animate={phase === "crashed" ? { x: 300, y: -200, opacity: 0, scale: 0.5 } : { x: 0, y: 0, opacity: 1, scale: 1 }}
                    transition={{ duration: phase === "crashed" ? 1.5 : 0.05, ease: "easeIn" }}
                  >
                    {PLANE_FRAMES.map((frame, index) => (
                      <img
                        key={frame}
                        src={frame}
                        alt=""
                        className={`absolute inset-0 h-full w-full object-contain ${index === planeFrameIndex ? "opacity-100" : "opacity-0"} ${phase === "crashed" ? "drop-shadow-[0_0_18px_hsl(0_85%_55%)]" : "drop-shadow-[0_0_14px_hsl(45_100%_55%)]"}`}
                      />
                    ))}
                  </motion.div>
                </div>
              </div>
            )}

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {phase === "betting" ? (
                <div className="text-center px-4">
                  <img src={planeImg} alt="" className="mx-auto h-20 w-20 object-contain mb-3 opacity-95" />
                  <div className="text-2xl sm:text-4xl font-black tracking-wide text-foreground">WAITING FOR NEXT ROUND</div>
                  <div className="mx-auto mt-4 h-1.5 w-64 max-w-[72vw] rounded-full overflow-hidden bg-muted">
                    <motion.div
                      key={countdown}
                      className="h-full bg-primary"
                      initial={{ width: "100%" }}
                      animate={{ width: `${Math.max(0, Math.min(100, (countdown / 7) * 100))}%` }}
                      transition={{ duration: 0.35 }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  {phase === "crashed" && <div className="text-2xl sm:text-4xl font-black text-destructive mb-1">FLEW AWAY!</div>}
                  <div className="font-game text-6xl sm:text-8xl leading-none font-black text-foreground text-glow">
                    {multiplier.toFixed(2)}<span className="text-4xl sm:text-6xl">X</span>
                  </div>
                </div>
              )}
            </div>

            

            {phase === "betting" && (
              <div className="absolute left-4 bottom-6 pointer-events-none">
                <img src={staticPlane} alt="" className="h-14 w-24 object-contain" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <BetPanel
              title="BET"
              defaultAmount={100}
              phase={phase}
              multiplier={multiplier}
              roundNumber={roundNumber}
              currency={currency}
              setCurrency={setCurrency}
              tgUserId={tgUser?.id}
              userName={userName}
              balance={balance}
              refreshBalance={refreshBalance}
              unlockAudio={unlockAudio}
              cashoutAudioRef={cashoutAudioRef}
              playSound={playSound}
            />
            <BetPanel
              title="AUTO"
              defaultAmount={50}
              phase={phase}
              multiplier={multiplier}
              roundNumber={roundNumber}
              currency={currency}
              setCurrency={setCurrency}
              tgUserId={tgUser?.id}
              userName={userName}
              balance={balance}
              refreshBalance={refreshBalance}
              unlockAudio={unlockAudio}
              cashoutAudioRef={cashoutAudioRef}
              playSound={playSound}
              auto
            />
          </div>

        </section>
      </main>
    </div>
  );
};

const BetPanel = ({
  title,
  defaultAmount,
  phase,
  multiplier,
  roundNumber,
  currency,
  setCurrency,
  tgUserId,
  userName,
  balance,
  refreshBalance,
  unlockAudio,
  cashoutAudioRef,
  playSound,
  auto = false,
}: {
  title: string;
  defaultAmount: number;
  phase: Phase;
  multiplier: number;
  roundNumber: number;
  currency: CurrencyType;
  setCurrency: (c: CurrencyType) => void;
  tgUserId: number | undefined;
  userName: string;
  balance: number;
  refreshBalance: () => void;
  unlockAudio: () => void;
  cashoutAudioRef: React.MutableRefObject<HTMLAudioElement | null>;
  playSound: (audio: HTMLAudioElement | null) => void;
  auto?: boolean;
}) => {
  const [betAmount, setBetAmount] = useState(defaultAmount);
  const [hasBet, setHasBet] = useState(false);
  const [pendingBet, setPendingBet] = useState(false);
  const [cashedOutAt, setCashedOutAt] = useState<number | null>(null);
  const lastRoundRef = useRef<number>(roundNumber);
  const lastPhaseRef = useRef<Phase>(phase);

  // Reset on new round
  useEffect(() => {
    if (roundNumber !== lastRoundRef.current) {
      lastRoundRef.current = roundNumber;
      setHasBet(false);
      setCashedOutAt(null);
      setPendingBet(false);
    }
  }, [roundNumber]);

  // Lost-bet toast on crash
  useEffect(() => {
    if (phase !== lastPhaseRef.current) {
      lastPhaseRef.current = phase;
    }
  }, [phase, hasBet, cashedOutAt, multiplier, title]);

  const placeBet = async () => {
    unlockAudio();
    if (phase !== "betting") return;
    if (betAmount <= 0) return;
    if (betAmount > balance) return;
    if (hasBet || pendingBet) return;
    if (!tgUserId) return;
    setPendingBet(true);
    try {
      await placeAviatorBet({ userId: tgUserId, amount: betAmount, currency, firstName: userName, slot: auto ? 2 : 1 });
      setHasBet(true);
      setCashedOutAt(null);
      refreshBalance();
    } catch {
      // silent - no popup
    } finally {
      setPendingBet(false);
    }
  };

  const cancelBet = async () => {
    if (!hasBet || phase !== "betting" || pendingBet) return;
    if (!tgUserId) return;
    setPendingBet(true);
    try {
      await cancelAviatorBet(tgUserId, currency, auto ? 2 : 1);
      setHasBet(false);
      setCashedOutAt(null);
      refreshBalance();
    } catch {
      // silent - no popup
    } finally {
      setPendingBet(false);
    }
  };

  const cashOut = async () => {
    unlockAudio();
    if (phase !== "flying" || !hasBet || cashedOutAt !== null) return;
    if (!tgUserId) return;
    try {
      const result = await cashOutAviator(tgUserId, currency, auto ? 2 : 1);
      setCashedOutAt(result.multiplier);
      playSound(cashoutAudioRef.current);
      toast.success(`[${title}] Cashed out @ ${result.multiplier.toFixed(2)}x - ${formatMoney(result.winAmount, currency)}`);
      refreshBalance();
    } catch (e) {
      // Silent - no loss popup. User just sees plane fly away if too late.
      console.warn("Cashout failed:", (e as Error).message);
    }
  };

  const canCashOut = phase === "flying" && hasBet && cashedOutAt === null;
  const isWaiting = hasBet && phase === "betting";
  const value = betAmount;

  const setValue = (next: number) => setBetAmount(Math.max(1, next));

  return (
    <div className="rounded-lg border border-primary/30 bg-[hsl(265_60%_10%)] p-1.5 space-y-1 shadow-[0_0_10px_hsl(280_80%_40%/0.18)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-widest text-primary/90">{auto ? "AUTO BET" : "BET AMOUNT"}</span>
        {auto && <span className="text-[9px] font-bold text-muted-foreground">AUTO</span>}
      </div>

      <div className="flex items-stretch gap-1.5">
        <div className="flex-1 h-9 rounded-md bg-[hsl(265_50%_8%)] border border-primary/40 flex items-center overflow-hidden">
          <button onClick={() => setValue(value - 1)} className="w-7 h-full grid place-items-center text-primary text-base font-bold hover:bg-primary/10">−</button>
          <input
            value={value}
            onChange={(event) => setValue(Number(event.target.value.replace(/[^0-9]/g, "")) || 0)}
            className="flex-1 min-w-0 bg-transparent px-1 text-center font-bold text-base text-foreground outline-none"
            inputMode="numeric"
          />
          <button onClick={() => setValue(value + 1)} className="w-7 h-full grid place-items-center text-primary text-base font-bold hover:bg-primary/10">+</button>
        </div>
        <div className="h-9 rounded-md bg-[hsl(265_50%_8%)] border border-primary/40 flex overflow-hidden">
          <button
            onClick={() => setCurrency("dollar")}
            className={`px-2.5 text-[11px] font-black tracking-wide transition ${currency === "dollar" ? "bg-primary/40 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            USD
          </button>
          <button
            onClick={() => setCurrency("star")}
            className={`px-2.5 grid place-items-center transition border-l border-primary/40 ${currency === "star" ? "bg-primary/40" : ""}`}
          >
            <span className="text-yellow-400 text-base leading-none">★</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {PRESETS_BY_CURRENCY[currency].map((amount) => (
          <button
            key={`${title}-${amount}`}
            onClick={() => setValue(amount)}
            className={`h-5 rounded text-[9px] font-bold transition border ${
              value === amount
                ? "border-primary text-primary bg-primary/10"
                : "border-primary/30 text-foreground/80 bg-[hsl(265_50%_8%)] hover:border-primary/60"
            }`}
          >
            {amount}
          </button>
        ))}
      </div>

      {canCashOut ? (
        <button onClick={cashOut} className="w-full h-7 rounded-md bg-gradient-to-b from-yellow-400 to-orange-500 text-black font-game text-xs flex items-center justify-center gap-2 shadow-[inset_0_-2px_0_hsl(30_90%_30%)]">
          <span>CASH OUT</span>
          <span className="text-xs font-sans font-black">{(value * multiplier).toFixed(2)}</span>
        </button>
      ) : cashedOutAt ? (
        <div className="w-full h-7 rounded-md bg-primary text-primary-foreground font-game text-xs flex items-center justify-center gap-2 opacity-90">
          <span>CASHED</span>
          <span className="text-xs">{cashedOutAt.toFixed(2)}x</span>
        </div>
      ) : isWaiting ? (
        <button
          onClick={cancelBet}
          disabled={pendingBet}
          className="w-full h-7 rounded-md bg-gradient-to-b from-[hsl(0_75%_55%)] to-[hsl(0_80%_38%)] text-white font-game text-base tracking-wider flex items-center justify-center gap-2 shadow-[inset_0_-3px_0_hsl(0_80%_25%),0_3px_12px_hsl(0_80%_40%/0.4)] disabled:opacity-70"
        >
          <span>CANCEL</span>
        </button>
      ) : (
        <button
          onClick={placeBet}
          disabled={phase !== "betting" || pendingBet}
          className="w-full h-7 rounded-md bg-gradient-to-b from-[hsl(110_75%_55%)] to-[hsl(120_80%_38%)] text-white font-game text-base tracking-wider flex items-center justify-center gap-2 shadow-[inset_0_-3px_0_hsl(120_80%_25%),0_3px_12px_hsl(120_80%_40%/0.4)] disabled:opacity-70"
        >
          <span>PLACE BET</span>
          <svg viewBox="0 0 24 24" className="w-4 h-4 -rotate-12" fill="currentColor">
            <path d="M2 21 L23 12 L2 3 L2 10 L17 12 L2 14 Z" />
          </svg>
        </button>
      )}
    </div>
  );
};

const PlaneNavIcon = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M2 12 L20 8 L12 12.5 Z" />
    <path d="M2 12 L20 8 L11 16 Z" opacity="0.7" />
  </svg>
);

export default AviatorGame;
