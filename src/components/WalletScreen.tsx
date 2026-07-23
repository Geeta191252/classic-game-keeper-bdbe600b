import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { ArrowDownLeft, ArrowUpRight, DollarSign, IndianRupee, Star, ArrowRightLeft, Wallet, Unplug, Coins, ExternalLink, X, Clock, Smartphone, ArrowLeft } from "lucide-react";
import { useTonConnectUI, useTonWallet, useTonAddress } from "@tonconnect/ui-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { initiatePayment, fetchTransactions, getTelegram, type CurrencyType, type ActionType } from "@/lib/telegram";
import { useBalanceContext } from "@/contexts/BalanceContext";
import AmountInputDialog from "./AmountInputDialog";

const STAR_TO_DOLLAR_RATE = 100; // 100 ⭐ = $1

const cryptoApiTicker: Record<string, string> = {
  usdt: "usdttrc20",
};

// Per-coin minimum deposit in USD (defaults, overridable via admin limits config)
const defaultCryptoMins: Record<string, number> = {
  btc: 20,
  ltc: 5,
  ton: 3,
  sol: 5,
  trx: 2,
  doge: 8,
};

const defaultLimits = {
  inr: { depositMin: 300, withdrawMin: 300 },
  star: { depositMin: 100, withdrawMin: 100 },
  crypto: { depositMin: defaultCryptoMins, withdrawMin: 10 },
};


type CryptoOption = { id: string; label: string; name: string; color: string; symbol: string };
const cryptoOptions: CryptoOption[] = [
  { id: "btc", label: "BTC", name: "Bitcoin", color: "#f7931a", symbol: "₿" },
  { id: "ltc", label: "LTC", name: "Litecoin", color: "#345d9d", symbol: "Ł" },
  { id: "ton", label: "TON", name: "Toncoin", color: "#0088cc", symbol: "T" },
  { id: "sol", label: "SOL", name: "Solana", color: "#9945ff", symbol: "◎" },
  { id: "trx", label: "TRX", name: "Tron", color: "#eb0029", symbol: "T" },
  { id: "doge", label: "DOGE", name: "Dogecoin", color: "#c2a633", symbol: "Ð" },
];


type WalletTransaction = {
  type?: string | null;
  game?: string | null;
  amount?: string | number | null;
  currency?: string | null;
  time?: string | number | Date | null;
  description?: string | null;
};

const fallbackTransactions: WalletTransaction[] = [
  { type: "win", game: "Greedy King", amount: "+250", currency: "💲", time: "2 min ago" },
  { type: "bet", game: "Greedy King", amount: "-100", currency: "💲", time: "5 min ago" },
  { type: "win", game: "Lucky Slots", amount: "+80", currency: "⭐", time: "1 hr ago" },
  { type: "bonus", game: "Daily Login", amount: "+50", currency: "💲", time: "3 hr ago" },
  { type: "bet", game: "Dice Master", amount: "-200", currency: "⭐", time: "5 hr ago" },
];

const safeText = (value: unknown, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  return String(value);
};

const formatTransactionAmount = (value: unknown, isPositive: boolean) => {
  const raw = safeText(value, "0").trim() || "0";
  if (raw.startsWith("-") || raw.startsWith("+")) return raw;
  return `${isPositive ? "+" : "-"}${raw}`;
};

const formatTransactionTime = (value: unknown) => {
  const raw = safeText(value, "Just now");
  try {
    if (raw.includes("T") || raw.includes("-") || typeof value === "number" || value instanceof Date) {
      const date = new Date(value as string | number | Date);
      return isNaN(date.getTime()) ? raw : date.toLocaleString();
    }
  } catch { /* ignore */ }
  return raw;
};

