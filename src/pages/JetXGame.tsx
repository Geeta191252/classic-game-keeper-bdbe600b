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
// Cartoon cloud sky — procedural SVG tiles (two parallax layers, varied clouds)
const CLOUDS_BACK = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='400' height='800' viewBox='0 0 400 800'>
  <defs>
    <radialGradient id='p' cx='50%' cy='50%' r='50%'>
      <stop offset='0%' stop-color='%23b892ff' stop-opacity='0.95'/>
      <stop offset='60%' stop-color='%237c5cff' stop-opacity='0.55'/>
      <stop offset='100%' stop-color='%237c5cff' stop-opacity='0'/>
    </radialGradient>
    <radialGradient id='w' cx='50%' cy='50%' r='50%'>
      <stop offset='0%' stop-color='%23ffffff' stop-opacity='0.28'/>
      <stop offset='100%' stop-color='%23ffffff' stop-opacity='0'/>
    </radialGradient>
  </defs>
  <g opacity='0.9'>
    <ellipse cx='60' cy='90' rx='90' ry='38' fill='url(%23p)'/>
    <ellipse cx='330' cy='220' rx='80' ry='32' fill='url(%23p)'/>
    <ellipse cx='40' cy='420' rx='70' ry='30' fill='url(%23p)'/>
    <ellipse cx='360' cy='560' rx='95' ry='40' fill='url(%23p)'/>
    <ellipse cx='120' cy='700' rx='75' ry='30' fill='url(%23p)'/>
  </g>
  <g>
    <circle cx='200' cy='60' r='1.4' fill='white' opacity='0.9'/>
    <circle cx='90' cy='180' r='1' fill='white' opacity='0.8'/>
    <circle cx='300' cy='120' r='1.2' fill='white' opacity='0.85'/>
    <circle cx='250' cy='330' r='1' fill='white' opacity='0.75'/>
    <circle cx='30' cy='300' r='1.3' fill='white' opacity='0.9'/>
    <circle cx='180' cy='500' r='1.1' fill='white' opacity='0.8'/>
    <circle cx='370' cy='450' r='1' fill='white' opacity='0.75'/>
    <circle cx='60' cy='620' r='1.4' fill='white' opacity='0.9'/>
    <circle cx='280' cy='650' r='1' fill='white' opacity='0.8'/>
    <circle cx='210' cy='770' r='1.2' fill='white' opacity='0.85'/>
  </g>
</svg>`)}`;

const CLOUDS_FRONT = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='400' height='900' viewBox='0 0 400 900'>
  <defs>
    <radialGradient id='c' cx='50%' cy='40%' r='60%'>
      <stop offset='0%' stop-color='%23ffffff' stop-opacity='0.95'/>
      <stop offset='55%' stop-color='%23c9d8ff' stop-opacity='0.55'/>
      <stop offset='100%' stop-color='%237ba0ff' stop-opacity='0'/>
    </radialGradient>
    <radialGradient id='pk' cx='50%' cy='40%' r='60%'>
      <stop offset='0%' stop-color='%23ffd6f2' stop-opacity='0.9'/>
      <stop offset='55%' stop-color='%23e879f9' stop-opacity='0.45'/>
      <stop offset='100%' stop-color='%23a855f7' stop-opacity='0'/>
    </radialGradient>
  </defs>
  <g>
    <ellipse cx='70' cy='120' rx='110' ry='42' fill='url(%23pk)'/>
    <ellipse cx='340' cy='60' rx='95' ry='36' fill='url(%23c)'/>
    <ellipse cx='320' cy='300' rx='120' ry='45' fill='url(%23pk)'/>
    <ellipse cx='50' cy='380' rx='100' ry='40' fill='url(%23c)'/>
    <ellipse cx='360' cy='540' rx='90' ry='36' fill='url(%23c)'/>
    <ellipse cx='80' cy='640' rx='120' ry='45' fill='url(%23pk)'/>
    <ellipse cx='300' cy='780' rx='105' ry='40' fill='url(%23c)'/>
    <ellipse cx='40' cy='860' rx='85' ry='34' fill='url(%23pk)'/>
  </g>
