import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Volume2, VolumeX } from "lucide-react";
import { useBalanceContext } from "@/contexts/BalanceContext";
import { type CurrencyType, reportGameResult } from "@/lib/telegram";
import GameCurrencyChips from "@/components/GameCurrencyChips";
import { GameCurrencyMode, toNativeAmount, currencySymbol } from "@/lib/gameCurrency";
import { toast } from "sonner";
import "./ChickenClassicGame.css";

// Web Audio API Sound Synthesizer
class ChickenAudioEngine {
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
      
      osc.type = "triangle";
      osc.frequency.setValueAtTime(350, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.08);
      
      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
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
      
      playTone(523.25, 0, 0.15);    // C5
      playTone(659.25, 0.06, 0.15); // E5
      playTone(783.99, 0.12, 0.35); // G5
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
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.linearRampToValueAtTime(30, now + 0.45);
      
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(350, now);
      filter.frequency.exponentialRampToValueAtTime(40, now + 0.45);
      
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start();
      osc.stop(now + 0.47);
    } catch (e) {}
  }
}

type Difficulty = "Easy" | "Medium" | "Hard" | "Hardcore";
type Phase = "betting" | "playing" | "lost" | "cashed";

const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { total: number; multipliers: number[] }
> = {
  Easy: {
    total: 25,
    multipliers: [
      1.03, 1.07, 1.12, 1.17, 1.23, 1.29, 1.36, 1.44, 1.53, 1.63, 1.75, 1.88, 2.04, 2.22, 2.45, 2.72, 3.06, 3.50, 4.08, 4.90, 6.13, 6.61, 9.81, 19.44
    ]
  },
  Medium: {
    total: 23,
    multipliers: [
      1.12, 1.28, 1.47, 1.70, 1.98, 2.33, 2.76, 3.32, 4.03, 4.96, 6.20, 6.91, 8.90, 11.74, 15.99, 22.61, 33.58, 53.20, 92.17, 182.51, 451.71, 1788.80
    ]
  },
  Hard: {
    total: 21,
    multipliers: [
      1.23, 1.55, 1.98, 2.56, 3.36, 4.49, 5.49, 7.53, 10.56, 15.21, 22.59, 34.79, 55.97, 94.99, 172.42, 341.40, 760.46, 2007.63, 6956.47, 41321.43
    ]
  },
  Hardcore: {
    total: 16,
    multipliers: [
      1.63, 2.80, 4.95, 9.08, 15.21, 30.12, 62.96, 140.24, 337.19, 890.19, 2643.89, 9161.08, 39301.05, 233448.29, 2542251.93
    ]
  }
};

const PRESETS_BY_MODE: Record<GameCurrencyMode, number[]> = {
  USD: [0.5, 1, 2, 7],
  INR: [50, 100, 200, 500],
  STAR: [10, 25, 50, 100],
};


