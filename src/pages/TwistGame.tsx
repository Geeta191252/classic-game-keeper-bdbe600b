import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ArrowLeft, Menu, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBalanceContext } from "@/contexts/BalanceContext";
import { getTelegramUser, type CurrencyType, reportGameResult } from "@/lib/telegram";
import GameCurrencyChips from "@/components/GameCurrencyChips";
import { GameCurrencyMode } from "@/lib/gameCurrency";
import { toast } from "sonner";
import "./TwistGame.css";

// Synthesized Audio Class using Web Audio API
class AudioSynthesizer {
  ctx: AudioContext | null = null;
  soundEnabled = true;
  musicEnabled = true;
  musicOsc: OscillatorNode | null = null;
  musicGain: GainNode | null = null;

  init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      if (this.musicEnabled) {
        this.startAmbientMusic();
      }
    } catch (e) {
      console.warn("Failed to initialize AudioContext", e);
    }
  }

  toggleSound(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  toggleMusic(enabled: boolean) {
    this.musicEnabled = enabled;
    if (enabled) {
      this.startAmbientMusic();
    } else {
      this.stopAmbientMusic();
    }
  }

  playClick() {
    if (!this.soundEnabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  playSpin() {
    if (!this.soundEnabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(80, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(180, this.ctx.currentTime + 0.8);
    osc.frequency.linearRampToValueAtTime(60, this.ctx.currentTime + 1.5);
    
    gain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.5);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 1.5);
  }

  playWinStep() {
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C major arpeggio
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      
      gain.gain.setValueAtTime(0, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.25);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.3);
    });
  }

  playRollback() {
    if (!this.soundEnabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = "triangle";
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(200, this.ctx.currentTime + 0.4);
    
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }

  playCashoutSuccess() {
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const chords = [
      [261.63, 329.63, 392.00], // C
      [349.23, 440.00, 523.25], // F
      [392.00, 493.88, 587.33], // G
      [523.25, 659.25, 783.99]  // C5
    ];
    
    chords.forEach((chord, chordIdx) => {
      chord.forEach((freq) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + chordIdx * 0.15);
        
        gain.gain.setValueAtTime(0, now + chordIdx * 0.15);
        gain.gain.linearRampToValueAtTime(0.06, now + chordIdx * 0.15 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.005, now + chordIdx * 0.15 + 0.4);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + chordIdx * 0.15);
        osc.stop(now + chordIdx * 0.15 + 0.5);
      });
    });
  }

  playCrash() {
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    
    // Sub-bass drop
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(100, now);
    subOsc.frequency.linearRampToValueAtTime(20, now + 0.6);
    subGain.gain.setValueAtTime(0.3, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start();
    subOsc.stop(now + 0.6);

    // Noise explosion
    const bufferSize = this.ctx.sampleRate * 0.8;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.6);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start();
    noise.stop(now + 0.8);
  }

  startAmbientMusic() {
    if (!this.musicEnabled || !this.ctx || this.musicOsc) return;
    
    this.musicOsc = this.ctx.createOscillator();
    this.musicGain = this.ctx.createGain();
    
    this.musicOsc.type = "triangle";
    this.musicOsc.frequency.setValueAtTime(110, this.ctx.currentTime); // low A note
    
    // Slow modulation LFO
    this.musicGain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    
    this.musicOsc.connect(this.musicGain);
    this.musicGain.connect(this.ctx.destination);
    
    this.musicOsc.start();
  }

  stopAmbientMusic() {
    if (this.musicOsc) {
      try {
        this.musicOsc.stop();
      } catch (e) {}
      this.musicOsc = null;
      this.musicGain = null;
    }
  }
}

const imageSources = {
  logo: "/images/twist/Twist logo.png",
  air: "/images/twist/air-icon.png",
  earthIcon: "/images/twist/earth-icon.png",
  earthGem: "/images/twist/earth.png",
  fireIcon: "/images/twist/fire-icon.png",
  fireGem: "/images/twist/fire.png",
  losing: "/images/twist/losing-icon.png",
  waterIcon: "/images/twist/water-icon.png",
  waterGem: "/images/twist/water.png"
};

const MULTIPLIERS = [
  [0, 1.55, 4.85, 10.0, 7.0], // Water (Inner)
  [0, 2.50, 7.70, 16.0, 27.5, 44.0, 20.5], // Earth (Middle)
  [0, 3.90, 12.5, 28.0, 52.0, 85.0, 133.0, 200.0, 1000.0]  // Fire (Outer)
];

const PRESETS_BY_CURRENCY = {
  dollar: [1, 3, 5, 10, 20, 50, 100],
  star: [10, 25, 50, 100, 250, 500, 1000]
};

const stepAngles = MULTIPLIERS.map(arr => {
  const len = arr.length;
  const angles: number[] = [];
  for (let i = 0; i < len; i++) {
    angles.push(-Math.PI/2 + (i / len) * 2 * Math.PI);
  }
  return angles;
});

