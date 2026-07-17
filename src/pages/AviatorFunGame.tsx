import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBalanceContext } from "@/contexts/BalanceContext";
import { type CurrencyType, reportGameResult, fetchAviatorState, getTelegramUser } from "@/lib/telegram";

type ServerBet = { user: string; amount: number; multiplier: number | null; cashout: number | null };

// Small seeded PRNG so all clients render the same simulated players per round
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import "./AviatorFunGame.css";

// Synthesizer Audio Engine using Web Audio API
class AviatorAudioEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = true; // Start muted by default (user toggles it in header)
  
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  toggleMute(): boolean {
    this.init();
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopEngine();
    }
    return this.isMuted;
  }

  playClick() {
    if (this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.08);
      
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (e) {
      console.error(e);
    }
  }

  startEngine() {
    if (this.isMuted || !this.ctx) return;
    try {
      if (this.engineOsc) return; // Already running

      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.setValueAtTime(45, this.ctx.currentTime);
      
      this.engineOsc2.type = "triangle";
      this.engineOsc2.frequency.setValueAtTime(90, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(180, this.ctx.currentTime);
      
      this.engineGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      this.engineGain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.5);
      
      this.engineOsc.connect(filter);
      this.engineOsc2.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      
      this.engineOsc.start();
      this.engineOsc2.start();
    } catch (e) {
      console.error(e);
    }
  }

  updateEnginePitch(multiplier: number) {
    if (this.isMuted || !this.engineOsc || !this.ctx || !this.engineGain) return;
    try {
      const baseFreq = 45 + Math.min(multiplier * 5, 120); 
      this.engineOsc.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.1);
      this.engineOsc2.frequency.setTargetAtTime(baseFreq * 2, this.ctx.currentTime, 0.1);
      
      const targetGain = 0.08 + Math.min(multiplier * 0.003, 0.07);
      this.engineGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.2);
    } catch (e) {}
  }

  stopEngine() {
    if (!this.engineOsc || !this.ctx || !this.engineGain) return;
    try {
      const tempGain = this.engineGain;
      const tempOsc = this.engineOsc;
      const tempOsc2 = this.engineOsc2;
      
      this.engineOsc = null;
      this.engineOsc2 = null;
      this.engineGain = null;
      
      tempGain.gain.setValueAtTime(tempGain.gain.value, this.ctx.currentTime);
      tempGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
      
      setTimeout(() => {
        try {
          tempOsc.stop();
          tempOsc2.stop();
          tempOsc.disconnect();
          tempOsc2.disconnect();
          tempGain.disconnect();
        } catch(e) {}
      }, 300);
    } catch (e) {
      console.error(e);
    }
  }

  playCashout() {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const playChime = (freq: number, delay: number) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + delay);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0.001, now + delay);
        gain.gain.linearRampToValueAtTime(0.12, now + delay + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.6);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now + delay);
        osc.stop(now + delay + 0.6);
      };
      
      playChime(784.00, 0);      
      playChime(1046.50, 0.06);   
      playChime(1318.51, 0.12);   
    } catch (e) {
      console.error(e);
    }
  }

  playCrash() {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.6);
      
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + 0.6);
      
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.65);
    } catch (e) {
      console.error(e);
    }
  }
}

type Phase = "WAITING" | "FLYING" | "CRASHED";
type BetStatus = "NONE" | "PLACED" | "ACTIVE" | "CASHED_OUT" | "LOST";

interface PanelState {
  status: BetStatus;
  amount: number;
  autoCashout: boolean;
  autoMultiplier: number;
  winAmount?: number;
}

interface SimulatedPlayer {
  name: string;
  betAmount: number;
  targetMultiplier: number;
  cashedOut: boolean;
  winAmount: number;
  avatarIdx: number;
}

const FIRST_NAMES = ["d***1", "d***6", "d***7", "d***2", "a***4", "k***9", "x***5", "m***2", "s***0", "r***8", "p***3", "c***7", "f***2", "g***8", "h***1", "j***6", "l***9", "n***0", "v***4", "y***5"];
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #ff6b6b, #ff8787)",
  "linear-gradient(135deg, #4dabf7, #3bc9db)",
  "linear-gradient(135deg, #51cf66, #94d82d)",
  "linear-gradient(135deg, #fcc419, #ffa834)",
  "linear-gradient(135deg, #cc5de8, #da77f2)",
  "linear-gradient(135deg, #ff922b, #ffa94d)",
  "linear-gradient(135deg, #20c997, #12b886)",
  "linear-gradient(135deg, #748ffc, #5c7cfa)"
];

const INITIAL_HISTORY = [
  1.07, 2.17, 54.42, 2.35, 1.43, 39.41, 5.00, 1.89, 14.52, 1.83, 
  20.67, 5.90, 66.12, 5.13, 1.25, 2.80, 1.10, 8.44, 1.95, 12.30
];

