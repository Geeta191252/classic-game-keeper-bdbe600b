import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Volume2, VolumeX } from "lucide-react";
import { useBalanceContext } from "@/contexts/BalanceContext";
import { type CurrencyType, reportGameResult } from "@/lib/telegram";
import GameCurrencyChips from "@/components/GameCurrencyChips";
import { GameCurrencyMode } from "@/lib/gameCurrency";
import { toast } from "sonner";
import "./MinesClassicGame.css";

// Web Audio API sound generator
class MinesAudioEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  playClick() {
    this.init();
    if (this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (e) {}
  }

  playStar() {
    this.init();
    if (this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5
      osc.frequency.linearRampToValueAtTime(783.99, this.ctx.currentTime + 0.15); // G5
      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.16);
    } catch (e) {}
  }

  playWin() {
    this.init();
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const playTone = (freq: number, delay: number, duration: number) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + delay);
        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0.08, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + duration);
      };
      playTone(523.25, 0, 0.12);
      playTone(659.25, 0.06, 0.12);
      playTone(783.99, 0.12, 0.35);
    } catch (e) {}
  }

  playLose() {
    this.init();
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(30, now + 0.4);
      
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.exponentialRampToValueAtTime(40, now + 0.4);
      
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.42);
    } catch (e) {}
  }
}

type CellState = "hidden" | "safe" | "mine";
type GamePhase = "betting" | "playing" | "lost" | "cashed";

const MULTIPLIER_TABLE = [
  1.00, 1.03, 1.10, 1.21, 1.36, 1.55, 1.78, 2.05, 2.36, 2.71, 3.10, 3.53, 4.00, 4.51, 5.06, 5.65, 6.28, 6.95, 7.66, 8.41, 9.20, 10.03, 10.90, 11.81, 12.76
];

const CUSTOM_MULTIPLIERS: Record<number, number[]> = {
  3: [1.07, 1.23, 1.41, 1.64, 1.91, 2.25, 2.67, 3.21, 3.9, 4.8, 6, 7.63, 9.93, 13.24, 18.2, 26.01, 39.01, 62.42, 109.25, 218.5, 546.25, 2185],
  4: [1.13, 1.35, 1.64, 2, 2.48, 3.1, 3.92, 5.04, 6.6, 8.8, 12, 16.8, 24.27, 36.41, 57.22, 95.37, 171.67, 343.35, 801, 2403.5, 12017.5],
  5: [1.18, 1.5, 1.91, 2.48, 3.25, 4.34, 5.89, 8.15, 11.55, 16.8, 25.21, 39.21, 63.72, 109.24, 200.29, 400.58, 901.31, 2403.49, 8412.24, 50473.49],
  6: [1.25, 1.66, 2.25, 3.1, 4.34, 6.2, 9.06, 13.59, 21, 33.61, 56.02, 98.04, 364.16, 801.16, 2002.91, 6008.75, 24035, 168245],
  7: [1.31, 1.86, 2.67, 3.92, 5.89, 9.06, 14.34, 23.48, 39.91, 70.96, 133.06, 266.12, 576.59, 1383.83, 3805.54, 12685.13, 57083.12, 456665],
  8: [1.39, 2.09, 3.21, 5.04, 8.15, 13.59, 23.48, 42.26, 79.83, 159.67, 342.15, 798.36, 2075.74, 6227.25, 22833.25, 114166.25, 1027496.25],
  9: [1.47, 2.35, 3.90, 6.36, 10.56, 18.13, 31.24, 55.84, 102.25, 197.28, 403.54, 887.78, 2130.66, 6391.99, 24295.5, 121477.5],
  10: [1.56, 2.66, 4.48, 7.66, 13.51, 24.43, 45.75, 88.76, 180.38, 390.83, 917.92, 2386.58, 7160, 26706.7, 139054],
  11: [1.65, 3.02, 5.15, 9.23, 17.17, 33.46, 66.92, 139.27, 304.4, 712.42, 1781.06, 4955, 15856.1, 63424.7],
  12: [1.74, 3.45, 5.93, 11.1, 21.43, 43.6, 93.17, 213.64, 523.9, 1373.5, 3853.8, 12523.9, 50095.6],
  13: [1.84, 3.94, 6.82, 13.4, 26.74, 57.86, 130.2, 313.5, 822.7, 2331.6, 7757.5, 32383.2],
  14: [1.95, 4.50, 7.83, 16.2, 33.39, 76.13, 178.4, 454.2, 1245.9, 3923.6, 17138.2],
  15: [2.07, 5.15, 9.00, 19.5, 41.8, 99.12, 253.1, 708.6, 2202.5, 9365.5],
  16: [2.20, 5.90, 10.3, 23.5, 52.6, 129.5, 359.8, 1163.2, 4945.3],
  17: [2.34, 6.76, 11.9, 28.3, 66.4, 170.2, 523.9, 2072.4],
  18: [3.39, 13.75, 62.6, 343.1, 2403.5, 24035, 456664],
  19: [3.90, 19, 109.25, 801.16, 8412.25, 168245],
  20: [4.10, 28.5, 218.5, 2403.5, 50473.5],
  21: [5.93, 47.5, 546.25, 12017.5],
  22: [7.91, 95, 2185],
  23: [11.87, 285],
  24: [23.75]
};