const ChickenClassicGame = () => {
  const navigate = useNavigate();
  const { dollarBalance, starBalance, dollarWinning, starWinning, refreshBalance, currencyDisplay, toggleCurrencyDisplay } = useBalanceContext();

  // Wallet currency selector
  const [currency, setCurrency] = useState<CurrencyType>("dollar");
  const [currencyMode, setCurrencyMode] = useState<GameCurrencyMode>("USD");
  useEffect(() => { setCurrency(currencyMode === "STAR" ? "star" : "dollar"); }, [currencyMode]);

  // Real balance — always from context (no fake demo balance)
  const totalDollar = dollarBalance + dollarWinning;
  const totalStar = starBalance + starWinning;
  const balance = currency === "dollar" ? totalDollar : totalStar;


  // Audio Engine
  const audioRef = useRef<ChickenAudioEngine>(new ChickenAudioEngine());
  const [isMuted, setIsMuted] = useState(false);

  // Game Core States
  const [betAmount, setBetAmount] = useState(0.5);
  const [difficulty, setDifficulty] = useState<Difficulty>("Easy");
  const [diffDropdownOpen, setDiffDropdownOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("betting");
  const [currentPos, setCurrentPos] = useState(0); // Active index of the chicken
  const [crashedPos, setCrashedPos] = useState<number | null>(null);

  // Modal Dialogs
  const [showHowModal, setShowHowModal] = useState(false);
  const [showWinModal, setShowWinModal] = useState(false);
  const [cashoutDetails, setCashoutDetails] = useState({ multiplier: "0x", winAmount: 0 });

  const scrollRowRef = useRef<HTMLDivElement | null>(null);
  const audioUnlockedRef = useRef(false);

  // Sync bet presets on currency change
  useEffect(() => {
    setBetAmount(currency === "dollar" ? 0.5 : 10);
  }, [currency]);


  const unlockAudio = () => {
    if (audioUnlockedRef.current) return;
    audioRef.current.init();
    audioUnlockedRef.current = true;
  };

  // Toggle sound
  const handleSoundToggle = () => {
    unlockAudio();
    audioRef.current.isMuted = !audioRef.current.isMuted;
    setIsMuted(audioRef.current.isMuted);
  };

  // Min/Max buttons handlers
  const handleMinBet = () => {
    unlockAudio();
    audioRef.current.playClick();
    setBetAmount(currency === "dollar" ? 0.1 : 1);
  };

  const handleMaxBet = () => {
    unlockAudio();
    audioRef.current.playClick();
    const maxVal = currency === "dollar" ? 500 : 5000;
    setBetAmount(Math.min(balance, maxVal));
  };

  // Quick Preset values clicked
  const handlePresetSelect = (val: number) => {
    unlockAudio();
    audioRef.current.playClick();
    setBetAmount(val);
  };

  const currentCfg = useMemo(() => DIFFICULTY_CONFIG[difficulty], [difficulty]);

  // Total rectangles generated:
  // HOME (index 0) + Middle lanes (currentCfg.total - 2) + FINAL + FINAL2
  const rectsCount = useMemo(() => currentCfg.total + 1, [currentCfg]);

  // Multipliers list (size matches currentCfg.multipliers.length)
  const multipliersList = useMemo(() => currentCfg.multipliers, [currentCfg]);

  const isRiggedRef = useRef(false);

  // Controlled/Random crash odds
  const checkWillCrash = (pos: number): boolean => {
    if (isRiggedRef.current) return true; // crash immediately if rigged high crash is active!
    // 20% crash rate per step
    return Math.random() < 0.2;
  };

  // Scroll Row auto-centering to keep chicken in view
  useEffect(() => {
    const scrollRow = scrollRowRef.current;
    if (!scrollRow) return;

    // Find the current active index rectangle
    const rects = scrollRow.querySelectorAll(".scroll-rect");
    const activeRect = rects[currentPos] as HTMLDivElement;
    if (activeRect) {
      const scrollRect = scrollRow.getBoundingClientRect();
      const rectBounds = activeRect.getBoundingClientRect();
      const scrollLeft = scrollRow.scrollLeft;
      const offset = rectBounds.left - scrollRect.left - (scrollRect.width / 2) + (rectBounds.width / 2);
      scrollRow.scrollTo({ left: scrollLeft + offset, behavior: "smooth" });
    }
  }, [currentPos, difficulty]);

  // Start Chicken Classic Game
  const startClassicGame = async () => {
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

    const minBet = currency === "dollar" ? 0.1 : 1;
    const maxBet = currency === "dollar" ? 1000 : 10000;

    if (betAmount < minBet) {
      toast.error(`Minimum bet amount is ${currency === "dollar" ? "$0.1" : "1 Star"}`);
      return;
    }
    if (betAmount > maxBet) {
      toast.error(`Maximum bet amount is ${currency === "dollar" ? "$1,000" : "10,000 Stars"}`);
      return;
    }
    const nativeBet = toNativeAmount(betAmount, currencyMode);
    if (nativeBet > balance) {
      toast.error(`Insufficient ${currencySymbol(currencyMode)} Balance!`);
      return;
    }

    // Deduct Stake via real API
    try {
      await reportGameResult({
        betAmount: nativeBet,
        winAmount: 0,
        currency,
        game: "chicken_classic"
      });
      refreshBalance();
    } catch (e) {
      toast.error("Failed to connect, please try again.");
      return;
    }

    setPhase("playing");
    setCurrentPos(1);
    setCrashedPos(null);
    setDiffDropdownOpen(false);

    // First step crash check
    if (checkWillCrash(1)) {
      handleStepCrash(1);
    }
  };

  // Step Crash sequence
  const handleStepCrash = (pos: number) => {
    setPhase("lost");
    setCrashedPos(pos);
    audioRef.current.playLose();

    // Reset back to betting phase after 2 seconds
    setTimeout(() => {
      setPhase("betting");
      setCurrentPos(0);
      setCrashedPos(null);
      refreshBalance();
    }, 2400);
  };

  // Move Chicken Forward
  const walkForward = () => {
    unlockAudio();
    audioRef.current.playClick();

    if (phase !== "playing") return;
    
    // Max index is rectsCount - 2 (the FINAL.jpg lane index)
    // FINAL2.jpg is index rectsCount - 1 (plain pad, unreachable)
    const targetPos = currentPos + 1;
    const maxPlayPos = rectsCount - 2;

    if (targetPos > maxPlayPos) return;

    setCurrentPos(targetPos);

    if (checkWillCrash(targetPos)) {
      handleStepCrash(targetPos);
      return;
    }

    // If successfully reached the last lane, auto cashout at maximum multiplier
    if (targetPos === maxPlayPos) {
      const maxMultVal = multipliersList[multipliersList.length - 1];
      const winAmt = betAmount * maxMultVal;
      handleWinCashout(maxMultVal.toFixed(2) + "x", winAmt);
    }
  };

  // Cashout and collect winnings
  const triggerCashout = () => {
    unlockAudio();
    audioRef.current.playClick();

    if (phase !== "playing" || currentPos <= 1) return;

    // Multiplier index is currentPos - 1
    const multVal = multipliersList[currentPos - 1 - 1];
    const winAmt = betAmount * multVal;

    handleWinCashout(multVal.toFixed(2) + "x", winAmt);
  };

  // Cashout success sequence
  const handleWinCashout = async (multStr: string, winAmt: number) => {
    setPhase("cashed");
    audioRef.current.playWin();

    // Credit winnings via real API
    try {
      await reportGameResult({
        betAmount: 0,
        winAmount: toNativeAmount(winAmt, currencyMode),
        currency,
        game: "chicken_classic"
      });
      refreshBalance();
    } catch (e) {
      toast.error("Failed to credit winnings!");
    }

    setCashoutDetails({ multiplier: multStr, winAmount: winAmt });
    setShowWinModal(true);
  };

  // Confirm Win Cashout Alert Close
  const closeWinModal = () => {
    unlockAudio();
    audioRef.current.playClick();
    setShowWinModal(false);
    setPhase("betting");
    setCurrentPos(0);
    setCrashedPos(null);
    refreshBalance();
  };

  return (
    <div className="chicken-classic-body">
      
      {/* App Header */}
      <header className="app-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate("/")} title="Go Back">
            <ArrowLeft size={22} />
          </button>
          <span className="logo-title">Chicken Classic</span>
        </div>
        
        <div className="header-right flex items-center gap-1.5">
          <GameCurrencyChips mode={currencyMode} onChange={setCurrencyMode} disabled={phase !== "betting"} />

          <button className="menu-btn" onClick={() => setShowHowModal(true)} title="How to play">
            <BookOpen size={16} />
          </button>

          <button className="menu-btn" onClick={handleSoundToggle} title="Mute/Unmute">
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </header>

      {/* Horizontal Game Scroll Lane Track */}
      <div className="scroll-row scrollbar" ref={scrollRowRef}>
        <div className="scroll-inner">
          {/* HOME Lane (Index 0) */}
          <div className="scroll-rect home-rect">
            <img src="/images/chicken-classic/HOME.jpg" alt="" className="rect-img" />
            {currentPos === 0 && (
              <img src="/images/chicken-classic/chicken.png" alt="" className="chicken-game-overlay" />
            )}
          </div>

          {/* Middle Lanes (Index 1 to total - 2) */}
          {[...Array(currentCfg.total - 2)].map((_, i) => {
            const laneNum = i + 1;
            const isLane1 = i % 2 === 0;
            const bgImage = isLane1 ? "/images/chicken-classic/LANE1.jpg" : "/images/chicken-classic/LANE2.jpg";
            
            // Check status of center image
            let centerImgSrc = "/images/chicken-classic/CENTER.png";
            let animClass = "";
            let textShadowColor = "#707CBB";
            
            if (currentPos > laneNum) {
              centerImgSrc = "/images/chicken-classic/CROSS.png";
            } else if (currentPos === laneNum) {
              if (crashedPos === laneNum) {
                centerImgSrc = "/images/chicken-classic/CRASH.png";
                animClass = "turn-effect";
              } else {
                centerImgSrc = "/images/chicken-classic/GREEN.png";
                animClass = "turn-effect";
                textShadowColor = "#60F363";
              }
            }

            const laneMultiplier = multipliersList[laneNum - 1];

            return (
              <div className="scroll-rect" key={laneNum}>
                <img src={bgImage} alt="" className="rect-img" />
                
                {/* Center Circle image */}
                {!(currentPos > laneNum) && (
                  <img src={centerImgSrc} alt="" className={`center-img ${animClass}`} />
                )}

                {/* Multiplier text overlay */}
                {currentPos <= laneNum && (
                  <div className="rect-text-overlay" style={{ textShadow: `2px 2px 0 ${textShadowColor}` }}>
                    {laneMultiplier.toFixed(2)}x
                  </div>
                )}

                {/* Chicken character avatar overlay */}
                {currentPos === laneNum && crashedPos === null && (
                  <img src="/images/chicken-classic/chicken.png" alt="" className="chicken-game-overlay" />
                )}

                {/* Fire GIF and Roast Chicken on Crash */}
                {crashedPos === laneNum && (
                  <>
                    <img src="/images/chicken-classic/fire.gif" alt="" className="chicken-game-overlay" style={{ zIndex: 12, bottom: "35px" }} />
                    <img src="/images/chicken-classic/ROAST.png" alt="" className="chicken-game-overlay" style={{ zIndex: 11 }} />
                  </>
                )}
              </div>
            );
          })}

          {/* FINAL Lane (Index total - 1) */}
          <div className="scroll-rect final-rect">
            <img src="/images/chicken-classic/FINAL.jpg" alt="" className="rect-img" />
            
            {/* Center block if active */}
            {currentPos < currentCfg.total - 1 && (
              <img src="/images/chicken-classic/CENTER.png" alt="" className="center-img" />
            )}
            {currentPos === currentCfg.total - 1 && crashedPos === null && (
              <img src="/images/chicken-classic/chicken.png" alt="" className="chicken-game-overlay" />
            )}
            {crashedPos === currentCfg.total - 1 && (
              <>
                <img src="/images/chicken-classic/fire.gif" alt="" className="chicken-game-overlay" style={{ zIndex: 12, bottom: "35px" }} />
                <img src="/images/chicken-classic/ROAST.png" alt="" className="chicken-game-overlay" style={{ zIndex: 11 }} />
              </>
            )}

            {currentPos <= currentCfg.total - 1 && (
              <div className="rect-text-overlay">
                {multipliersList[multipliersList.length - 1].toFixed(2)}x
              </div>
            )}
          </div>

          {/* FINAL2 Lane (Index total - plain background padding) */}
          <div className="scroll-rect final2-rect">
            <img src="/images/chicken-classic/FINAL2.jpg" alt="" className="rect-img" />
          </div>
        </div>
      </div>

      {/* Control betting panel */}
      <div className="play-card-standalone">
        
        {/* Bet value slider box */}
        <div className="play-row play-row-top">
          <button className="minmax-btn" onClick={handleMinBet} disabled={phase !== "betting"}>MIN</button>
          <input 
            className="minmax-input" 
            type="number" 
            step={currency === "dollar" ? "0.1" : "1"} 
            min={currency === "dollar" ? "0.1" : "1"} 
            value={betAmount} 
            onChange={(e) => setBetAmount(Math.max(currency === "dollar" ? 0.1 : 1, parseFloat(e.target.value) || 0))}
            disabled={phase !== "betting"} 
          />
          <button className="minmax-btn" onClick={handleMaxBet} disabled={phase !== "betting"}>MAX</button>
        </div>

        {/* Quick select presets */}
        <div className="play-row-amounts">
          {PRESETS_BY_CURRENCY[currency].map(val => (
            <button 
              key={val} 
              className="amount-btn" 
              onClick={() => handlePresetSelect(val)}
              disabled={phase !== "betting"}
            >
              {currency === "dollar" ? `$${val}` : val}
            </button>
          ))}
        </div>

        {/* Difficulty select dropdown */}
        <div className="play-row">
          {phase === "betting" ? (
            <div className="difficulty-select-wrapper">
              <div 
                className="difficulty-select-display" 
                onClick={() => setDiffDropdownOpen(!diffDropdownOpen)}
              >
                <span>Difficulty: {difficulty}</span>
                <span>&#9660;</span>
              </div>
              {diffDropdownOpen && (
                <div className="difficulty-popup">
                  {(["Easy", "Medium", "Hard", "Hardcore"] as Difficulty[]).map(opt => (
                    <div 
                      key={opt} 
                      className={`difficulty-option ${difficulty === opt ? "selected" : ""}`}
                      onClick={() => {
                        setDifficulty(opt);
                        setDiffDropdownOpen(false);
                      }}
                    >
                      {opt} ({DIFFICULTY_CONFIG[opt].multipliers.length} Steps)
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="difficulty-select-display opacity-60">
              Difficulty locked: {difficulty}
            </div>
          )}
        </div>

        {/* Play Action Buttons */}
        {phase === "betting" ? (
          <button className="play-btn" onClick={startClassicGame}>
            Play Game
          </button>
        ) : (
          <div className="play-row-gocash">
            <button 
              className="cashout-btn" 
              onClick={triggerCashout}
              disabled={currentPos <= 1 || phase !== "playing"}
            >
              CASHOUT
            </button>
            <button 
              className="go-btn" 
              onClick={walkForward}
              disabled={phase !== "playing"}
            >
              GO
            </button>
          </div>
        )}
      </div>

      {/* Modal Dialog: How to Play */}
      {showHowModal && (
        <div className="modal-backdrop" onClick={() => setShowHowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowHowModal(false)}>&times;</button>
            <div className="modal-title">How to Play?</div>
            <div className="modal-content">
              <ol>
                <li>Enter your stake amount and select a difficulty. Higher difficulties have larger multipliers but fewer lanes.</li>
                <li>Press the <strong>Play</strong> button to start. Your chicken begins at the HOME safety zone.</li>
                <li>Tap <strong>GO</strong> to step onto the next lane. Be careful — cars can crash into your chicken and fry it!</li>
                <li>Secure your winnings at any point by clicking <strong>CASHOUT</strong> after completing at least one safe step.</li>
                <li>If you successfully cross all lanes and reach the FINAL zone, you automatically win the maximum multiplier!</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog: Cashout Celebration */}
      {showWinModal && (
        <div className="modal-backdrop">
          <div className="modal-box cashout-modal-content">
            <div className="celebration-emoji">🎉</div>
            <div className="cashout-title">CASHOUT!</div>
            <div className="cashout-sub">You successfully cashed out at:</div>
            <div className="cashout-mult">{cashoutDetails.multiplier}</div>
            <div className="cashout-sub">Winnings:</div>
            <div className="cashout-winnings">
              {currency === "dollar" ? `$${cashoutDetails.winAmount.toFixed(2)}` : `★${Math.floor(cashoutDetails.winAmount).toLocaleString()}`}
            </div>
            <button className="cashout-ok-btn" onClick={closeWinModal}>
              Collect
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default ChickenClassicGame;
