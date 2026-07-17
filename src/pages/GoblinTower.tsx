import { useEffect, useRef, useState, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBalanceContext } from "@/contexts/BalanceContext";
import { type CurrencyType, reportGameResult } from "@/lib/telegram";
import GameCurrencyChips from "@/components/GameCurrencyChips";
import { GameCurrencyMode } from "@/lib/gameCurrency";
import { toast } from "sonner";
import "./GoblinTower.css";

// Multipliers configuration
const MULTIPLIERS = {
  easy: [1.12, 1.40, 1.75, 2.19, 2.73, 3.42, 4.27, 5.34, 6.67, 8.34, 10.42],
  low: [1.60, 2.56, 4.10, 6.55, 10.49, 16.78, 26.84, 42.95, 68.72, 109.95, 175.92],
  medium: [2.40, 5.76, 13.82, 33.18, 79.63, 191.10, 458.65, 1100.75, 2641.80, 6340.33, 15216.79],
  high: [4.80, 23.04, 110.59, 530.84, 2548.04, 12230.59, 58706.84, 281792.84, 1352605.65, 6492507.13, 31164034.21]
};

const PRESETS_BY_CURRENCY = {
  dollar: [1, 3, 5, 10, 20, 50, 100],
  star: [10, 25, 50, 100, 250, 500, 1000]
};

// Web Audio API Sound Engine
class GoblinAudioEngine {
  ctx: AudioContext | null = null;
  soundEnabled = true;