const TwistGame = () => {
  const navigate = useNavigate();
  const { dollarBalance, starBalance, dollarWinning, starWinning, refreshBalance, currencyDisplay, toggleCurrencyDisplay } = useBalanceContext();
  const tgUser = getTelegramUser();

  const [currency, setCurrency] = useState<CurrencyType>("dollar");
  const [currencyMode, setCurrencyMode] = useState<GameCurrencyMode>("USD");
  useEffect(() => {
    const newC = currencyMode === "STAR" ? "star" : "dollar";
    setCurrency(newC);
    setBet(newC === "star" ? 30 : 3);
  }, [currencyMode]);
  const [bet, setBet] = useState(3);
  const [lastWin, setLastWin] = useState<number | null>(null);
  
  // Game state
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const isRiggedRef = useRef(false);
  const [crashed, setCrashed] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [ringsEnabled, setRingsEnabled] = useState<[boolean, boolean, boolean]>([true, true, true]);
  
  const [steps, setSteps] = useState<[number, number, number]>([0, 0, 0]);
  const [betHistory, setBetHistory] = useState<Array<{ id: string; bet: string; mult: string; payout: string; type: string }>>([]);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  
  // Drawer Toggles
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openModalId, setOpenModalId] = useState<string | null>(null);
  
  // Avatar
  const [avatar, setAvatar] = useState("🧑‍🚀");
  const [avatarName, setAvatarName] = useState("Space Cadet");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);

  // References
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const synthRef = useRef<AudioSynthesizer>(new AudioSynthesizer());
  
  // Mutable state variables for animation loop (prevents React render bottlenecks)
  const animStateRef = useRef({
    isSpinning: false,
    spinStartTime: 0,
    startSpinPos: 3 * 160,
    targetSpinPos: 3 * 160,
    centerSpinPos: 3 * 160,
    targetIdx: 3,
    steps: [0, 0, 0] as [number, number, number],
    ringsEnabled: [true, true, true] as [boolean, boolean, boolean],
    visualSteps: [0, 0, 0] as [number, number, number],
    rotationAngles: [0, 0, 0] as [number, number, number],
  });

  const totalDollar = dollarBalance + dollarWinning;
  const totalStar = starBalance + starWinning;
  const balance = currency === "dollar" ? totalDollar : totalStar;
  const userName = tgUser?.first_name || tgUser?.username || "Player";

  // Pre-load images
  useEffect(() => {
    let loaded = 0;
    const sources = Object.entries(imageSources);
    sources.forEach(([key, src]) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        loaded++;
        if (loaded === sources.length) {
          setImagesLoaded(true);
        }
      };
      img.onerror = () => {
        loaded++;
        if (loaded === sources.length) {
          setImagesLoaded(true); // Fallback to canvas
        }
      };
      imagesRef.current[key] = img;
    });

    synthRef.current.init();

    return () => {
      synthRef.current.stopAmbientMusic();
    };
  }, []);

  // Update sync references when React states change
  useEffect(() => {
    animStateRef.current.steps = steps;
  }, [steps]);

  useEffect(() => {
    animStateRef.current.ringsEnabled = ringsEnabled;
  }, [ringsEnabled]);

  useEffect(() => {
    animStateRef.current.isSpinning = isSpinning;
  }, [isSpinning]);

  // Adjust sound states
  useEffect(() => {
    synthRef.current.toggleSound(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    synthRef.current.toggleMusic(musicEnabled);
  }, [musicEnabled]);

  // Calculate current multiplier payout
  const calculatePayoutVal = useCallback((currentSteps: [number, number, number]) => {
    let activeSum = 0;
    let countActive = 0;
    for (let i = 0; i < 3; i++) {
      if (ringsEnabled[i] && currentSteps[i] > 0) {
        activeSum += MULTIPLIERS[i][currentSteps[i]];
        countActive++;
      }
    }
    return countActive === 0 ? 0 : activeSum;
  }, [ringsEnabled]);

  const currentPayoutMult = useMemo(() => calculatePayoutVal(steps), [steps, calculatePayoutVal]);
  const currentPayoutVal = useMemo(() => currentPayoutMult * bet, [currentPayoutMult, bet]);

  // Part cashout values (rings with step >= 2)
  const partPayoutVal = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < 3; i++) {
      if (ringsEnabled[i] && steps[i] >= 2) {
        sum += MULTIPLIERS[i][steps[i]] * bet;
      }
    }
    return sum;
  }, [steps, ringsEnabled, bet]);

  const hasPartProgress = useMemo(() => {
    return ringsEnabled.some((enabled, i) => enabled && steps[i] >= 2);
  }, [steps, ringsEnabled]);

  // Draw elements onto Canvas
  const drawRings = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const canvasSize = 1080;
    ctx.clearRect(0, 0, canvasSize, canvasSize);

    const cx = canvasSize / 2;
    const cy = canvasSize / 2;
    const RING_RADII = [185, 315, 445];
    const RING_WIDTH = 90;

    const ringColors = [
      { base: "rgba(56, 189, 248, 0.08)", active: "#38bdf8", stepColor: "#6cd3fc" }, // Water
      { base: "rgba(46, 189, 89, 0.08)", active: "#2ebd59", stepColor: "#77fc4b" }, // Earth
      { base: "rgba(244, 63, 94, 0.08)", active: "#f43f5e", stepColor: "#dd64fd" }  // Fire
    ];

    const elementIcons = [
      imagesRef.current.waterIcon,
      imagesRef.current.earthIcon,
      imagesRef.current.fireIcon
    ];

    // Disc shadow
    ctx.save();
    ctx.shadowColor = "#2b383e";
    ctx.shadowBlur = 85;
    ctx.beginPath();
    ctx.arc(cx, cy, RING_RADII[2] + RING_WIDTH/2, 0, 2 * Math.PI);
    ctx.fillStyle = "#0f141b";
    ctx.fill();
    ctx.restore();

    // 1. Static tracks
    for (let i = 0; i < 3; i++) {
      const radius = RING_RADII[i];
      const enabled = animStateRef.current.ringsEnabled[i];
      
      const trackGrad = ctx.createRadialGradient(cx, cy, radius - RING_WIDTH/2, cx, cy, radius + RING_WIDTH/2);
      if (enabled) {
        trackGrad.addColorStop(0, "#1a2226");
        trackGrad.addColorStop(1, "#0b0e10");
      } else {
        trackGrad.addColorStop(0, "#111619");
        trackGrad.addColorStop(1, "#060809");
      }
      
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.lineWidth = RING_WIDTH;
      ctx.strokeStyle = trackGrad;
      ctx.stroke();
    }

    // Border bevel rings
    const borderRadii = [120, 250, 380, 490];
    ctx.save();
    ctx.lineWidth = 40;
    for (let r = 0; r < 4; r++) {
      const rad = borderRadii[r];
      const grad = ctx.createLinearGradient(cx - rad, cy - rad, cx + rad, cy + rad);
      grad.addColorStop(0, "#192025");
      grad.addColorStop(0.3, "#455563");
      grad.addColorStop(0.5, "#2c363f");
      grad.addColorStop(0.7, "#516375");
      grad.addColorStop(1, "#151b20");
      
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Center Slot
    const centerRadius = 120;
    const centerGrad = ctx.createLinearGradient(cx - centerRadius, cy - centerRadius, cx + centerRadius, cy + centerRadius);
    centerGrad.addColorStop(0, "#192025");
    centerGrad.addColorStop(0.3, "#455563");
    centerGrad.addColorStop(0.5, "#2c363f");
    centerGrad.addColorStop(0.7, "#516375");
    centerGrad.addColorStop(1, "#151b20");

    ctx.beginPath();
    ctx.arc(cx, cy, centerRadius, 0, 2 * Math.PI);
    ctx.fillStyle = "#0f141b";
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, centerRadius, 0, 2 * Math.PI);
    ctx.lineWidth = 40;
    ctx.strokeStyle = centerGrad;
    ctx.stroke();
    ctx.restore();

    // Clip Slot Images
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, centerRadius - 12, 0, 2 * Math.PI);
    ctx.clip();

    const iconSpacing = 160;
    const currentScroll = animStateRef.current.centerSpinPos;
    const slotIcons = [
      imagesRef.current.waterIcon,
      imagesRef.current.earthIcon,
      imagesRef.current.fireIcon,
      imagesRef.current.air,
      imagesRef.current.losing
    ];

    for (let offset = -2; offset <= 2; offset++) {
      const virtualY = cy + (offset * iconSpacing) - (currentScroll % iconSpacing);
      const baseIdx = Math.floor(currentScroll / iconSpacing);
      let drawIdx = (baseIdx + offset) % 5;
      if (drawIdx < 0) drawIdx += 5;
      
      const icon = slotIcons[drawIdx];
      if (icon && icon.complete) {
        const iconSize = (drawIdx === 4) ? 170 : 135;
        ctx.drawImage(icon, cx - iconSize/2, virtualY - iconSize/2, iconSize, iconSize);
      }
    }
    ctx.restore();

    // Helper functions inside drawing
    const drawCurvedText = (
      cContext: CanvasRenderingContext2D,
      text: string,
      radius: number,
      angle: number,
      font: string,
      color: string
    ) => {
      cContext.save();
      cContext.font = font;
      cContext.fillStyle = color;
      cContext.textAlign = "center";
      cContext.textBaseline = "middle";
      
      const charArray = text.split("");
      const charCount = charArray.length;
      
      let totalWidth = 0;
      const widths: number[] = [];
      for (let i = 0; i < charCount; i++) {
        const w = cContext.measureText(charArray[i]).width;
        widths.push(w);
        totalWidth += w;
      }
      
      const charSpacing = 1.5;
      const spacingTotal = (charCount - 1) * charSpacing;
      const angleSpread = (totalWidth + spacingTotal) / radius;
      
      let currentAngle = angle - angleSpread / 2;
      
      for (let i = 0; i < charCount; i++) {
        const char = charArray[i];
        const w = widths[i];
        
        const charAngle = w / radius;
        const drawAngle = currentAngle + charAngle / 2;
        
        const x = cx + radius * Math.cos(drawAngle);
        const y = cy + radius * Math.sin(drawAngle);
        
        cContext.save();
        cContext.translate(x, y);
        cContext.rotate(drawAngle + Math.PI/2);
        cContext.fillText(char, 0, 0);
        cContext.restore();
        
        currentAngle += charAngle + (charSpacing / radius);
      }
      cContext.restore();
    };

    // 3. Progress arcs & Text values
    for (let i = 0; i < 3; i++) {
      const radius = RING_RADII[i];
      const enabled = animStateRef.current.ringsEnabled[i];
      const step = animStateRef.current.steps[i];
      
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(animStateRef.current.rotationAngles[i]);
      ctx.translate(-cx, -cy);
      
      const visualStep = animStateRef.current.visualSteps[i];
      if (enabled && visualStep > 0) {
        const len = MULTIPLIERS[i].length;
        const endAngle = -Math.PI/2 + (visualStep / len) * 2 * Math.PI;
        
        let fillColor = "#ffffff";
        let borderColor = "#ffffff";
        if (i === 0) {
          fillColor = "#2591f6";
          borderColor = "#6cd3fc";
        } else if (i === 1) {
          fillColor = "#43ca1b";
          borderColor = "#77fc4b";
        } else {
          fillColor = "#f02ce7";
          borderColor = "#dd64fd";
        }
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI/2, endAngle, false);
        ctx.lineWidth = RING_WIDTH + 16;
        ctx.strokeStyle = borderColor;
        ctx.lineCap = "round";
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI/2, endAngle, false);
        ctx.lineWidth = RING_WIDTH + 4;
        ctx.strokeStyle = fillColor;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      }
      
      // Arc Dividers and Multipliers Labels
      const stepCount = MULTIPLIERS[i].length;
      for (let stepIdx = 1; stepIdx < stepCount; stepIdx++) {
        const angle = stepAngles[i][stepIdx];
        const multVal = MULTIPLIERS[i][stepIdx];
        
        const drawRadius = radius - 8;
        const isActive = enabled && stepIdx <= step;
        
        let fontStr = "";
        let colorStr = "";
        
        if (isActive) {
          fontStr = '950 54px "Outfit"';
          if (i === 0) colorStr = "#0b131f";
          else if (i === 1) colorStr = "#06200a";
          else colorStr = "#ffffff";
        } else {
          fontStr = '900 48px "Outfit"';
          colorStr = enabled ? "#596f7c" : "rgba(89, 111, 124, 0.25)";
        }
        
        let labelText = multVal + "X";
        if (multVal === 1000) labelText = "BONUS";
        else if (i === 0 && multVal === 7) labelText = "+7X";
        else if (i === 1 && multVal === 20.5) labelText = "+20.5X";
        
        drawCurvedText(ctx, labelText, drawRadius, angle, fontStr, colorStr);

        // Dividers
        if (stepIdx < stepCount - 1) {
          const a1 = stepAngles[i][stepIdx];
          const a2 = stepAngles[i][stepIdx + 1];
          
          let diffAngle = a2 - a1;
          if (diffAngle < -Math.PI) diffAngle += 2 * Math.PI;
          else if (diffAngle > Math.PI) diffAngle -= 2 * Math.PI;
          
          const midAngle = a1 + diffAngle / 2;
          const divX = cx + drawRadius * Math.cos(midAngle);
          const divY = cy + drawRadius * Math.sin(midAngle);
          
          const isDividerActive = enabled && stepIdx <= step;
          let dividerColor = "";
          if (isDividerActive) {
            if (i === 0) dividerColor = "#0b131f";
            else if (i === 1) dividerColor = "#06200a";
            else dividerColor = "#3d0739";
          } else {
            dividerColor = enabled ? "#596f7c" : "rgba(89, 111, 124, 0.25)";
          }
          
          ctx.save();
          ctx.font = '900 48px "Outfit"';
          ctx.fillStyle = dividerColor;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.translate(divX, divY);
          ctx.rotate(midAngle + Math.PI/2);
          ctx.fillText("|", 0, 0);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // 4. Element circular toggles
    for (let i = 0; i < 3; i++) {
      const radius = RING_RADII[i];
      const enabled = animStateRef.current.ringsEnabled[i];
      const toggleX = cx;
      const toggleY = cy - radius;
      
      ctx.save();
      if (!enabled) {
        ctx.globalAlpha = 0.3;
      } else {
        ctx.shadowColor = ringColors[i].stepColor;
        ctx.shadowBlur = animStateRef.current.steps[i] > 0 ? 12 : 3;
      }
      
      const drawSize = 92;
      ctx.beginPath();
      ctx.arc(toggleX, toggleY, drawSize/2, 0, 2 * Math.PI);
      ctx.fillStyle = "#0f141b";
      ctx.fill();
      
      const icon = elementIcons[i];
      if (icon && icon.complete) {
        ctx.drawImage(icon, toggleX - drawSize/2, toggleY - drawSize/2, drawSize, drawSize);
      } else {
        ctx.beginPath();
        ctx.arc(toggleX, toggleY, drawSize/2 - 2, 0, 2*Math.PI);
        ctx.fillStyle = ringColors[i].stepColor;
        ctx.fill();
      }
      
      ctx.restore();
    }
  }, []);

  // Animation Game Loop
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      if (animStateRef.current.isSpinning) {
        const duration = 1800; // 1.8s
        const elapsed = Date.now() - animStateRef.current.spinStartTime;
        let t = elapsed / duration;
        
        if (t >= 1) {
          t = 1;
          animStateRef.current.centerSpinPos = animStateRef.current.targetSpinPos;
          animStateRef.current.isSpinning = false;
          setIsSpinning(false);
          resolveSpinOutcome();
        } else {
          // cubic ease out
          const ease = 1 - Math.pow(1 - t, 3);
          animStateRef.current.centerSpinPos = animStateRef.current.startSpinPos + (animStateRef.current.targetSpinPos - animStateRef.current.startSpinPos) * ease;
        }
      }

      // visual steps interpolation
      for (let i = 0; i < 3; i++) {
        const target = animStateRef.current.steps[i] > 0 ? (animStateRef.current.steps[i] + 0.5) : 0;
        const diff = target - animStateRef.current.visualSteps[i];
        if (Math.abs(diff) > 0.001) {
          animStateRef.current.visualSteps[i] += diff * 0.06;
        } else {
          animStateRef.current.visualSteps[i] = target;
        }
      }

      drawRings();
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [drawRings]);

  // Adjust bet
  const adjustBetVal = (amt: number) => {
    synthRef.current.init();
    synthRef.current.playClick();
    if (isRoundActive) return;
    setBet(prev => Math.max(1, Math.min(currency === "dollar" ? 100 : 1000, prev + amt)));
  };

  // Click handler on canvas to toggle rings
  const handleCanvasClick = (e: React.MouseEvent<HTMLElement>) => {
    synthRef.current.init();
    if (isRoundActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 1080;
    const clickY = ((e.clientY - rect.top) / rect.height) * 1080;
    
    const cx = 1080 / 2;
    const cy = 1080 / 2;
    const RING_RADII = [185, 315, 445];
    const clickTolerance = 45; // slightly higher tolerance for touch

    for (let i = 0; i < 3; i++) {
      const iconX = cx;
      const iconY = cy - RING_RADII[i];
      const distance = Math.hypot(clickX - iconX, clickY - iconY);
      
      if (distance <= clickTolerance) {
        synthRef.current.playClick();
        const activeCount = ringsEnabled.filter(Boolean).length;
        if (ringsEnabled[i] && activeCount === 1) {
          toast.error("At least one element must be active!");
          return;
        }
        
        const newRings = [...ringsEnabled] as [boolean, boolean, boolean];
        newRings[i] = !newRings[i];
        setRingsEnabled(newRings);

        if (!newRings[i]) {
          const newSteps = [...steps] as [number, number, number];
          newSteps[i] = 0;
          setSteps(newSteps);
        }
        break;
      }
    }
  };

  // Spin Trigger
  const spin = async () => {
    synthRef.current.init();
    if (isSpinning) return;
    
    let currentSteps = [...steps] as [number, number, number];
    let isStartingNewRound = !isRoundActive;

    if (isStartingNewRound) {
      try {
        const rigRes = await fetch("/api/game/rig");
        const rigData = await rigRes.json();
        isRiggedRef.current = rigData.rigged === true;
      } catch (e) {
        isRiggedRef.current = false;
      }

      if (balance < bet) {
        toast.error("Insufficient Balance!");
        setAutoplay(false);
        return;
      }
      
      try {
        await reportGameResult({
          betAmount: bet,
          winAmount: 0,
          currency,
          game: "twist"
        });
        refreshBalance();
      } catch (err) {
        toast.error("Failed to place bet. Please try again.");
        return;
      }

      currentSteps = [0, 0, 0];
      setSteps([0, 0, 0]);
      setCrashed(false);
      setIsRoundActive(true);
      
      // Reset anim state helper
      animStateRef.current.steps = [0, 0, 0];
      animStateRef.current.visualSteps = [0, 0, 0];
    }
    
    // Choose outcome
    const totalRingsActive = ringsEnabled.filter(Boolean).length;
    const currentLevelSum = currentSteps.reduce((a, b) => a + b, 0);
    
    let crashChance = 0.18; // default 18%
    if (currentLevelSum === 0) {
      crashChance = 0.05; // 5% risk on very first hook
    } else if (currentLevelSum > 10) {
      crashChance = 0.28;
    }
    
    const roll = Math.random();
    let outcome = "gem";
    
    if (isRiggedRef.current) {
      outcome = "skull"; // force lose
    } else if (roll < crashChance) {
      outcome = "skull";
    } else if (roll < crashChance + 0.12) {
      outcome = "stone"; // 12% wind stone
    }
    
    let targetIdx = 3; // Air
    let ringsToAdvance: number[] = [];
    
    if (outcome === "skull") {
      targetIdx = 4; // Skull / Losing
    } else if (outcome === "stone") {
      targetIdx = 3; // Air / Neutral
    } else {
      const activeIndices: number[] = [];
      for (let i = 0; i < 3; i++) {
        if (ringsEnabled[i]) activeIndices.push(i);
      }
      const chosenRing = activeIndices[Math.floor(Math.random() * activeIndices.length)];
      ringsToAdvance = [chosenRing];
      targetIdx = chosenRing;
    }
    
    // Configure spin params in animation thread reference
    animStateRef.current.spinStartTime = Date.now();
    animStateRef.current.startSpinPos = animStateRef.current.centerSpinPos;
    animStateRef.current.targetIdx = targetIdx;
    
    const currentBase = animStateRef.current.startSpinPos;
    const targetBase = Math.ceil(currentBase / 800) * 800 + 1600;
    animStateRef.current.targetSpinPos = targetBase + (targetIdx * 160);
    
    // Spin trigger hook variables
    (animStateRef.current as any).spinOutcome = outcome;
    (animStateRef.current as any).spinRingsToAdvance = ringsToAdvance;
    
    animStateRef.current.isSpinning = true;
    setIsSpinning(true);
    synthRef.current.playSpin();
  };

  // Resolve outcome of the slot spinning animation
  const resolveSpinOutcome = () => {
    const outcome = (animStateRef.current as any).spinOutcome;
    const targetIdx = animStateRef.current.targetIdx;
    const ringsToAdvance = (animStateRef.current as any).spinRingsToAdvance;
    
    const currentSteps = [...animStateRef.current.steps] as [number, number, number];

    if (outcome === "skull") {
      const totalSteps = currentSteps.reduce((a, b) => a + b, 0);
      
      if (totalSteps > 0) {
        // Rollback
        for (let i = 0; i < 3; i++) {
          if (currentSteps[i] > 0) {
            currentSteps[i] = currentSteps[i] - 1;
          }
        }
        setSteps(currentSteps);
        animStateRef.current.steps = currentSteps;
        
        synthRef.current.playRollback();
        toast.error("Skull: Progress rolled back!");
        
        if (autoplay) {
          setTimeout(spin, 1800);
        }
      } else {
        // Crash
        setCrashed(true);
        setIsRoundActive(false);
        synthRef.current.playCrash();
        
        saveHistoryRecord("Lost", 0, "Lost");
        setSteps([0, 0, 0]);
        animStateRef.current.steps = [0, 0, 0];
        animStateRef.current.visualSteps = [0, 0, 0];
        
        toast.error("CRASHED!");
        
        if (autoplay) {
          setTimeout(spin, 1800);
        }
      }
    } else if (outcome === "stone") {
      // Wind action
      const roll = Math.random();
      if (roll < 0.5) {
        // Extra progress
        const activeIndices: number[] = [];
        for (let i = 0; i < 3; i++) {
          if (ringsEnabled[i] && currentSteps[i] < MULTIPLIERS[i].length - 1) {
            activeIndices.push(i);
          }
        }
        if (activeIndices.length > 0) {
          const chosen = activeIndices[Math.floor(Math.random() * activeIndices.length)];
          currentSteps[chosen]++;
          setSteps(currentSteps);
          animStateRef.current.steps = currentSteps;
          
          synthRef.current.playWinStep();
          toast.success("Wind: Extra Progress granted!");
        } else {
          toast.success("Wind: Free Extra Spin!");
          setTimeout(spin, 1200);
        }
      } else {
        // Free spin
        toast.success("Wind: Free Extra Spin!");
        setTimeout(spin, 1200);
      }
    } else {
      // Gem advance
      ringsToAdvance.forEach((ringIdx: number) => {
        const maxStep = MULTIPLIERS[ringIdx].length - 1;
        if (currentSteps[ringIdx] < maxStep) {
          currentSteps[ringIdx]++;
        }
      });
      setSteps(currentSteps);
      animStateRef.current.steps = currentSteps;
      
      synthRef.current.playWinStep();
      
      if (autoplay) {
        const currentMultVal = calculatePayoutVal(currentSteps);
        if (currentMultVal >= 8) {
          setTimeout(cashout, 1000);
        } else {
          setTimeout(spin, 1500);
        }
      }
    }
  };

  // Cashout / Secure Winnings
  const cashout = async () => {
    synthRef.current.init();
    if (!isRoundActive || isSpinning || crashed) return;
    
    const mult = calculatePayoutVal(steps);
    const winnings = mult * bet;
    
      try {
        // Add winnings to database
        await reportGameResult({
          betAmount: 0,
          winAmount: winnings,
          currency,
          game: "twist"
        });
        refreshBalance();

        setLastWin(winnings);
        setIsRoundActive(false);
        
        synthRef.current.playCashoutSuccess();
        toast.success(`Won ${currency === "star" ? "★" : "$"}${winnings.toFixed(2)} !`);
        
        saveHistoryRecord(mult.toFixed(2) + "x", winnings, "Full");
        
        setSteps([0, 0, 0]);
        animStateRef.current.steps = [0, 0, 0];
        animStateRef.current.visualSteps = [0, 0, 0];
      } catch {
        toast.error("Cashout failed. Please try again.");
      }
  };

  // Part Cashout
  const partCashout = async () => {
    synthRef.current.init();
    if (!isRoundActive || isSpinning || crashed) return;
    
    let totalPartWinnings = 0;
    let totalPartMult = 0;
    let didCashoutAny = false;
    const newSteps = [...steps] as [number, number, number];
    
    for (let i = 0; i < 3; i++) {
      if (ringsEnabled[i] && steps[i] >= 2) {
        const ringMult = MULTIPLIERS[i][steps[i]];
        const ringWinnings = ringMult * bet;
        totalPartWinnings += ringWinnings;
        totalPartMult += ringMult;
        
        newSteps[i] = steps[i] - 1;
        animStateRef.current.visualSteps[i] = newSteps[i];
        didCashoutAny = true;
      }
    }
    
    if (!didCashoutAny) return;
    
      try {
        // Report part winnings to backend
        await reportGameResult({
          betAmount: 0,
          winAmount: totalPartWinnings,
          currency,
          game: "twist"
        });
        refreshBalance();

        setSteps(newSteps);
        setLastWin(totalPartWinnings);
        
        synthRef.current.playCashoutSuccess();
        toast.success(`Secured ${currency === "star" ? "★" : "$"}${totalPartWinnings.toFixed(2)} !`);
        
        saveHistoryRecord(totalPartMult.toFixed(2) + "x", totalPartWinnings, "Part");
      } catch {
        toast.error("Part cashout failed. Please try again.");
      }
  };

  const saveHistoryRecord = (mult: string, payout: number, type: string) => {
    const roundId = "#" + Math.floor(Math.random() * 900000 + 100000);
    const record = {
      id: roundId,
      bet: currency === "star" ? `★${bet}` : `$${bet.toFixed(2)}`,
      mult,
      payout: payout > 0 ? (currency === "star" ? `★${payout}` : `$${payout.toFixed(2)}`) : "0.00",
      type
    };
    setBetHistory(prev => [record, ...prev].slice(0, 20));
  };

  const selectAvatar = (emoji: string, name: string) => {
    synthRef.current.init();
    synthRef.current.playClick();
    setAvatar(emoji);
    setAvatarName(name);
    setOpenModalId(null);
    toast.success(`Avatar changed to ${name}!`);
  };

  return (
    <div className="twist-body">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => navigate(-1)} 
            className="h-9 w-9 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-white active:scale-95 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="logo">
            <img src={imageSources.logo} alt="TWIST Logo" />
          </div>
        </div>

        <GameCurrencyChips mode={currencyMode} onChange={setCurrencyMode} disabled={isRoundActive} />

        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              synthRef.current.init();
              synthRef.current.playClick();
              setIsMenuOpen(true);
            }} 
            className="menu-toggle"
          >
            <svg viewBox="0 0 24 24">
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Main Wheel Area */}
      <main id="gameMain">
        <div className={`wheel-container ${crashed ? "shake" : ""}`} id="wheelContainer" onClick={handleCanvasClick}>
          <canvas ref={canvasRef} id="gameCanvas" width={1080} height={1080}></canvas>
          <div className="center-cloud" id="centerCloud" onClick={(e) => { e.stopPropagation(); spin(); }}></div>
        </div>

        {/* Controls Panel */}
        <div className="controls-wrapper">
          <div className="bottom-panel">
            
            {/* Row 1: Balance & Bet */}
            <div className="panel-row">
              <div className="flex gap-1.5 items-center" />


              <div className="bet-card">
                <div className="bet-input-section">
                  <div className="bet-input-label">BET</div>
                  <div className="bet-value-display">
                    <div className="currency-icon">{currency === "dollar" ? "$" : "★"}</div>
                    <span>{bet}</span>
                  </div>
                </div>
                <div className="bet-spinners">
                  <button className="spinner-btn" onClick={() => adjustBetVal(currency === "dollar" ? 1 : 10)}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>
                  </button>
                  <button className="spinner-btn" onClick={() => adjustBetVal(currency === "dollar" ? -1 : -10)}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Presets */}
            <div className="flex gap-1 justify-between w-full mb-1">
              {PRESETS_BY_CURRENCY[currency].map((preset) => (
                <button
                  key={preset}
                  disabled={isRoundActive}
                  onClick={() => {
                    synthRef.current.init();
                    synthRef.current.playClick();
                    setBet(preset);
                  }}
                  className={`flex-1 py-1 rounded text-[10px] font-bold transition border ${
                    bet === preset
                      ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
                      : "border-slate-800 text-slate-400 bg-slate-900/60 hover:border-slate-700"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Row 2: Cashout & Part Cashout (Only during active round) */}
            {isRoundActive && (
              <div className="panel-row cashout-row" id="cashoutRow">
                <button 
                  className="btn-rect part-cashout-btn-rect" 
                  onClick={partCashout}
                  disabled={!hasPartProgress || isSpinning || crashed}
                >
                  PART CASHOUT 
                  {hasPartProgress && (
                    <span className="cashout-amount blue-glow">
                      {currency === "dollar" ? `$${partPayoutVal.toFixed(2)}` : `★${partPayoutVal}`}
                    </span>
                  )}
                </button>
                
                <button 
                  className="btn-rect cashout-btn-rect active" 
                  onClick={cashout}
                  disabled={currentPayoutMult <= 0 || isSpinning || crashed}
                >
                  CASHOUT 
                  {currentPayoutMult > 0 && (
                    <span className="cashout-amount">
                      {currency === "dollar" ? `$${currentPayoutVal.toFixed(2)}` : `★${currentPayoutVal}`}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Row 3: Action Buttons */}
            <div className="panel-row action-row">
              <button 
                className={`btn-rect play-btn-rect ${isSpinning ? "spinning" : ""}`} 
                id="playBtn"
                onClick={spin}
                disabled={isSpinning}
              >
                <span className="btn-rect-label">{isRoundActive ? "SPIN AGAIN" : "SPIN"}</span>
                <span className="btn-rect-sub">
                  {isRoundActive ? "RISK STAKE TO BUILD MULTIPLIERS" : "SPIN AND FILL RINGS"}
                </span>
              </button>

              <button 
                onClick={() => {
                  synthRef.current.init();
                  synthRef.current.playClick();
                  setAutoplay(prev => !prev);
                }} 
                className={`autoplay-toggle-btn ${autoplay ? "active" : ""}`}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm-1.78 2.3L8.76 7.76C7.54 8.98 7 10.43 7 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8z"/>
                </svg>
              </button>
            </div>

          </div>
        </div>
      </main>

      {/* Footer Info */}
      <div className="footer-bar">
        Last Win: <span id="lastWinDisplay">{lastWin ? (currency === "dollar" ? `$${lastWin.toFixed(2)}` : `★${lastWin}`) : "-"}</span>
      </div>

      {/* Settings Drawer */}
      <div className={`drawer-overlay ${isMenuOpen ? "open" : ""}`} onClick={() => setIsMenuOpen(false)}>
        <div className="drawer" onClick={(e) => e.stopPropagation()}>
          <div className="avatar-section">
            <div className="avatar-info">
              <div className="avatar-circle">{avatar}</div>
              <div className="avatar-name">{avatarName}</div>
            </div>
            <a className="change-avatar-link" onClick={() => { setIsMenuOpen(false); setOpenModalId("modalAvatarSelect"); }}>Change avatar</a>
          </div>

          <div className="setting-item">
            <div className="setting-label-group">Sound</div>
            <label className="switch">
              <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-label-group">Music</div>
            <label className="switch">
              <input type="checkbox" checked={musicEnabled} onChange={(e) => setMusicEnabled(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          <div className="menu-nav">
            <button className="menu-link" onClick={() => { setIsMenuOpen(false); setOpenModalId("modalProvablyFair"); }}>Provably fair settings</button>
            <button className="menu-link" onClick={() => { setIsMenuOpen(false); setOpenModalId("modalGameRules"); }}>Game rules</button>
            <button className="menu-link" onClick={() => { setIsMenuOpen(false); setOpenModalId("modalBetHistory"); }}>My bet history</button>
            <button className="menu-link" onClick={() => { setIsMenuOpen(false); setOpenModalId("modalHowToPlay"); }}>How to play?</button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {/* 1. Provably Fair */}
      <div className={`modal-overlay ${openModalId === "modalProvablyFair" ? "open" : ""}`} onClick={() => setOpenModalId(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Provably Fair Settings</div>
            <button className="drawer-close" onClick={() => setOpenModalId(null)}>&times;</button>
          </div>
          <div className="fair-text">
            <p>This game uses cryptographic verification to guarantee that every spin is 100% fair.</p>
            <h4>Client Seed</h4>
            <div className="seed-box">twist_client_seed_77491024</div>
            <h4>Server Seed (SHA256 Hash)</h4>
            <div className="seed-box">8f9e612cb34de8018244afb23b9d034a74ef1a25d2cba50aefbc73fbc231ea7a</div>
          </div>
        </div>
      </div>

      {/* 2. Game Rules */}
      <div className={`modal-overlay ${openModalId === "modalGameRules" ? "open" : ""}`} onClick={() => setOpenModalId(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Game Rules</div>
            <button className="drawer-close" onClick={() => setOpenModalId(null)}>&times;</button>
          </div>
          <div className="rules-text">
            <h4>1. Bet Lagao</h4>
            <p>Apni bet amount select karo aur SPIN dabao. Har spin par active elements par progress badhegi.</p>
            <h4>2. Elements</h4>
            <p>Water, Earth, aur Fire active rings complete karte hain.</p>
            <h4>3. Multipliers</h4>
            <p>Jaise rings fill hoti hain, payout multipliers badhte hain (Water: x10 max, Earth: x44 max, Fire: x1000 max).</p>
            <h4>4. Part Cashout</h4>
            <p>Step 2 ya usse upar pahunchne par aap half earnings safe (Part Cashout) kar sakte hain aur game jari rakh sakte hain.</p>
            <h4>5. Skull & Wind</h4>
            <p>💀 Skull progress rollback karta hai (agar sab 0 hain toh direct defeat). 🌪️ Wind free spin deta hai.</p>
          </div>
        </div>
      </div>

      {/* 3. Bet History */}
      <div className={`modal-overlay ${openModalId === "modalBetHistory" ? "open" : ""}`} onClick={() => setOpenModalId(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">My Bet History</div>
            <button className="drawer-close" onClick={() => setOpenModalId(null)}>&times;</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="history-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Bet</th>
                  <th>Mult</th>
                  <th>Payout</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {betHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "20px" }}>No bets placed yet.</td>
                  </tr>
                ) : (
                  betHistory.map((rec) => (
                    <tr key={rec.id} className={rec.payout !== "0.00" ? "win-row" : "loss-row"}>
                      <td>{rec.id}</td>
                      <td>{rec.bet}</td>
                      <td>{rec.mult}</td>
                      <td>{rec.payout}</td>
                      <td><span className={`cashout-type type-${rec.type.toLowerCase()}`}>{rec.type}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. How to Play */}
      <div className={`modal-overlay ${openModalId === "modalHowToPlay" ? "open" : ""}`} onClick={() => setOpenModalId(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">How to Play</div>
            <button className="drawer-close" onClick={() => setOpenModalId(null)}>&times;</button>
          </div>
          <div className="help-text">
            <ol className="list-decimal pl-5 space-y-2">
              <li>Apni stake select karein (BET Up/Down se).</li>
              <li>SPIN button dabakar round start karein. Bet amount balance se kat jayega.</li>
              <li>Gems land hone par rings fill ho jayenge aur multipliers active ho jayenge.</li>
              <li>Aap aage spin kar sakte hain, Secure (Cashout) kar sakte hain ya fir half amount secure (Part Cashout) kar sakte hain.</li>
              <li>Agar 💀 Skull aata hai aur progress 0 ho jati hai, toh round end ho jayega aur bet amount loss ho jayega.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* 5. Avatar Selector */}
      <div className={`modal-overlay ${openModalId === "modalAvatarSelect" ? "open" : ""}`} onClick={() => setOpenModalId(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Select Avatar</div>
            <button className="drawer-close" onClick={() => setOpenModalId(null)}>&times;</button>
          </div>
          <div className="avatar-grid">
            {[
              { emoji: "🧑‍🚀", name: "Space Cadet" },
              { emoji: "🐱", name: "Lucky Cat" },
              { emoji: "🔥", name: "Fire Starter" },
              { emoji: "💧", name: "Water Bender" },
              { emoji: "🌱", name: "Earth Keeper" },
              { emoji: "🎲", name: "High Roller" },
              { emoji: "👽", name: "Invader" },
              { emoji: "🦁", name: "Gold Lion" }
            ].map((opt) => (
              <div 
                key={opt.emoji}
                className={`avatar-option ${avatar === opt.emoji ? "selected" : ""}`}
                onClick={() => selectAvatar(opt.emoji, opt.name)}
              >
                {opt.emoji}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

export default TwistGame;