</svg>`)}`;

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
  const multSpring = useSpring(multMv, { stiffness: 90, damping: 20, mass: 0.7 });
  const multText = useTransform(multSpring, (v) => `${v.toFixed(2)}x`);
  useEffect(() => { multMv.set(multiplier); }, [multiplier, multMv]);

  // ── Smooth rocket vertical position driven by spring (no per-poll jumps)
  const bottomMv = useMotionValue(8);
  const bottomSpring = useSpring(bottomMv, { stiffness: 140, damping: 22, mass: 0.6 });
  const bottomStyle = useTransform(bottomSpring, (v) => `${v}%`);

  // ── Cloud parallax scroll (two layers, continuous, varied)
  const cloudBackY = useMotionValue(0);
  const cloudFrontY = useMotionValue(0);
  const cloudBackPos = useTransform(cloudBackY, (v) => `0 ${v}px`);
  const cloudFrontPos = useTransform(cloudFrontY, (v) => `0 ${v}px`);


  // ── Sound: continuous rocket thrust + crash boom (Web Audio)
  const audioRef = useRef<{
    ctx: AudioContext | null;
    thrustGain: GainNode | null;
    thrustSrc: AudioBufferSourceNode | null;
    thrustFilter: BiquadFilterNode | null;
  }>({ ctx: null, thrustGain: null, thrustSrc: null, thrustFilter: null });

  const ensureAudio = useCallback(() => {
    const a = audioRef.current;
    if (a.ctx) return a.ctx;
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    a.ctx = new Ctx();
    return a.ctx;
  }, []);

  const startThrust = useCallback(() => {
    const a = audioRef.current;
    const ctx = ensureAudio();
    if (!ctx || a.thrustSrc) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.4);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    a.thrustSrc = src; a.thrustGain = gain; a.thrustFilter = filter;
  }, [ensureAudio]);

  const setThrustIntensity = useCallback((mult: number) => {
    const a = audioRef.current;
    if (!a.ctx || !a.thrustFilter || !a.thrustGain) return;
    const p = Math.min(1, Math.log(Math.max(1, mult)) / Math.log(20));
    const t = a.ctx.currentTime;
    a.thrustFilter.frequency.setTargetAtTime(500 + p * 1800, t, 0.15);
    a.thrustGain.gain.setTargetAtTime(0.22 + p * 0.25, t, 0.2);
  }, []);

  const stopThrust = useCallback(() => {
    const a = audioRef.current;
    if (!a.ctx || !a.thrustSrc || !a.thrustGain) return;
    const t = a.ctx.currentTime;
    a.thrustGain.gain.cancelScheduledValues(t);
    a.thrustGain.gain.setValueAtTime(a.thrustGain.gain.value, t);
    a.thrustGain.gain.linearRampToValueAtTime(0.0001, t + 0.15);
    const src = a.thrustSrc;
    setTimeout(() => { try { src.stop(); } catch {} }, 200);
    a.thrustSrc = null;
  }, []);

  const playCrash = useCallback(() => {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.6);
    og.gain.setValueAtTime(0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.connect(og).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.75);
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const nsrc = ctx.createBufferSource(); nsrc.buffer = buf;
    const nf = ctx.createBiquadFilter(); nf.type = "lowpass"; nf.frequency.value = 1200;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    nsrc.connect(nf).connect(ng).connect(ctx.destination);
    nsrc.start(t); nsrc.stop(t + 0.6);
  }, [ensureAudio]);

  useEffect(() => () => { stopThrust(); }, [stopThrust]);

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

  // Rocket flight math — faster rise
  const progress = phase === "flying" ? Math.min(1, Math.log(Math.max(1, multiplier)) / Math.log(8)) : 0;
  const rocketBottomPct = phase === "crashed" ? 140 : 8 + progress * 62;
  const flameHvh = phase === "flying" ? 5 + progress * 4 : phase === "betting" ? 3 : 2;

  // Drive smooth rocket bottom + thrust intensity when values change
  useEffect(() => { bottomMv.set(rocketBottomPct); }, [rocketBottomPct, bottomMv]);
  useEffect(() => { if (phase === "flying") setThrustIntensity(multiplier); }, [multiplier, phase, setThrustIntensity]);

  // Phase-based sound lifecycle
  useEffect(() => {
    if (phase === "flying") {
      startThrust();
    } else if (phase === "crashed") {
      stopThrust();
      playCrash();
    } else {
      stopThrust();
    }
  }, [phase, startThrust, stopThrust, playCrash]);

  // Continuous cloud scroll: speed scales with multiplier. Clouds drift DOWN as rocket rises.
  useEffect(() => {
    const TILE_BACK = 800;
    const TILE_FRONT = 900;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      // Base idle drift + multiplier-driven boost (faster)
      const boost = phase === "flying" ? 180 + multiplier * 140 : 45;
      const frontSpeed = boost;         // front layer faster
      const backSpeed = boost * 0.5;    // back layer slower (parallax)
      // Positive Y offset = clouds move downward
      const nb = (cloudBackY.get() + backSpeed * dt) % TILE_BACK;
      const nf = (cloudFrontY.get() + frontSpeed * dt) % TILE_FRONT;
      cloudBackY.set(nb);
      cloudFrontY.set(nf);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, multiplier, cloudBackY, cloudFrontY]);

  return (
    <div
      className="min-h-screen w-full text-white select-none relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 20% 10%, #1a2a5a 0%, #0a0f24 40%, #04060f 100%)",
      }}
    >
      {/* Background is applied only inside the stage below */}


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

          <button
            onClick={() => { const c = ensureAudio(); if (c && c.state === "suspended") c.resume(); }}
            className="w-11 h-11 rounded-2xl flex items-center justify-center jetx-glass"
          >
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
          {/* Solid blue night sky base */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg,#0b1a5e 0%,#0d2585 40%,#0a1f6b 75%,#061344 100%)",
            }}
          />

          {/* Back cloud layer (slow parallax, purple haze + stars) */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("${CLOUDS_BACK}")`,
              backgroundSize: "100% auto",
              backgroundRepeat: "repeat-y",
              backgroundPosition: cloudBackPos,
              willChange: "background-position",
              opacity: 0.85,
            }}
          />

          {/* Front cloud layer (fast, cartoon white/pink puffs) */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("${CLOUDS_FRONT}")`,
              backgroundSize: "100% auto",
              backgroundRepeat: "repeat-y",
              backgroundPosition: cloudFrontPos,
              willChange: "background-position",
            }}
          />

          {/* Subtle vignette for depth */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 50% 40%, transparent 55%, rgba(0,0,0,0.35) 100%)",
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
            style={{ width: "34%", x: "-50%", bottom: bottomStyle }}
            animate={{
              y: phase === "betting" ? [0, -8, 0, 6, 0] : phase === "flying" ? [0, -3, 0, 3, 0] : 0,
            }}
            transition={{
              y: { duration: phase === "flying" ? 0.6 : 2.4, repeat: Infinity, ease: "easeInOut" },
            }}
          >
            <img
              src={rocketImg}
              alt="rocket"
              className="w-full block relative"
              style={{
                filter:
                  "drop-shadow(0 16px 24px rgba(0,0,0,0.75)) drop-shadow(0 0 18px rgba(120,180,255,0.35)) drop-shadow(0 0 10px rgba(249,115,22,0.35))",
              }}
            />
            {/* Flame plume — compact soft glowing 3D plume */}
            <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{ top: "92%", width: "16%", height: `${flameHvh}vh`, maxHeight: "12vh" }}
            >
              {/* wide ambient glow */}
              <motion.div
                style={{
                  position: "absolute", inset: "-5% -35% 5% -35%",
                  background:
                    "radial-gradient(ellipse at 50% 15%, rgba(251,191,36,0.45) 0%, rgba(249,115,22,0.22) 30%, rgba(234,88,12,0.08) 55%, transparent 75%)",
                  filter: "blur(12px)",
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
                  filter: "blur(5px) drop-shadow(0 0 18px rgba(249,115,22,0.65))",
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