const WalletScreen = () => {
  const [loading, setLoading] = useState(false);
  const [walletTab, setWalletTab] = useState<"deposit" | "withdraw">("deposit");
  const [depositStep, setDepositStep] = useState<"menu" | "crypto" | "inr" | "star">("menu");
  const [withdrawStep, setWithdrawStep] = useState<"menu" | "crypto" | "inr" | "star">("menu");
  const [upiWithdrawAddress, setUpiWithdrawAddress] = useState("");
  const [amountDialog, setAmountDialog] = useState<{
    open: boolean;
    action: ActionType;
    currency: CurrencyType;
  }>({ open: false, action: "deposit", currency: "dollar" });

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawNetwork, setWithdrawNetwork] = useState("Bitcoin");
  const [withdrawCurrency, setWithdrawCurrency] = useState<CurrencyType>("dollar");
  const [withdrawCrypto, setWithdrawCrypto] = useState("btc");
  const [withdrawing, setWithdrawing] = useState(false);

  const withdrawCryptoOptions = [
    { id: "btc", label: "BTC", network: "Bitcoin" },
    { id: "ltc", label: "LTC", network: "Litecoin" },
    { id: "ton", label: "TON", network: "TON" },
    { id: "sol", label: "SOL", network: "Solana" },
    { id: "trx", label: "TRX", network: "TRC20" },
    { id: "doge", label: "DOGE", network: "Dogecoin" },
  ];

  const [convertStars, setConvertStars] = useState("");
  const [converting, setConverting] = useState(false);

  // Telegram Star withdrawal
  const [starWithdrawAmount, setStarWithdrawAmount] = useState("");
  const [starWithdrawUsername, setStarWithdrawUsername] = useState("");
  const [starWithdrawing, setStarWithdrawing] = useState(false);

  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const tonAddress = useTonAddress(false);

  const [tonDepositAmount, setTonDepositAmount] = useState("");
  const [tonWithdrawAmount, setTonWithdrawAmount] = useState("");
  const [tonProcessing, setTonProcessing] = useState(false);
  const [tonPrice, setTonPrice] = useState<number | null>(null);

  const [cryptoAmount, setCryptoAmount] = useState("");
  const [cryptoCurrency, setCryptoCurrency] = useState("btc");
  const [cryptoProcessing, setCryptoProcessing] = useState(false);
  const [cryptoPayment, setCryptoPayment] = useState<{
    payAddress: string;
    payAmount: number;
    payCurrency: string;
    orderId: string;
  } | null>(null);

  const [upiConfig, setUpiConfig] = useState<{
    upiId: string;
    payeeName: string;
    qrImageUrl: string;
    isEnabled: boolean;
    exchangeRate: number;
  }>({
    upiId: "payee@upi",
    payeeName: "Royal King Games",
    qrImageUrl: "",
    isEnabled: true,
    exchangeRate: 85
  });
  const [upiDepositDialog, setUpiDepositDialog] = useState(false);
  const [upiAmount, setUpiAmount] = useState("");
  const [upiUtr, setUpiUtr] = useState("");
  const [upiSubmitting, setUpiSubmitting] = useState(false);
  const [upiTimerStart, setUpiTimerStart] = useState<number | null>(null);
  const [upiSecondsLeft, setUpiSecondsLeft] = useState(600);

  const { dollarBalance, rupeeBalance, starBalance, dollarWinning, rupeeWinning, starWinning, refreshBalance } = useBalanceContext();
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  const apiBase = import.meta.env.VITE_API_BASE_URL || "https://broken-bria-chetan1-ea890b93.koyeb.app/api";

  const formatCurrencyAmount = (currency: CurrencyType, amount: number) => {
    if (currency === "star") return `${amount.toLocaleString()} ⭐`;
    if (currency === "rupee") return `₹${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const safeCopy = (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        toast({ title: "Copied!", description: "Copied to clipboard." });
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        toast({ title: "Copied!", description: "Copied to clipboard." });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to copy.", variant: "destructive" });
    }
  };

  const [limits, setLimits] = useState(defaultLimits);
  const cryptoMins = limits.crypto.depositMin;
  const inrDepositMin = limits.inr.depositMin;
  const inrWithdrawMin = limits.inr.withdrawMin;
  const starDepositMin = limits.star.depositMin;
  const starWithdrawMin = limits.star.withdrawMin;
  const cryptoWithdrawMin = limits.crypto.withdrawMin;

  useEffect(() => {
    fetch(`${apiBase}/upi-config`)
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        if (data && typeof data === "object" && "upiId" in data) {
          setUpiConfig(data);
        }
      })
      .catch(() => {});
    fetch(`${apiBase}/limits-config`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data && data.inr) setLimits(data); })
      .catch(() => {});
  }, []);


  useEffect(() => {
    if (walletTab === "deposit") setDepositStep("menu");
    else setWithdrawStep("menu");
  }, [walletTab]);

  // 10-minute UPI deposit countdown — auto-closes dialog when expired so admin
  // panel + user history don't fill up with abandoned requests.
  useEffect(() => {
    if (!upiDepositDialog) {
      setUpiTimerStart(null);
      setUpiSecondsLeft(600);
      return;
    }
    if (upiTimerStart === null) {
      setUpiTimerStart(Date.now());
      setUpiSecondsLeft(600);
      return;
    }
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - upiTimerStart) / 1000);
      const left = Math.max(0, 600 - elapsed);
      setUpiSecondsLeft(left);
      if (left <= 0) {
        setUpiDepositDialog(false);
        toast({
          title: "Deposit window expired",
          description: "10 minutes are up. Please start a new UPI deposit if you haven't paid yet.",
          variant: "destructive",
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [upiDepositDialog, upiTimerStart]);


  const handleUpiDepositSubmit = async () => {
    const rupeeAmount = Number(upiAmount);
    if (!rupeeAmount || rupeeAmount < inrDepositMin) {
      toast({ title: `Minimum ₹${inrDepositMin}`, description: `Minimum UPI deposit is ₹${inrDepositMin}.`, variant: "destructive" });
      return;
    }

    const utrVal = upiUtr.trim();
    if (!/^\d{12}$/.test(utrVal)) {
      toast({ title: "Invalid UTR", description: "Enter the real 12-digit UTR from your bank/UPI app.", variant: "destructive" });

      return;
    }

    setUpiSubmitting(true);
    try {
      const tg = getTelegram();
      const userId = tg?.initDataUnsafe?.user?.id || "demo";
      const res = await fetch(`${apiBase}/upi/deposit-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, amount: rupeeAmount, utr: utrVal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");

      toast({
        title: "Deposit Submitted! 📝",
        description: "Your UPI deposit request has been sent for admin verification.",
      });
      setUpiDepositDialog(false);
      setUpiAmount("");
      setUpiUtr("");
      refreshBalance();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Deposit request failed.", variant: "destructive" });
    } finally {
      setUpiSubmitting(false);
    }
  };

  useEffect(() => {
    if (!cryptoPayment?.orderId) {
      setPaymentStatus(null);
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/crypto/check-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: cryptoPayment.orderId }),
        });
        const data = await res.json();
        setPaymentStatus(data.status);
        if (data.status === "completed") {
          toast({
            title: "Payment Received! ✅",
            description: `$${data.amount} has been added to your wallet.`,
          });
          refreshBalance();
          setCryptoPayment(null);
        }
      } catch { /* ignore */ }
    };

    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [cryptoPayment?.orderId]);

  const { data: transactions = fallbackTransactions } = useQuery<WalletTransaction[]>({
    queryKey: ["transactions"],
    queryFn: fetchTransactions,
    placeholderData: fallbackTransactions,
    retry: 1,
  });

  const dollarWinnings = dollarWinning;
  const rupeeWinnings = rupeeWinning;
  const starWinnings = starWinning;
  const totalDollarWallet = dollarBalance + dollarWinnings;
  const totalRupeeWallet = rupeeBalance + rupeeWinnings;
  const totalStarWallet = starBalance + starWinnings;

  useQuery({
    queryKey: ["ton-price"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/ton/price`);
      const data = await res.json();
      setTonPrice(data.tonUsdPrice);
      return data.tonUsdPrice;
    },
    refetchInterval: 60000,
  });

  const handleTonDeposit = async () => {
    const tonAmt = Number(tonDepositAmount);
    if (!tonAmt || tonAmt <= 0) {
      toast({ title: "Invalid amount", description: "Enter a valid TON amount.", variant: "destructive" });
      return;
    }
    if (!tonAddress) {
      toast({ title: "Wallet not connected", description: "Connect your TON wallet first.", variant: "destructive" });
      return;
    }

    setTonProcessing(true);
    try {
      const tg = getTelegram();
      const userId = tg?.initDataUnsafe?.user?.id || "demo";

      const initRes = await fetch(`${apiBase}/ton/init-deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, tonAmount: tonAmt }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || "Failed to init deposit");

      const nanoTon = BigInt(Math.floor(tonAmt * 1e9)).toString();
      const { beginCell } = await import("@ton/core");
      const body = beginCell()
        .storeUint(0, 32)
        .storeStringTail(initData.depositComment)
        .endCell();
      const payloadBase64 = body.toBoc().toString("base64");

      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: initData.ownerWallet,
            amount: nanoTon,
            payload: payloadBase64,
          },
        ],
      });

      const confirmRes = await fetch(`${apiBase}/ton/confirm-deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          transactionId: initData.transactionId,
          bocHash: txResult.boc || "confirmed",
        }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error || "Failed to confirm deposit");

      toast({
        title: "TON Deposit Successful! ✅",
        description: `${tonAmt} TON ≈ $${initData.usdEquivalent.toFixed(2)} added to your wallet!`,
      });
      setTonDepositAmount("");
      refreshBalance();
    } catch (err: any) {
      if (err?.message?.includes("Rejected")) {
        toast({ title: "Cancelled", description: "Transaction was cancelled." });
      } else {
        toast({ title: "Error", description: err?.message || "TON deposit failed.", variant: "destructive" });
      }
    } finally {
      setTonProcessing(false);
    }
  };

  const handleTonWithdraw = async () => {
    const dollarAmt = Number(tonWithdrawAmount);
    if (!dollarAmt || dollarAmt < 10) {
      toast({ title: "Minimum $10", description: "Minimum withdrawal is $10.", variant: "destructive" });
      return;
    }
    if (dollarAmt > dollarBalance) {
      toast({ title: "Insufficient balance", description: "You don't have enough dollar balance.", variant: "destructive" });
      return;
    }
    if (!tonAddress) {
      toast({ title: "Wallet not connected", description: "Connect your TON wallet first.", variant: "destructive" });
      return;
    }

    setTonProcessing(true);
    try {
      const tg = getTelegram();
      const userId = tg?.initDataUnsafe?.user?.id || "demo";

      const res = await fetch(`${apiBase}/ton/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, dollarAmount: dollarAmt, tonWalletAddress: tonAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed");

      toast({
        title: "Withdrawal Submitted! ✅",
        description: `$${dollarAmt} ≈ ${data.tonAmount.toFixed(4)} TON will be sent to your wallet.`,
      });
      setTonWithdrawAmount("");
      refreshBalance();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Withdrawal failed.", variant: "destructive" });
    } finally {
      setTonProcessing(false);
    }
  };

  const handleCryptoDeposit = async () => {
    const usdAmt = Number(cryptoAmount);
    const minReq = cryptoMins[cryptoCurrency] || 1;
    if (!usdAmt || usdAmt < minReq) {
      toast({ title: "Amount too low", description: `Minimum deposit for ${cryptoCurrency.toUpperCase()} is $${minReq}.`, variant: "destructive" });
      return;
    }

    setCryptoProcessing(true);
    try {
      const tg = getTelegram();
      const userId = tg?.initDataUnsafe?.user?.id || "demo";

      const apiCurrency = cryptoApiTicker[cryptoCurrency] || cryptoCurrency;
      const res = await fetch(`${apiBase}/crypto/create-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, amount: usdAmt, currency: apiCurrency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payment");

      if (data.payAddress) {
        setCryptoPayment({
          payAddress: data.payAddress,
          payAmount: data.payAmount,
          payCurrency: data.payCurrency,
          orderId: data.orderId,
        });
        toast({
          title: "Payment Created! 🪙",
          description: `Send exactly ${data.payAmount} ${data.payCurrency.toUpperCase()} to the address shown below.`,
        });
        setCryptoAmount("");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Crypto deposit failed.", variant: "destructive" });
    } finally {
      setCryptoProcessing(false);
    }
  };

  const handleCurrencySelect = (action: ActionType, currency: CurrencyType) => {
    setAmountDialog({ open: true, action, currency });
  };

  const handleAmountConfirm = async (amount: number) => {
    const { action, currency } = amountDialog;
    setAmountDialog((prev) => ({ ...prev, open: false }));

    setLoading(true);
    try {
      await initiatePayment(action, currency, amount, (status) => {
        setLoading(false);
        if (status === "paid") {
          toast({
            title: "Success! ✅",
            description: `${action === "deposit" ? "Deposit" : "Withdrawal"} of ${formatCurrencyAmount(currency, amount)} completed!`,
          });
          refreshBalance();
        } else if (status === "cancelled") {
          toast({ title: "Cancelled", description: "Payment was cancelled." });
        } else {
          toast({ title: "Failed", description: "Payment failed. Try again.", variant: "destructive" });
        }
      });
    } catch (err: any) {
      setLoading(false);
      const message = err?.message || "Could not connect to server.";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleWithdrawSubmit = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt < 10) {
      toast({ title: "Minimum $10", description: "Minimum withdrawal amount is $10.", variant: "destructive" });
      return;
    }
    if (!withdrawAddress.trim()) {
      toast({ title: "Address required", description: "Enter your crypto wallet address.", variant: "destructive" });
      return;
    }
    const winField = withdrawCurrency === "dollar" ? dollarWinnings : withdrawCurrency === "rupee" ? rupeeWinnings : starWinnings;
    if (amt > winField) {
      toast({ title: "Insufficient winnings", description: `You only have ${formatCurrencyAmount(withdrawCurrency, winField)} in winnings.`, variant: "destructive" });
      return;
    }

    setWithdrawing(true);
    try {
      const tg = getTelegram();
      const userId = tg?.initDataUnsafe?.user?.id || "demo";
      const res = await fetch(`${apiBase}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          currency: withdrawCurrency,
          amount: amt,
          cryptoAddress: withdrawAddress.trim(),
          network: withdrawNetwork.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      toast({
        title: "Withdrawal Submitted! 📝",
        description: "Your request is pending admin approval. You will be notified when processed.",
      });
      setWithdrawAmount("");
      setWithdrawAddress("");
      refreshBalance();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Withdrawal failed.", variant: "destructive" });
    } finally {
      setWithdrawing(false);
    }
  };

  const starInputNum = Number(convertStars) || 0;
  const dollarOutput = (starInputNum / STAR_TO_DOLLAR_RATE).toFixed(2);

  const handleConvert = async () => {
    if (starInputNum < STAR_TO_DOLLAR_RATE) {
      toast({ title: "Minimum required", description: `Minimum ${STAR_TO_DOLLAR_RATE} ⭐ needed to convert.`, variant: "destructive" });
      return;
    }
    if (starInputNum > starBalance) {
      toast({ title: "Insufficient Stars", description: "You don't have enough Stars.", variant: "destructive" });
      return;
    }

    setConverting(true);
    try {
      const tg = getTelegram();
      const userId = tg?.initDataUnsafe?.user?.id || "demo";
      const res = await fetch(`${apiBase}/convert-stars`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, starAmount: starInputNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Conversion failed");

      toast({
        title: "Converted! ✅",
        description: `${starInputNum} ⭐ → $${dollarOutput} added to your Dollar wallet.`,
      });
      setConvertStars("");
      refreshBalance();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Conversion failed.", variant: "destructive" });
    } finally {
      setConverting(false);
    }
  };

  const handleStarWithdraw = async () => {
    const amt = Number(starWithdrawAmount);
    const uname = starWithdrawUsername.trim().replace(/^@/, "");
    if (!amt || amt < starWithdrawMin) {
      toast({ title: "Minimum required", description: `Minimum ${starWithdrawMin} ⭐ to withdraw.`, variant: "destructive" });
      return;
    }

    if (amt > starBalance) {
      toast({ title: "Insufficient Stars", description: "You don't have enough Stars.", variant: "destructive" });
      return;
    }
    if (!uname) {
      toast({ title: "Username required", description: "Enter your Telegram @username.", variant: "destructive" });
      return;
    }
    setStarWithdrawing(true);
    try {
      const tg = getTelegram();
      const userId = tg?.initDataUnsafe?.user?.id || "demo";
      const res = await fetch(`${apiBase}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          amount: amt,
          currency: "star",
          network: "TELEGRAM_STARS",
          cryptoAddress: `@${uname}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed");
      toast({ title: "Request submitted ✅", description: `${amt} ⭐ withdrawal to @${uname} sent for admin approval.` });
      setStarWithdrawAmount("");
      setStarWithdrawUsername("");
      refreshBalance();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Withdrawal failed.", variant: "destructive" });
    } finally {
      setStarWithdrawing(false);
    }
  };

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 bg-[#0e131f] text-[#8e97a4] min-h-screen">
      
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 flex items-center gap-3 bg-[#141b2b] border border-white/[0.02] shadow-md"
      >
        <span className="text-2xl">👛</span>
        <div>
          <h2 className="font-extrabold text-sm text-white">Cashier & Wallet</h2>
          <p className="text-[10px] text-[#8e97a4] mt-0.5">Manage balances, deposits, and winnings cashouts</p>
        </div>
      </motion.div>

      {/* Balances Card */}
      <div className="grid grid-cols-3 gap-2">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-3 space-y-1 shadow-md"
        >
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[#8e97a4] text-[9px] font-extrabold uppercase tracking-wider">
                <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Dollar
              </div>
              <p className="font-black text-sm text-white">
                ${totalDollarWallet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-3 space-y-1 shadow-md"
        >
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[#8e97a4] text-[9px] font-extrabold uppercase tracking-wider">
                <IndianRupee className="h-3.5 w-3.5 text-emerald-400" /> Rupee
              </div>
              <p className="font-black text-sm text-white">
                ₹{totalRupeeWallet.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </motion.div>

        
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-3 space-y-1 shadow-md"
        >
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[#8e97a4] text-[9px] font-extrabold uppercase tracking-wider">
                <Star className="h-3.5 w-3.5 text-amber-400" /> Stars
              </div>
              <p className="font-black text-sm text-white">
                {totalStarWallet.toLocaleString()}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Segmented Switch Tabs (Deposit vs Withdraw) */}
      <div className="flex p-1 bg-[#0d121f] border border-white/[0.02] rounded-2xl">
        <button
          onClick={() => setWalletTab("deposit")}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
            walletTab === "deposit"
              ? "bg-[#00a2e8] text-white shadow-md shadow-[#00a2e8]/20"
              : "text-[#8e97a4] hover:text-white"
          }`}
        >
          Deposit (जमा)
        </button>
        <button
          onClick={() => setWalletTab("withdraw")}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
            walletTab === "withdraw"
              ? "bg-[#00a2e8] text-white shadow-md shadow-[#00a2e8]/20"
              : "text-[#8e97a4] hover:text-white"
          }`}
        >
          Withdraw (निकासी)
        </button>
      </div>

      {/* Conditional Rendering of Tabs Content */}
      <div className="space-y-4">
        {walletTab === "deposit" ? (
          /* ============================================
             DEPOSIT TAB
             ============================================ */
          <>
            {/* Deposit Method MENU Page */}
            {depositStep === "menu" && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <p className="text-[10px] font-extrabold text-[#8e97a4] uppercase tracking-wider text-center">
                  Choose Deposit Method
                </p>
                {([
                  { id: "crypto", label: "Crypto $", desc: "BTC • LTC • TON • SOL • TRX • DOGE", min: `Min $${Math.min(...Object.values(cryptoMins))}+`, icon: DollarSign, color: "#00a2e8" },
                  { id: "inr", label: "INR", desc: "UPI / QR Code", min: `Min ₹${inrDepositMin}`, icon: IndianRupee, color: "#10b981" },
                  { id: "star", label: "Star", desc: "Telegram Stars ⭐", min: `Min ${starDepositMin} ⭐`, icon: Star, color: "#f59e0b" },
                ] as const).map((m) => {

                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setDepositStep(m.id)}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#141b2b] border border-white/[0.02] hover:border-white/10 hover:bg-[#1a2235] transition-all text-left shadow-md"
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${m.color}15`, color: m.color }}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm text-white">{m.label}</p>
                        <p className="text-[10px] text-[#8e97a4] truncate">{m.desc}</p>
                        <p className="text-[9px] font-black text-amber-400 mt-0.5">{m.min}</p>
                      </div>
                      <ArrowRightLeft className="h-4 w-4 text-[#8e97a4] rotate-[-90deg]" />
                    </button>
                  );
                })}
              </motion.div>
            )}

            {/* CRYPTO DEPOSIT PAGE */}
            {depositStep === "crypto" && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDepositStep("menu")}
                    className="flex items-center gap-1 text-[10px] font-black text-[#8e97a4] hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <span className="font-black text-xs text-white uppercase tracking-wider">Crypto Deposit</span>
                </div>

                {/* Crypto currency grid */}
                <div className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-4 space-y-3.5 shadow-md">
                  <p className="text-[10px] text-[#8e97a4]">Select currency → Pay → Get $ in wallet</p>
                  <div className="grid grid-cols-3 gap-2">
                    {cryptoOptions.map((coin) => {
                      const active = cryptoCurrency === coin.id;
                      return (
                        <button
                          key={coin.id}
                          onClick={() => setCryptoCurrency(coin.id)}
                          className={`rounded-2xl p-3 flex flex-col items-start gap-2 transition-all border ${
                            active
                              ? "bg-[#00a2e8]/10 border-[#00a2e8]/50 shadow-md shadow-[#00a2e8]/10"
                              : "bg-[#0d121f] border-white/[0.04] hover:border-white/10"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 w-full">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                              style={{ background: coin.color }}
                            >
                              {coin.symbol}
                            </div>
                            <span className="text-[13px] font-black text-white tracking-tight">{coin.label}</span>
                          </div>
                          <span className="text-[10px] text-[#8e97a4] font-medium leading-none">{coin.name}</span>
                          <span className={`text-[9px] font-black leading-none mt-0.5 ${active ? "text-[#00a2e8]" : "text-amber-400/80"}`}>Min ${cryptoMins[coin.id]}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <div className="flex-1 relative">
                      <Input
                        type="number"
                        placeholder={`USD amount (min $${cryptoMins[cryptoCurrency] || 1})`}
                        value={cryptoAmount}
                        onChange={(e) => setCryptoAmount(e.target.value)}
                        className="pr-7 rounded-xl bg-[#0d121f] h-10 text-xs border-white/[0.02] text-white placeholder-slate-500 font-bold"
                        min={cryptoMins[cryptoCurrency] || 1}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#8e97a4] font-black">$</span>
                    </div>
                    <button
                      className="rounded-xl h-10 px-4 bg-[#00a2e8] hover:bg-[#0091d0] text-white text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                      disabled={cryptoProcessing || !cryptoAmount}
                      onClick={handleCryptoDeposit}
                    >
                      {cryptoProcessing ? "..." : <>Pay <ExternalLink className="h-3 w-3" /></>}
                    </button>
                  </div>

                  <AnimatePresence>
                    {cryptoPayment && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-[#0d121f] border border-white/[0.02] rounded-xl p-4 space-y-3"
                      >
                        <p className="text-[11px] font-semibold text-white">
                          Send exactly <span className="text-[#00a2e8] font-bold">{cryptoPayment.payAmount} {cryptoPayment.payCurrency.toUpperCase()}</span>
                        </p>
                        <div className="flex justify-center py-2">
                          <div className="bg-white p-2.5 rounded-2xl shadow-inner">
                            <QRCodeSVG
                              value={cryptoPayment.payAddress}
                              size={150}
                              level="H"
                              includeMargin={false}
                            />
                          </div>
                        </div>
                        <div className="bg-[#141b2b] border border-white/[0.02] rounded-xl p-3">
                          <p className="text-[9px] font-extrabold text-[#00a2e8] mb-0.5 uppercase tracking-wider">
                            {cryptoPayment.payCurrency.toUpperCase()} Address:
                          </p>
                          <p className="text-[9px] font-mono text-slate-200 break-all select-all">{cryptoPayment.payAddress}</p>
                        </div>
                        <button
                          className="w-full rounded-xl py-2 text-xs font-black uppercase tracking-wider bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.02] transition-colors"
                          onClick={() => safeCopy(cryptoPayment.payAddress)}
                        >
                          Copy Address
                        </button>
                        <p className="text-[8px] text-[#8e97a4] text-center">
                          Balance updates automatically after confirmation • Send exact amount only
                        </p>
                        {paymentStatus && paymentStatus !== "completed" && (
                          <div className="flex items-center gap-2 bg-[#00a2e8]/10 rounded-xl px-3 py-2 border border-[#00a2e8]/10">
                            <span className="animate-pulse text-[#00a2e8] text-lg">⏳</span>
                            <span className="text-[10px] font-medium text-slate-200 capitalize">
                              Status: {paymentStatus === "pending" ? "Waiting for payment..." : paymentStatus}
                            </span>
                          </div>
                        )}
                        <button
                          className="w-full text-[10px] font-bold text-slate-500 hover:text-white mt-1"
                          onClick={() => setCryptoPayment(null)}
                        >
                          Close
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* TON Deposit — also on crypto page */}
                <div className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-4 space-y-3.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Wallet className="h-4 w-4 text-[#00a2e8]" />
                      <h3 className="font-black text-xs text-white uppercase tracking-wider">TON Deposit</h3>
                    </div>
                    {tonPrice && (
                      <span className="text-[9px] font-extrabold bg-[#0d121f] text-amber-400 px-2 py-0.5 rounded border border-white/[0.01]">
                        1 TON = ${tonPrice.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-center py-1">
                    {tonAddress ? (
                      <div className="flex items-center gap-2 w-full">
                        <div className="flex-1 bg-[#0d121f] border border-white/[0.04] rounded-xl px-3 py-2">
                          <p className="text-[8px] font-extrabold text-emerald-400 uppercase tracking-wider">Connected</p>
                          <p className="text-[10px] font-mono text-white truncate">{tonAddress}</p>
                        </div>
                        <button
                          onClick={() => tonConnectUI.disconnect()}
                          className="rounded-xl h-10 px-3 text-[10px] font-black uppercase bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 tracking-wider transition-all"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => tonConnectUI.openModal()}
                        className="w-full rounded-xl h-10 text-[11px] font-black uppercase bg-[#0098ea] hover:bg-[#0086cf] text-white tracking-wider shadow-md shadow-[#0098ea]/20 transition-all"
                      >
                        Connect TON Wallet
                      </button>
                    )}
                  </div>
                  {tonAddress ? (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-extrabold text-[#8e97a4] uppercase tracking-wider">Instant TON Deposit</p>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Input
                            type="number"
                            placeholder="Amount of TON"
                            value={tonDepositAmount}
                            onChange={(e) => setTonDepositAmount(e.target.value)}
                            className="pr-8 rounded-xl bg-[#0d121f] h-9 text-xs border-white/[0.02] text-white placeholder-slate-500 font-bold"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-extrabold text-[#8e97a4]">TON</span>
                        </div>
                        <button
                          onClick={handleTonDeposit}
                          disabled={tonProcessing || !tonDepositAmount}
                          className="rounded-xl h-9 px-4 text-[10px] font-black uppercase bg-[#00a2e8] hover:bg-[#0091d0] text-white tracking-wider shadow-md shadow-[#00a2e8]/20 transition-all disabled:opacity-50"
                        >
                          {tonProcessing ? "..." : "Deposit"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[9px] text-[#8e97a4] text-center py-2">
                      ⚠️ Connect your TON wallet above to perform instant TON deposits.
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* INR / UPI DEPOSIT PAGE */}
            {depositStep === "inr" && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDepositStep("menu")}
                    className="flex items-center gap-1 text-[10px] font-black text-[#8e97a4] hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <span className="font-black text-xs text-white uppercase tracking-wider">INR Deposit</span>
                </div>

                {upiConfig && upiConfig.upiId ? (
                  <div className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-4 space-y-3.5 shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Smartphone className="h-4 w-4 text-[#00a2e8]" />
                        <h3 className="font-black text-xs text-white uppercase tracking-wider">UPI Deposit</h3>
                      </div>
                      <span className="text-[9px] font-extrabold bg-[#0d121f] text-emerald-400 px-2 py-0.5 rounded border border-white/[0.01]">
                        Credits ₹ Wallet
                      </span>
                    </div>
                    <p className="text-[10px] text-[#8e97a4]">Pay using any Indian UPI App (PhonePe, GPay, Paytm) and get ₹ balance</p>
                    <button
                      onClick={() => setUpiDepositDialog(true)}
                      className="w-full rounded-xl h-10 text-xs font-black uppercase tracking-wider bg-[#00a2e8] hover:bg-[#0091d0] text-white shadow-md shadow-[#00a2e8]/20 transition-all flex items-center justify-center gap-1.5"
                    >
                      Pay with UPI / QR Code
                    </button>
                  </div>
                ) : (
                  <div className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-4 text-center text-[10px] text-[#8e97a4]">
                    UPI deposit currently unavailable.
                  </div>
                )}
              </motion.div>
            )}

            {/* STAR DEPOSIT PAGE */}
            {depositStep === "star" && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDepositStep("menu")}
                    className="flex items-center gap-1 text-[10px] font-black text-[#8e97a4] hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <span className="font-black text-xs text-white uppercase tracking-wider">Star Deposit</span>
                </div>

                <div className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-4 space-y-3.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Star className="h-4 w-4 text-amber-400" />
                      <h3 className="font-black text-xs text-white uppercase tracking-wider">Buy Stars</h3>
                    </div>
                    <span className="text-[9px] font-extrabold bg-[#0d121f] text-amber-400 px-2 py-0.5 rounded border border-white/[0.01]">
                      Credits ⭐ Wallet
                    </span>
                  </div>
                  <p className="text-[10px] text-[#8e97a4]">Buy Telegram Stars directly — instantly credited to your ⭐ wallet.</p>
                  <button
                    onClick={() => handleCurrencySelect("deposit", "star")}
                    className="w-full rounded-xl h-10 text-xs font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-black shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Star className="h-4 w-4" /> Buy Stars with Telegram
                  </button>
                </div>

                <div className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-4 space-y-3.5 shadow-md">
                  <div className="flex items-center gap-1.5">
                    <ArrowRightLeft className="h-4 w-4 text-[#00a2e8]" />
                    <h3 className="font-black text-xs text-white uppercase tracking-wider">Star to Cash Converter</h3>
                  </div>
                  <p className="text-[10px] text-[#8e97a4]">Convert Star balance to withdrawable Dollars ({STAR_TO_DOLLAR_RATE} ⭐ = $1.00)</p>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Input
                        type="number"
                        placeholder={`Min ${STAR_TO_DOLLAR_RATE} ⭐`}
                        value={convertStars}
                        onChange={(e) => setConvertStars(e.target.value)}
                        className="pr-6 rounded-xl bg-[#0d121f] h-9 text-xs border-white/[0.02] text-white placeholder-slate-500 font-bold"
                        min={STAR_TO_DOLLAR_RATE}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-extrabold text-[#8e97a4]">⭐</span>
                    </div>
                    <button
                      onClick={handleConvert}
                      disabled={converting || starInputNum < STAR_TO_DOLLAR_RATE}
                      className="rounded-xl h-9 px-4 text-[10px] font-black uppercase bg-[#00a2e8] hover:bg-[#0091d0] text-white tracking-wider shadow-md shadow-[#00a2e8]/20 transition-all disabled:opacity-50"
                    >
                      {converting ? "..." : `Convert to $${dollarOutput}`}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

          </>
        ) : (
          /* ============================================
             WITHDRAW TAB
             ============================================ */
          <>
            {/* Withdraw Method MENU Page */}
            {withdrawStep === "menu" && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <p className="text-[10px] font-extrabold text-[#8e97a4] uppercase tracking-wider text-center">
                  Choose Withdraw Method
                </p>
                {([
                  { id: "crypto", label: "Crypto $", desc: "BTC • LTC • TON • SOL • TRX • DOGE", min: `Min $${cryptoWithdrawMin}`, icon: DollarSign, color: "#00a2e8" },
                  { id: "inr", label: "INR", desc: "UPI / Bank UPI ID", min: `Min ₹${inrWithdrawMin}`, icon: IndianRupee, color: "#10b981" },
                  { id: "star", label: "Star", desc: "Convert Stars → $ then withdraw", min: `Min ${starWithdrawMin} ⭐`, icon: Star, color: "#f59e0b" },
                ] as const).map((m) => {

                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setWithdrawStep(m.id)}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#141b2b] border border-white/[0.02] hover:border-white/10 hover:bg-[#1a2235] transition-all text-left shadow-md"
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${m.color}15`, color: m.color }}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm text-white">{m.label}</p>
                        <p className="text-[10px] text-[#8e97a4] truncate">{m.desc}</p>
                        <p className="text-[9px] font-black text-amber-400 mt-0.5">{m.min}</p>
                      </div>
                      <ArrowRightLeft className="h-4 w-4 text-[#8e97a4] rotate-[-90deg]" />
                    </button>
                  );
                })}
              </motion.div>
            )}

            {/* CRYPTO WITHDRAW PAGE */}
            {withdrawStep === "crypto" && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setWithdrawStep("menu")}
                    className="flex items-center gap-1 text-[10px] font-black text-[#8e97a4] hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <span className="font-black text-xs text-white uppercase tracking-wider">Crypto Withdraw</span>
                </div>

                <div className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-4 space-y-4 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <ArrowUpRight className="h-4 w-4 text-[#00a2e8]" />
                      <h3 className="font-black text-xs text-white uppercase tracking-wider">Withdraw Winnings</h3>
                    </div>
                    <span className="text-[9px] font-extrabold bg-[#0d121f] text-emerald-400 px-2 py-0.5 rounded border border-white/[0.01]">
                      Available: ${dollarWinnings.toFixed(2)}
                    </span>
                  </div>

                  <p className="text-[10px] text-[#8e97a4]">
                    Minimum withdrawal: <span className="text-amber-400 font-black">$10</span>
                  </p>

                  <div className="grid grid-cols-3 gap-1.5">
                    {withdrawCryptoOptions.map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setWithdrawCrypto(c.id);
                          setWithdrawNetwork(c.network);
                        }}
                        className={`py-2 rounded-xl text-[10px] font-black border transition-colors ${
                          withdrawCrypto === c.id
                            ? "border-[#00a2e8] bg-[#00a2e8]/10 text-white"
                            : "border-white/[0.02] bg-[#0d121f] text-slate-400"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-extrabold uppercase tracking-wider text-slate-400">Withdraw Address</label>
                    <Input
                      type="text"
                      placeholder={`Your ${withdrawCryptoOptions.find(c => c.id === withdrawCrypto)?.label || ''} address`}
                      value={withdrawAddress}
                      onChange={e => setWithdrawAddress(e.target.value)}
                      className="rounded-xl bg-[#0d121f] border-white/[0.02] font-mono text-[9px] text-white h-9"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-extrabold uppercase tracking-wider text-slate-400">Amount (USD) — Min ${cryptoWithdrawMin}</label>
                    <Input
                      type="number"
                      placeholder={`Amount to withdraw (min $${cryptoWithdrawMin})`}
                      value={withdrawAmount}
                      onChange={e => { setWithdrawAmount(e.target.value); setWithdrawCurrency("dollar"); }}
                      className="rounded-xl bg-[#0d121f] border-white/[0.02] text-white h-9 text-xs"
                      min={cryptoWithdrawMin}
                    />
                  </div>

                  <Button
                    onClick={() => { setWithdrawCurrency("dollar"); handleWithdrawSubmit(); }}
                    disabled={withdrawing || !withdrawAmount || !withdrawAddress.trim() || parseFloat(withdrawAmount) < cryptoWithdrawMin}

                    className="w-full rounded-xl h-10 font-black text-xs uppercase bg-[#00a2e8] hover:bg-[#0091d0] text-white tracking-wider shadow-md shadow-[#00a2e8]/20 transition-all disabled:opacity-50"
                  >
                    {withdrawing ? "Submitting..." : `Withdraw via ${withdrawCryptoOptions.find(c => c.id === withdrawCrypto)?.label || ''}`}
                  </Button>

                  <p className="text-[8px] text-slate-500 text-center leading-relaxed">
                    ⏳ Requests go to admin for approval. You'll get a Telegram message once processed.
                  </p>
                </div>

                {/* TON Instant Withdraw */}
                <div className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-4 space-y-3.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Wallet className="h-4 w-4 text-[#00a2e8]" />
                      <h3 className="font-black text-xs text-white uppercase tracking-wider">TON Withdraw</h3>
                    </div>
                    {tonPrice && (
                      <span className="text-[9px] font-extrabold bg-[#0d121f] text-amber-400 px-2 py-0.5 rounded border border-white/[0.01]">
                        1 TON = ${tonPrice.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-center py-1">
                    {tonAddress ? (
                      <div className="flex items-center gap-2 w-full">
                        <div className="flex-1 bg-[#0d121f] border border-white/[0.04] rounded-xl px-3 py-2">
                          <p className="text-[8px] font-extrabold text-emerald-400 uppercase tracking-wider">Connected</p>
                          <p className="text-[10px] font-mono text-white truncate">{tonAddress}</p>
                        </div>
                        <button
                          onClick={() => tonConnectUI.disconnect()}
                          className="rounded-xl h-10 px-3 text-[10px] font-black uppercase bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 tracking-wider transition-all"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => tonConnectUI.openModal()}
                        className="w-full rounded-xl h-10 text-[11px] font-black uppercase bg-[#0098ea] hover:bg-[#0086cf] text-white tracking-wider shadow-md shadow-[#0098ea]/20 transition-all"
                      >
                        Connect TON Wallet
                      </button>
                    )}
                  </div>

                  {tonAddress ? (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-extrabold text-[#8e97a4] uppercase tracking-wider">Withdraw to connected TON wallet (Min ${cryptoWithdrawMin})</p>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Input
                            type="number"
                            placeholder={`Amount to withdraw (min $${cryptoWithdrawMin})`}
                            value={tonWithdrawAmount}
                            onChange={(e) => setTonWithdrawAmount(e.target.value)}
                            className="pr-6 rounded-xl bg-[#0d121f] h-9 text-xs border-white/[0.02] text-white placeholder-slate-500 font-bold"
                            min={cryptoWithdrawMin}
                          />

                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-extrabold text-[#8e97a4]">$</span>
                        </div>
                        <button
                          onClick={handleTonWithdraw}
                          disabled={tonProcessing || !tonWithdrawAmount}
                          className="rounded-xl h-9 px-4 text-[10px] font-black uppercase bg-[#00a2e8] hover:bg-[#0091d0] text-white tracking-wider shadow-md shadow-[#00a2e8]/20 transition-all disabled:opacity-50"
                        >
                          {tonProcessing ? "..." : "Withdraw"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[9px] text-[#8e97a4] text-center py-2">
                      ⚠️ Connect your TON wallet to perform TON withdrawals.
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* INR / UPI WITHDRAW PAGE */}
            {withdrawStep === "inr" && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setWithdrawStep("menu")}
                    className="flex items-center gap-1 text-[10px] font-black text-[#8e97a4] hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <span className="font-black text-xs text-white uppercase tracking-wider">INR Withdraw</span>
                </div>

                <div className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-4 space-y-4 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Smartphone className="h-4 w-4 text-emerald-400" />
                      <h3 className="font-black text-xs text-white uppercase tracking-wider">UPI Withdraw</h3>
                    </div>
                    <span className="text-[9px] font-extrabold bg-[#0d121f] text-emerald-400 px-2 py-0.5 rounded border border-white/[0.01]">
                      Available: ₹{rupeeWinnings.toFixed(2)}
                    </span>
                  </div>

                  <p className="text-[10px] text-[#8e97a4]">
                    Minimum withdrawal: <span className="text-amber-400 font-black">₹{inrWithdrawMin}</span>. Payout to your UPI ID after admin approval.
                  </p>

                  <div className="space-y-1">
                    <label className="text-[8px] font-extrabold uppercase tracking-wider text-slate-400">Your UPI ID</label>
                    <Input
                      type="text"
                      placeholder="e.g. yourname@upi"
                      value={upiWithdrawAddress}
                      onChange={e => setUpiWithdrawAddress(e.target.value)}
                      className="rounded-xl bg-[#0d121f] border-white/[0.02] font-mono text-[10px] text-white h-9"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-extrabold uppercase tracking-wider text-slate-400">Amount (INR) — Min ₹{inrWithdrawMin}</label>
                    <Input
                      type="number"
                      placeholder={`Amount in ₹ (min ${inrWithdrawMin})`}
                      value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value)}
                      className="rounded-xl bg-[#0d121f] border-white/[0.02] text-white h-9 text-xs"
                      min={inrWithdrawMin}
                    />
                  </div>

                  <Button
                    onClick={() => {
                      const amt = parseFloat(withdrawAmount);
                      if (!amt || amt < inrWithdrawMin) {
                        toast({ title: `Minimum ₹${inrWithdrawMin}`, description: `Minimum INR withdrawal is ₹${inrWithdrawMin}.`, variant: "destructive" });
                        return;
                      }
                      if (!upiWithdrawAddress.trim()) {
                        toast({ title: "UPI ID required", description: "Enter your UPI ID.", variant: "destructive" });
                        return;
                      }
                      setWithdrawCurrency("rupee");
                      setWithdrawAddress(upiWithdrawAddress.trim());
                      setWithdrawNetwork("UPI");
                      setTimeout(handleWithdrawSubmit, 0);
                    }}
                    disabled={withdrawing || !withdrawAmount || !upiWithdrawAddress.trim() || parseFloat(withdrawAmount) < inrWithdrawMin}
                    className="w-full rounded-xl h-10 font-black text-xs uppercase bg-emerald-500 hover:bg-emerald-600 text-white tracking-wider shadow-md transition-all disabled:opacity-50"
                  >

                    {withdrawing ? "Submitting..." : "Withdraw to UPI"}
                  </Button>

                  <p className="text-[8px] text-slate-500 text-center leading-relaxed">
                    ⏳ Admin will verify and send INR to your UPI ID.
                  </p>
                </div>
              </motion.div>
            )}

            {/* STAR WITHDRAW PAGE */}
            {withdrawStep === "star" && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setWithdrawStep("menu")}
                    className="flex items-center gap-1 text-[10px] font-black text-[#8e97a4] hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <span className="font-black text-xs text-white uppercase tracking-wider">Star Withdraw</span>
                </div>

                <div className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-4 space-y-3.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <ArrowRightLeft className="h-4 w-4 text-amber-400" />
                      <h3 className="font-black text-xs text-white uppercase tracking-wider">Star to Cash</h3>
                    </div>
                    <span className="text-[9px] font-extrabold bg-[#0d121f] text-amber-400 px-2 py-0.5 rounded border border-white/[0.01]">
                      Available: {starBalance.toLocaleString()} ⭐
                    </span>
                  </div>

                  <p className="text-[10px] text-[#8e97a4]">
                    Convert Stars to $ ({STAR_TO_DOLLAR_RATE} ⭐ = $1). Minimum: <span className="text-amber-400 font-black">{STAR_TO_DOLLAR_RATE} ⭐</span>. Then withdraw $ from Crypto tab.
                  </p>

                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Input
                        type="number"
                        placeholder={`Min ${STAR_TO_DOLLAR_RATE} ⭐`}
                        value={convertStars}
                        onChange={(e) => setConvertStars(e.target.value)}
                        className="pr-6 rounded-xl bg-[#0d121f] h-9 text-xs border-white/[0.02] text-white placeholder-slate-500 font-bold"
                        min={STAR_TO_DOLLAR_RATE}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-extrabold text-[#8e97a4]">⭐</span>
                    </div>
                    <button
                      onClick={handleConvert}
                      disabled={converting || starInputNum < STAR_TO_DOLLAR_RATE}
                      className="rounded-xl h-9 px-4 text-[10px] font-black uppercase bg-amber-500 hover:bg-amber-600 text-black tracking-wider shadow-md transition-all disabled:opacity-50"
                    >
                      {converting ? "..." : `Convert to $${dollarOutput}`}
                    </button>
                  </div>
                </div>

                {/* Direct Telegram Star Withdrawal */}
                <div className="bg-[#141b2b] border border-white/[0.02] rounded-2xl p-4 space-y-3.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Star className="h-4 w-4 text-amber-400" />
                      <h3 className="font-black text-xs text-white uppercase tracking-wider">Telegram Star Withdraw</h3>
                    </div>
                    <span className="text-[9px] font-extrabold bg-[#0d121f] text-amber-400 px-2 py-0.5 rounded border border-white/[0.01]">
                      Min {STAR_TO_DOLLAR_RATE} ⭐
                    </span>
                  </div>

                  <p className="text-[10px] text-[#8e97a4]">
                    Withdraw Stars directly to your Telegram account. Owner will send Stars to your @username after approval.
                  </p>

                  <div className="space-y-2">
                    <div>
                      <label className="text-[9px] font-extrabold text-[#8e97a4] uppercase tracking-wider mb-1 block">Telegram Username</label>
                      <Input
                        type="text"
                        placeholder="@yourusername"
                        value={starWithdrawUsername}
                        onChange={(e) => setStarWithdrawUsername(e.target.value)}
                        className="rounded-xl bg-[#0d121f] h-9 text-xs border-white/[0.02] text-white placeholder-slate-500 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-extrabold text-[#8e97a4] uppercase tracking-wider mb-1 block">Amount of Stars</label>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Input
                            type="number"
                            placeholder={`Min ${STAR_TO_DOLLAR_RATE} ⭐`}
                            value={starWithdrawAmount}
                            onChange={(e) => setStarWithdrawAmount(e.target.value)}
                            className="pr-6 rounded-xl bg-[#0d121f] h-9 text-xs border-white/[0.02] text-white placeholder-slate-500 font-bold"
                            min={STAR_TO_DOLLAR_RATE}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-extrabold text-[#8e97a4]">⭐</span>
                        </div>
                        <button
                          onClick={handleStarWithdraw}
                          disabled={starWithdrawing || !starWithdrawAmount || !starWithdrawUsername.trim()}
                          className="rounded-xl h-9 px-4 text-[10px] font-black uppercase bg-amber-500 hover:bg-amber-600 text-black tracking-wider shadow-md transition-all disabled:opacity-50"
                        >
                          {starWithdrawing ? "..." : "Withdraw"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Transactions History list */}
      <div className="space-y-2 pt-2">
        <h3 className="font-extrabold text-xs text-white uppercase tracking-wide px-1 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-[#00a2e8]" />
          Transaction History
        </h3>
        <div className="space-y-2">
          {transactions.slice(0, 10).map((tx, i) => {
            const txType = safeText(tx?.type, "transaction").toLowerCase();
            const title = safeText(tx?.game || tx?.description || tx?.type, "Transaction");
            const isPositive = txType === "win" || txType === "deposit" || txType === "bonus" || txType === "refund";
            const isCancelled = txType.includes("cancel");
            const displayAmount = formatTransactionAmount(tx?.amount, isPositive);
            const currencySymbol = safeText(tx?.currency, "💲");
            const timeDisplay = formatTransactionTime(tx?.time);

            const iconColor = isCancelled ? "bg-amber-500/10 border border-amber-500/20" : isPositive ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20";
            const textColor = isCancelled ? "text-amber-400" : isPositive ? "text-emerald-400" : "text-red-400";

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 bg-[#141b2b] border border-white/[0.02] rounded-2xl p-3 shadow"
              >
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${iconColor}`}>
                  {isCancelled ? (
                    <span className="text-[10px] font-bold">✕</span>
                  ) : isPositive ? (
                    <ArrowDownLeft className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs text-white truncate">
                    {isCancelled ? `Cancelled: ${safeText(tx?.type, "Transaction")}` : title}
                  </h4>
                  <p className="text-[9px] text-slate-400 mt-0.5">{timeDisplay}</p>
                </div>
                <span className={`text-xs font-bold ${textColor}`}>
                  {currencySymbol} {isCancelled ? "Cancel" : displayAmount}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* UPI Deposit Dialog */}
      <AnimatePresence>
        {upiDepositDialog && upiConfig && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setUpiDepositDialog(false)}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={() => setUpiDepositDialog(false)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                className="bg-[#141b2b] border border-white/[0.03] rounded-3xl p-5 shadow-2xl space-y-4 w-full max-w-sm max-h-[85vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-xs uppercase tracking-wider text-white">
                    UPI Deposit
                  </h3>
                  <button onClick={() => setUpiDepositDialog(false)} className="h-7 w-7 rounded-full bg-[#0d121f] flex items-center justify-center hover:bg-slate-800 transition-colors">
                    <X className="h-4 w-4 text-slate-400" />
                  </button>
                </div>

                {/* 10-minute countdown — request auto-cancels if not paid */}
                <div className={`flex items-center justify-between rounded-xl px-3 py-2 border ${upiSecondsLeft <= 60 ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-300">Time left to pay</span>
                  <span className={`text-sm font-black font-mono ${upiSecondsLeft <= 60 ? 'text-red-300' : 'text-amber-200'}`}>
                    {String(Math.floor(upiSecondsLeft / 60)).padStart(2, '0')}:{String(upiSecondsLeft % 60).padStart(2, '0')}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[9px] font-extrabold text-[#8e97a4] uppercase tracking-wider">INR Amount to Deposit</p>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="Enter INR amount (e.g. 100)"
                      value={upiAmount}
                      onChange={e => setUpiAmount(e.target.value)}
                      className="pr-6 rounded-xl bg-[#0d121f] border-white/[0.02] text-white h-9 text-xs font-bold"
                      min="1"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-extrabold text-[#8e97a4]">₹</span>
                  </div>
                  {Number(upiAmount) > 0 && (
                    <p className="text-[10px] text-emerald-400 font-bold">
                      Pay exactly: ₹{Number(upiAmount).toFixed(2)} INR
                    </p>
                  )}
                </div>

                {Number(upiAmount) > 0 && (
                  <div className="space-y-3.5 border-t border-white/[0.03] pt-3.5">
                    {/* QR Code */}
                    <div className="flex flex-col items-center justify-center space-y-1.5">
                      <div className="bg-white p-2.5 rounded-2xl shadow-inner">
                        <QRCodeSVG
                          value={`upi://pay?pa=${upiConfig?.upiId || ''}&pn=${encodeURIComponent(upiConfig?.payeeName || '')}&am=${Number(upiAmount).toFixed(2)}&cu=INR`}
                          size={150}
                          level="H"
                          includeMargin={false}
                        />
                      </div>
                      <p className="text-[8px] text-[#8e97a4] font-medium">Scan to pay with any UPI App</p>
                    </div>

                    <div className="space-y-1.5 bg-[#0d121f] border border-white/[0.01] rounded-2xl p-3">
                      <div>
                        <p className="text-[8px] font-extrabold text-[#00a2e8] uppercase tracking-wider">UPI ID / Address</p>
                        <div className="flex items-center justify-between gap-1.5 mt-0.5">
                          <span className="text-[10px] font-mono text-white select-all break-all">{upiConfig?.upiId || ''}</span>
                          <button
                            onClick={() => {
                              safeCopy(upiConfig?.upiId || "");
                            }}
                            className="text-[9px] text-[#00a2e8] font-bold shrink-0 hover:underline"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      <div className="border-t border-white/[0.02] pt-1.5 mt-1.5">
                        <p className="text-[8px] font-extrabold text-[#8e97a4] uppercase tracking-wider">Payee Name</p>
                        <p className="text-[10px] text-white font-bold">{upiConfig?.payeeName || ''}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[9px] font-extrabold text-[#8e97a4] uppercase tracking-wider">Enter 12-Digit UTR / Transaction ID</p>
                      <Input
                        type="text"
                        placeholder="e.g. 312345678901"
                        value={upiUtr}
                        onChange={e => setUpiUtr(e.target.value)}
                        className="rounded-xl bg-[#0d121f] border-white/[0.02] font-mono text-[10px] text-white h-9"
                      />
                    </div>

                    <Button
                      onClick={handleUpiDepositSubmit}
                      disabled={upiSubmitting || !upiUtr.trim() || upiUtr.trim().length < 10}
                      className="w-full rounded-xl h-10 font-black text-xs uppercase bg-[#00a2e8] hover:bg-[#0091d0] text-white tracking-wider shadow-md shadow-[#00a2e8]/20 transition-all disabled:opacity-50"
                    >
                      {upiSubmitting ? "Submitting Request..." : "Submit Deposit Request"}
                    </Button>
                  </div>
                )}

                <p className="text-[9px] text-slate-500 text-center">
                  ⚠️ Send exactly the INR amount shown. Once payment matches, admin will credit your account.
                </p>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Amount Input Dialog */}
      <AmountInputDialog
        open={amountDialog.open}
        onClose={() => setAmountDialog((prev) => ({ ...prev, open: false }))}
        onConfirm={handleAmountConfirm}
        currency={amountDialog.currency}
        action={amountDialog.action}
      />
    </div>
  );
};

export default WalletScreen;