  init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    } catch (e) {
      console.warn("Failed to initialize AudioContext", e);
    }
  }

  toggleSound(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  playBet() {
    this.init();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playCoin() {
    this.init();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1760, now + 0.05);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playExplosion() {
    this.init();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(800, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(10, now + 0.4);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
    
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    
    noise.start(now);
    noise.stop(now + 0.4);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playCashout() {
    this.init();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    
    notes.forEach((freq, index) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const noteTime = now + (index * 0.08);
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, noteTime);
      
      gain.gain.setValueAtTime(0.15, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.01, noteTime + 0.15);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(noteTime);
      osc.stop(noteTime + 0.15);
    });
  }
}

type DifficultyType = "easy" | "low" | "medium" | "high";
type CrateStateType = null | "safe" | "goblin" | "unrevealed-safe" | "unrevealed-goblin";

const GoblinTower = () => {
  const navigate = useNavigate();
  const { dollarBalance, starBalance, dollarWinning, starWinning, refreshBalance, currencyDisplay, toggleCurrencyDisplay } = useBalanceContext();
  const [currency, setCurrency] = useState<CurrencyType>("dollar");
  const [currencyMode, setCurrencyMode] = useState<GameCurrencyMode>("USD");
  useEffect(() => {
    const newC = currencyMode === "STAR" ? "star" : "dollar";
    setCurrency(newC);
    setBet(newC === "star" ? 30 : 3);
  }, [currencyMode]);

  // States
  const [bet, setBet] = useState(3);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(0); // 0 to 10
  const [difficulty, setDifficulty] = useState<DifficultyType>("easy");
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isRiggedRef = useRef(false);

  // Modal / Toast overlay
  const [overlay, setOverlay] = useState<{
    open: boolean;
    title: string;
    text: string;
    isWin: boolean;
  }>({
    open: false,
    title: "",
    text: "",
    isWin: false
  });

  // Stats
  const [stats, setStats] = useState({ bets: 0, won: 0 });

  // Grid states
  // 10 rows, 5 columns: gridLayouts[row][col] is true if it contains a goblin
  const [gridLayouts, setGridLayouts] = useState<boolean[][]>([]);
  const [revealedGrid, setRevealedGrid] = useState<CrateStateType[][]>(
    Array(10).fill(null).map(() => Array(5).fill(null))
  );

  const audioRef = useRef<GoblinAudioEngine>(new GoblinAudioEngine());

  const totalDollar = dollarBalance + dollarWinning;
  const totalStar = starBalance + starWinning;
  const balance = currency === "dollar" ? totalDollar : totalStar;

  // Set initial settings from localStorage if available
  useEffect(() => {
    const savedDiff = localStorage.getItem("goblin_difficulty") as DifficultyType;
    if (savedDiff && ["easy", "low", "medium", "high"].includes(savedDiff)) {
      setDifficulty(savedDiff);
    }
    const savedStats = localStorage.getItem("goblin_stats");
    if (savedStats) {
      try {
        setStats(JSON.parse(savedStats));
      } catch (e) {}
    }
  }, []);

  // Sync stats to localstorage
  const saveStatsToStorage = (newStats: { bets: number; won: number }) => {
    localStorage.setItem("goblin_stats", JSON.stringify(newStats));
  };

  const currentMults = useMemo(() => MULTIPLIERS[difficulty], [difficulty]);

  // Handle Bet Action Button (BET or CASH OUT)
  const handleBetAction = async () => {
    audioRef.current.init();
    if (isPlaying) {
      // Cash out
      cashOut();
    } else {
      // Start game
      try {
        const rigRes = await fetch("/api/game/rig");
        const rigData = await rigRes.json();
        isRiggedRef.current = rigData.rigged === true;
      } catch (e) {
        isRiggedRef.current = false;
      }

      if (balance < bet) {
        toast.error("Insufficient Balance!");
        return;
      }

      try {
        await reportGameResult({
          betAmount: bet,
          winAmount: 0,
          currency,
          game: "goblin_tower"
        });
        refreshBalance();
      } catch (e) {
        toast.error("Failed to place bet. Please try again.");
        return;
      }

      // Play start sound
      audioRef.current.playBet();

      // Stats increment
      const nextStats = { ...stats, bets: stats.bets + 1 };
      setStats(nextStats);
      saveStatsToStorage(nextStats);

      // Generate grid layouts
      // easy: 1 goblin, 4 safe
      // low: 2 goblins, 3 safe
      // medium: 3 goblins, 2 safe
      // high: 4 goblins, 1 safe
      let goblinCount = 1;
      if (difficulty === "low") goblinCount = 2;
      if (difficulty === "medium") goblinCount = 3;
      if (difficulty === "high") goblinCount = 4;

      const layouts: boolean[][] = [];
      for (let r = 0; r < 10; r++) {
        const row = [false, false, false, false, false];
        let placed = 0;
        while (placed < goblinCount) {
          const idx = Math.floor(Math.random() * 5);
          if (!row[idx]) {
            row[idx] = true;
            placed++;
          }
        }
        layouts.push(row);
      }

      setGridLayouts(layouts);
      setRevealedGrid(Array(10).fill(null).map(() => Array(5).fill(null)));
      setCurrentLevel(0);
      setIsPlaying(true);
    }
  };

  // Crate clicks
  const handleCrateClick = (row: number, col: number) => {
    if (!isPlaying) return;
    if (row !== currentLevel) return;

    const isGoblin = isRiggedRef.current ? true : gridLayouts[row][col];
    const newRevealed = revealedGrid.map((r, rIdx) =>
      r.map((cell, cIdx) => {
        if (rIdx === row && cIdx === col) {
          return isGoblin ? "goblin" : "safe";
        }
        return cell;
      })
    );

    setRevealedGrid(newRevealed);

    if (isGoblin) {
      // Hit bomb / goblin
      audioRef.current.playExplosion();
      handleLoss(row, col, newRevealed);
    } else {
      // Safe crate hit
      audioRef.current.playCoin();
      handleSuccess(row, newRevealed);
    }
  };

  // Safe Hit
  const handleSuccess = async (row: number, currentRevealed: CrateStateType[][]) => {
    const nextLevel = currentLevel + 1;
    setCurrentLevel(nextLevel);

    const mult = currentMults[row];
    const potentialWin = bet * mult;

    if (nextLevel === 10) {
      // Reached top! Auto cash out
      setIsPlaying(false);
      
      try {
        await reportGameResult({
          betAmount: 0,
          winAmount: potentialWin,
          currency,
          game: "goblin_tower"
        });
        refreshBalance();
      } catch (e) {
        toast.error("Auto cashout failed, please try refreshing.");
      }

      // Stats
      const nextStats = { ...stats, won: stats.won + potentialWin };
      setStats(nextStats);
      saveStatsToStorage(nextStats);

      audioRef.current.playCashout();
      revealBoard(-1, currentRevealed);
      
      setOverlay({
        open: true,
        title: "CONGRATULATIONS!",
        text: `You successfully climbed the Goblin Tower and won ${currency === "star" ? "★" : "$"}${potentialWin.toFixed(2)}!`,
        isWin: true
      });
    }
  };

  // Loss
  const handleLoss = (hitRow: number, hitCol: number, currentRevealed: CrateStateType[][]) => {
    setIsPlaying(false);
    revealBoard(hitRow, currentRevealed);

    setOverlay({
      open: true,
      title: "YOU HIT A GOBLIN!",
      text: `You lost your bet of ${currency === "star" ? "★" : "$"}${bet.toFixed(2)}.`,
      isWin: false
    });
  };

  // Manual Cashout
  const cashOut = async () => {
    if (!isPlaying || currentLevel === 0) return;

    const mult = currentMults[currentLevel - 1];
    const winVal = bet * mult;

    setIsPlaying(false);

      try {
        await reportGameResult({
          betAmount: 0,
          winAmount: winVal,
          currency,
          game: "goblin_tower"
        });
        refreshBalance();
      } catch (e) {
        toast.error("Cashout failed. Please try again.");
        return;
      }

    // Stats
    const nextStats = { ...stats, won: stats.won + winVal };
    setStats(nextStats);
    saveStatsToStorage(nextStats);

    audioRef.current.playCashout();
    revealBoard(-1, revealedGrid);

    setOverlay({
      open: true,
      title: "CASHED OUT!",
      text: `You won ${currency === "star" ? "★" : "$"}${winVal.toFixed(2)} (x${mult.toFixed(2)})`,
      isWin: true
    });
  };

  // Reveal entire board at game end
  const revealBoard = (hitRow: number, currentRevealed: CrateStateType[][]) => {
    const finalGrid = currentRevealed.map((r, rIdx) =>
      r.map((cell, cIdx) => {
        // Skip the one that exploded or was opened
        if (cell === "goblin" || cell === "safe") return cell;
        
        const hasGoblin = gridLayouts[rIdx][cIdx];
        return hasGoblin ? "unrevealed-goblin" : "unrevealed-safe";
      })
    );
    setRevealedGrid(finalGrid);
  };

  const adjustBet = (amt: number) => {
    if (isPlaying) return;
    setBet(prev => Math.max(1, Math.min(currency === "dollar" ? 1000 : 10000, prev + amt)));
  };

  const handleDifficultySelect = (diff: DifficultyType) => {
    if (isPlaying) return;
    setDifficulty(diff);
    localStorage.setItem("goblin_difficulty", diff);
    setIsDiffOpen(false);
  };

  const handleReset = () => {
    localStorage.setItem("demo_dollar", "1000");
    localStorage.setItem("demo_star", "10000");
    const zeroStats = { bets: 0, won: 0 };
    setStats(zeroStats);
    saveStatsToStorage(zeroStats);
    setIsMenuOpen(false);
    toast.success("Game progress & balances reset!");
  };

  // Scroll active multiplier & row into view
  useEffect(() => {
    if (isPlaying) {
      const activeMultEl = document.getElementById(`mult-${currentLevel}`);
      if (activeMultEl) {
        activeMultEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
      const activeRowEl = document.getElementById(`row-${currentLevel}`);
      if (activeRowEl) {
        activeRowEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [currentLevel, isPlaying]);

  return (
    <div className="goblin-body">
      <div className="web-wrapper" onClick={() => setIsDiffOpen(false)}>
        <div className="mobile-viewport">
          
          {/* Header */}
          <header className="game-header">
            <div className="logo">
              <button 
                onClick={() => navigate(-1)} 
                className="h-8 w-8 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-white active:scale-95 transition"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span>GOBLIN TOWER</span>
            </div>

            <div className="header-right flex items-center gap-1">
              <GameCurrencyChips mode={currencyMode} onChange={setCurrencyMode} disabled={isPlaying} />

              {/* Hamburger Menu Toggle */}
              <button className="menu-btn" onClick={(e) => { e.stopPropagation(); setIsMenuOpen(true); }}>
                <span className="menu-line"></span>
                <span className="menu-line"></span>
                <span className="menu-line"></span>
              </button>
            </div>
          </header>

          {/* Main Game Area */}
          <main className="game-area">
            
            {/* Wooden Board Container */}
            <div className="board-container">
              
              {/* Multipliers horizontal list */}
              <div className="multipliers-bar">
                {currentMults.slice(0, 10).map((multVal, levelIdx) => (
                  <div
                    key={levelIdx}
                    id={`mult-${levelIdx}`}
                    className={`multiplier-box ${levelIdx === currentLevel && isPlaying ? "active-mult" : ""}`}
                  >
                    <span className="mult-val">x{multVal.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Grid 10x5 of crates */}
              <div className="grid-container">
                {Array(10).fill(null).map((_, rIdx) => {
                  // Draw from top (9) to bottom (0)
                  const actualRowIndex = 9 - rIdx;
                  const isActiveRow = actualRowIndex === currentLevel && isPlaying;
                  const isCompletedRow = actualRowIndex < currentLevel && isPlaying;
                  
                  return (
                    <div
                      key={actualRowIndex}
                      id={`row-${actualRowIndex}`}
                      className={`grid-row ${isActiveRow ? "active-row" : ""} ${isCompletedRow ? "completed-row" : ""}`}
                    >
                      {Array(5).fill(null).map((_, colIndex) => {
                        const crateState = revealedGrid[actualRowIndex][colIndex];
                        let crateClass = "";
                        let innerContent = null;

                        if (crateState === "safe") {
                          crateClass = "safe-crate";
                          innerContent = <img src="/images/goblin/coin.png" alt="Coin" />;
                        } else if (crateState === "goblin") {
                          crateClass = "goblin-crate";
                          innerContent = <img src="/images/goblin/bomb.png" alt="Bomb" />;
                        } else if (crateState === "unrevealed-safe") {
                          crateClass = "unrevealed-safe";
                          innerContent = <img src="/images/goblin/coin.png" alt="Coin" />;
                        } else if (crateState === "unrevealed-goblin") {
                          crateClass = "unrevealed-goblin";
                          innerContent = <img src="/images/goblin/bomb.png" alt="Bomb" />;
                        }

                        return (
                          <div
                            key={colIndex}
                            className={`crate ${crateClass}`}
                            onClick={() => handleCrateClick(actualRowIndex, colIndex)}
                          >
                            <div 
                              className="crate-content"
                              style={crateState ? { opacity: crateState.startsWith("unrevealed") ? 0.6 : 1, transform: "scale(1)" } : {}}
                            >
                              {innerContent}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Betting Controls Panel */}
              <div className="controls-panel">
                <div className="bet-input-row-screenshot">
                  <button className="bet-adjust-btn-screenshot" onClick={() => adjustBet(currency === "dollar" ? -1 : -10)} disabled={isPlaying}>Min</button>
                  <div className="bet-value-display">
                    <span className="bet-number-input-screenshot">{currency === "dollar" ? `${bet.toFixed(2)}` : `${bet}`}</span>
                  </div>
                  <button className="bet-adjust-btn-screenshot" onClick={() => adjustBet(currency === "dollar" ? 1 : 10)} disabled={isPlaying}>Max</button>
                </div>

                {/* Bet / Cashout Main Action Button */}
                <button
                  className={`bet-action-btn-screenshot ${isPlaying && currentLevel > 0 ? "cashout-mode" : ""}`}
                  onClick={handleBetAction}
                  disabled={isPlaying && currentLevel === 0}
                >
                  {!isPlaying ? "BET" : currentLevel === 0 ? "CHOOSE A CRATE" : `CASH OUT ${currency === "star" ? "★" : "$"}${(bet * currentMults[currentLevel - 1]).toFixed(2)}`}
                </button>

                {/* Difficulty selector dropdown */}
                <div className={`dropdown-container ${isDiffOpen ? "open" : ""}`}>
                  <div 
                    className="dropdown-trigger" 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isPlaying) setIsDiffOpen(!isDiffOpen);
                    }}
                    style={isPlaying ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                  >
                    <span>{difficulty.toUpperCase()}</span>
                    <span className="chevron-icon">&#9662;</span>
                  </div>
                  <div className="dropdown-options" onClick={(e) => e.stopPropagation()}>
                    <div className="dropdown-option" onClick={() => handleDifficultySelect("easy")}>EASY (1 Goblin)</div>
                    <div className="dropdown-option" onClick={() => handleDifficultySelect("low")}>LOW (2 Goblins)</div>
                    <div className="dropdown-option" onClick={() => handleDifficultySelect("medium")}>MEDIUM (3 Goblins)</div>
                    <div className="dropdown-option" onClick={() => handleDifficultySelect("high")}>HIGH (4 Goblins)</div>
                  </div>
                </div>

              </div>
            </div>
          </main>

          {/* Sidebar Menu Modal */}
          <div className={`menu-modal ${isMenuOpen ? "open" : ""}`} onClick={() => setIsMenuOpen(false)}>
            <div className="menu-content" onClick={(e) => e.stopPropagation()}>
              <button className="close-menu" onClick={() => setIsMenuOpen(false)}>&times;</button>
              <h2>Goblin Tower</h2>
              <p className="rules-text">
                Climb the goblin tower to secure massive rewards! 
                Start from the bottom row and select a crate.
                Avoid Goblins to keep climbing, or cash out early to bank your winnings!
              </p>
              <hr />
              <div className="stats-container">
                <div className="stat-item">
                  <span className="stat-label">Total Bets:</span>
                  <span className="stat-value">{stats.bets}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Won:</span>
                  <span className="stat-value">{currency === "star" ? "★" : "$"}{stats.won.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Win/Loss Toast Overlay Alert */}
          <div className={`game-overlay ${overlay.open ? "open" : ""}`}>
            <div className="overlay-card" style={overlay.isWin ? { borderColor: "#81c784" } : { borderColor: "#e57373" }}>
              <h3 id="overlay-title" style={overlay.isWin ? { color: "#81c784" } : { color: "#e57373" }}>{overlay.title}</h3>
              <p id="overlay-text">{overlay.text}</p>
              <button 
                className="overlay-close-btn" 
                onClick={() => setOverlay({ ...overlay, open: false })}
                style={overlay.isWin ? { backgroundColor: "#9ccc3c" } : { backgroundColor: "#d32f2f", color: "white" }}
              >
                Next Round
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default GoblinTower;
