import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Users, Star, DollarSign, RefreshCw, User, CreditCard, Plus, Minus, X, Copy, Tag, Send, Trash2, Trophy, Gamepad2, TrendingUp, TrendingDown, Pencil, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { getTelegramUser } from "@/lib/telegram";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://broken-bria-chetan1-ea890b93.koyeb.app/api";
const OWNER_ID = 6965488457;

interface AdminStats {
  totalStarsEarned: number;
  starDepositCount: number;
  totalDollarsEarned: number;
  dollarDepositCount: number;
  totalUsers: number;
  recentTransactions: Array<{
    telegramId: number;
    type: string;
    currency: string;
    amount: number;
    createdAt: string;
  }>;
}

interface UserData {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  dollarBalance: number;
  starBalance: number;
  dollarWinning: number;
  starWinning: number;
  lastActive?: string;
  createdAt: string;
}

interface WithdrawalRequest {
  _id: string;
  telegramId: number;
  currency: string;
  amount: number;
  status: string;
  createdAt: string;
  description?: string;
  cryptoAddress?: string;
  withdrawalNetwork?: string;
}

type Tab = "stats" | "users" | "withdrawals" | "offers" | "tournaments" | "games" | "upi";

interface GameStat {
  game: string;
  dollarWin: number;
  starWin: number;
  dollarLoss: number;
  starLoss: number;
  winCount: number;
  betCount: number;
}

interface PrizeTier { fromRank: number; toRank: number; amount: number; }
interface AdminTournament {
  _id: string;
  title: string;
  imageUrl?: string;
  prizeCurrency: "dollar" | "star";
  tier: number;
  prizePerWinner: number;
  prizeTiers?: PrizeTier[];
  endsAt?: string | null;
  active: boolean;
  createdAt: string;
}

interface AdminOffer {
  _id: string;
  title: string;
  payAmount: number;
  payCurrency: "star" | "dollar";
  getAmount: number;
  bonusLabel?: string;
  valueLabel?: string;
  active: boolean;
  createdAt: string;
}

