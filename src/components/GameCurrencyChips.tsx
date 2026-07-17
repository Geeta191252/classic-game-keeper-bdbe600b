import { GameCurrencyMode } from "@/lib/gameCurrency";
import { useBalanceContext } from "@/contexts/BalanceContext";
import { toast } from "sonner";

interface Props {
  mode: GameCurrencyMode;
  onChange: (mode: GameCurrencyMode) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Compact 3-chip currency selector ($ / ₹ / ★) used in every game.
 * Each chip is only clickable if the user has funds in that wallet.
 * USD/INR share the dollar wallet, STAR uses the star wallet.
 */
const GameCurrencyChips = ({ mode, onChange, disabled, className = "" }: Props) => {
  const { dollarBalance, rupeeBalance, starBalance, dollarWinning, rupeeWinning, starWinning } = useBalanceContext();
  const totalDollar = dollarBalance + dollarWinning;
  const totalRupee = rupeeBalance + rupeeWinning;
  const totalStar = starBalance + starWinning;
  const hasDollar = totalDollar > 0;
  const hasRupee = totalRupee > 0;
  const hasStar = totalStar > 0;

  const chips: Array<{
    id: GameCurrencyMode;
    label: string;
    value: string;
    activeBg: string;
    activeText: string;
    hasFunds: boolean;
  }> = [
    {
      id: "USD",
      label: "$",
      value: `$${totalDollar.toFixed(2)}`,
      activeBg: "bg-sky-500",
      activeText: "text-white",
      hasFunds: hasDollar,
    },
    {
      id: "INR",
      label: "₹",
      value: `₹${totalRupee.toFixed(0)}`,
      activeBg: "bg-emerald-500",
      activeText: "text-white",
      hasFunds: hasRupee,
    },
    {
      id: "STAR",
      label: "★",
      value: `${totalStar.toLocaleString()}`,
      activeBg: "bg-amber-500",
      activeText: "text-black",
      hasFunds: hasStar,
    },
  ];

  const handleClick = (c: typeof chips[number]) => {
    if (disabled) return;
    if (!c.hasFunds) {
      toast.error(
        c.id === "STAR"
          ? "No ⭐ balance — deposit stars to play"
          : c.id === "INR"
          ? "No ₹ balance — deposit funds to play"
          : "No $ balance — deposit funds to play"
      );
      return;
    }
    onChange(c.id);
  };

  return (
    <div className={`inline-flex items-center gap-1 rounded-full bg-black/40 p-0.5 backdrop-blur-sm ${className}`}>
      {chips.map((c) => {
        const active = mode === c.id;
        const noFunds = !c.hasFunds;
        return (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            onClick={() => handleClick(c)}
            className={`flex items-center gap-1 rounded-full px-2 h-7 text-[10px] font-bold transition-all ${
              active ? `${c.activeBg} ${c.activeText} shadow` : "text-white/70 hover:text-white"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${noFunds && !active ? "opacity-40" : ""}`}
            title={noFunds ? "No balance in this currency" : ""}
          >
            <span className="text-xs leading-none">{c.label}</span>
            <span className="leading-none">{c.value}</span>
          </button>
        );
      })}
    </div>
  );
};

export default GameCurrencyChips;
