import { motion, AnimatePresence } from "framer-motion";
import { X, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getTelegram, requestInvoice } from "@/lib/telegram";
import { useBalanceContext } from "@/contexts/BalanceContext";
import { useEffect, useState } from "react";
import OfferCard3D from "@/components/OfferCard3D";

interface MarketScreenProps {
  onGoToWallet?: () => void;
}

interface BackendOffer {
  _id: string;
  title: string;
  payAmount: number;
  payCurrency: "star" | "dollar";
  getAmount: number;
  bonusLabel?: string;
  valueLabel?: string;
}

const apiBase = import.meta.env.VITE_API_BASE_URL || "https://broken-bria-chetan1-ea890b93.koyeb.app/api";

const cryptoApiTicker: Record<string, string> = { usdt: "usdttrc20" };
const CRYPTO_OPTIONS: Array<{ id: string; label: string; emoji: string }> = [
  { id: "btc", label: "BTC", emoji: "₿" },
  { id: "ltc", label: "LTC", emoji: "Ł" },
  { id: "usdt", label: "USDT", emoji: "₮" },
  { id: "ton", label: "TON", emoji: "💎" },
  { id: "sol", label: "SOL", emoji: "◎" },
  { id: "trx", label: "TRX", emoji: "🔺" },
  { id: "doge", label: "DOGE", emoji: "🐕" },
];