const AdminPanel = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("stats");

  // Fund adjustment dialog state
  const [adjustUser, setAdjustUser] = useState<UserData | null>(null);
  const [adjustCurrency, setAdjustCurrency] = useState<"star" | "dollar">("star");
  const [adjustType, setAdjustType] = useState<"deposit" | "winning">("deposit");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustAction, setAdjustAction] = useState<"add" | "remove">("add");
  const [adjusting, setAdjusting] = useState(false);
  const [processingWithdrawal, setProcessingWithdrawal] = useState<string | null>(null);

  // Offers state
  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [offerForm, setOfferForm] = useState({
    title: "",        // chosen from presets; auto-default if empty
    payAmount: "",
    payCurrency: "star" as "star" | "dollar",
    getAmount: "",
    bonusStar: "",   // extra ⭐ (for both star and dollar offers)
    bonusDollar: "", // extra $ (only for dollar offers)
  });
  const [creatingOffer, setCreatingOffer] = useState(false);
  const [broadcastingId, setBroadcastingId] = useState<string | null>(null);
  const [deletingOfferId, setDeletingOfferId] = useState<string | null>(null);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);

  // Tournaments state
  const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
  const [tournamentForm, setTournamentForm] = useState({
    title: "",
    imageUrl: "",
    prizeCurrency: "dollar" as "star" | "dollar",
    days: "0",
    hours: "0",
    minutes: "15",
    seconds: "15",
  });
  const [tierRows, setTierRows] = useState<PrizeTier[]>([
    { fromRank: 1, toRank: 1, amount: 1000 },
    { fromRank: 2, toRank: 2, amount: 500 },
    { fromRank: 3, toRank: 3, amount: 250 },
    { fromRank: 4, toRank: 20, amount: 50 },
    { fromRank: 21, toRank: 50, amount: 20 },
    { fromRank: 51, toRank: 100, amount: 10 },
  ]);
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [deletingTournamentId, setDeletingTournamentId] = useState<string | null>(null);
  const [distributingId, setDistributingId] = useState<string | null>(null);

  // UPI Tab state
  const [upiForm, setUpiForm] = useState({
    upiId: "",
    payeeName: "",
    qrImageUrl: "",
    isEnabled: true,
    exchangeRate: 85
  });
  const [upiDeposits, setUpiDeposits] = useState<Array<{
    _id: string;
    telegramId: number;
    amount: number;
    status: string;
    createdAt: string;
    description?: string;
  }>>([]);
  const [loadingUpi, setLoadingUpi] = useState(false);
  const [savingUpiConfig, setSavingUpiConfig] = useState(false);
  const [processingUpiDepositId, setProcessingUpiDepositId] = useState<string | null>(null);

  const fetchUpiConfig = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/upi-config?ownerId=${OWNER_ID}`);
      const data = await res.json();
      if (res.ok) {
        setUpiForm({
          upiId: data.upiId || "",
          payeeName: data.payeeName || "",
          qrImageUrl: data.qrImageUrl || "",
          isEnabled: data.isEnabled !== false,
          exchangeRate: data.exchangeRate || 85
        });
      }
    } catch { /* ignore */ }
  };

  const fetchUpiDeposits = async () => {
    setLoadingUpi(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/upi-deposits?ownerId=${OWNER_ID}`);
      const data = await res.json();
      if (res.ok) {
        setUpiDeposits(data.deposits || []);
      }
    } catch { /* ignore */ }
    setLoadingUpi(false);
  };

  const handleSaveUpiConfig = async () => {
    if (!upiForm.upiId.trim() || !upiForm.payeeName.trim()) {
      toast({ title: "Validation error", description: "UPI ID and Payee Name are required." });
      return;
    }

    setSavingUpiConfig(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/upi-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: String(OWNER_ID),
          ...upiForm
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: "UPI Config Saved! ✅", description: "Details are now updated in user wallet." });
      } else {
        toast({ title: "Save failed", description: data.error || "Failed" });
      }
    } catch {
      toast({ title: "Save failed", description: "Network error" });
    }
    setSavingUpiConfig(false);
  };

  const handleUpiDepositAction = async (txId: string, action: "approve" | "reject") => {
    setProcessingUpiDepositId(txId);
    try {
      const endpoint = action === "approve" ? "approve-deposit" : "reject-deposit";
      const res = await fetch(`${API_BASE_URL}/admin/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: String(OWNER_ID),
          transactionId: txId,
          reason: action === "reject" ? "UTR could not be verified / Payment not received" : undefined
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUpiDeposits(prev => prev.filter(d => d._id !== txId));
        toast({ title: "Success! ✅", description: data.message });
      } else {
        toast({ title: "Failed", description: data.error || "Failed" });
      }
    } catch {
      toast({ title: "Network error", description: "Try again." });
    }
    setProcessingUpiDepositId(null);
  };

  const fetchTournaments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/tournaments/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID) }),
      });
      const data = await res.json();
      if (res.ok) setTournaments(data.tournaments || []);
    } catch { /* ignore */ }
  };

  // Per-game stats
  const [gameStats, setGameStats] = useState<GameStat[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const fetchGameStats = async () => {
    setLoadingGames(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/games-stats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID) }),
      });
      const data = await res.json();
      if (res.ok) setGameStats(data.games || []);
    } catch { /* ignore */ }
    setLoadingGames(false);
  };

  const handleImageFile = (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 4MB" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setTournamentForm((f) => ({ ...f, imageUrl: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  const handleCreateTournament = async () => {
    if (!tournamentForm.title.trim()) {
      toast({ title: "Invalid", description: "Title bharo." });
      return;
    }
    if (tierRows.length === 0) {
      toast({ title: "Invalid", description: "Kam se kam ek prize tier add karo." });
      return;
    }
    const days = Number(tournamentForm.days) || 0;
    const hours = Number(tournamentForm.hours) || 0;
    const minutes = Number(tournamentForm.minutes) || 0;
    const seconds = Number(tournamentForm.seconds) || 0;
    const durationMs = ((days * 24 + hours) * 60 + minutes) * 60 * 1000 + seconds * 1000;
    if (durationMs <= 0) {
      toast({ title: "Invalid", description: "Duration set karo." });
      return;
    }
    setCreatingTournament(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/tournaments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: String(OWNER_ID),
          title: tournamentForm.title.trim(),
          imageUrl: tournamentForm.imageUrl,
          prizeCurrency: tournamentForm.prizeCurrency,
          prizeTiers: tierRows,
          durationMs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({ title: "Tournament created 🏆" });
      setTournamentForm({ title: "", imageUrl: "", prizeCurrency: "dollar", days: "0", hours: "0", minutes: "15", seconds: "15" });
      fetchTournaments();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed" });
    } finally {
      setCreatingTournament(false);
    }
  };

  const handleDeleteTournament = async (id: string) => {
    if (!confirm("Delete this tournament?")) return;
    setDeletingTournamentId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/tournaments/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID), tournamentId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setTournaments((prev) => prev.filter((t) => t._id !== id));
      toast({ title: "Deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed" });
    } finally {
      setDeletingTournamentId(null);
    }
  };

  const handleDistributeTournament = async (id: string) => {
    if (!confirm("Distribute prizes to top winners now? (tournament closes)")) return;
    setDistributingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/tournaments/distribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID), tournamentId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({ title: "Distributed 🎉", description: `Credited ${data.credited} winners` });
      fetchTournaments();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed" });
    } finally {
      setDistributingId(null);
    }
  };

  // Aviator profit %
  const [aviatorProfit, setAviatorProfit] = useState<number>(50);
  const [aviatorProfitInput, setAviatorProfitInput] = useState<string>("50");
  const [savingProfit, setSavingProfit] = useState(false);

  const fetchAviatorProfit = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/admin/aviator/profit?ownerId=${OWNER_ID}`);
      if (r.ok) {
        const d = await r.json();
        setAviatorProfit(d.percent);
        setAviatorProfitInput(String(d.percent));
      }
    } catch (e) { /* ignore */ }
  };

  const saveAviatorProfit = async () => {
    const num = Number(aviatorProfitInput);
    if (isNaN(num) || num < 0 || num > 95) {
      toast({ title: "Invalid value", description: "Enter a number between 0 and 95" });
      return;
    }
    setSavingProfit(true);
    try {
      const r = await fetch(`${API_BASE_URL}/admin/aviator/profit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID), percent: num }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setAviatorProfit(d.percent);
        toast({ title: "Updated", description: `Aviator profit set to ${d.percent}%` });
      } else {
        toast({ title: "Failed", description: d.error || "Could not update" });
      }
    } catch {
      toast({ title: "Network error", description: "Please retry" });
    }
    setSavingProfit(false);
  };

  // Rigged High Crash setting state
  const [riggedHighCrash, setRiggedHighCrash] = useState(false);
  const [savingRig, setSavingRig] = useState(false);

  const fetchRiggedHighCrash = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/admin/rigged-high-crash?ownerId=${OWNER_ID}`);
      if (r.ok) {
        const d = await r.json();
        setRiggedHighCrash(!!d.rigged);
      }
    } catch (e) { /* ignore */ }
  };

  const saveRiggedHighCrash = async (enabled: boolean) => {
    setSavingRig(true);
    try {
      const r = await fetch(`${API_BASE_URL}/admin/rigged-high-crash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID), enabled }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setRiggedHighCrash(d.rigged);
        toast({ title: "Updated", description: `Rigged High Crash mode is now ${d.rigged ? "ON" : "OFF"}` });
      } else {
        toast({ title: "Failed", description: d.error || "Could not update" });
      }
    } catch {
      toast({ title: "Network error", description: "Please retry" });
    }
    setSavingRig(false);
  };

  // Aviator manual crash queue (per currency)
  const [manualCurrency, setManualCurrency] = useState<"dollar" | "star">("dollar");
  const [manualQueue, setManualQueue] = useState<number[]>([]);
  const [manualActive, setManualActive] = useState(false);
  const [manualInput, setManualInput] = useState<string>("");
  const [manualBulkInput, setManualBulkInput] = useState<string>("");

  const fetchManualQueue = async (curr: "dollar" | "star" = manualCurrency) => {
    try {
      const r = await fetch(`${API_BASE_URL}/admin/aviator/manual?ownerId=${OWNER_ID}&currency=${curr}`);
      if (r.ok) {
        const d = await r.json();
        setManualQueue(d.queue || []);
        setManualActive(!!d.active);
      }
    } catch { /* ignore */ }
  };

  const addManualValue = async (value: number) => {
    if (!isFinite(value) || value <= 0) {
      toast({ title: "Invalid", description: "Value must be greater than 0" });
      return;
    }
    try {
      const r = await fetch(`${API_BASE_URL}/admin/aviator/manual/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID), currency: manualCurrency, value }),
      });
      const d = await r.json();
      if (r.ok) {
        setManualQueue(d.queue);
        setManualInput("");
      } else {
        toast({ title: "Failed", description: d.error || "Could not add" });
      }
    } catch { toast({ title: "Network error", description: "Please retry" }); }
  };

  const removeManualAt = async (index: number) => {
    try {
      const r = await fetch(`${API_BASE_URL}/admin/aviator/manual/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID), currency: manualCurrency, index }),
      });
      const d = await r.json();
      if (r.ok) setManualQueue(d.queue);
    } catch { /* ignore */ }
  };

  const clearManualQueue = async () => {
    try {
      await fetch(`${API_BASE_URL}/admin/aviator/manual/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID), currency: manualCurrency }),
      });
      setManualQueue([]);
    } catch { /* ignore */ }
  };

  const setManualQueueBulk = async () => {
    const parts = manualBulkInput
      .split(/[\s,]+/)
      .map((p) => p.replace(/x$/i, "").trim())
      .filter(Boolean)
      .map((p) => Number(p))
      .filter((n) => isFinite(n) && n > 0 && n <= 100000);
    if (parts.length === 0) {
      toast({ title: "Invalid", description: "Enter values like 1, 3, 1, 2, 4" });
      return;
    }
    try {
      const r = await fetch(`${API_BASE_URL}/admin/aviator/manual/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID), currency: manualCurrency, queue: parts }),
      });
      const d = await r.json();
      if (r.ok) {
        setManualQueue(d.queue);
        setManualBulkInput("");
        toast({ title: "Queue set", description: `${d.queue.length} values queued in exact order` });
      } else {
        toast({ title: "Failed", description: d.error || "Could not set" });
      }
    } catch { toast({ title: "Network error", description: "Please retry" }); }
  };

  const user = getTelegramUser();
  const isOwner = user?.id === OWNER_ID;

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/stats`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerId: String(OWNER_ID) }),
        }),
        fetch(`${API_BASE_URL}/admin/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerId: String(OWNER_ID) }),
        }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users || []);
        setWithdrawals(data.withdrawals || []);
      }
    } catch (e) {
      console.error("Failed to fetch admin data", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOwner) {
      fetchAll();
      fetchAviatorProfit();
      fetchRiggedHighCrash();
      fetchManualQueue("dollar");
      fetchOffers();
      fetchTournaments();
      fetchGameStats();
      fetchUpiConfig();
      fetchUpiDeposits();
    }
  }, []);

  const handleAdjust = async () => {
    if (!adjustUser || !adjustAmount || adjusting) return;
    const num = parseFloat(adjustAmount);
    if (isNaN(num) || num <= 0) return;

    setAdjusting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/adjust-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: String(OWNER_ID),
          targetUserId: adjustUser.telegramId,
          currency: adjustCurrency,
          balanceType: adjustType,
          amount: adjustAction === "add" ? num : -num,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Update local user list
        setUsers(prev => prev.map(u =>
          u.telegramId === adjustUser.telegramId
            ? { ...u, dollarBalance: data.dollarBalance, starBalance: data.starBalance, dollarWinning: data.dollarWinning, starWinning: data.starWinning }
            : u
        ));
        setAdjustUser(null);
        setAdjustAmount("");
      } else {
        alert(data.error || "Failed");
      }
    } catch (e) {
      alert("Network error");
    }
    setAdjusting(false);
  };

  const handleWithdrawalAction = async (txId: string, action: "approve" | "reject") => {
    setProcessingWithdrawal(txId);
    try {
      const endpoint = action === "approve" ? "approve-withdrawal" : "reject-withdrawal";
      let extra: { txId?: string; usdValue?: string } = {};
      if (action === "approve") {
        const providerTxId = window.prompt("Blockchain TxID (optional — will be posted to the withdrawal channel):", "") || "";
        const usd = window.prompt("USD value (optional, e.g. 0.0152):", "") || "";
        extra = { txId: providerTxId.trim(), usdValue: usd.trim() };
      }
      const res = await fetch(`${API_BASE_URL}/admin/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: String(OWNER_ID),
          transactionId: txId,
          reason: action === "reject" ? "Admin rejected" : undefined,
          ...extra,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWithdrawals(prev => prev.filter(w => w._id !== txId));
        alert(data.message);
      } else {
        alert(data.error || "Failed");
      }
    } catch (e) {
      alert("Network error");
    }
    setProcessingWithdrawal(null);
  };

  // ---- Offers handlers ----
  const fetchOffers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/offers/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID) }),
      });
      const data = await res.json();
      if (res.ok) setOffers(data.offers || []);
    } catch { /* ignore */ }
  };

  const handleCreateOffer = async () => {
    const payNum = parseFloat(offerForm.payAmount);
    const getNum = parseFloat(offerForm.getAmount);
    if (isNaN(payNum) || payNum <= 0 || isNaN(getNum) || getNum <= 0) {
      toast({ title: "Invalid offer", description: "Fill pay & get amounts." });
      return;
    }
    const bonusStarNum = parseFloat(offerForm.bonusStar) || 0;
    const bonusDollarNum = parseFloat(offerForm.bonusDollar) || 0;

    // Auto title
    const autoTitle = (offerForm.title || (offerForm.payCurrency === "star" ? "SPECIAL OFFER" : "MEGA DEAL")).trim();

    const inferredBonus = Math.max(0, getNum - payNum);
    const finalBonusStarNum = offerForm.payCurrency === "star" && bonusStarNum <= 0 ? inferredBonus : bonusStarNum;
    const finalBonusDollarNum = offerForm.payCurrency === "dollar" && bonusDollarNum <= 0 ? inferredBonus : bonusDollarNum;

    // Auto bonus label
    const bonusParts: string[] = [];
    if (offerForm.payCurrency === "dollar" && finalBonusDollarNum > 0) bonusParts.push(`+$${finalBonusDollarNum}`);
    if (finalBonusStarNum > 0) bonusParts.push(`+${finalBonusStarNum} ⭐`);
    const autoBonusLabel = bonusParts.join(" ");

    // Auto value % — bonus value vs pay amount (same currency basis)
    // For ⭐ offer: % = bonusStar / payAmount * 100
    // For $ offer: % = (bonusDollar + bonusStar/100) / payAmount * 100  (rough ⭐→$ at 100⭐=$1)
    const bonusValue =
      offerForm.payCurrency === "star"
        ? finalBonusStarNum
        : finalBonusDollarNum + finalBonusStarNum / 100;
    const pct = payNum > 0 ? Math.round((bonusValue / payNum) * 100) : 0;
    const autoValueLabel = pct > 0 ? `${pct}% OFF` : "";

    setCreatingOffer(true);
    try {
      const isEdit = !!editingOfferId;
      const url = isEdit ? `${API_BASE_URL}/admin/offers/update` : `${API_BASE_URL}/admin/offers/create`;
      const body: any = {
        ownerId: String(OWNER_ID),
        title: autoTitle,
        payAmount: payNum,
        payCurrency: offerForm.payCurrency,
        getAmount: getNum,
        bonusLabel: autoBonusLabel,
        valueLabel: autoValueLabel,
      };
      if (isEdit) body.offerId = editingOfferId;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({ title: isEdit ? "Offer updated ✅" : "Offer created ✅", description: `${autoTitle} is now live.` });
      setOfferForm({ title: "", payAmount: "", payCurrency: "star", getAmount: "", bonusStar: "", bonusDollar: "" });
      setEditingOfferId(null);
      fetchOffers();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not save offer." });
    } finally {
      setCreatingOffer(false);
    }
  };

  const startEditOffer = (o: AdminOffer) => {
    const inferred = Math.max(0, Number(o.getAmount || 0) - Number(o.payAmount || 0));
    setEditingOfferId(o._id);
    setOfferForm({
      title: o.title || "",
      payAmount: String(o.payAmount ?? ""),
      payCurrency: (o.payCurrency as "star" | "dollar") || "star",
      getAmount: String(o.getAmount ?? ""),
      bonusStar: o.payCurrency === "star" ? String(inferred) : "",
      bonusDollar: o.payCurrency === "dollar" ? String(inferred) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteOffer = async (offerId: string) => {
    if (!confirm("Delete this offer?")) return;
    setDeletingOfferId(offerId);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/offers/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID), offerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({ title: "Offer deleted" });
      setOffers((prev) => prev.filter((o) => o._id !== offerId));
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not delete." });
    } finally {
      setDeletingOfferId(null);
    }
  };

  const handleBroadcastOffer = async (offerId: string) => {
    if (!confirm("Send this offer to ALL users via bot?")) return;
    setBroadcastingId(offerId);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/offers/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: String(OWNER_ID), offerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({ title: "Broadcast sent 📢", description: `Sent to ${data.sent} users (${data.failed} failed).` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Broadcast failed." });
    } finally {
      setBroadcastingId(null);
    }
  };

  if (!isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(260 60% 15%)" }}>
        <p style={{ color: "hsl(0 70% 60%)" }} className="text-lg font-bold">⛔ Access Denied</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "stats", label: "Stats", icon: <Star className="h-4 w-4" /> },
    { key: "users", label: "Users", icon: <Users className="h-4 w-4" /> },
    { key: "withdrawals", label: "Wd", icon: <CreditCard className="h-4 w-4" /> },
    { key: "upi", label: "UPI Config & Deposits", icon: <Smartphone className="h-4 w-4" /> },
    { key: "offers", label: "Offers", icon: <Tag className="h-4 w-4" /> },
    { key: "tournaments", label: "Tournament", icon: <Trophy className="h-4 w-4" /> },
    { key: "games", label: "Games Win/Loss", icon: <Gamepad2 className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen pb-4" style={{
      background: "linear-gradient(180deg, hsl(260 60% 20%) 0%, hsl(280 50% 15%) 100%)",
    }}>
      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-md px-3 py-2 flex items-center gap-2" style={{
        background: "hsla(260, 50%, 20%, 0.9)",
        borderBottom: "1px solid hsla(45, 80%, 50%, 0.3)",
      }}>
        <button onClick={() => navigate("/")} className="p-1">
          <ArrowLeft className="h-4 w-4" style={{ color: "hsl(45 80% 65%)" }} />
        </button>
        <h1 className="font-bold text-sm" style={{ color: "hsl(45 90% 70%)" }}>👑 Admin Panel</h1>
        <button onClick={fetchAll} className="ml-auto p-1.5 rounded-lg" style={{ background: "hsla(45, 80%, 50%, 0.15)" }}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} style={{ color: "hsl(45 80% 65%)" }} />
        </button>
      </div>

      {/* Tabs - vertical stack */}
      <div className="flex flex-col gap-1.5 px-3 mt-2 max-w-md mx-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all"
            style={{
              background: activeTab === tab.key ? "hsla(45, 80%, 50%, 0.25)" : "hsla(260, 40%, 30%, 0.4)",
              color: activeTab === tab.key ? "hsl(45 90% 70%)" : "hsl(0 0% 55%)",
              border: activeTab === tab.key ? "1px solid hsla(45, 80%, 50%, 0.4)" : "1px solid transparent",
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {loading && !stats ? (
        <div className="flex items-center justify-center py-10">
          <RefreshCw className="h-6 w-6 animate-spin" style={{ color: "hsl(45 80% 65%)" }} />
        </div>
      ) : (
        <div className="px-3 mt-2 max-w-md mx-auto">
          {/* Stats Tab */}
          {activeTab === "stats" && stats && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl p-3" style={{
                  background: "linear-gradient(135deg, hsla(200, 70%, 50%, 0.2), hsla(220, 60%, 40%, 0.2))",
                  border: "1px solid hsla(200, 70%, 50%, 0.3)",
                }}>
                  <Star className="h-4 w-4 mb-1" style={{ color: "hsl(45 90% 60%)" }} />
                  <p className="text-xl font-bold" style={{ color: "hsl(0 0% 95%)" }}>{stats.totalStarsEarned}</p>
                  <p className="text-[10px]" style={{ color: "hsl(0 0% 60%)" }}>Total Stars Earned</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "hsl(200 70% 60%)" }}>{stats.starDepositCount} deposits</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl p-3" style={{
                  background: "linear-gradient(135deg, hsla(120, 60%, 40%, 0.2), hsla(140, 50%, 35%, 0.2))",
                  border: "1px solid hsla(120, 60%, 40%, 0.3)",
                }}>
                  <DollarSign className="h-4 w-4 mb-1" style={{ color: "hsl(120 60% 55%)" }} />
                  <p className="text-xl font-bold" style={{ color: "hsl(0 0% 95%)" }}>${stats.totalDollarsEarned.toFixed(2)}</p>
                  <p className="text-[10px]" style={{ color: "hsl(0 0% 60%)" }}>Total Dollars Earned</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "hsl(120 60% 55%)" }}>{stats.dollarDepositCount} deposits</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl p-3" style={{
                  background: "linear-gradient(135deg, hsla(280, 60%, 50%, 0.2), hsla(300, 50%, 40%, 0.2))",
                  border: "1px solid hsla(280, 60%, 50%, 0.3)",
                }}>
                  <Users className="h-4 w-4 mb-1" style={{ color: "hsl(280 60% 65%)" }} />
                  <p className="text-xl font-bold" style={{ color: "hsl(0 0% 95%)" }}>{stats.totalUsers}</p>
                  <p className="text-[10px]" style={{ color: "hsl(0 0% 60%)" }}>Total Users</p>
                </motion.div>
              </div>

              {/* Aviator profit control */}
              <div className="rounded-2xl p-4" style={{
                background: "linear-gradient(135deg, hsla(350, 80%, 45%, 0.18), hsla(15, 80%, 45%, 0.18))",
                border: "1px solid hsla(350, 80%, 50%, 0.35)",
              }}>
                <h2 className="font-bold text-sm mb-2" style={{ color: "hsl(45 90% 70%)" }}>✈️ Aviator House Profit</h2>
                <p className="text-xs mb-3" style={{ color: "hsl(0 0% 70%)" }}>
                  Current: <span className="font-bold" style={{ color: "hsl(350 90% 65%)" }}>{aviatorProfit}%</span> kept by house each round.
                </p>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min={0}
                    max={95}
                    value={aviatorProfitInput}
                    onChange={(e) => setAviatorProfitInput(e.target.value)}
                    className="flex-1 rounded-lg px-3 py-2 text-sm font-bold outline-none"
                    style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(45, 60%, 50%, 0.3)" }}
                  />
                  <span className="text-sm font-bold" style={{ color: "hsl(45 90% 70%)" }}>%</span>
                  <button
                    onClick={saveAviatorProfit}
                    disabled={savingProfit}
                    className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                    style={{ background: "hsl(350 80% 50%)", color: "white" }}
                  >
                    {savingProfit ? "Saving…" : "Save"}
                  </button>
                </div>
                <p className="text-[10px] mt-2" style={{ color: "hsl(0 0% 55%)" }}>
                  Example: 50% means if total bets are $100, total cashouts are capped at $50.
                </p>
              </div>

              {/* Manual Game Control (High Crash Rig) */}
              <div className="rounded-2xl p-4" style={{
                background: "linear-gradient(135deg, hsla(350, 80%, 45%, 0.18), hsla(300, 80%, 45%, 0.18))",
                border: "1px solid hsla(350, 80%, 50%, 0.35)",
              }}>
                <h2 className="font-bold text-sm mb-2" style={{ color: "hsl(45 90% 70%)" }}>🚨 Manual Game Control (High Crash)</h2>
                <p className="text-xs mb-3" style={{ color: "hsl(0 0% 70%)" }}>
                  Rig all 5 client-side games (Aviator Fun, Chicken Classic, Mines Classic, Goblin Tower, and Twist) to crash/lose instantly!
                </p>
                <div className="flex gap-4 items-center">
                  <span className="text-sm font-bold animate-pulse" style={{ color: riggedHighCrash ? "hsl(0 90% 65%)" : "hsl(140 80% 50%)" }}>
                    Status: {riggedHighCrash ? "🔴 HIGH CRASH RIGGED (ON)" : "🟢 RANDOM/NORMAL (OFF)"}
                  </span>
                  <button
                    onClick={() => saveRiggedHighCrash(!riggedHighCrash)}
                    disabled={savingRig}
                    className="ml-auto px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                    style={{ background: riggedHighCrash ? "hsl(140 70% 35%)" : "hsl(0 80% 50%)", color: "white" }}
                  >
                    {savingRig ? "Processing…" : riggedHighCrash ? "Turn OFF Rig" : "Turn ON Rig"}
                  </button>
                </div>
              </div>

              {/* Aviator Manual Crash Control */}
              <div className="rounded-2xl p-4" style={{
                background: "linear-gradient(135deg, hsla(280, 80%, 35%, 0.22), hsla(220, 80%, 35%, 0.22))",
                border: "1px solid hsla(280, 80%, 55%, 0.4)",
              }}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold text-sm" style={{ color: "hsl(45 90% 70%)" }}>🎯 Aviator Manual Crash Control</h2>
                  {manualActive && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "hsl(140 70% 40%)", color: "white" }}>LIVE</span>
                  )}
                </div>
                <p className="text-xs mb-3" style={{ color: "hsl(0 0% 70%)" }}>
                  Queue exact crash multipliers. Each round consumes one — overrides the auto profit cap.
                </p>

                {/* Currency tabs */}
                <div className="flex gap-2 mb-3">
                  {(["dollar", "star"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => { setManualCurrency(c); fetchManualQueue(c); }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold transition"
                      style={{
                        background: manualCurrency === c ? "hsl(280 70% 50%)" : "hsla(260, 40%, 18%, 0.8)",
                        color: manualCurrency === c ? "white" : "hsl(0 0% 70%)",
                        border: `1px solid ${manualCurrency === c ? "hsl(280 70% 60%)" : "hsla(280, 50%, 40%, 0.3)"}`,
                      }}
                    >
                      {c === "dollar" ? "$ Dollar" : "⭐ Star"}
                    </button>
                  ))}
                </div>

                {/* Quick add buttons */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[1, 1.5, 2, 3, 4, 5, 10].map((v) => (
                    <button
                      key={v}
                      onClick={() => addManualValue(v)}
                      className="px-2.5 py-1 rounded-md text-xs font-bold"
                      style={{ background: "hsl(350 80% 50%)", color: "white" }}
                    >
                      {v}x
                    </button>
                  ))}
                </div>

                {/* Custom input */}
                <div className="flex gap-2 items-center mb-3">
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="Custom (e.g. 1.75)"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    className="flex-1 rounded-lg px-3 py-2 text-sm font-bold outline-none"
                    style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(280, 60%, 50%, 0.3)" }}
                  />
                  <button
                    onClick={() => { const n = Number(manualInput); if (!isNaN(n)) addManualValue(n); }}
                    className="px-4 py-2 rounded-lg text-xs font-bold"
                    style={{ background: "hsl(140 70% 40%)", color: "white" }}
                  >
                    + Add
                  </button>
                </div>

                {/* Bulk set queue (exact order, replaces existing) */}
                <div className="rounded-lg p-2 mb-3" style={{ background: "hsla(260, 40%, 12%, 0.6)", border: "1px dashed hsla(280, 60%, 50%, 0.4)" }}>
                  <p className="text-[11px] font-bold mb-1.5" style={{ color: "hsl(45 90% 70%)" }}>
                    📝 Bulk Set (exact order, replaces queue)
                  </p>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="e.g. 1, 3, 1, 2, 4"
                      value={manualBulkInput}
                      onChange={(e) => setManualBulkInput(e.target.value)}
                      className="flex-1 rounded-lg px-3 py-2 text-sm font-bold outline-none"
                      style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(280, 60%, 50%, 0.3)" }}
                    />
                    <button
                      onClick={setManualQueueBulk}
                      className="px-4 py-2 rounded-lg text-xs font-bold"
                      style={{ background: "hsl(45 90% 50%)", color: "hsl(260 70% 15%)" }}
                    >
                      Set
                    </button>
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: "hsl(0 0% 55%)" }}>
                    Comma/space separated. Order preserved exactly.
                  </p>
                </div>

                {/* Queue list */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold" style={{ color: "hsl(0 0% 70%)" }}>
                    Queue ({manualQueue.length})
                  </span>
                  {manualQueue.length > 0 && (
                    <button
                      onClick={clearManualQueue}
                      className="text-[10px] font-bold px-2 py-0.5 rounded"
                      style={{ background: "hsla(0, 70%, 40%, 0.3)", color: "hsl(0 90% 75%)" }}
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="rounded-lg p-2 min-h-[44px]" style={{ background: "hsla(260, 40%, 12%, 0.6)", border: "1px solid hsla(280, 50%, 40%, 0.2)" }}>
                  {manualQueue.length === 0 ? (
                    <p className="text-xs text-center py-2" style={{ color: "hsl(0 0% 50%)" }}>
                      Empty — auto profit% logic will run.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {manualQueue.map((v, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold"
                          style={{ background: i === 0 ? "hsl(45 90% 50%)" : "hsla(280, 60%, 50%, 0.8)", color: i === 0 ? "hsl(260 70% 15%)" : "white" }}
                        >
                          #{i + 1}: {v}x
                          <button onClick={() => removeManualAt(i)} className="ml-0.5 opacity-80 hover:opacity-100" aria-label="Remove">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[10px] mt-2" style={{ color: "hsl(0 0% 55%)" }}>
                  #1 (yellow) is next round's crash. Lower values = more user losses, higher profit.
                </p>
                <button
                  onClick={() => fetchManualQueue()}
                  className="w-full mt-2 py-1.5 rounded-md text-[11px] font-bold"
                  style={{ background: "hsla(260, 40%, 20%, 0.8)", color: "hsl(0 0% 80%)" }}
                >
                  ↻ Refresh
                </button>
              </div>

              <div>
                <h2 className="font-bold text-sm mb-3" style={{ color: "hsl(45 90% 70%)" }}>📋 Recent Deposits</h2>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {stats.recentTransactions.map((tx, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                      className="rounded-xl p-3 flex items-center justify-between"
                      style={{ background: "hsla(260, 40%, 25%, 0.6)", border: "1px solid hsla(260, 40%, 40%, 0.2)" }}>
                      <div>
                        <p className="text-xs font-mono" style={{ color: "hsl(0 0% 60%)" }}>ID: {tx.telegramId}</p>
                        <p className="text-[10px]" style={{ color: "hsl(0 0% 45%)" }}>{new Date(tx.createdAt).toLocaleString()}</p>
                      </div>
                      <p className="font-bold text-sm" style={{ color: tx.currency === "star" ? "hsl(45 90% 60%)" : "hsl(120 60% 55%)" }}>
                        {tx.currency === "star" ? `⭐ ${tx.amount}` : `$${tx.amount}`}
                      </p>
                    </motion.div>
                  ))}
                  {stats.recentTransactions.length === 0 && (
                    <p className="text-center text-sm py-4" style={{ color: "hsl(0 0% 50%)" }}>No deposits yet</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === "users" && (
            <div className="space-y-3">
              {/* Active / Offline summary */}
              {(() => {
                const now = Date.now();
                const FIVE_MIN = 5 * 60 * 1000;
                const activeUsers = users.filter(u => u.lastActive && (now - new Date(u.lastActive).getTime()) < FIVE_MIN);
                const offlineUsers = users.filter(u => !u.lastActive || (now - new Date(u.lastActive).getTime()) >= FIVE_MIN);
                return (
                  <>
                    {/* Summary bar */}
                    <div className="flex gap-3 mb-1">
                      <div className="flex-1 rounded-xl p-3 flex items-center gap-2" style={{
                        background: "linear-gradient(135deg, hsla(120, 70%, 40%, 0.25), hsla(140, 60%, 35%, 0.15))",
                        border: "1px solid hsla(120, 70%, 45%, 0.4)",
                      }}>
                        <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: "hsl(120 70% 50%)", boxShadow: "0 0 8px hsl(120 70% 50%)" }} />
                        <div>
                          <p className="text-lg font-bold" style={{ color: "hsl(120 70% 65%)" }}>{activeUsers.length}</p>
                          <p className="text-[10px] font-bold" style={{ color: "hsl(120 50% 55%)" }}>Active Now</p>
                        </div>
                      </div>
                      <div className="flex-1 rounded-xl p-3 flex items-center gap-2" style={{
                        background: "linear-gradient(135deg, hsla(0, 0%, 50%, 0.15), hsla(0, 0%, 40%, 0.1))",
                        border: "1px solid hsla(0, 0%, 50%, 0.3)",
                      }}>
                        <div className="w-3 h-3 rounded-full" style={{ background: "hsl(0 0% 45%)" }} />
                        <div>
                          <p className="text-lg font-bold" style={{ color: "hsl(0 0% 65%)" }}>{offlineUsers.length}</p>
                          <p className="text-[10px] font-bold" style={{ color: "hsl(0 0% 50%)" }}>Offline</p>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs" style={{ color: "hsl(0 0% 50%)" }}>{users.length} total users</p>
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                      {users.map((u, i) => {
                        const isActive = u.lastActive && (now - new Date(u.lastActive).getTime()) < FIVE_MIN;
                        const lastSeenText = u.lastActive
                          ? (() => {
                              const diff = now - new Date(u.lastActive).getTime();
                              if (diff < 60000) return "Just now";
                              if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                              if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
                              return `${Math.floor(diff / 86400000)}d ago`;
                            })()
                          : "Never";
                        return (
                          <motion.div key={u.telegramId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                            className="rounded-xl p-3" style={{
                              background: "hsla(260, 40%, 25%, 0.6)",
                              border: isActive
                                ? "1px solid hsla(120, 70%, 45%, 0.4)"
                                : "1px solid hsla(260, 40%, 40%, 0.2)",
                            }}>
                            <div className="flex items-center gap-2 mb-2">
                              {/* Online/Offline dot */}
                              <div className="relative">
                                <User className="h-4 w-4" style={{ color: "hsl(45 80% 65%)" }} />
                                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                                  style={{
                                    background: isActive ? "hsl(120 70% 50%)" : "hsl(0 0% 45%)",
                                    borderColor: "hsl(260 40% 25%)",
                                    boxShadow: isActive ? "0 0 6px hsl(120 70% 50%)" : "none",
                                  }}
                                />
                              </div>
                              <span className="text-xs font-bold" style={{ color: "hsl(0 0% 90%)" }}>
                                {u.firstName || u.username || "Unknown"}
                                {u.lastName ? ` ${u.lastName}` : ""}
                              </span>
                              {u.username && (
                                <span className="text-[10px]" style={{ color: "hsl(200 70% 60%)" }}>@{u.username}</span>
                              )}
                              {/* Status badge */}
                              <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full font-bold" style={{
                                background: isActive ? "hsla(120, 70%, 45%, 0.2)" : "hsla(0, 0%, 50%, 0.15)",
                                color: isActive ? "hsl(120 70% 60%)" : "hsl(0 0% 55%)",
                              }}>
                                {isActive ? "🟢 Online" : `⚫ ${lastSeenText}`}
                              </span>
                            </div>
                            <p className="text-[10px] font-mono mb-2" style={{ color: "hsl(0 0% 50%)" }}>ID: {u.telegramId}</p>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div className="rounded-lg p-2" style={{ background: "hsla(45, 80%, 50%, 0.1)" }}>
                                <p className="text-[10px]" style={{ color: "hsl(0 0% 50%)" }}>⭐ Star Wallet</p>
                                <p className="text-sm font-bold" style={{ color: "hsl(45 90% 60%)" }}>
                                  {(u.starBalance || 0) + (u.starWinning || 0)}
                                </p>
                              </div>
                              <div className="rounded-lg p-2" style={{ background: "hsla(120, 60%, 40%, 0.1)" }}>
                                <p className="text-[10px]" style={{ color: "hsl(0 0% 50%)" }}>$ Dollar Wallet</p>
                                <p className="text-sm font-bold" style={{ color: "hsl(120 60% 55%)" }}>
                                  ${((u.dollarBalance || 0) + (u.dollarWinning || 0)).toFixed(2)}
                                </p>
                              </div>
                            </div>
                            {/* Fund Adjust Button */}
                            <button
                              onClick={() => { setAdjustUser(u); setAdjustAmount(""); setAdjustAction("add"); }}
                              className="w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
                              style={{
                                background: "linear-gradient(135deg, hsla(45, 80%, 50%, 0.25), hsla(30, 80%, 50%, 0.25))",
                                border: "1px solid hsla(45, 80%, 50%, 0.4)",
                                color: "hsl(45 90% 70%)",
                              }}
                            >
                              <DollarSign className="h-3.5 w-3.5" /> Adjust Fund
                            </button>
                          </motion.div>
                        );
                      })}
                      {users.length === 0 && (
                        <p className="text-center text-sm py-8" style={{ color: "hsl(0 0% 50%)" }}>No users yet</p>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Withdrawals Tab */}
          {activeTab === "withdrawals" && (
            <div className="space-y-2">
              <p className="text-xs mb-2" style={{ color: "hsl(0 0% 50%)" }}>{withdrawals.length} pending requests</p>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {withdrawals.map((w, i) => (
                  <motion.div key={w._id || i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="rounded-xl p-3 space-y-2" style={{ background: "hsla(260, 40%, 25%, 0.6)", border: "1px solid hsla(0, 70%, 45%, 0.3)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        {(() => {
                          const user = users.find(u => u.telegramId === w.telegramId);
                          return user ? (
                            <p className="text-xs font-bold cursor-pointer mb-0.5" style={{ color: "hsl(210 90% 60%)" }}>
                              👤 {user.firstName}{user.lastName ? ` ${user.lastName}` : ""}
                            </p>
                          ) : null;
                        })()}
                        <span className="text-xs font-mono" style={{ color: "hsl(0 0% 60%)" }}>ID: {w.telegramId}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{
                        background: "hsla(45, 80%, 50%, 0.2)",
                        color: "hsl(45 80% 65%)",
                      }}>{w.status}</span>
                    </div>
                    <p className="font-bold text-sm" style={{
                      color: w.currency === "star" ? "hsl(45 90% 60%)" : "hsl(120 60% 55%)",
                    }}>
                      {w.currency === "star" ? `⭐ ${Math.abs(w.amount)}` : `$${Math.abs(w.amount).toFixed(2)}`}
                    </p>
                    {/* Crypto Address & Network */}
                    <div className="rounded-lg p-2 space-y-1" style={{ background: "hsla(200, 60%, 50%, 0.1)", border: "1px solid hsla(200, 60%, 50%, 0.2)" }}>
                      <p className="text-[10px] font-bold" style={{ color: "hsl(200 70% 60%)" }}>
                        🔗 Network: <span style={{ color: "hsl(45 80% 65%)" }}>{w.withdrawalNetwork || "Not specified"}</span>
                      </p>
                      <p className="text-[10px] font-bold" style={{ color: "hsl(200 70% 60%)" }}>📍 Crypto Address:</p>
                      <div className="flex items-center gap-1">
                        <p className="text-[11px] font-mono break-all flex-1" style={{ color: "hsl(0 0% 80%)" }}>{w.cryptoAddress || "N/A"}</p>
                        {w.cryptoAddress && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(w.cryptoAddress || "");
                              toast({ title: "✅ Copied!", description: "Address copied to clipboard" });
                            }}
                            className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                            title="Copy address"
                          >
                            <Copy className="w-3.5 h-3.5" style={{ color: "hsl(45 80% 65%)" }} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px]" style={{ color: "hsl(0 0% 45%)" }}>
                      {new Date(w.createdAt).toLocaleString()}
                    </p>
                    {w.description && <p className="text-[10px]" style={{ color: "hsl(0 0% 40%)" }}>{w.description}</p>}
                    {/* Approve / Reject Buttons */}
                    {w.status === "pending" && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleWithdrawalAction(w._id, "approve")}
                          disabled={processingWithdrawal === w._id}
                          className="flex-1 py-2 rounded-lg text-xs font-bold disabled:opacity-40"
                          style={{
                            background: "linear-gradient(135deg, hsl(120 60% 35%), hsl(140 50% 30%))",
                            color: "hsl(0 0% 95%)",
                          }}
                        >
                          {processingWithdrawal === w._id ? "..." : "✅ Approve"}
                        </button>
                        <button
                          onClick={() => handleWithdrawalAction(w._id, "reject")}
                          disabled={processingWithdrawal === w._id}
                          className="flex-1 py-2 rounded-lg text-xs font-bold disabled:opacity-40"
                          style={{
                            background: "linear-gradient(135deg, hsl(0 70% 40%), hsl(15 60% 35%))",
                            color: "hsl(0 0% 95%)",
                          }}
                        >
                          {processingWithdrawal === w._id ? "..." : "❌ Reject"}
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
                {withdrawals.length === 0 && (
                  <p className="text-center text-sm py-8" style={{ color: "hsl(0 0% 50%)" }}>No withdrawal requests</p>
                )}
              </div>
            </div>
          )}

          {/* UPI Settings & Deposits Tab */}
          {activeTab === "upi" && (
            <div className="space-y-4">
              
              {/* UPI Config Form */}
              <div className="rounded-2xl p-4 space-y-3" style={{
                background: "linear-gradient(135deg, hsla(200, 70%, 50%, 0.15), hsla(220, 60%, 40%, 0.15))",
                border: "1px solid hsla(200, 70%, 50%, 0.3)",
              }}>
                <h2 className="font-bold text-sm" style={{ color: "hsl(200 90% 75%)" }}>⚙️ Configure UPI details</h2>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold" style={{ color: "hsl(0 0% 70%)" }}>UPI ID / Address</label>
                  <input
                    type="text"
                    value={upiForm.upiId}
                    onChange={e => setUpiForm({ ...upiForm, upiId: e.target.value })}
                    placeholder="e.g. payee@upi"
                    className="w-full rounded-lg px-3 py-2 text-xs font-bold outline-none"
                    style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(200, 60%, 50%, 0.3)" }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold" style={{ color: "hsl(0 0% 70%)" }}>Payee Name (displayed to user)</label>
                  <input
                    type="text"
                    value={upiForm.payeeName}
                    onChange={e => setUpiForm({ ...upiForm, payeeName: e.target.value })}
                    placeholder="e.g. Royal King Games"
                    className="w-full rounded-lg px-3 py-2 text-xs font-bold outline-none"
                    style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(200, 60%, 50%, 0.3)" }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold" style={{ color: "hsl(0 0% 70%)" }}>Exchange Rate (1$ = ₹X)</label>
                    <input
                      type="number"
                      value={upiForm.exchangeRate}
                      onChange={e => setUpiForm({ ...upiForm, exchangeRate: Number(e.target.value) || 85 })}
                      placeholder="85"
                      className="w-full rounded-lg px-3 py-2 text-xs font-bold outline-none"
                      style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(200, 60%, 50%, 0.3)" }}
                    />
                  </div>
                  <div className="space-y-1 flex flex-col justify-end">
                    <button
                      onClick={() => setUpiForm({ ...upiForm, isEnabled: !upiForm.isEnabled })}
                      className="w-full py-2 rounded-lg text-xs font-bold border transition-colors"
                      style={{
                        background: upiForm.isEnabled ? "hsla(140, 70%, 40%, 0.2)" : "hsla(0, 70%, 40%, 0.2)",
                        borderColor: upiForm.isEnabled ? "hsl(140 70% 45%)" : "hsl(0 70% 45%)",
                        color: upiForm.isEnabled ? "hsl(140 90% 70%)" : "hsl(0 90% 70%)"
                      }}
                    >
                      {upiForm.isEnabled ? "🟢 UPI Active" : "🔴 UPI Disabled"}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSaveUpiConfig}
                  disabled={savingUpiConfig}
                  className="w-full py-2 mt-2 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: "linear-gradient(135deg, hsl(200, 70%, 45%), hsl(220, 60%, 40%))",
                    color: "white"
                  }}
                >
                  {savingUpiConfig ? "Saving Config..." : "Save UPI Settings"}
                </button>
              </div>

              {/* Pending Deposits List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wide">Pending UPI Deposits</h3>
                  <button onClick={fetchUpiDeposits} className="text-[10px] font-bold text-[#00a2e8] hover:underline">
                    ↻ Refresh List
                  </button>
                </div>
                
                {loadingUpi ? (
                  <p className="text-center text-xs py-4" style={{ color: "hsl(0 0% 50%)" }}>Loading UPI requests...</p>
                ) : upiDeposits.length === 0 ? (
                  <p className="text-center text-xs py-4" style={{ color: "hsl(0 0% 50%)" }}>No pending UPI deposits</p>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {upiDeposits.map((d, i) => {
                      const user = users.find(u => u.telegramId === d.telegramId);
                      return (
                        <motion.div key={d._id || i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                          className="rounded-xl p-3.5 space-y-2" style={{ background: "hsla(260, 40%, 25%, 0.6)", border: "1px solid hsla(200, 70%, 45%, 0.3)" }}>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              {user ? (
                                <p className="text-xs font-bold mb-0.5 text-blue-400">
                                  👤 {user.firstName}{user.lastName ? ` ${user.lastName}` : ""}
                                </p>
                              ) : null}
                              <span className="text-[10px] font-mono text-slate-400">ID: {d.telegramId}</span>
                            </div>
                            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-[#0d121f] text-amber-400">
                              PENDING
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-white/[0.02]">
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase tracking-wider">USD Amount to credit</p>
                              <p className="font-extrabold text-sm text-emerald-400">${d.amount.toFixed(2)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wider">INR to pay (approx)</p>
                              <p className="font-bold text-xs text-white">₹{(d.amount * upiForm.exchangeRate).toFixed(2)}</p>
                            </div>
                          </div>

                          <div className="bg-[#0d121f] rounded-lg p-2 text-[10px] font-mono text-slate-300 border border-white/[0.01]">
                            {d.description || "UPI Deposit request"}
                          </div>

                          <div className="flex gap-2 pt-1.5">
                            <button
                              onClick={() => handleUpiDepositAction(d._id, "approve")}
                              disabled={processingUpiDepositId === d._id}
                              className="flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                              style={{
                                background: "linear-gradient(135deg, hsl(120 60% 35%), hsl(140 50% 30%))",
                                color: "white",
                              }}
                            >
                              {processingUpiDepositId === d._id ? "..." : "Approve & Credit"}
                            </button>
                            <button
                              onClick={() => handleUpiDepositAction(d._id, "reject")}
                              disabled={processingUpiDepositId === d._id}
                              className="flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                              style={{
                                background: "linear-gradient(135deg, hsl(0 70% 40%), hsl(15 60% 35%))",
                                color: "white",
                              }}
                            >
                              {processingUpiDepositId === d._id ? "..." : "Reject request"}
                            </button>
                          </div>

                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Offers Tab */}
          {activeTab === "offers" && (
            <div className="space-y-4">
              {/* Create new offer form */}
              <div className="rounded-2xl p-4" style={{
                background: "linear-gradient(135deg, hsla(45, 90%, 50%, 0.18), hsla(25, 80%, 45%, 0.18))",
                border: "1px solid hsla(45, 80%, 50%, 0.35)",
              }}>
                <h2 className="font-bold text-sm mb-3" style={{ color: "hsl(45 95% 70%)" }}>🎁 Create New Offer</h2>
                <p className="text-[11px] mb-3" style={{ color: "hsl(260 30% 75%)" }}>
                  % VALUE auto set hoga. Title niche se choose karo.
                </p>

                {/* Title preset picker */}
                <p className="text-[10px] mb-1 font-bold" style={{ color: "hsl(45 90% 70%)" }}>Offer Title</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {["SPECIAL OFFER", "MEGA DEAL", "STARTER PACK", "VIP BUNDLE", "DAILY DEAL"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setOfferForm({ ...offerForm, title: t })}
                      className="py-2 rounded-lg text-[11px] font-bold"
                      style={{
                        background: offerForm.title === t ? "hsla(45, 80%, 50%, 0.3)" : "hsla(260, 40%, 18%, 0.7)",
                        border: offerForm.title === t ? "1px solid hsla(45, 85%, 55%, 0.7)" : "1px solid hsla(260, 40%, 30%, 0.5)",
                        color: offerForm.title === t ? "hsl(45 95% 75%)" : "hsl(0 0% 75%)",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 mb-2">
                  {(["star", "dollar"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setOfferForm({ ...offerForm, payCurrency: c })}
                      className="flex-1 py-2 rounded-lg text-xs font-bold"
                      style={{
                        background: offerForm.payCurrency === c ? "hsla(45, 80%, 50%, 0.25)" : "hsla(260, 40%, 30%, 0.4)",
                        border: offerForm.payCurrency === c ? "1px solid hsla(45, 80%, 50%, 0.4)" : "1px solid transparent",
                        color: offerForm.payCurrency === c ? "hsl(45 90% 70%)" : "hsl(0 0% 55%)",
                      }}
                    >
                      {c === "star" ? "⭐ Star" : "$ Dollar (BTC)"}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    type="number"
                    placeholder={offerForm.payCurrency === "dollar" ? "Pay $ amount" : "Pay ⭐ amount"}
                    value={offerForm.payAmount}
                    onChange={(e) => setOfferForm({ ...offerForm, payAmount: e.target.value })}
                    className="rounded-lg px-3 py-2 text-sm font-bold outline-none"
                    style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(45, 60%, 50%, 0.3)" }}
                  />
                  <input
                    type="number"
                    placeholder={offerForm.payCurrency === "dollar" ? "Get $ amount" : "Get ⭐ amount"}
                    value={offerForm.getAmount}
                    onChange={(e) => setOfferForm({ ...offerForm, getAmount: e.target.value })}
                    className="rounded-lg px-3 py-2 text-sm font-bold outline-none"
                    style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(120, 60%, 45%, 0.3)" }}
                  />
                </div>

                {offerForm.payCurrency === "dollar" && (
                  <input
                    type="number"
                    placeholder="Bonus $ amount (extra dollars)"
                    value={offerForm.bonusDollar}
                    onChange={(e) => setOfferForm({ ...offerForm, bonusDollar: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 mb-2 text-sm outline-none"
                    style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(45, 60%, 50%, 0.3)" }}
                  />
                )}

                <input
                  type="number"
                  placeholder="Bonus ⭐ amount (extra stars)"
                  value={offerForm.bonusStar}
                  onChange={(e) => setOfferForm({ ...offerForm, bonusStar: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 mb-3 text-sm outline-none"
                  style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(280, 60%, 50%, 0.3)" }}
                />

                <div className="flex gap-2">
                  <button
                    onClick={handleCreateOffer}
                    disabled={creatingOffer}
                    className="flex-1 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50"
                    style={{ background: editingOfferId
                      ? "linear-gradient(135deg, hsl(35 85% 50%), hsl(20 80% 45%))"
                      : "linear-gradient(135deg, hsl(140 70% 40%), hsl(160 60% 35%))", color: "white" }}
                  >
                    {creatingOffer ? (editingOfferId ? "Updating…" : "Creating…") : (editingOfferId ? "💾 Update Offer" : "➕ Create Offer")}
                  </button>
                  {editingOfferId && (
                    <button
                      onClick={() => {
                        setEditingOfferId(null);
                        setOfferForm({ title: "", payAmount: "", payCurrency: "star", getAmount: "", bonusStar: "", bonusDollar: "" });
                      }}
                      className="px-3 py-2.5 rounded-lg text-sm font-bold"
                      style={{ background: "hsla(0, 0%, 100%, 0.1)", color: "hsl(0 0% 90%)" }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Existing offers */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold text-sm" style={{ color: "hsl(45 90% 70%)" }}>📋 Active Offers ({offers.length})</h2>
                  <button onClick={fetchOffers} className="p-1.5 rounded-md" style={{ background: "hsla(260, 40%, 25%, 0.6)" }}>
                    <RefreshCw className="h-3.5 w-3.5" style={{ color: "hsl(45 80% 65%)" }} />
                  </button>
                </div>

                {offers.length === 0 ? (
                  <p className="text-center text-xs py-6" style={{ color: "hsl(0 0% 50%)" }}>No offers yet — create one above.</p>
                ) : (
                  <div className="space-y-2">
                    {offers.map((o) => {
                      const payDisp = o.payCurrency === "star" ? `${o.payAmount} ⭐` : `$${o.payAmount}`;
                      const getDisp = o.payCurrency === "star" ? `${o.getAmount} ⭐` : `$${o.getAmount}`;
                      return (
                        <div key={o._id} className="rounded-xl p-3" style={{
                          background: "hsla(260, 40%, 25%, 0.6)",
                          border: "1px solid hsla(45, 80%, 50%, 0.25)",
                        }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="font-bold text-sm" style={{ color: "hsl(45 95% 70%)" }}>{o.title}</p>
                            {o.valueLabel && (
                              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={{
                                background: "hsla(0, 70%, 50%, 0.3)", color: "hsl(0 90% 75%)",
                              }}>{o.valueLabel}</span>
                            )}
                          </div>
                          <p className="text-xs mb-2" style={{ color: "hsl(0 0% 75%)" }}>
                            Pay <span style={{ color: "hsl(0 0% 100%)" }} className="font-bold">{payDisp}</span> → Get <span style={{ color: "hsl(120 70% 60%)" }} className="font-bold">{getDisp}</span>
                            {o.bonusLabel && <> · <span style={{ color: "hsl(45 95% 65%)" }}>{o.bonusLabel}</span></>}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleBroadcastOffer(o._id)}
                              disabled={broadcastingId === o._id}
                              className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg, hsl(200 75% 45%), hsl(220 70% 40%))", color: "white" }}
                            >
                              <Send className="h-3.5 w-3.5" />
                              {broadcastingId === o._id ? "Sending…" : "Broadcast"}
                            </button>
                            <button
                              onClick={() => startEditOffer(o)}
                              className="px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                              style={{ background: "linear-gradient(135deg, hsl(35 85% 50%), hsl(20 80% 45%))", color: "white" }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteOffer(o._id)}
                              disabled={deletingOfferId === o._id}
                              className="px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg, hsl(0 70% 45%), hsl(15 60% 40%))", color: "white" }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tournaments Tab */}
          {activeTab === "tournaments" && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4" style={{
                background: "linear-gradient(135deg, hsla(280, 70%, 45%, 0.2), hsla(45, 80%, 50%, 0.18))",
                border: "1px solid hsla(45, 80%, 50%, 0.35)",
              }}>
                <h2 className="font-bold text-sm mb-3" style={{ color: "hsl(45 95% 70%)" }}>🏆 Create Tournament</h2>

                <input
                  type="text"
                  placeholder="Title (e.g. Mega Game Battle)"
                  value={tournamentForm.title}
                  onChange={(e) => setTournamentForm({ ...tournamentForm, title: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 mb-2 text-sm font-bold outline-none"
                  style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(45, 60%, 50%, 0.3)" }}
                />

                {/* Image upload */}
                <label className="block text-[11px] mb-1 mt-1" style={{ color: "hsl(0 0% 70%)" }}>Tournament Photo (upload)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
                  className="w-full rounded-lg px-3 py-2 mb-1 text-xs outline-none"
                  style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 80%)", border: "1px solid hsla(280, 60%, 50%, 0.3)" }}
                />
                {tournamentForm.imageUrl && (
                  <div className="relative mb-2">
                    <img src={tournamentForm.imageUrl} alt="preview" className="w-full h-28 object-cover rounded-lg" />
                    <button
                      onClick={() => setTournamentForm({ ...tournamentForm, imageUrl: "" })}
                      className="absolute top-1 right-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
                      style={{ background: "hsla(0,70%,45%,0.85)", color: "white" }}
                    >Remove</button>
                  </div>
                )}

                <label className="block text-[11px] mb-1" style={{ color: "hsl(0 0% 70%)" }}>Prize Currency</label>
                <div className="flex gap-2 mb-3">
                  {(["dollar", "star"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setTournamentForm({ ...tournamentForm, prizeCurrency: c })}
                      className="flex-1 py-2 rounded-lg text-xs font-bold"
                      style={{
                        background: tournamentForm.prizeCurrency === c ? "hsla(45, 80%, 50%, 0.25)" : "hsla(260, 40%, 30%, 0.4)",
                        border: tournamentForm.prizeCurrency === c ? "1px solid hsla(45, 80%, 50%, 0.4)" : "1px solid transparent",
                        color: tournamentForm.prizeCurrency === c ? "hsl(45 90% 70%)" : "hsl(0 0% 55%)",
                      }}
                    >
                      {c === "star" ? "⭐ Star" : "$ Dollar"}
                    </button>
                  ))}
                </div>

                {/* Duration */}
                <label className="block text-[11px] mb-1" style={{ color: "hsl(0 0% 70%)" }}>Duration (Days / Hours / Minutes / Seconds)</label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {(["days","hours","minutes","seconds"] as const).map((k) => (
                    <input
                      key={k}
                      type="number"
                      min={0}
                      placeholder={k[0].toUpperCase()}
                      value={(tournamentForm as any)[k]}
                      onChange={(e) => setTournamentForm({ ...tournamentForm, [k]: e.target.value })}
                      className="rounded-lg px-2 py-2 text-sm font-bold text-center outline-none"
                      style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(280, 60%, 50%, 0.3)" }}
                    />
                  ))}
                </div>

                {/* Prize tiers editor */}
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px]" style={{ color: "hsl(0 0% 70%)" }}>Prize Tiers (rank ranges, max 100)</label>
                  <button
                    onClick={() => {
                      const last = tierRows[tierRows.length - 1];
                      const start = last ? last.toRank + 1 : 1;
                      if (start > 100) return;
                      setTierRows([...tierRows, { fromRank: start, toRank: Math.min(start, 100), amount: 0 }]);
                    }}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                    style={{ background: "hsla(280, 70%, 50%, 0.4)", color: "white" }}
                  >+ Add Tier</button>
                </div>
                <div className="space-y-1.5 mb-3">
                  {tierRows.map((row, idx) => (
                    <div key={idx} className="flex gap-1.5 items-center">
                      <input
                        type="number" min={1} max={100} value={row.fromRank}
                        onChange={(e) => { const v = [...tierRows]; v[idx] = { ...v[idx], fromRank: Number(e.target.value) }; setTierRows(v); }}
                        className="w-14 rounded-md px-2 py-1.5 text-xs text-center outline-none"
                        style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(45, 60%, 50%, 0.25)" }}
                      />
                      <span className="text-[10px]" style={{ color: "hsl(0 0% 60%)" }}>to</span>
                      <input
                        type="number" min={1} max={100} value={row.toRank}
                        onChange={(e) => { const v = [...tierRows]; v[idx] = { ...v[idx], toRank: Number(e.target.value) }; setTierRows(v); }}
                        className="w-14 rounded-md px-2 py-1.5 text-xs text-center outline-none"
                        style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(0 0% 95%)", border: "1px solid hsla(45, 60%, 50%, 0.25)" }}
                      />
                      <span className="text-[10px]" style={{ color: "hsl(0 0% 60%)" }}>=</span>
                      <input
                        type="number" min={0} value={row.amount}
                        onChange={(e) => { const v = [...tierRows]; v[idx] = { ...v[idx], amount: Number(e.target.value) }; setTierRows(v); }}
                        placeholder="Prize"
                        className="flex-1 rounded-md px-2 py-1.5 text-xs font-bold outline-none"
                        style={{ background: "hsla(260, 40%, 15%, 0.8)", color: "hsl(120 70% 70%)", border: "1px solid hsla(120, 60%, 45%, 0.25)" }}
                      />
                      <button
                        onClick={() => setTierRows(tierRows.filter((_, i) => i !== idx))}
                        className="px-2 py-1.5 rounded-md"
                        style={{ background: "hsla(0, 70%, 45%, 0.5)", color: "white" }}
                      ><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleCreateTournament}
                  disabled={creatingTournament}
                  className="w-full py-2.5 rounded-lg text-sm font-bold disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, hsl(280 70% 45%), hsl(45 80% 50%))", color: "white" }}
                >
                  {creatingTournament ? "Creating…" : "🏆 Create Tournament"}
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold text-sm" style={{ color: "hsl(45 90% 70%)" }}>📋 All Tournaments ({tournaments.length})</h2>
                  <button onClick={fetchTournaments} className="p-1.5 rounded-md" style={{ background: "hsla(260, 40%, 25%, 0.6)" }}>
                    <RefreshCw className="h-3.5 w-3.5" style={{ color: "hsl(45 80% 65%)" }} />
                  </button>
                </div>

                {tournaments.length === 0 ? (
                  <p className="text-center text-xs py-6" style={{ color: "hsl(0 0% 50%)" }}>No tournaments yet.</p>
                ) : (
                  <div className="space-y-2">
                    {tournaments.map((t) => {
                      const sym = t.prizeCurrency === "dollar" ? "$" : "⭐";
                      return (
                        <div key={t._id} className="rounded-xl p-3" style={{
                          background: "hsla(260, 40%, 25%, 0.6)",
                          border: t.active ? "1px solid hsla(45, 80%, 50%, 0.3)" : "1px solid hsla(0, 0%, 40%, 0.2)",
                          opacity: t.active ? 1 : 0.6,
                        }}>
                          <div className="flex gap-3">
                            {t.imageUrl && (
                              <img src={t.imageUrl} alt={t.title} className="w-16 h-16 rounded-lg object-cover" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm truncate" style={{ color: "hsl(45 95% 70%)" }}>{t.title}</p>
                              <p className="text-[11px]" style={{ color: "hsl(0 0% 75%)" }}>
                                Top {t.tier} • {(t.prizeTiers && t.prizeTiers.length) ? `${t.prizeTiers.length} tiers` : `${sym}${t.prizePerWinner} each`}
                              </p>
                              {t.endsAt && (
                                <p className="text-[10px]" style={{ color: "hsl(280 60% 75%)" }}>
                                  Ends: {new Date(t.endsAt).toLocaleString()}
                                </p>
                              )}
                              <p className="text-[10px]" style={{ color: "hsl(0 0% 55%)" }}>
                                {t.active ? "🟢 Active" : "⚫ Closed"}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2">
                            {t.active && (
                              <button
                                onClick={() => handleDistributeTournament(t._id)}
                                disabled={distributingId === t._id}
                                className="flex-1 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                                style={{ background: "linear-gradient(135deg, hsl(140 65% 40%), hsl(160 60% 35%))", color: "white" }}
                              >
                                {distributingId === t._id ? "..." : "🎉 Distribute Prizes"}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteTournament(t._id)}
                              disabled={deletingTournamentId === t._id}
                              className="px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg, hsl(0 70% 45%), hsl(15 60% 40%))", color: "white" }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Games Win/Loss Tab */}
          {activeTab === "games" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm" style={{ color: "hsl(45 90% 70%)" }}>🎮 Per-Game Win / Loss</h2>
                <button
                  onClick={fetchGameStats}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1"
                  style={{ background: "hsla(45, 80%, 50%, 0.2)", color: "hsl(45 90% 70%)" }}
                >
                  <RefreshCw className={`h-3 w-3 ${loadingGames ? "animate-spin" : ""}`} /> Refresh
                </button>
              </div>
              <p className="text-[10px]" style={{ color: "hsl(0 0% 60%)" }}>
                <span className="font-bold" style={{ color: "hsl(120 60% 60%)" }}>Win</span> = total paid to users · <span className="font-bold" style={{ color: "hsl(0 70% 65%)" }}>Loss</span> = total bets users lost (house income)
              </p>

              {gameStats.length === 0 && !loadingGames && (
                <div className="rounded-xl p-4 text-center text-xs" style={{ background: "hsla(260, 40%, 18%, 0.6)", color: "hsl(0 0% 60%)" }}>
                  No game activity yet.
                </div>
              )}

              <div className="flex flex-col gap-2">
                {gameStats.map((g) => {
                  const dollarNet = g.dollarLoss - g.dollarWin;
                  const starNet = g.starLoss - g.starWin;
                  return (
                    <div key={g.game} className="rounded-xl p-3" style={{
                      background: "linear-gradient(135deg, hsla(260, 50%, 25%, 0.6), hsla(280, 45%, 20%, 0.6))",
                      border: "1px solid hsla(45, 80%, 50%, 0.25)",
                    }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Gamepad2 className="h-4 w-4" style={{ color: "hsl(45 90% 65%)" }} />
                        <h3 className="font-bold text-sm capitalize" style={{ color: "hsl(45 90% 75%)" }}>
                          {g.game.replace(/-/g, " ")}
                        </h3>
                        <span className="ml-auto text-[10px]" style={{ color: "hsl(0 0% 55%)" }}>
                          {g.betCount} bets · {g.winCount} wins
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Dollar */}
                        <div className="rounded-lg p-2" style={{ background: "hsla(120, 40%, 20%, 0.4)", border: "1px solid hsla(120, 60%, 40%, 0.25)" }}>
                          <p className="text-[9px] font-bold mb-1" style={{ color: "hsl(120 60% 70%)" }}>$ DOLLAR</p>
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span style={{ color: "hsl(0 0% 65%)" }}><TrendingUp className="h-3 w-3 inline" /> Win</span>
                            <span className="font-bold" style={{ color: "hsl(120 60% 65%)" }}>${g.dollarWin.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span style={{ color: "hsl(0 0% 65%)" }}><TrendingDown className="h-3 w-3 inline" /> Loss</span>
                            <span className="font-bold" style={{ color: "hsl(0 70% 70%)" }}>${g.dollarLoss.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] mt-1 pt-1" style={{ borderTop: "1px dashed hsla(45, 60%, 50%, 0.2)" }}>
                            <span style={{ color: "hsl(45 80% 65%)" }}>House</span>
                            <span className="font-bold" style={{ color: dollarNet >= 0 ? "hsl(45 95% 65%)" : "hsl(0 70% 65%)" }}>
                              {dollarNet >= 0 ? "+" : ""}${dollarNet.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* Star */}
                        <div className="rounded-lg p-2" style={{ background: "hsla(45, 60%, 25%, 0.4)", border: "1px solid hsla(45, 80%, 50%, 0.25)" }}>
                          <p className="text-[9px] font-bold mb-1" style={{ color: "hsl(45 90% 70%)" }}>⭐ STAR</p>
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span style={{ color: "hsl(0 0% 65%)" }}><TrendingUp className="h-3 w-3 inline" /> Win</span>
                            <span className="font-bold" style={{ color: "hsl(120 60% 65%)" }}>⭐{g.starWin.toFixed(0)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span style={{ color: "hsl(0 0% 65%)" }}><TrendingDown className="h-3 w-3 inline" /> Loss</span>
                            <span className="font-bold" style={{ color: "hsl(0 70% 70%)" }}>⭐{g.starLoss.toFixed(0)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] mt-1 pt-1" style={{ borderTop: "1px dashed hsla(45, 60%, 50%, 0.2)" }}>
                            <span style={{ color: "hsl(45 80% 65%)" }}>House</span>
                            <span className="font-bold" style={{ color: starNet >= 0 ? "hsl(45 95% 65%)" : "hsl(0 70% 65%)" }}>
                              {starNet >= 0 ? "+" : ""}⭐{starNet.toFixed(0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fund Adjustment Modal */}
      {adjustUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "hsla(0,0%,0%,0.7)" }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl p-5"
            style={{
              background: "linear-gradient(180deg, hsl(260 50% 22%) 0%, hsl(270 45% 18%) 100%)",
              border: "1px solid hsla(45, 80%, 50%, 0.3)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm" style={{ color: "hsl(45 90% 70%)" }}>
                💰 Adjust Fund — {adjustUser.firstName || adjustUser.username || adjustUser.telegramId}
              </h3>
              <button onClick={() => setAdjustUser(null)} className="p-1">
                <X className="h-4 w-4" style={{ color: "hsl(0 0% 60%)" }} />
              </button>
            </div>

            {/* Add / Remove toggle */}
            <div className="flex gap-2 mb-3">
              {(["add", "remove"] as const).map(a => (
                <button
                  key={a}
                  onClick={() => setAdjustAction(a)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                  style={{
                    background: adjustAction === a
                      ? a === "add" ? "hsla(120, 60%, 40%, 0.3)" : "hsla(0, 70%, 45%, 0.3)"
                      : "hsla(260, 40%, 30%, 0.4)",
                    border: adjustAction === a
                      ? `1px solid ${a === "add" ? "hsla(120, 60%, 50%, 0.5)" : "hsla(0, 70%, 50%, 0.5)"}`
                      : "1px solid transparent",
                    color: adjustAction === a
                      ? a === "add" ? "hsl(120 60% 65%)" : "hsl(0 70% 65%)"
                      : "hsl(0 0% 55%)",
                  }}
                >
                  {a === "add" ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                  {a === "add" ? "Add" : "Remove"}
                </button>
              ))}
            </div>

            {/* Currency toggle */}
            <div className="flex gap-2 mb-3">
              {(["star", "dollar"] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setAdjustCurrency(c)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold"
                  style={{
                    background: adjustCurrency === c ? "hsla(45, 80%, 50%, 0.25)" : "hsla(260, 40%, 30%, 0.4)",
                    border: adjustCurrency === c ? "1px solid hsla(45, 80%, 50%, 0.4)" : "1px solid transparent",
                    color: adjustCurrency === c ? "hsl(45 90% 70%)" : "hsl(0 0% 55%)",
                  }}
                >
                  {c === "star" ? "⭐ Star" : "$ Dollar"}
                </button>
              ))}
            </div>

            {/* Balance type toggle */}
            <div className="flex gap-2 mb-3">
              {(["deposit", "winning"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setAdjustType(t)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold"
                  style={{
                    background: adjustType === t ? "hsla(280, 60%, 50%, 0.25)" : "hsla(260, 40%, 30%, 0.4)",
                    border: adjustType === t ? "1px solid hsla(280, 60%, 50%, 0.4)" : "1px solid transparent",
                    color: adjustType === t ? "hsl(280 60% 75%)" : "hsl(0 0% 55%)",
                  }}
                >
                  {t === "deposit" ? "Deposit" : "Winning"}
                </button>
              ))}
            </div>

            {/* Amount input */}
            <input
              type="number"
              value={adjustAmount}
              onChange={e => setAdjustAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full rounded-xl px-4 py-3 text-sm font-bold mb-4 outline-none"
              style={{
                background: "hsla(260, 40%, 18%, 0.8)",
                border: "1px solid hsla(260, 40%, 40%, 0.3)",
                color: "hsl(0 0% 90%)",
              }}
            />

            {/* Confirm button */}
            <button
              onClick={handleAdjust}
              disabled={adjusting || !adjustAmount || parseFloat(adjustAmount) <= 0}
              className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-40"
              style={{
                background: adjustAction === "add"
                  ? "linear-gradient(135deg, hsl(120 60% 40%), hsl(140 50% 35%))"
                  : "linear-gradient(135deg, hsl(0 70% 45%), hsl(15 60% 40%))",
                color: "hsl(0 0% 95%)",
              }}
            >
              {adjusting ? "Processing..." : `${adjustAction === "add" ? "➕ Add" : "➖ Remove"} ${adjustAmount || "0"} ${adjustCurrency === "star" ? "⭐" : "$"}`}
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