const AviatorFunGame = () => {
  const navigate = useNavigate();
  const { dollarBalance, starBalance, dollarWinning, starWinning, refreshBalance, currencyDisplay, toggleCurrencyDisplay } = useBalanceContext();
  const [currency, setCurrency] = useState<CurrencyType>("dollar");

  const totalDollar = dollarBalance + dollarWinning;
  const totalStar = starBalance + starWinning;
  const balance = currency === "dollar" ? totalDollar : totalStar;

  // Settings
  const [roundSpeedMultiplier, setRoundSpeedMultiplier] = useState(1.0);
  const [enableAutoRefill, setEnableAutoRefill] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  // Modals & Menu
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<"deposit" | "withdraw" | "settings" | null>(null);
  const [depositAmount, setDepositAmount] = useState(500);
  const [withdrawAmount, setWithdrawAmount] = useState(500);

  // Dual Betting Panels State
  const [panel1, setPanel1] = useState<PanelState>({ status: "NONE", amount: 3, autoCashout: false, autoMultiplier: 2.0 });
  const [panel2, setPanel2] = useState<PanelState>({ status: "NONE", amount: 3, autoCashout: false, autoMultiplier: 2.0 });
  const [panel1ActiveTab, setPanel1ActiveTab] = useState<"bet" | "auto">("bet");
  const [panel2ActiveTab, setPanel2ActiveTab] = useState<"bet" | "auto">("bet");
  const [panel2Collapsed, setPanel2Collapsed] = useState(false);

  // Game Engine state refs
  const audioRef = useRef<AviatorAudioEngine>(new AviatorAudioEngine());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const planeImgRef = useRef<HTMLImageElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);

  const [gameState, setGameState] = useState<Phase>("WAITING");
  const [currentMultiplier, setCurrentMultiplier] = useState(1.00);
  const [crashMultiplier, setCrashMultiplier] = useState(1.00);
  const [waitingCountdown, setWaitingCountdown] = useState(5.0);
  const [historyList, setHistoryList] = useState<number[]>(INITIAL_HISTORY);
  const [simPlayers, setSimPlayers] = useState<SimulatedPlayer[]>([]);
  const [serverBets, setServerBets] = useState<ServerBet[]>([]);
  const [activeSidebarTab, setActiveSidebarTab] = useState<"all-bets" | "my-bets" | "top-bets">("all-bets");
  const [roundTotalWin, setRoundTotalWin] = useState(0);
  const [historyDropdownOpen, setHistoryDropdownOpen] = useState(false);
  const isRiggedRef = useRef(false);
  const myNameRef = useRef<string>(getTelegramUser()?.first_name || "Player");

  // References for values to avoid react state polling lag in frame updates
  const stateRef = useRef({
    gameState: "WAITING" as Phase,
    currentMultiplier: 1.00,
    crashMultiplier: 1.00,
    timeElapsed: 0,
    lastFrameTime: 0,
    waitingTimer: 5000,
    waitingDuration: 5000,
    panel1: { status: "NONE" as BetStatus, amount: 3, autoCashout: false, autoMultiplier: 2.0 },
    panel2: { status: "NONE" as BetStatus, amount: 3, autoCashout: false, autoMultiplier: 2.0 },
    simPlayers: [] as SimulatedPlayer[],
    roundTotalWin: 0
  });

  // Keep stateRef synced with betting values
  useEffect(() => {
    stateRef.current.panel1 = { ...panel1 };
  }, [panel1]);

  useEffect(() => {
    stateRef.current.panel2 = { ...panel2 };
  }, [panel2]);

  // Load Canvas Images
  useEffect(() => {
    const pImg = new Image();
    pImg.src = "/images/aviator/p.png";
    planeImgRef.current = pImg;

    const bgImg = new Image();
    bgImg.src = "/images/aviator/bg-rotate-old.svg";
    bgImgRef.current = bgImg;
  }, []);

  // Format Helper
  const formatMoney = useCallback((val: number) => {
    if (currency === "star") return `★${Math.floor(val).toLocaleString()}`;
    return `$${val.toFixed(2)}`;
  }, [currency]);

  // Balance Auto Refill (Disabled for real money mode)
  useEffect(() => {
    // Real balance does not auto-refill
  }, [balance, currency, enableAutoRefill]);

  // sound toggle helper
  const handleSoundToggle = () => {
    audioRef.current.init();
    const muted = audioRef.current.toggleMute();
    setIsMuted(muted);
  };

  // Deposit Submit
  const handleDepositSubmit = () => {
    toast.error("Please add funds through Telegram wallet invoices.");
    setActiveModal(null);
  };

  // Withdraw Submit
  const handleWithdrawSubmit = () => {
    toast.error("Please initiate withdrawals in TG app main dashboard.");
    setActiveModal(null);
  };

  // Generate simulated players — seeded by roundNumber so every user sees the same list
  const roundSeedRef = useRef(1);
  const generateSimulatedPlayers = () => {
    const rand = mulberry32(roundSeedRef.current * 9301 + (currency === "star" ? 1 : 2));
    const list: SimulatedPlayer[] = [];
    const numPlayers = Math.floor(rand() * 40) + 90;
    for (let i = 0; i < numPlayers; i++) {
      const name = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)] + Math.floor(rand() * 900 + 100);
      const betAmt = Math.floor(rand() * (currency === "dollar" ? 10 : 100)) + (currency === "dollar" ? 1 : 10);

      const r = rand();
      let target = 1.05 + rand() * 0.2;
      if (r > 0.3) target = 1.25 + Math.pow(rand(), 2) * 4.0;
      if (r > 0.8) target = 5.0 + Math.pow(rand(), 3) * 35.0;

      list.push({
        name,
        betAmount: betAmt,
        targetMultiplier: Math.round(target * 100) / 100,
        cashedOut: false,
        winAmount: 0,
        avatarIdx: Math.floor(rand() * AVATAR_GRADIENTS.length)
      });
    }
    return list;
  };


  // Game Round Control
  const startWaitingRound = useCallback(() => {
    setGameState("WAITING");
    setCurrentMultiplier(1.00);
    setRoundTotalWin(0);

    stateRef.current.gameState = "WAITING";
    stateRef.current.currentMultiplier = 1.00;
    stateRef.current.waitingTimer = 5000;
    stateRef.current.roundTotalWin = 0;

    // Pre-fetch rig state to avoid transition stutters
    fetch("/api/game/rig")
      .then(res => res.json())
      .then(data => {
        isRiggedRef.current = data.rigged === true;
      })
      .catch(() => {
        isRiggedRef.current = false;
      });

    // Reset panel active statuses
    setPanel1(prev => {
      if (prev.status === "CASHED_OUT" || prev.status === "LOST") {
        return { ...prev, status: "NONE" };
      }
      return prev;
    });
    setPanel2(prev => {
      if (prev.status === "CASHED_OUT" || prev.status === "LOST") {
        return { ...prev, status: "NONE" };
      }
      return prev;
    });

    const sim = generateSimulatedPlayers();
    setSimPlayers(sim);
    stateRef.current.simPlayers = sim;
  }, [currency]);

  const startFlyingRound = useCallback(() => {
    // Crash multiplier comes from the server; use a large sentinel so the local
    // render loop never triggers the crash on its own — we wait for the server signal.
    const crashVal = 999999;

    setCrashMultiplier(crashVal);
    setGameState("FLYING");

    stateRef.current.gameState = "FLYING";
    stateRef.current.crashMultiplier = crashVal;
    stateRef.current.timeElapsed = 0;
    stateRef.current.currentMultiplier = 1.00;

    audioRef.current.startEngine();
    audioRef.current.updateEnginePitch(1.00);

    // Transition panels from PLACED to ACTIVE
    setPanel1(prev => {
      if (prev.status === "PLACED") return { ...prev, status: "ACTIVE" };
      return { ...prev, status: "NONE" };
    });
    setPanel2(prev => {
      if (prev.status === "PLACED") return { ...prev, status: "ACTIVE" };
      return { ...prev, status: "NONE" };
    });
  }, []);

  const startCrashedRound = useCallback((finalMult: number) => {
    setGameState("CRASHED");
    audioRef.current.stopEngine();
    audioRef.current.playCrash();

    stateRef.current.gameState = "CRASHED";
    stateRef.current.timeElapsed = 0; // Reset timer for smooth fly-away animation
    stateRef.current.currentMultiplier = finalMult;
    setCurrentMultiplier(finalMult);

    // Un-cashed user bets are lost
    setPanel1(prev => {
      if (prev.status === "ACTIVE") return { ...prev, status: "LOST" };
      return prev;
    });
    setPanel2(prev => {
      if (prev.status === "ACTIVE") return { ...prev, status: "LOST" };
      return prev;
    });

    setHistoryList(prev => [finalMult, ...prev.slice(0, 39)]);
    // Server drives the next WAITING transition — no local setTimeout here.
  }, []);

  // ---------------------------------------------------------------------------
  // Server-synced rounds: drive phase transitions from the shared aviator state
  // so every user sees the same round, crash and countdown at the same time.
  // ---------------------------------------------------------------------------
  const serverSyncRef = useRef({ phase: "" as string, roundNumber: 0 });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const s = await fetchAviatorState(currency);
        if (cancelled) return;

        const prev = serverSyncRef.current;
        const phaseChanged = prev.phase !== s.phase;
        const roundChanged = prev.roundNumber !== s.roundNumber;
        serverSyncRef.current = { phase: s.phase, roundNumber: s.roundNumber };
        roundSeedRef.current = s.roundNumber || 1;

        if (s.phase === "betting") {
          stateRef.current.waitingTimer = Math.max(0, s.timeLeft * 1000);
          setWaitingCountdown(s.timeLeft);
          if (phaseChanged || roundChanged) {
            startWaitingRound();
          }
        } else if (s.phase === "flying") {
          if (phaseChanged) startFlyingRound();
          // Sync local elapsed time to server-reported multiplier
          const m = Math.max(1.0001, s.multiplier);
          const elapsedMs = (Math.log(m) / Math.log(1.075) / 1.8) * 1000;
          stateRef.current.timeElapsed = elapsedMs;
          stateRef.current.currentMultiplier = m;
          setCurrentMultiplier(Number(m.toFixed(2)));
        } else if (s.phase === "crashed") {
          if (phaseChanged) {
            const finalMult = s.crashAt ?? s.multiplier ?? stateRef.current.currentMultiplier;
            startCrashedRound(Number(finalMult));
          }
        }

        if (Array.isArray(s.history) && s.history.length) {
          setHistoryList(s.history.slice(0, 40));
        }
        if (Array.isArray(s.bets)) {
          setServerBets(s.bets as ServerBet[]);
        } else {
          setServerBets([]);
        }
      } catch {
        // network hiccup — retry
      }
      if (!cancelled) timer = setTimeout(tick, 500);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [currency, startWaitingRound, startFlyingRound, startCrashedRound]);


  // Main Canvas Render loop
  useEffect(() => {
    let animationFrameId: number;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.floor(rect.width * window.devicePixelRatio);
      const height = Math.floor(rect.height * window.devicePixelRatio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        ctx.resetTransform();
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    stateRef.current.lastFrameTime = performance.now();

    const drawGrid = (w: number, h: number, time: number) => {
      const bgImg = bgImgRef.current;
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        ctx.save();
        ctx.fillStyle = "#0f0f10";
        ctx.fillRect(0, 0, w, h);
        
        ctx.translate(0, h);
        let rotSpeed = 0.00003;
        if (stateRef.current.gameState === "FLYING") {
          rotSpeed = 0.00008 + Math.min(0.00017, stateRef.current.currentMultiplier * 0.000015);
        } else if (stateRef.current.gameState === "CRASHED") {
          rotSpeed = 0.00025;
        }
        
        ctx.rotate(time * rotSpeed);
        const diagonal = Math.sqrt(w * w + h * h);
        const size = diagonal * 2.2;
        ctx.drawImage(bgImg, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        ctx.fillStyle = "#080808";
        ctx.fillRect(0, 0, w, h);
      }
    };

    const drawCurve = (sx: number, sy: number, px: number, py: number) => {
      ctx.save();
      const fillGradient = ctx.createLinearGradient(sx, sy, px, py);
      fillGradient.addColorStop(0, "rgba(235, 20, 54, 0.35)");
      fillGradient.addColorStop(1, "rgba(235, 20, 54, 0.0)");
      
      ctx.fillStyle = fillGradient;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      
      const cx = sx + (px - sx) * 0.6;
      const cy = sy;
      
      ctx.quadraticCurveTo(cx, cy, px, py);
      ctx.lineTo(px, sy);
      ctx.lineTo(sx, sy);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#eb1436";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cx, cy, px, py);
      ctx.stroke();
      ctx.restore();
    };

    const drawPlane = (px: number, py: number, angle: number) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      
      const pImg = planeImgRef.current;
      let drawn = false;
      if (pImg && pImg.complete && pImg.naturalWidth > 0) {
        const planeWidth = 90;
        const planeHeight = planeWidth * (pImg.naturalHeight / pImg.naturalWidth);
        ctx.drawImage(pImg, -planeWidth * 0.15, -planeHeight * 0.85, planeWidth, planeHeight);
        drawn = true;
      }
      
      if (!drawn) {
        ctx.fillStyle = "#eb1436";
        ctx.scale(1.8, 1.8);
        ctx.translate(5, -5);
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.quadraticCurveTo(8, -5, -2, -4);
        ctx.lineTo(-12, -4);
        ctx.lineTo(-16, -10);
        ctx.lineTo(-18, -10);
        ctx.lineTo(-16, 0);
        ctx.lineTo(-18, 10);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };

    const gameLoop = (now: number) => {
      let deltaTime = (now - stateRef.current.lastFrameTime) * roundSpeedMultiplier;
      if (deltaTime < 0 || deltaTime > 100 * roundSpeedMultiplier) {
        deltaTime = 16.6 * roundSpeedMultiplier;
      }
      stateRef.current.lastFrameTime = now;

      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      ctx.clearRect(0, 0, w, h);
      
      drawGrid(w, h, now);

      const refState = stateRef.current;

      if (refState.gameState === "WAITING") {
        // Countdown display is driven by the server poll; do not auto-transition here.
        refState.waitingTimer = Math.max(0, refState.waitingTimer - deltaTime);
        drawPlane(0, h, -0.06);
      }
      else if (refState.gameState === "FLYING") {
        refState.timeElapsed += deltaTime;
        const tSec = refState.timeElapsed / 1000;
        // Same formula as the server (aviatorMultiplierAt): 1.075^(t*1.8)
        const mult = Math.round(Math.pow(1.075, tSec * 1.8) * 100) / 100;

        refState.currentMultiplier = mult;
        setCurrentMultiplier(mult);
        audioRef.current.updateEnginePitch(mult);

        // Simulated Cashouts
        let winDelta = 0;
        refState.simPlayers.forEach(p => {
          if (!p.cashedOut && mult >= p.targetMultiplier) {
            p.cashedOut = true;
            p.winAmount = Math.round(p.betAmount * p.targetMultiplier * 100) / 100;
            winDelta += p.winAmount;
          }
        });
        if (winDelta > 0) {
          refState.roundTotalWin += winDelta;
          setRoundTotalWin(refState.roundTotalWin);
          setSimPlayers([...refState.simPlayers]);
        }

        // Auto Cashout checks
        if (refState.panel1.status === "ACTIVE" && refState.panel1.autoCashout && mult >= refState.panel1.autoMultiplier) {
          cashOutUser("panel-1");
        }
        if (refState.panel2.status === "ACTIVE" && refState.panel2.autoCashout && mult >= refState.panel2.autoMultiplier) {
          cashOutUser("panel-2");
        }

        // Plane position coordinates
        const progress = Math.min(1.0, (mult - 1.0) / 0.50);
        const startX = 0;
        const startY = h;
        const maxFlightX = w * 0.72;
        const maxFlightY = h * 0.35;

        let planeX = startX + (maxFlightX - startX) * progress;
        let planeY = startY - (startY - maxFlightY) * Math.pow(progress, 1.5);
        planeY += Math.sin(now * 0.004) * 6;
        planeX += Math.cos(now * 0.002) * 3;

        let angle = -0.06;
        if (progress >= 0.95) {
          angle = Math.sin(now * 0.003) * 0.02;
        }

        drawCurve(0, h, planeX, planeY);
        drawPlane(planeX, planeY, angle);

        // Crash is signalled by the server sync loop — no local threshold trigger.
      }

      else if (refState.gameState === "CRASHED") {
        refState.timeElapsed += deltaTime;
        const progressAtCrash = Math.min(1.0, (refState.currentMultiplier - 1.0) / 0.50);
        const startX = 0;
        const startY = h;
        const maxFlightX = w * 0.72;
        const maxFlightY = h * 0.35;
        
        const crashStartX = startX + (maxFlightX - startX) * progressAtCrash;
        const crashStartY = startY - (startY - maxFlightY) * Math.pow(progressAtCrash, 1.5);
        
        const crashT = refState.timeElapsed / 1000;
        const planeX = crashStartX + Math.pow(crashT, 1.6) * 450;
        const planeY = crashStartY - Math.pow(crashT, 1.6) * 180;

        drawCurve(0, h, crashStartX, crashStartY);
        if (planeX < w + 50 && planeY > -50) {
          drawPlane(planeX, planeY, -Math.PI / 8);
        }
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [startFlyingRound, startCrashedRound, roundSpeedMultiplier]);

  // Start the waiting round initially
  useEffect(() => {
    startWaitingRound();
    return () => {
      audioRef.current.stopEngine();
    };
  }, [startWaitingRound]);

  // Place Bet
  const placeBetUser = async (panelId: "panel-1" | "panel-2") => {
    audioRef.current.init();
    audioRef.current.playClick();

    const panel = panelId === "panel-1" ? panel1 : panel2;
    if (panel.status !== "NONE") return;

    if (balance < panel.amount) {
      toast.error("Insufficient Balance!");
      return;
    }

    try {
      await reportGameResult({
        betAmount: panel.amount,
        winAmount: 0,
        currency,
        game: "aviator"
      });
      refreshBalance();
    } catch (e) {
      toast.error("Failed to place bet!");
      return;
    }

    const updater = panelId === "panel-1" ? setPanel1 : setPanel2;
    updater(prev => ({ ...prev, status: "PLACED" }));
    toast.success("Bet placed for the next round!");
  };

  // Cancel Bet
  const cancelBetUser = async (panelId: "panel-1" | "panel-2") => {
    audioRef.current.init();
    audioRef.current.playClick();

    const panel = panelId === "panel-1" ? panel1 : panel2;
    if (panel.status !== "PLACED") return;

    try {
      await reportGameResult({
        betAmount: 0,
        winAmount: panel.amount,
        currency,
        game: "aviator"
      });
      refreshBalance();
    } catch (e) {
      toast.error("Refund failed!");
      return;
    }

    const updater = panelId === "panel-1" ? setPanel1 : setPanel2;
    updater(prev => ({ ...prev, status: "NONE" }));
    toast.info("Bet cancelled and refunded.");
  };

  // Cashout User
  const cashOutUser = async (panelId: "panel-1" | "panel-2") => {
    const panel = panelId === "panel-1" ? panel1 : panel2;
    if (stateRef.current.gameState !== "FLYING") return;
    
    const currentStatus = panelId === "panel-1" ? stateRef.current.panel1.status : stateRef.current.panel2.status;
    if (currentStatus !== "ACTIVE") return;

    const mult = stateRef.current.currentMultiplier;
    const winAmt = Math.round(panel.amount * mult * 100) / 100;

    try {
      await reportGameResult({
        betAmount: 0,
        winAmount: winAmt,
        currency,
        game: "aviator"
      });
      refreshBalance();
    } catch (e) {
      toast.error("Failed to process winnings!");
      return;
    }

    const updater = panelId === "panel-1" ? setPanel1 : setPanel2;
    updater(prev => ({ ...prev, status: "CASHED_OUT", winAmount: winAmt }));
    
    audioRef.current.playCashout();
    toast.success(`Cashed Out at ${mult.toFixed(2)}x! Won ${formatMoney(winAmt)}`);
  };

  // Manual Adjustments
  const adjustBet = (panelId: "panel-1" | "panel-2", amountChange: number) => {
    audioRef.current.playClick();
    const updater = panelId === "panel-1" ? setPanel1 : setPanel2;
    updater(prev => {
      if (prev.status !== "NONE") return prev;
      const minVal = currency === "dollar" ? 1 : 10;
      const maxVal = currency === "dollar" ? 1000 : 10000;
      const next = Math.max(minVal, Math.min(maxVal, prev.amount + amountChange));
      return { ...prev, amount: next };
    });
  };

  // Quick select preset values
  const handleQuickPreset = (panelId: "panel-1" | "panel-2", val: number) => {
    audioRef.current.playClick();
    const updater = panelId === "panel-1" ? setPanel1 : setPanel2;
    updater(prev => {
      if (prev.status !== "NONE") return prev;
      return { ...prev, amount: val };
    });
  };

  // Render player rows — real bets only, current user's bet floats to top
  const renderedSidebarBets = useMemo(() => {
    const myName = myNameRef.current;
    const mapped = serverBets.map((b) => {
      const isUser = (b.user || "").toLowerCase() === myName.toLowerCase();
      const cashed = b.cashout != null && b.multiplier != null;
      return {
        name: b.user || "Player",
        isUser,
        betAmount: b.amount,
        cashedOut: cashed,
        winAmount: cashed ? Number(b.cashout) : 0,
        targetMultiplier: cashed ? Number(b.multiplier) : 0,
        avatarIdx: Math.abs((b.user || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % AVATAR_GRADIENTS.length,
      };
    });

    let displayList: any[] = [];
    if (activeSidebarTab === "all-bets") {
      // Own bets on top, then rest
      const mine = mapped.filter(p => p.isUser);
      const others = mapped.filter(p => !p.isUser);
      displayList = [...mine, ...others];
    } else if (activeSidebarTab === "my-bets") {
      displayList = mapped.filter(p => p.isUser);
      // Fallback: if server hasn't caught up yet, show local panel state
      if (displayList.length === 0) {
        if (panel1.status !== "NONE") {
          displayList.push({
            name: "You (Bet 1)",
            isUser: true,
            betAmount: panel1.amount,
            cashedOut: panel1.status === "CASHED_OUT",
            winAmount: panel1.winAmount || 0,
            targetMultiplier: panel1.autoCashout ? panel1.autoMultiplier : 0,
          });
        }
        if (panel2.status !== "NONE") {
          displayList.push({
            name: "You (Bet 2)",
            isUser: true,
            betAmount: panel2.amount,
            cashedOut: panel2.status === "CASHED_OUT",
            winAmount: panel2.winAmount || 0,
            targetMultiplier: panel2.autoCashout ? panel2.autoMultiplier : 0,
          });
        }
      }
    } else if (activeSidebarTab === "top-bets") {
      displayList = [...mapped].filter(p => p.cashedOut).sort((a, b) => b.winAmount - a.winAmount).slice(0, 20);
    }

    return displayList.map((player, idx) => {
      const getBadgeClass = (v: number) => {
        if (v < 2.0) return "low";
        if (v < 10.0) return "mid";
        return "high";
      };

      const isCashed = player.cashedOut;
      const mult = player.targetMultiplier;

      return (
        <div key={idx} className={`bet-row ${isCashed ? "cashed-out" : ""}`} style={player.isUser ? { border: "1px solid rgba(235, 20, 72, 0.4)", backgroundColor: isCashed ? "rgba(44, 186, 66, 0.15)" : "rgba(225, 29, 72, 0.05)" } : {}}>
          <div className="player-info">
            {player.isUser ? (
              <div className="player-avatar" style={{ background: "var(--primary-red)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", fontWeight: "800" }}>U</div>
            ) : (
              <div className="player-avatar" style={{ background: AVATAR_GRADIENTS[player.avatarIdx || 0] }}></div>
            )}
            <span className="player-name" style={player.isUser ? { fontWeight: 700 } : {}}>{player.name}</span>
          </div>
          <div className="bet-val text-center">{currency === "star" ? `★${Math.floor(player.betAmount)}` : `$${player.betAmount}`}</div>
          <div className="bet-mult text-center">
            {isCashed && mult > 0 ? (
              <span className={`multiplier-badge ${getBadgeClass(mult)}`}>{mult.toFixed(2)}x</span>
            ) : "-"}
          </div>
          <div className="win-val text-right">
            {isCashed ? (currency === "star" ? `★${Math.floor(player.winAmount)}` : `$${player.winAmount.toFixed(2)}`) : "-"}
          </div>
        </div>
      );
    });
  }, [activeSidebarTab, serverBets, panel1, panel2, currency]);

  return (
    <div className="aviator-body">
      <div className="app-container">
        
        {/* App Header */}
        <header className="app-header">
          <div className="logo-container">
            <button className="menu-btn" onClick={() => navigate("/")} title="Go Home">
              <ArrowLeft size={20} />
            </button>
            <div className="logo-aviator">
              <span className="logo-text-bold">Aviator Fun</span>
            </div>
          </div>
          
          <div className="header-right">
            <div className="balance-display-container flex items-center gap-1">
              {/* Dollar (USD) Balance */}
              <div 
                className={`balance-display cursor-pointer transition-all ${currency === "dollar" ? "ring-1 ring-[#00a2e8] bg-[#00a2e8]/10" : "bg-slate-900 opacity-60"}`}
                onClick={() => {
                  if (gameState !== "FLYING") {
                    setCurrency("dollar");
                    setPanel1(prev => ({ ...prev, amount: 3 }));
                    setPanel2(prev => ({ ...prev, amount: 3 }));
                  }
                }}
              >
                <span className="balance-amount">${totalDollar.toFixed(2)}</span>
                <span className="balance-currency font-black text-[9px] text-[#00a2e8]">USD</span>
              </div>
              
              {/* INR Balance */}
              <div 
                className={`balance-display cursor-pointer transition-all ${currency === "dollar" ? "ring-1 ring-emerald-500 bg-emerald-500/10 text-emerald-400" : "bg-slate-900 opacity-60 text-emerald-500/70"}`}
                onClick={() => {
                  if (gameState !== "FLYING") {
                    setCurrency("dollar");
                    setPanel1(prev => ({ ...prev, amount: 3 }));
                    setPanel2(prev => ({ ...prev, amount: 3 }));
                  }
                }}
              >
                <span className="balance-amount">₹{(totalDollar * 85).toFixed(2)}</span>
                <span className="balance-currency font-black text-[9px]">INR</span>
              </div>

              {/* Star Balance */}
              <div 
                className={`balance-display cursor-pointer transition-all ${currency === "star" ? "ring-1 ring-amber-500 bg-amber-500/10 text-amber-400" : "bg-slate-900 opacity-60 text-amber-500/70"}`}
                onClick={() => {
                  if (gameState !== "FLYING") {
                    setCurrency("star");
                    setPanel1(prev => ({ ...prev, amount: 30 }));
                    setPanel2(prev => ({ ...prev, amount: 30 }));
                  }
                }}
              >
                <span className="balance-amount">★{Math.floor(totalStar).toLocaleString()}</span>
                <span className="balance-currency font-black text-[9px]">STARS</span>
              </div>
            </div>
            
            <button className={`menu-btn ${!isMuted ? "active-sound" : ""}`} onClick={handleSoundToggle} title="Toggle Sound">
              {!isMuted ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zm-2 15.54l-5-5H3v-6h4l5-5v16zm5-6.77c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M12 4L9.91 6.09L12 8.18M18 12C18 9.97 16.8 8.23 15 7.39V9.61L17.89 12.5C17.96 12.33 18 12.17 18 12M21 12C21 13.5 20.6 14.88 19.9 16.1L21.35 17.55C22.38 15.9 23 13.97 23 12C23 6.94 19.34 2.7 14.5 1.83V3.88C18.23 4.72 21 8.04 21 12M3.12 1.88L1.88 3.12L7.38 8.62L3 13H7L12 18V13.24L16.26 17.5C15.26 18.28 14 18.8 12.63 19V21.05C14.58 20.81 16.36 19.91 17.74 18.62L20.88 21.75L22.12 20.5M12 5.82V10.12L9.26 7.38L12 5.82Z" />
                </svg>
              )}
            </button>
            
            <button className="menu-btn" onClick={() => setIsMenuOpen(true)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Main layout */}
        <div className="main-layout">
          
          {/* Sidebar */}
          <aside className="sidebar-bets">
            <div className="tabs-header">
              <button className={`tab-btn ${activeSidebarTab === "all-bets" ? "active" : ""}`} onClick={() => setActiveSidebarTab("all-bets")}>All Bets</button>
              <button className={`tab-btn ${activeSidebarTab === "my-bets" ? "active" : ""}`} onClick={() => setActiveSidebarTab("my-bets")}>My Bets</button>
              <button className={`tab-btn ${activeSidebarTab === "top-bets" ? "active" : ""}`} onClick={() => setActiveSidebarTab("top-bets")}>Top</button>
            </div>
            
            <div className="bets-stats-header">
              <div className="bets-count">
                <span className="count-value">{simPlayers.length}/{simPlayers.length + 10}</span>
                <span className="count-label">Bets</span>
                <div className="indicator-bar">
                  <div className="indicator-fill" style={{ width: "85%" }}></div>
                </div>
              </div>
              <div className="total-win">
                <span className="win-label">Total win</span>
                <span className="win-value">{currency === "star" ? `★${Math.floor(roundTotalWin).toLocaleString()}` : `$${roundTotalWin.toFixed(2)}`}</span>
              </div>
            </div>
            
            <div className="table-columns-header">
              <span className="col-player">Player</span>
              <span className="col-bet text-center">Bet</span>
              <span className="col-mult text-center">X</span>
              <span className="col-win text-right">Win</span>
            </div>
            
            <div className="bets-list-container scrollbar">
              {renderedSidebarBets}
            </div>
            
            <footer className="sidebar-footer">
              <div className="fair-game">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="#10b981">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                </svg>
                <span>Provably Fair Game</span>
              </div>
              <div className="powered-by">
                Powered by <span>SPRIBE</span>
              </div>
            </footer>
          </aside>

          {/* Main Area */}
          <main className="game-area">
            
            {/* Multipliers History bar */}
            <div className="history-row-container">
              <div className="history-scroll">
                {historyList.slice(0, 18).map((val, idx) => {
                  const getBadgeClass = (v: number) => {
                    if (v < 2.0) return "low";
                    if (v < 10.0) return "mid";
                    return "high";
                  };
                  return (
                    <div key={idx} className={`hist-item ${getBadgeClass(val)}`} onClick={() => toast.info(`Round verified: ${val.toFixed(2)}x`)}>
                      {val.toFixed(2)}x
                    </div>
                  );
                })}
              </div>
              <button className="history-dropdown-btn" onClick={() => setHistoryDropdownOpen(!historyDropdownOpen)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M7 10l5 5 5-5H7z" />
                </svg>
              </button>
              
              <div className={`history-dropdown-panel ${historyDropdownOpen ? "show" : ""}`}>
                <div className="history-dropdown-header">
                  <span>Round History</span>
                  <button id="history-close-btn" onClick={() => setHistoryDropdownOpen(false)}>&times;</button>
                </div>
                <div className="history-dropdown-grid">
                  {historyList.map((val, idx) => {
                    const getBadgeClass = (v: number) => {
                      if (v < 2.0) return "low";
                      if (v < 10.0) return "mid";
                      return "high";
                    };
                    return (
                      <div key={idx} className={`hist-item ${getBadgeClass(val)}`} style={{ padding: "6px", textAlign: "center" }}>
                        {val.toFixed(2)}x
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Graph Canvas Container */}
            <div className="graph-container">
              <div className="fun-mode-banner">FUN MODE</div>
              
              <div className="canvas-wrapper">
                <canvas ref={canvasRef}></canvas>
                
                {/* Multiplier Display Overlay */}
                {gameState === "FLYING" && (
                  <div className="multiplier-overlay">
                    {currentMultiplier.toFixed(2)}x
                  </div>
                )}
                
                {/* Waiting countdown overlay */}
                {gameState === "WAITING" && (
                  <div className="screen-overlay waiting-overlay">
                    <div className="waiting-box">
                      <div className="waiting-title">WAITING FOR NEXT ROUND</div>
                      <div className="progress-ring-container">
                        <div className="countdown-bar-fill" style={{ width: `${(waitingCountdown / 5.0) * 100}%` }}></div>
                      </div>
                      <div className="waiting-subtitle">Starts in {waitingCountdown.toFixed(1)}s</div>
                    </div>
                  </div>
                )}
                
                {/* Crashed Screen overlay */}
                {gameState === "CRASHED" && (
                  <div className="screen-overlay crashed-overlay">
                    <div className="flew-away-text">FLEW AWAY!</div>
                    <div className="flew-away-multiplier">{currentMultiplier.toFixed(2)}x</div>
                  </div>
                )}
                
                {/* Online indicator */}
                <div className="online-indicator">
                  <div className="avatar-stack">
                    <div className="avatar-mini a1"></div>
                    <div className="avatar-mini a2"></div>
                    <div className="avatar-mini a3"></div>
                  </div>
                  <span className="online-count">{(simPlayers.length + 35).toLocaleString()} playing</span>
                </div>
              </div>
            </div>

            {/* Betting Panels */}
            <div className="bet-panels-container">
              
              {/* Betting Panel 1 */}
              <div className="bet-panel" id="panel-1">
                <div className="panel-header-tabs">
                  <button className={`panel-tab-btn ${panel1ActiveTab === "bet" ? "active" : ""}`} onClick={() => setPanel1ActiveTab("bet")}>Bet</button>
                  <button className={`panel-tab-btn ${panel1ActiveTab === "auto" ? "active" : ""}`} onClick={() => setPanel1ActiveTab("auto")}>Auto</button>
                </div>
                
                <div className="panel-body">
                  <div className="control-left">
                    <div className="bet-input-box">
                      <button className="value-change-btn minus" onClick={() => adjustBet("panel-1", currency === "dollar" ? -1 : -10)} disabled={panel1.status !== "NONE"}>&minus;</button>
                      <div className="input-wrapper">
                        <input type="number" readOnly value={panel1.amount} />
                        <span className="input-currency">{currency === "dollar" ? "USD" : "STR"}</span>
                      </div>
                      <button className="value-change-btn plus" onClick={() => adjustBet("panel-1", currency === "dollar" ? 1 : 10)} disabled={panel1.status !== "NONE"}>+</button>
                    </div>
                    <div className="quick-bets-grid">
                      <button className="quick-btn" onClick={() => handleQuickPreset("panel-1", currency === "dollar" ? 5 : 50)} disabled={panel1.status !== "NONE"}>{currency === "dollar" ? "5" : "50"}</button>
                      <button className="quick-btn" onClick={() => handleQuickPreset("panel-1", currency === "dollar" ? 10 : 100)} disabled={panel1.status !== "NONE"}>{currency === "dollar" ? "10" : "100"}</button>
                      <button className="quick-btn" onClick={() => handleQuickPreset("panel-1", currency === "dollar" ? 20 : 250)} disabled={panel1.status !== "NONE"}>{currency === "dollar" ? "20" : "250"}</button>
                      <button className="quick-btn" onClick={() => handleQuickPreset("panel-1", currency === "dollar" ? 50 : 500)} disabled={panel1.status !== "NONE"}>{currency === "dollar" ? "50" : "500"}</button>
                    </div>
                  </div>
                  
                  <div className="control-right">
                    {panel1.status === "NONE" && (
                      <button className="main-bet-btn btn-bet" onClick={() => placeBetUser("panel-1")}>
                        <span className="btn-action-label">BET</span>
                        <span className="btn-value-label">{formatMoney(panel1.amount)}</span>
                      </button>
                    )}
                    {panel1.status === "PLACED" && (
                      <button className="main-bet-btn btn-cancel" onClick={() => cancelBetUser("panel-1")}>
                        <span className="btn-action-label">CANCEL</span>
                        <span className="btn-value-label">{formatMoney(panel1.amount)}</span>
                      </button>
                    )}
                    {panel1.status === "ACTIVE" && (
                      <button className="main-bet-btn btn-cashout" onClick={() => cashOutUser("panel-1")}>
                        <span className="btn-action-label">CASH OUT</span>
                        <span className="btn-value-label">{formatMoney(panel1.amount * currentMultiplier)}</span>
                      </button>
                    )}
                    {panel1.status === "CASHED_OUT" && (
                      <button className="main-bet-btn btn-disabled" disabled>
                        <span className="btn-action-label">WON</span>
                        <span className="btn-value-label">{formatMoney(panel1.winAmount || 0)}</span>
                      </button>
                    )}
                    {panel1.status === "LOST" && (
                      <button className="main-bet-btn btn-disabled" disabled>
                        <span className="btn-action-label">LOST</span>
                        <span className="btn-value-label">{formatMoney(panel1.amount)}</span>
                      </button>
                    )}
                  </div>
                </div>
                
                {panel1ActiveTab === "auto" && (
                  <div className="auto-settings-panel">
                    <div className="auto-row">
                      <span className="auto-label">Auto Cashout</span>
                      <label className="switch-toggle">
                        <input type="checkbox" checked={panel1.autoCashout} onChange={(e) => setPanel1(prev => ({ ...prev, autoCashout: e.target.checked }))} />
                        <span className="slider-round"></span>
                      </label>
                      <div className={`auto-input-box ${!panel1.autoCashout ? "disabled" : ""}`}>
                        <input type="number" step="0.1" min="1.01" max="100" value={panel1.autoMultiplier} onChange={(e) => setPanel1(prev => ({ ...prev, autoMultiplier: parseFloat(e.target.value) || 2.0 }))} disabled={!panel1.autoCashout} />
                        <span className="x-suffix">x</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Betting Panel 2 */}
              <div className={`bet-panel ${panel2Collapsed ? "collapsed" : ""}`} id="panel-2">
                <div className="panel-header-tabs">
                  <button className="panel-tab-btn active" style={panel2Collapsed ? { display: "none" } : {}} onClick={() => setPanel2ActiveTab("bet")}>Bet</button>
                  <button className="panel-tab-btn" style={panel2Collapsed ? { display: "none" } : {}} onClick={() => setPanel2ActiveTab("auto")}>Auto</button>
                  <button className="panel-collapse-btn" onClick={() => setPanel2Collapsed(!panel2Collapsed)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M19 13H5v-2h14v2z" />
                    </svg>
                  </button>
                </div>
                
                <div className="panel-body collapse-target">
                  <div className="control-left">
                    <div className="bet-input-box">
                      <button className="value-change-btn minus" onClick={() => adjustBet("panel-2", currency === "dollar" ? -1 : -10)} disabled={panel2.status !== "NONE"}>&minus;</button>
                      <div className="input-wrapper">
                        <input type="number" readOnly value={panel2.amount} />
                        <span className="input-currency">{currency === "dollar" ? "USD" : "STR"}</span>
                      </div>
                      <button className="value-change-btn plus" onClick={() => adjustBet("panel-2", currency === "dollar" ? 1 : 10)} disabled={panel2.status !== "NONE"}>+</button>
                    </div>
                    <div className="quick-bets-grid">
                      <button className="quick-btn" onClick={() => handleQuickPreset("panel-2", currency === "dollar" ? 5 : 50)} disabled={panel2.status !== "NONE"}>{currency === "dollar" ? "5" : "50"}</button>
                      <button className="quick-btn" onClick={() => handleQuickPreset("panel-2", currency === "dollar" ? 10 : 100)} disabled={panel2.status !== "NONE"}>{currency === "dollar" ? "10" : "100"}</button>
                      <button className="quick-btn" onClick={() => handleQuickPreset("panel-2", currency === "dollar" ? 20 : 250)} disabled={panel2.status !== "NONE"}>{currency === "dollar" ? "20" : "250"}</button>
                      <button className="quick-btn" onClick={() => handleQuickPreset("panel-2", currency === "dollar" ? 50 : 500)} disabled={panel2.status !== "NONE"}>{currency === "dollar" ? "50" : "500"}</button>
                    </div>
                  </div>
                  
                  <div className="control-right">
                    {panel2.status === "NONE" && (
                      <button className="main-bet-btn btn-bet" onClick={() => placeBetUser("panel-2")}>
                        <span className="btn-action-label">BET</span>
                        <span className="btn-value-label">{formatMoney(panel2.amount)}</span>
                      </button>
                    )}
                    {panel2.status === "PLACED" && (
                      <button className="main-bet-btn btn-cancel" onClick={() => cancelBetUser("panel-2")}>
                        <span className="btn-action-label">CANCEL</span>
                        <span className="btn-value-label">{formatMoney(panel2.amount)}</span>
                      </button>
                    )}
                    {panel2.status === "ACTIVE" && (
                      <button className="main-bet-btn btn-cashout" onClick={() => cashOutUser("panel-2")}>
                        <span className="btn-action-label">CASH OUT</span>
                        <span className="btn-value-label">{formatMoney(panel2.amount * currentMultiplier)}</span>
                      </button>
                    )}
                    {panel2.status === "CASHED_OUT" && (
                      <button className="main-bet-btn btn-disabled" disabled>
                        <span className="btn-action-label">WON</span>
                        <span className="btn-value-label">{formatMoney(panel2.winAmount || 0)}</span>
                      </button>
                    )}
                    {panel2.status === "LOST" && (
                      <button className="main-bet-btn btn-disabled" disabled>
                        <span className="btn-action-label">LOST</span>
                        <span className="btn-value-label">{formatMoney(panel2.amount)}</span>
                      </button>
                    )}
                  </div>
                </div>
                
                {panel2ActiveTab === "auto" && !panel2Collapsed && (
                  <div className="auto-settings-panel collapse-target">
                    <div className="auto-row">
                      <span className="auto-label">Auto Cashout</span>
                      <label className="switch-toggle">
                        <input type="checkbox" checked={panel2.autoCashout} onChange={(e) => setPanel2(prev => ({ ...prev, autoCashout: e.target.checked }))} />
                        <span className="slider-round"></span>
                      </label>
                      <div className={`auto-input-box ${!panel2.autoCashout ? "disabled" : ""}`}>
                        <input type="number" step="0.1" min="1.01" max="100" value={panel2.autoMultiplier} onChange={(e) => setPanel2(prev => ({ ...prev, autoMultiplier: parseFloat(e.target.value) || 2.0 }))} disabled={!panel2.autoCashout} />
                        <span className="x-suffix">x</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>

          </main>

        </div>

        {/* Sidebar right menu drawer */}
        <div className={`right-menu-sidebar ${isMenuOpen ? "open" : ""}`}>
          <div className="right-menu-header">
            <span className="right-menu-title">Account Menu</span>
            <button className="right-menu-close" onClick={() => setIsMenuOpen(false)}>&times;</button>
          </div>
          <div className="right-menu-body scrollbar">
            <div className="menu-account-box">
              <span className="menu-account-label">Current Balance</span>
              <span className="menu-account-balance">{currency === "star" ? `★${Math.floor(balance).toLocaleString()}` : `$${balance.toFixed(2)}`}</span>
            </div>
            
            <div className="menu-actions">
              <button className="menu-action-item" onClick={() => { setIsMenuOpen(false); setActiveModal("deposit"); }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#ffffff"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                <span>Add Funds</span>
              </button>
              <button className="menu-action-item" onClick={() => { setIsMenuOpen(false); setActiveModal("withdraw"); }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#ffffff"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                <span>Withdraw Funds</span>
              </button>
              <button className="menu-action-item" onClick={() => { setIsMenuOpen(false); setActiveModal("settings"); }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#ffffff"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                <span>Game Settings</span>
              </button>
              <button className="menu-action-item" onClick={() => {
                if (confirm("Reset local demo balance to $1,000.00 / ★10,000?")) {
                  localStorage.setItem("demo_dollar", "1000");
                  localStorage.setItem("demo_star", "10000");
                  toast.success("Demo wallet reset!");
                  setIsMenuOpen(false);
                }
              }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#ffffff"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                <span>Reset Balance</span>
              </button>
            </div>
          </div>
        </div>

        {/* Menu Backdrop */}
        <div className={`menu-backdrop-overlay ${isMenuOpen || activeModal !== null ? "open" : ""}`} onClick={() => { setIsMenuOpen(false); setActiveModal(null); }}></div>

        {/* Modal: Add Funds */}
        <div className={`menu-modal ${activeModal === "deposit" ? "open" : ""}`}>
          <div className="modal-header">
            <span className="modal-title">Deposit Funds</span>
            <button className="modal-close" onClick={() => setActiveModal(null)}>&times;</button>
          </div>
          <div className="modal-body">
            <span className="modal-desc">Enter amount to add in currency values:</span>
            <div className="modal-input-container">
              <input type="number" min="10" max="100000" value={depositAmount} onChange={(e) => setDepositAmount(parseInt(e.target.value) || 0)} />
              <span className="modal-currency">{currency === "dollar" ? "USD" : "STR"}</span>
            </div>
            <div className="modal-presets">
              <button className="preset-btn" onClick={() => setDepositAmount(p => p + (currency === "dollar" ? 10 : 100))}>+{currency === "dollar" ? "10" : "100"}</button>
              <button className="preset-btn" onClick={() => setDepositAmount(p => p + (currency === "dollar" ? 50 : 500))}>+{currency === "dollar" ? "50" : "500"}</button>
              <button className="preset-btn" onClick={() => setDepositAmount(p => p + (currency === "dollar" ? 100 : 1000))}>+{currency === "dollar" ? "100" : "1000"}</button>
              <button className="preset-btn" onClick={() => setDepositAmount(p => p + (currency === "dollar" ? 500 : 5000))}>+{currency === "dollar" ? "500" : "5000"}</button>
            </div>
            <button className="modal-submit-btn btn-deposit" onClick={handleDepositSubmit}>Deposit</button>
          </div>
        </div>

        {/* Modal: Withdraw */}
        <div className={`menu-modal ${activeModal === "withdraw" ? "open" : ""}`}>
          <div className="modal-header">
            <span className="modal-title">Withdraw Funds</span>
            <button className="modal-close" onClick={() => setActiveModal(null)}>&times;</button>
          </div>
          <div className="modal-body">
            <span className="modal-desc">Enter amount to withdraw:</span>
            <div className="modal-input-container">
              <input type="number" min="10" max="100000" value={withdrawAmount} onChange={(e) => setWithdrawAmount(parseInt(e.target.value) || 0)} />
              <span className="modal-currency">{currency === "dollar" ? "USD" : "STR"}</span>
            </div>
            <div className="modal-presets">
              <button className="preset-btn" onClick={() => setWithdrawAmount(currency === "dollar" ? 10 : 100)}>{currency === "dollar" ? "10" : "100"}</button>
              <button className="preset-btn" onClick={() => setWithdrawAmount(currency === "dollar" ? 50 : 500)}>{currency === "dollar" ? "50" : "500"}</button>
              <button className="preset-btn" onClick={() => setWithdrawAmount(currency === "dollar" ? 100 : 1000)}>{currency === "dollar" ? "100" : "1000"}</button>
              <button className="preset-btn" onClick={() => setWithdrawAmount(Math.floor(balance))}>MAX</button>
            </div>
            <button className="modal-submit-btn btn-withdraw" onClick={handleWithdrawSubmit}>Withdraw</button>
          </div>
        </div>

        {/* Modal: Settings */}
        <div className={`menu-modal ${activeModal === "settings" ? "open" : ""}`}>
          <div className="modal-header">
            <span className="modal-title">Game Settings</span>
            <button className="modal-close" onClick={() => setActiveModal(null)}>&times;</button>
          </div>
          <div className="modal-body">
            <div className="settings-row">
              <div className="settings-text">
                <span className="settings-label">Mute Sounds</span>
                <span className="settings-desc">Disable audio effects and engine Hum</span>
              </div>
              <label className="switch-toggle">
                <input type="checkbox" checked={isMuted} onChange={handleSoundToggle} />
                <span className="slider-round"></span>
              </label>
            </div>
            
            <div className="settings-row">
              <div className="settings-text">
                <span className="settings-label">Auto Refill Balance</span>
                <span className="settings-desc">Refills automatically when empty</span>
              </div>
              <label className="switch-toggle">
                <input type="checkbox" checked={enableAutoRefill} onChange={(e) => setEnableAutoRefill(e.target.checked)} />
                <span className="slider-round"></span>
              </label>
            </div>
            
            <div className="settings-row flex-column">
              <div className="settings-text">
                <span className="settings-label">Round Speed Multiplier</span>
                <span className="settings-desc">Accelerate round simulation speed</span>
              </div>
              <div className="speed-presets">
                <button className={`speed-btn ${roundSpeedMultiplier === 1.0 ? "active" : ""}`} onClick={() => setRoundSpeedMultiplier(1.0)}>1.0x (Normal)</button>
                <button className={`speed-btn ${roundSpeedMultiplier === 1.5 ? "active" : ""}`} onClick={() => setRoundSpeedMultiplier(1.5)}>1.5x (Fast)</button>
                <button className={`speed-btn ${roundSpeedMultiplier === 2.0 ? "active" : ""}`} onClick={() => setRoundSpeedMultiplier(2.0)}>2.0x (Turbo)</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AviatorFunGame;