const MarketScreen = ({ onGoToWallet }: MarketScreenProps) => {
  const { refreshBalance } = useBalanceContext();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [offers, setOffers] = useState<BackendOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [coinPickerOffer, setCoinPickerOffer] = useState<BackendOffer | null>(null);
  const [cryptoPayment, setCryptoPayment] = useState<{
    payAddress: string;
    payAmount: number;
    payCurrency: string;
    orderId: string;
    offerLabel: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${apiBase}/offers`);
        const d = await r.json();
        setOffers(d.offers || []);
      } catch {
        setOffers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const claimStarOffer = async (offer: BackendOffer) => {
    setBusyId(offer._id);
    try {
      const tg = getTelegram();
      if (!tg) {
        throw new Error("Please open this app inside Telegram to make payments.");
      }
      const invoiceUrl = await requestInvoice("deposit", "star", offer.payAmount);
      setBusyId(null);
      tg.openInvoice(invoiceUrl, (status) => {
        if (status === "paid") {
          toast({ title: "Offer paid! 🎁", description: `${offer.bonusLabel || "Bonus"} will be credited by admin shortly.` });
          refreshBalance();
        } else if (status === "cancelled") {
          toast({ title: "Cancelled", description: "Offer payment cancelled." });
        } else if (status === "failed") {
          toast({ title: "Payment failed", description: "Please try again.", variant: "destructive" });
        }
      });
    } catch (err: any) {
      setBusyId(null);
      toast({ title: "Error", description: err?.message || "Could not start payment.", variant: "destructive" });
    }
  };

  const claimDollarOffer = (offer: BackendOffer) => {
    setCoinPickerOffer(offer);
  };

  const startCryptoPayment = async (offer: BackendOffer, coinId: string) => {
    setBusyId(offer._id);
    setCoinPickerOffer(null);
    try {
      const tg = getTelegram();
      const userId = tg?.initDataUnsafe?.user?.id || "demo";
      const apiCurrency = cryptoApiTicker[coinId] || coinId;
      const res = await fetch(`${apiBase}/crypto/create-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, amount: offer.payAmount, currency: apiCurrency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payment");
      if (!data.payAddress) throw new Error("No payment address returned");
      setCryptoPayment({
        payAddress: data.payAddress,
        payAmount: data.payAmount,
        payCurrency: data.payCurrency,
        orderId: data.orderId,
        offerLabel: `${offer.title} • Get $${offer.getAmount}`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not start offer.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const claim = (offer: BackendOffer) =>
    offer.payCurrency === "star" ? claimStarOffer(offer) : claimDollarOffer(offer);

  return (
    <div className="relative z-10 px-4 pt-4 pb-24 space-y-4 bg-[#0e131f] text-[#8e97a4] min-h-screen">
      
      {/* Page Title Card */}
      <div className="rounded-2xl p-4 flex items-center gap-3 bg-[#141b2b] border border-white/[0.02] shadow-md">
        <span className="text-2xl">🏪</span>
        <div>
          <h2 className="font-extrabold text-sm text-white">Market Shop</h2>
          <p className="text-[10px] text-[#8e97a4] mt-0.5">Purchase star packages and cash balance bundles</p>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-xs py-8 text-slate-400">Loading offers…</p>
      ) : offers.length === 0 ? (
        <div className="rounded-2xl p-6 text-center bg-[#141b2b] border border-dashed border-white/[0.04]">
          <div className="text-3xl mb-1.5">📭</div>
          <p className="text-xs font-bold text-white">No active offers right now</p>
          <p className="text-[10px] text-[#8e97a4] mt-0.5">Check back soon for special deals!</p>
        </div>
      ) : (
        offers.map((offer) => (
          <div key={offer._id}>
            <OfferCard3D
              offer={offer}
              onClaim={() => claim(offer)}
              busy={busyId === offer._id}
            />
          </div>
        ))
      )}

      {offers.length > 0 && (
        <p className="text-center text-[9px] text-slate-500 px-4">
          After payment, bonus will be credited automatically by admin.
        </p>
      )}

      {/* Crypto Selector Modal */}
      <AnimatePresence>
        {coinPickerOffer && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setCoinPickerOffer(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-3xl p-5 max-h-[80vh] overflow-y-auto bg-[#141b2b] border border-white/[0.03] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-xs text-white">Pay ${coinPickerOffer.payAmount} with…</h3>
                <button onClick={() => setCoinPickerOffer(null)} className="h-7 w-7 rounded-full bg-[#0d121f] flex items-center justify-center">
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              </div>
              <p className="text-[10px] text-[#8e97a4] mb-4">
                Select a cryptocurrency. Bonus: {coinPickerOffer.bonusLabel || `Get $${coinPickerOffer.getAmount}`}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {CRYPTO_OPTIONS.map((c) => (
                  <motion.button
                    key={c.id}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => startCryptoPayment(coinPickerOffer, c.id)}
                    className="rounded-xl py-2.5 font-bold flex flex-col items-center gap-1 bg-[#0d121f] border border-white/[0.02] hover:bg-slate-800 transition-colors"
                  >
                    <span className="text-xl">{c.emoji}</span>
                    <span className="text-[10px] text-slate-300">{c.label}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Details Modal */}
      <AnimatePresence>
        {cryptoPayment && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setCryptoPayment(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-3xl p-5 max-h-[80vh] overflow-y-auto bg-[#141b2b] border border-white/[0.03] shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-xs text-white">Send Payment</h3>
                <button onClick={() => setCryptoPayment(null)} className="h-7 w-7 rounded-full bg-[#0d121f] flex items-center justify-center">
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              </div>
              <p className="text-[10px] text-[#8e97a4]">{cryptoPayment.offerLabel}</p>

              <div className="rounded-xl p-3 bg-[#0d121f] border border-white/[0.02]">
                <p className="text-[9px] text-[#8e97a4] mb-0.5">Send exactly</p>
                <p className="font-extrabold text-sm text-[#00a2e8]">
                  {cryptoPayment.payAmount} {cryptoPayment.payCurrency.toUpperCase()}
                </p>
              </div>

              <div className="rounded-xl p-3 bg-[#0d121f] border border-white/[0.02]">
                <p className="text-[9px] text-[#8e97a4] mb-0.5">{cryptoPayment.payCurrency.toUpperCase()} Address</p>
                <p className="text-[9px] font-mono break-all select-all text-white">{cryptoPayment.payAddress}</p>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(cryptoPayment.payAddress);
                  toast({ title: "Copied!", description: "Address copied to clipboard." });
                }}
                className="w-full rounded-xl py-2.5 text-xs font-black uppercase bg-[#00a2e8] hover:bg-[#0091d0] text-white tracking-wider shadow-md shadow-[#00a2e8]/20 transition-transform active:scale-97"
              >
                Copy Address
              </button>
              <p className="text-[9px] text-center text-slate-500">
                Bonus automatically credited after blockchain confirmation.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MarketScreen;