const PRESETS_BY_CURRENCY: Record<CurrencyType, number[]> = {
  dollar: [1, 5, 10],
  star: [100, 500, 1000]
};

const MinesClassicGame = () => {
  const navigate = useNavigate();
  const { dollarBalance, starBalance, dollarWinning, starWinning, refreshBalance, currencyDisplay, toggleCurrencyDisplay } = useBalanceContext();
  const [currency, setCurrency] = useState<CurrencyType>("dollar");

  const totalDollar = dollarBalance + dollarWinning;
  const totalStar = starBalance + starWinning;
  const balance = currency === "dollar" ? totalDollar : totalStar;

  // Audio configuration
  const audioRef = useRef(new MinesAudioEngine());
  const [isMuted, setIsMuted] = useState(false);
  const audioUnlockedRef = useRef(false);

  // Betting & Game configuration
  const [betInputStr, setBetInputStr] = useState("1.00");
  const [bombsCount, setBombsCount] = useState(3);
  const [customBombsOpen, setCustomBombsOpen] = useState(false);
  const [customBombsInput, setCustomBombsInput] = useState("3");
  const isRiggedRef = useRef(false);

  const [phase, setPhase] = useState<GamePhase>("betting");
  const [revealedCells, setRevealedCells] = useState<Record<number, CellState>>({});
  const [bombPositions, setBombPositions] = useState<Set<number>>(new Set());
  const [shakingCells, setShakingCells] = useState<Set<number>>(new Set());

  // Multipliers list based on current active bombs
  const multipliersList = useMemo(() => {
    const list = CUSTOM_MULTIPLIERS[bombsCount] || [];
    if (list.length > 0) return list;

    // Fallback multiplier table mapping
    const fallbackList: number[] = [];
    const maxSteps = 25 - bombsCount;
    for (let i = 1; i <= maxSteps; i++) {
      const v = MULTIPLIER_TABLE[i] ? MULTIPLIER_TABLE[i] : Math.pow(1 + i * 0.07, i);
      fallbackList.push(v);
    }
    return fallbackList;
  }, [bombsCount]);

  const safeOpens = useMemo(() => {
    return Object.values(revealedCells).filter(v => v === "safe").length;
  }, [revealedCells]);

  const currentMultiplier = useMemo(() => {
    if (safeOpens === 0) return 1.00;
    return multipliersList[safeOpens - 1] || 1.00;
  }, [safeOpens, multipliersList]);

  // Modal dialog states
  const [showHowModal, setShowHowModal] = useState(false);
  const [showWinModal, setShowWinModal] = useState(false);
  const [cashoutDetails, setCashoutDetails] = useState({ multiplier: "1.00x", winAmount: 0 });

  // Sync bet amount placeholder on currency changes
  useEffect(() => {
    setBetInputStr(currency === "dollar" ? "1.00" : "100");
  }, [currency]);



  const unlockAudio = () => {
    if (audioUnlockedRef.current) return;
    audioRef.current.init();
    audioUnlockedRef.current = true;
  };

  const toggleSound = () => {
    unlockAudio();
    audioRef.current.isMuted = !audioRef.current.isMuted;
    setIsMuted(audioRef.current.isMuted);
  };

  const handleMinBet = () => {
    unlockAudio();
    audioRef.current.playClick();
    setBetInputStr(currency === "dollar" ? "0.10" : "10");
  };

  const handleMaxBet = () => {
    unlockAudio();
    audioRef.current.playClick();
    const maxVal = currency === "dollar" ? 500 : 5000;
    setBetInputStr(Math.min(balance, maxVal).toString());
  };

  const handlePresetSelect = (val: number) => {
    unlockAudio();
    audioRef.current.playClick();
    setBetInputStr(val.toString());
  };

  const handleBombPresetSelect = (count: number) => {
    unlockAudio();
    audioRef.current.playClick();
    if (phase !== "betting") return;
    setBombsCount(count);
    setCustomBombsOpen(false);
  };

  const handleCustomBombChange = (valStr: string) => {
    setCustomBombsInput(valStr);
    const parsed = parseInt(valStr);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 24) {
      setBombsCount(parsed);
    }
  };

  // Start Mines Classic game
  const startGame = async () => {
    unlockAudio();
    audioRef.current.playClick();

    if (phase !== "betting") return;

    // Fetch rigging setting from backend
    try {
      const rigRes = await fetch("/api/game/rig");
      const rigData = await rigRes.json();
      isRiggedRef.current = rigData.rigged === true;
    } catch (e) {
      isRiggedRef.current = false;
    }

    const parsedBet = parseFloat(betInputStr) || 0;
    const minLimit = currency === "dollar" ? 0.1 : 10;
    const maxLimit = currency === "dollar" ? 1000 : 10000;

    if (parsedBet < minLimit) {
      toast.error(`Minimum bet is ${currency === "dollar" ? "$0.10" : "10 Stars"}`);
      return;
    }
    if (parsedBet > maxLimit) {
      toast.error(`Maximum bet is ${currency === "dollar" ? "$1,000" : "10,000 Stars"}`);
      return;
    }
    if (parsedBet > balance) {
      toast.error("Insufficient Balance!");
      return;
    }

    // Deduct Stake
    try {
      await reportGameResult({
        betAmount: parsedBet,
        winAmount: 0,
        currency,
        game: "mines_classic"
      });
      refreshBalance();
    } catch (e) {
      toast.error("Connection failed, please try again.");
      return;
    }

    // Generate random bomb index positions upfront
    const positions = new Set<number>();
    while (positions.size < bombsCount) {
      const randIdx = Math.floor(Math.random() * 25);
      positions.add(randIdx);
    }

    setBombPositions(positions);
    setRevealedCells({});
    setShakingCells(new Set());
    setPhase("playing");
  };

  // Click on a cell in the grid
  const handleCellClick = (cellIdx: number) => {
    unlockAudio();
    if (phase !== "playing") return;
    if (revealedCells[cellIdx]) return; // already clicked

    // Play initial cell reveal tick
    audioRef.current.playClick();
    
    // Add shake animation
    setShakingCells(prev => new Set([...prev, cellIdx]));

    setTimeout(() => {
      setShakingCells(prev => {
        const next = new Set(prev);
        next.delete(cellIdx);
        return next;
      });

      if (isRiggedRef.current) {
        // Force this clicked cell to be a bomb
        const nextPositions = new Set(bombPositions);
        nextPositions.add(cellIdx);
        setBombPositions(nextPositions);
        handleExplodedCell(cellIdx);
      } else if (bombPositions.has(cellIdx)) {
        // Exploded!
        handleExplodedCell(cellIdx);
      } else {
        // Safe!
        handleSafeCell(cellIdx);
      }
    }, 400);
  };

  // Exploded cell sequence
  const handleExplodedCell = (idx: number) => {
    audioRef.current.playLose();
    setPhase("lost");

    // Reveal all mines (bomb positions) and safe cells
    const finalReveals: Record<number, CellState> = {};
    for (let i = 0; i < 25; i++) {
      if (bombPositions.has(i)) {
        finalReveals[i] = "mine";
      } else {
        finalReveals[i] = "safe";
      }
    }
    setRevealedCells(finalReveals);

    // Reset back to bet layout after 2.2 seconds
    setTimeout(() => {
      setPhase("betting");
      setRevealedCells({});
      setBombPositions(new Set());
      refreshBalance();
    }, 2200);
  };

  // Safe cell revealed sequence
  const handleSafeCell = (idx: number) => {
    audioRef.current.playStar();
    
    const nextRevealed = { ...revealedCells, [idx]: "safe" as CellState };
    setRevealedCells(nextRevealed);

    // If successfully clicked all safe cells, trigger auto-cashout victory
    const revealedCount = Object.keys(nextRevealed).length;
    if (revealedCount === 25 - bombsCount) {
      const maxMult = multipliersList[multipliersList.length - 1];
      const parsedBet = parseFloat(betInputStr) || 0;
      handleWinCashout(maxMult.toFixed(2) + "x", parsedBet * maxMult);
    }
  };

  // Trigger cashout to collect winnings
  const triggerCashout = () => {
    unlockAudio();
    audioRef.current.playClick();

    if (phase !== "playing" || safeOpens === 0) return;

    const parsedBet = parseFloat(betInputStr) || 0;
    const finalWin = parsedBet * currentMultiplier;

    handleWinCashout(currentMultiplier.toFixed(2) + "x", finalWin);
  };

  // Cashout sequence success
  const handleWinCashout = async (multStr: string, winAmt: number) => {
    setPhase("cashed");
    audioRef.current.playWin();

    try {
      await reportGameResult({
        betAmount: 0, // already deducted
        winAmount: winAmt,
        currency,
        game: "mines_classic"
      });
      refreshBalance();
    } catch (e) {
      toast.error("Failed to credit winnings!");
    }

    setCashoutDetails({ multiplier: multStr, winAmount: winAmt });
    setShowWinModal(true);

    // Auto-reveal all remaining positions
    const finalReveals: Record<number, CellState> = {};
    for (let i = 0; i < 25; i++) {
      if (bombPositions.has(i)) {
        finalReveals[i] = "mine";
      } else {
        finalReveals[i] = "safe";
      }
    }
    setRevealedCells(finalReveals);
  };

  // Collect winnings and restore betting
  const closeWinModal = () => {
    unlockAudio();
    audioRef.current.playClick();
    setShowWinModal(false);
    setPhase("betting");
    setRevealedCells({});
    setBombPositions(new Set());
    refreshBalance();
  };

  return (
    <div className="mines-classic-body">
      
      {/* App Header */}
      <header className="app-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate("/")} title="Go Back">
            <ArrowLeft size={22} />
          </button>
          <span className="logo-title">Mines Classic</span>
        </div>

        <div className="header-right flex items-center gap-1.5">
          {/* Dollar (USD) Balance */}
          <div 
            className={`balance-display cursor-pointer transition-all ${currency === "dollar" ? "ring-1 ring-[#00a2e8] bg-[#00a2e8]/10" : "bg-slate-900 opacity-60"}`}
            onClick={() => {
              if (phase === "betting") {
                setCurrency("dollar");
              }
            }}
          >
            <span className="text-[#00a2e8] font-bold">$</span>
            <span>{totalDollar.toFixed(2)}</span>
          </div>
          
          {/* INR Balance */}
          <div 
            className={`balance-display cursor-pointer transition-all ${currency === "dollar" ? "ring-1 ring-emerald-500 bg-emerald-500/10 text-emerald-400" : "bg-slate-900 opacity-60 text-emerald-500/70"}`}
            onClick={() => {
              if (phase === "betting") {
                setCurrency("dollar");
              }
            }}
          >
            <span className="text-emerald-400 font-bold">₹</span>
            <span>{(totalDollar * 85).toFixed(2)}</span>
          </div>

          {/* Star Balance */}
          <div 
            className={`balance-display cursor-pointer transition-all ${currency === "star" ? "ring-1 ring-amber-500 bg-amber-500/10 text-amber-400" : "bg-slate-900 opacity-60 text-amber-500/70"}`}
            onClick={() => {
              if (phase === "betting") {
                setCurrency("star");
              }
            }}
          >
            <span className="text-amber-400 font-bold">★</span>
            <span>{Math.floor(totalStar).toLocaleString()}</span>
          </div>

          <button className="menu-btn" onClick={() => setShowHowModal(true)} title="Rules / Guide">
            <BookOpen size={16} />
          </button>

          <button className="menu-btn" onClick={toggleSound} title="Mute/Unmute">
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </header>

      {/* Multipliers progression row at the top */}
      <div className="multipliers-container hide-scrollbar">
        {multipliersList.map((mult, idx) => {
          const stepNum = idx + 1;
          const isActive = stepNum <= safeOpens;
          return (
            <div key={idx} className="flex items-center gap-2">
              <div className={`multiplier-step ${isActive ? "active" : ""}`}>
                x{mult.toFixed(2)}
              </div>
              {idx < multipliersList.length - 1 && (
                <span className="arrow-indicator">&#9656;</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 5x5 Grid Board Wrapper */}
      <div className="grid-wrapper">
        <div className="mines-grid">
          {[...Array(25)].map((_, idx) => {
            const isRevealed = revealedCells[idx] !== undefined;
            const cellState = revealedCells[idx];
            const isShaking = shakingCells.has(idx);

            let cellClass = "";
            let emojiContent = "";

            if (isRevealed) {
              cellClass = cellState === "mine" ? "revealed mine-bomb" : "revealed mine-safe";
              emojiContent = cellState === "mine" ? "💣" : "⭐";
            }

            return (
              <div 
                key={idx} 
                className={`grid-cell ${cellClass} ${isShaking ? "shake" : ""} ${phase !== "playing" ? "disabled" : ""}`}
                onClick={() => handleCellClick(idx)}
              >
                {isRevealed ? (
                  <span className="mine-icon pop">{emojiContent}</span>
                ) : (
                  <span>?</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Control betting configuration panel */}
      <div className="control-card">
        
        {/* Bet value slider box */}
        <div className="control-label">Bet Amount</div>
        <div className="input-wrapper">
          <button className="minmax-btn" onClick={handleMinBet} disabled={phase !== "betting"}>MIN</button>
          <input 
            type="number"
            className="bet-input"
            step={currency === "dollar" ? "0.10" : "10"}
            min={currency === "dollar" ? "0.10" : "10"}
            value={betInputStr}
            onChange={(e) => setBetInputStr(e.target.value)}
            disabled={phase !== "betting"}
          />
          <button className="minmax-btn" onClick={handleMaxBet} disabled={phase !== "betting"}>MAX</button>
        </div>

        {/* Quick select presets */}
        <div className="presets-row">
          {PRESETS_BY_CURRENCY[currency].map(val => (
            <button 
              key={val} 
              className="preset-btn" 
              onClick={() => handlePresetSelect(val)}
              disabled={phase !== "betting"}
            >
              {currency === "dollar" ? `$${val}` : val}
            </button>
          ))}
        </div>

        {/* Bombs selection count */}
        <div className="control-label">Number Of Bombs</div>
        <div className="bombs-selector">
          {[3, 5, 10, 15].map(cnt => (
            <button 
              key={cnt}
              className={`bomb-btn ${bombsCount === cnt && !customBombsOpen ? "active" : ""} ${phase !== "betting" ? "disabled" : ""}`}
              onClick={() => handleBombPresetSelect(cnt)}
              disabled={phase !== "betting"}
            >
              {cnt}
            </button>
          ))}
          {customBombsOpen ? (
            <input 
              type="number"
              className="custom-bomb-input"
              min="1"
              max="24"
              value={customBombsInput}
              onChange={(e) => handleCustomBombChange(e.target.value)}
              onBlur={() => setCustomBombsOpen(false)}
              autoFocus
            />
          ) : (
            <button 
              className={`bomb-btn ${![3, 5, 10, 15].includes(bombsCount) || customBombsOpen ? "active" : ""} ${phase !== "betting" ? "disabled" : ""}`}
              onClick={() => {
                if (phase === "betting") {
                  setCustomBombsOpen(true);
                }
              }}
              disabled={phase !== "betting"}
            >
              {![3, 5, 10, 15].includes(bombsCount) ? bombsCount : "✎"}
            </button>
          )}
        </div>

        {/* Main Action Trigger */}
        {phase === "betting" ? (
          <button className="play-action-btn play" onClick={startGame}>
            Play
          </button>
        ) : (
          <button 
            className="play-action-btn cashout" 
            onClick={triggerCashout}
            disabled={safeOpens === 0 || phase !== "playing"}
          >
            Cashout {safeOpens > 0 && `(${(parseFloat(betInputStr) * currentMultiplier).toFixed(2)})`}
          </button>
        )}

      </div>

      {/* Rules / How Modal Overlay */}
      {showHowModal && (
        <div className="modal-backdrop" onClick={() => setShowHowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowHowModal(false)}>&times;</button>
            <div className="modal-title">How to Play?</div>
            <div className="modal-content">
              <ol>
                <li>Choose the risk level by selecting the number of bombs. More bombs result in higher progressive multipliers!</li>
                <li>Enter your stake amount and click <strong>Play</strong> to lock in your bet.</li>
                <li>Tap on cells in the 5x5 grid to reveal them. Finding a <strong>⭐ (Star)</strong> increases your winnings multiplier.</li>
                <li>If you hit a <strong>💣 (Bomb)</strong>, the game ends instantly and your bet is lost.</li>
                <li>Click <strong>Cashout</strong> at any step to collect your accumulated winnings and secure your profit!</li>
              </ol>
            </div>
            <button className="ok-btn" onClick={() => setShowHowModal(false)}>OK</button>
          </div>
        </div>
      )}

      {/* Cashout Celebration Overlay */}
      {showWinModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="celebration-emoji">🎉</div>
            <div className="modal-title">CASHOUT SUCCESS!</div>
            <div className="cashout-sub">You secured winnings at multiplier:</div>
            <div className="cashout-mult">x{cashoutDetails.multiplier}</div>
            <div className="cashout-sub">Winnings Collected:</div>
            <div className="cashout-winnings">
              {currency === "dollar" ? `$${cashoutDetails.winAmount.toFixed(2)}` : `★${Math.floor(cashoutDetails.winAmount).toLocaleString()}`}
            </div>
            <button className="ok-btn" style={{ background: "#10B981" }} onClick={closeWinModal}>
              Collect
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default MinesClassicGame;
