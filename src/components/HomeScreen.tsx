import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShoppingCart, User, Shield, Sparkles, Flame, X, Trophy, Menu, Clock, 
  Search, ArrowRight, ChevronLeft, ChevronRight, Gamepad2, Coins, Compass, 
  Gift, Users, Wallet, Rocket, Play, RefreshCw, BarChart2, Star, DollarSign,
  HelpCircle, MessageSquare
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBalanceContext } from "@/contexts/BalanceContext";
import { getTelegramUser } from "@/lib/telegram";
import BottomNav from "./BottomNav";
import EarnScreen from "./EarnScreen";
import FriendsScreen from "./FriendsScreen";
import WalletScreen from "./WalletScreen";
import MarketScreen from "./MarketScreen";
import OfferPopup from "./OfferPopup";
import TournamentLeaderboard, { Tournament } from "./TournamentLeaderboard";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`;

type FilterTab = "all" | "originals" | "slots" | "crash" | "wheel" | "tournaments";

import greedyKingThumb from "@/assets/greedy-king-thumb.png";
import gameDice from "@/assets/dice.webp";
import gameCarnivalSpin from "@/assets/carnival.webp";
import gameMines from "@/assets/mines.webp";
import gameAviator from "@/assets/aviator.jpg";
import gamePlinko from "@/assets/plinko.webp";
import gameChickenRoad from "@/assets/chicken.webp";
import gameGoblin from "@/assets/goblin.webp";
import gameTwist from "@/assets/twist.webp";


interface GameTileProps {
  image: string;
  name: string;
  category: string;
  badge?: string;
  badgeColor?: string;
  fit?: "cover" | "contain";
  onClick?: () => void;
}

// Thunderpick-styled vertical rectangle game card
const GameTile = ({ image, name, category, badge, badgeColor, fit = "cover", onClick }: GameTileProps) => (
  <motion.div
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className="cursor-pointer group flex-shrink-0 w-[115px] sm:w-[130px] flex flex-col bg-[#141b2b] rounded-xl overflow-hidden border border-white/[0.02] hover:border-white/[0.08] transition-all duration-200"
  >
    <div className={`relative aspect-[3/4] w-full overflow-hidden ${fit === "contain" ? "bg-black" : "bg-[#0d121f]"}`}>
      <img 
        src={image} 
        alt={name} 
        className={`w-full h-full ${fit === "contain" ? "object-contain" : "object-cover"} transition-transform duration-300 group-hover:scale-105`} 
      />
      {badge && (
        <span
          className="absolute top-1.5 left-1.5 text-white text-[7px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider shadow"
          style={{
            backgroundColor: badgeColor || "#10b981",
          }}
        >
          {badge}
        </span>
      )}
      {/* Play Overlay */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <div className="h-8 w-8 rounded-full bg-[#00a2e8] flex items-center justify-center text-white shadow-lg">
          <Play className="h-3 w-3 fill-white ml-0.5" />
        </div>
      </div>
    </div>
    <div className="p-2 min-w-0">
      <h4 className="font-bold text-[10px] text-white truncate leading-none">{name}</h4>
      <p className="text-[8px] text-[#8e97a4] mt-1 truncate">{category}</p>
    </div>
  </motion.div>
);

const HomeScreen = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0); // 0: Home, 1: Market, 2: Earn, 3: Friends, 4: Wallet
  const [showProfile, setShowProfile] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { dollarBalance, starBalance, rupeeBalance, dollarWinning, starWinning, rupeeWinning } = useBalanceContext();
  const totalDollar = dollarBalance + dollarWinning;
  const totalStar = starBalance + starWinning;
  const totalRupee = rupeeBalance + rupeeWinning;
  const [filter, setFilter] = useState<FilterTab>("all");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [openTournament, setOpenTournament] = useState<Tournament | null>(null);
  const [now, setNow] = useState(Date.now());
  const [drawerCategory, setDrawerCategory] = useState<"Casino" | "Sports" | "Esports">("Casino");

  useEffect(() => {
    const hasTimedTournament = tournaments.some((t) => !!t.endsAt);
    if (!hasTimedTournament) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tournaments]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/tournaments/active`)
      .then((r) => r.ok ? r.json() : { tournaments: [] })
      .then((d) => setTournaments(d.tournaments || []))
      .catch(() => {});
  }, []);

  const formatRemaining = (ms: number) => {
    if (ms <= 0) return "Ended";
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    return `${h}h ${m}m`;
  };

  const goToGreedyKing = () => navigate("/greedy-king");
  const goToDiceMaster = () => navigate("/dice-master");
  const goToCarnivalSpin = () => navigate("/carnival-spin");
  const goToMines = () => navigate("/mines");
  const goToMinesClassic = () => navigate("/mines-classic");
  const goToAviator = () => navigate("/aviator");
  const goToAviatorFun = () => navigate("/aviator-fun");
  const goToPlinko = () => navigate("/plinko");
  const goToChickenRoad = () => navigate("/chicken-road");
  const goToChickenClassic = () => navigate("/chicken-classic");
  const goToTwist = () => navigate("/twist");
  const goToGoblinTower = () => navigate("/goblin-tower");
  const goToJetX = () => navigate("/jetx");
  const goToAdmin = () => navigate("/admin");

  const telegramUser = getTelegramUser();
  const isOwner = telegramUser?.id === 6965488457;

  // Active Category List for sliding pills
  const categories: { key: FilterTab; label: string; icon: any }[] = [
    { key: "all", label: "All Games", icon: Gamepad2 },
    { key: "originals", label: "Originals", icon: Flame },
    { key: "slots", label: "Slots", icon: Coins },
    { key: "crash", label: "Crash", icon: Rocket },
    { key: "wheel", label: "Wheel", icon: RefreshCw },
    { key: "tournaments", label: "Tournaments", icon: Trophy },
  ];

  // Full Games list categorized
  const gamesList = [
    { id: "mines", name: "Mines", image: gameMines, category: "Originals", tab: "originals", badge: "NEW", badgeColor: "#10b981", action: goToMines },
    { id: "mines-classic", name: "Mines Classic", image: gameMines, category: "Originals", tab: "originals", badge: "CLASSIC", badgeColor: "#6366f1", action: goToMinesClassic },
    { id: "dice", name: "Dice Master", image: gameDice, category: "Originals", tab: "originals", badge: "HOT", badgeColor: "#ef4444", action: goToDiceMaster },
    { id: "twist", name: "Twist Rings", image: gameTwist, category: "Originals", tab: "originals", badge: "HOT", badgeColor: "#ef4444", action: goToTwist },
    { id: "aviator-fun", name: "Aviator Fun", image: gameAviator, category: "Crash", tab: "crash", badge: "TURBO", badgeColor: "#f97316", action: goToAviatorFun },
    { id: "aviator", name: "Aviator Real", image: gameAviator, category: "Crash", tab: "crash", badge: "POPULAR", badgeColor: "#ec4899", action: goToAviator },
    { id: "jetx", name: "JetX", image: jetxLogo.url, category: "Crash", tab: "crash", badge: "3D", badgeColor: "#eab308", action: goToJetX },
    { id: "chicken-road", name: "Chicken Road", image: gameChickenRoad, category: "Crash", tab: "crash", badge: "POPULAR", badgeColor: "#ec4899", action: goToChickenRoad },
    { id: "chicken-classic", name: "Chicken Classic", image: gameChickenRoad, category: "Crash", tab: "crash", badge: "CLASSIC", badgeColor: "#6366f1", action: goToChickenClassic },
    { id: "plinko", name: "Plinko Pegs", image: gamePlinko, category: "Slots", tab: "slots", badge: "EASY", badgeColor: "#10b981", action: goToPlinko },
    { id: "goblin", name: "Goblin Tower", image: gameGoblin, category: "Slots", tab: "slots", badge: "EARLY ACCESS", badgeColor: "#8b5cf6", action: goToGoblinTower },
    { id: "greedy", name: "Greedy King", image: greedyKingThumb, category: "Wheel", tab: "wheel", badge: "MULTIPLIER", badgeColor: "#eab308", action: goToGreedyKing },
    { id: "carnival", name: "Carnival Spin", image: gameCarnivalSpin, category: "Wheel", tab: "wheel", badge: "SPIN", badgeColor: "#3b82f6", action: goToCarnivalSpin },
  ];

  // Shuffles/picks a random game
  const playRandomGame = () => {
    const rand = gamesList[Math.floor(Math.random() * gamesList.length)];
    rand.action();
  };

  const filteredGames = gamesList.filter(g => {
    const matchesTab = filter === "all" || g.tab === filter;
    const matchesSearch = g.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const renderTabContent = () => {
    switch (activeTab) {
      case 1: return <MarketScreen onGoToWallet={() => setActiveTab(4)} />;
      case 2: return <EarnScreen />;
      case 3: return <FriendsScreen />;
      case 4: return <WalletScreen />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen pb-20 relative bg-[#0e131f] text-[#8e97a4] font-sans selection:bg-[#00a2e8]/30">
      
      {/* Left Sidebar Drawer Menu (Thunderpick style) */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black"
              onClick={() => setIsDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25 }}
              className="fixed top-0 bottom-0 left-0 w-[260px] z-50 bg-[#0e131f] border-r border-white/[0.03] flex flex-col"
            >
              {/* Drawer Top Category Selectors */}
              <div className="p-4 border-b border-white/[0.03] flex flex-col gap-3 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-white font-black text-sm tracking-wide">
                    <span className="text-[#00a2e8]">⚡</span> ROYAL KING
                  </div>
                  <button 
                    onClick={() => setIsDrawerOpen(false)} 
                    className="p-1 rounded-lg bg-[#141b2b] text-[#8e97a4] hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1 bg-[#090d16] p-1 rounded-xl">
                  {(["Esports", "Sports", "Casino"] as const).map((cat) => {
                    const active = drawerCategory === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setDrawerCategory(cat)}
                        className={`py-1.5 text-[9px] font-extrabold rounded-lg uppercase tracking-wider transition-all ${
                          active 
                            ? "bg-[#00a2e8] text-white shadow-md shadow-[#00a2e8]/20" 
                            : "text-[#8e97a4] hover:text-white"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Drawer Scrollable Links */}
              <div className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
                <div className="text-[9px] font-extrabold tracking-wider uppercase text-slate-500 px-3 py-1 mt-1">Categories</div>
                {[
                  { label: "Recent Played", icon: Clock, act: () => { setFilter("all"); setIsDrawerOpen(false); } },
                  { label: "Originals", icon: Flame, act: () => { setFilter("originals"); setIsDrawerOpen(false); } },
                  { label: "Slots Games", icon: Coins, act: () => { setFilter("slots"); setIsDrawerOpen(false); } },
                  { label: "Crash Multiplier", icon: Rocket, act: () => { setFilter("crash"); setIsDrawerOpen(false); } },
                  { label: "Tournament Info", icon: Trophy, act: () => { setFilter("tournaments"); setIsDrawerOpen(false); } },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={item.act}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-[#141b2b] rounded-xl transition-all"
                  >
                    <item.icon className="h-4 w-4 text-[#8e97a4]" />
                    {item.label}
                  </button>
                ))}

                <div className="h-px bg-white/[0.03] my-2" />
                <div className="text-[9px] font-extrabold tracking-wider uppercase text-slate-500 px-3 py-1">Direct Nav</div>
                {[
                  { label: "Wallet & Cashier", icon: Wallet, act: () => { setActiveTab(4); setIsDrawerOpen(false); } },
                  { label: "Invite & Referrals", icon: Users, act: () => { setActiveTab(3); setIsDrawerOpen(false); } },
                  { label: "Earn Rewards", icon: Gift, act: () => { setActiveTab(2); setIsDrawerOpen(false); } },
                  { label: "Market Shop", icon: ShoppingCart, act: () => { setActiveTab(1); setIsDrawerOpen(false); } },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={item.act}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-[#141b2b] rounded-xl transition-all"
                  >
                    <item.icon className="h-4 w-4 text-[#8e97a4]" />
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Drawer Footer */}
              {isOwner && (
                <div className="p-3 border-t border-white/[0.03] shrink-0">
                  <button
                    onClick={() => { navigate("/admin"); setIsDrawerOpen(false); }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-black uppercase bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 rounded-xl"
                  >
                    <Shield className="h-3 w-3" /> Owner Panel
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Top Header Navigation (Thunderpick Style) */}
      <div className="sticky top-0 z-30 px-3 py-2.5 flex items-center justify-between bg-[#0e131f] border-b border-white/[0.03]">
        <div className="flex items-center gap-2">
          {/* Hamburger Menu Toggle */}
          <button 
            onClick={() => setIsDrawerOpen(true)}
            className="h-8 w-8 rounded-lg flex items-center justify-center bg-[#141b2b] border border-white/[0.03] hover:bg-slate-800 transition-colors"
          >
            <Menu className="h-4 w-4 text-white" />
          </button>
          {/* Brand Logo Lightning */}
          <div className="flex items-center gap-1 select-none cursor-pointer" onClick={() => { setActiveTab(0); setFilter("all"); }}>
            <span className="text-xl leading-none text-[#00a2e8]">⚡</span>
          </div>
        </div>

        {/* Balance Dropdown & Wallet Action */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {/* Dollar Balance */}
          <div 
            onClick={() => setActiveTab(4)}
            className="flex items-center gap-1 bg-[#090d16] border border-white/[0.02] rounded-xl px-2 py-1.5 cursor-pointer hover:bg-slate-900 transition-all select-none"
          >
            <span className="text-[9px]">💲</span>
            <span className="text-[9px] font-black text-emerald-400">
              {totalDollar.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Rupee Balance */}
          <div 
            onClick={() => setActiveTab(4)}
            className="flex items-center gap-1 bg-[#090d16] border border-white/[0.02] rounded-xl px-2 py-1.5 cursor-pointer hover:bg-slate-900 transition-all select-none"
          >
            <span className="text-[9px]">₹</span>
            <span className="text-[9px] font-black text-cyan-400">
              {totalRupee.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>

          {/* Star Balance */}
          <div 
            onClick={() => setActiveTab(4)}
            className="flex items-center gap-1 bg-[#090d16] border border-white/[0.02] rounded-xl px-2 py-1.5 cursor-pointer hover:bg-slate-900 transition-all select-none"
          >
            <span className="text-[9px]">⭐</span>
            <span className="text-[9px] font-black text-amber-400">
              {totalStar.toLocaleString()}
            </span>
          </div>

          <button
            onClick={() => setActiveTab(4)}
            className="bg-[#00a2e8] hover:bg-[#0091d0] text-white text-[9px] font-black px-2.5 py-2 rounded-xl transition-all shadow-md shadow-[#00a2e8]/20 tracking-wider uppercase shrink-0"
          >
            Wallet
          </button>

          {/* User Profile Avatar trigger */}
          <div 
            onClick={() => setShowProfile(true)}
            className="h-8 w-8 rounded-lg overflow-hidden flex items-center justify-center bg-[#141b2b] border border-white/[0.03] cursor-pointer hover:bg-slate-800"
          >
            <User className="h-4 w-4 text-slate-300" />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 0 ? (
          <motion.div 
            key="games" 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            transition={{ duration: 0.2 }} 
            className="relative z-10 p-3 space-y-4"
          >
            {/* Featured Promo Banner - styled like MooFo banner */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#151c2d] to-[#0c101a] border border-white/[0.03] p-4 flex items-center justify-between min-h-[120px] shadow-lg">
              <div className="flex-1 space-y-2 z-10 max-w-[65%]">
                <span className="text-[8px] font-extrabold text-[#00a2e8] uppercase tracking-widest bg-[#00a2e8]/10 px-2 py-0.5 rounded border border-[#00a2e8]/20">Early Access</span>
                <h3 className="font-black text-sm text-white leading-tight">Royal King Originals</h3>
                <p className="text-[9px] text-[#8e97a4] leading-normal">Provably fair multiplier matches. Play and cash out instantly!</p>
                <button 
                  onClick={playRandomGame}
                  className="flex items-center gap-1.5 bg-[#00a2e8] hover:bg-[#0091d0] text-white text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider transition-all"
                >
                  <Play className="h-2.5 w-2.5 fill-white" /> Play Random
                </button>
              </div>
              <div className="absolute right-0 bottom-0 top-0 w-[40%] flex items-center justify-center pointer-events-none">
                <img 
                  src={gameTwist} 
                  alt="Original Twist" 
                  className="h-[95%] w-auto object-contain opacity-85 translate-x-4 rotate-12 scale-110" 
                />
              </div>
            </div>

            {/* Horizontal Filter Category Pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-3 px-3">
              {categories.map((c) => {
                const active = filter === c.key;
                return (
                  <motion.button
                    key={c.key}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setFilter(c.key)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 transition-all border ${
                      active 
                        ? "bg-[#141b2b] text-[#00a2e8] border-[#00a2e8]/30" 
                        : "bg-[#090d16] text-[#8e97a4] border-white/[0.01] hover:text-white"
                    }`}
                  >
                    <c.icon className={`h-3.5 w-3.5 ${active ? "text-[#00a2e8]" : "text-[#8e97a4]"}`} />
                    {c.label}
                  </motion.button>
                );
              })}
            </div>

            {/* Search and Random Action Bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8e97a4]" />
                <input
                  type="text"
                  placeholder="Search games..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs font-bold bg-[#141b2b] border border-white/[0.02] text-white rounded-xl placeholder-[#8e97a4]/60 focus:outline-none focus:border-[#00a2e8]/40 transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")} 
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <button
                onClick={playRandomGame}
                className="flex items-center gap-1.5 bg-[#141b2b] border border-white/[0.03] text-slate-200 hover:text-white text-xs font-bold px-3 py-2 rounded-xl"
              >
                <span>⚡</span> Random
              </button>
            </div>

            {/* Tournaments Section */}
            {(filter === "all" || filter === "tournaments") && tournaments.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-xs tracking-wide uppercase text-white flex items-center gap-1.5">
                    <Trophy className="h-3.5 w-3.5 text-amber-500" />
                    Tournaments ({tournaments.length})
                  </h2>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                  {tournaments.map((t) => {
                    const sym = t.prizeCurrency === "dollar" ? "$" : "⭐";
                    const firstPrize = t.prizeTiers && t.prizeTiers.length > 0 ? t.prizeTiers[0].amount : t.prizePerWinner;
                    const remainingMs = t.endsAt ? new Date(t.endsAt).getTime() - now : 0;
                    return (
                      <motion.div
                        key={t._id}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setOpenTournament(t)}
                        className="cursor-pointer flex-shrink-0 w-[180px] rounded-xl overflow-hidden bg-[#141b2b] border border-white/[0.02]"
                      >
                        <div className="aspect-[16/10] relative overflow-hidden bg-[#0d121f]">
                          {t.imageUrl ? (
                            <img src={t.imageUrl} alt={t.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-amber-500/10">
                              <Trophy className="h-6 w-6 text-amber-400" />
                            </div>
                          )}
                          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[7px] font-black text-amber-400 uppercase">
                            TOP {t.tier}
                          </div>
                          {t.endsAt && (
                            <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[7px] font-extrabold bg-black/80 text-slate-200">
                              ⏱ {formatRemaining(remainingMs)}
                            </div>
                          )}
                        </div>
                        <div className="p-2 space-y-0.5">
                          <p className="text-[10px] font-bold truncate text-white">{t.title}</p>
                          <p className="text-[9px] text-amber-400 font-bold">
                            1st Prize: {sym}{firstPrize}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Originals Section */}
            {(filter === "all" || filter === "originals") && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-extrabold text-xs tracking-wide uppercase text-white flex items-center gap-1.5">
                    <span>⚡</span> Original Games ({gamesList.filter(g => g.tab === "originals").length})
                  </h2>
                  <div className="flex gap-1">
                    <button className="h-6 w-6 rounded-lg bg-[#141b2b] flex items-center justify-center text-slate-400 hover:text-white">
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                    <button className="h-6 w-6 rounded-lg bg-[#141b2b] flex items-center justify-center text-slate-400 hover:text-white">
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
                  {filteredGames.filter(g => g.tab === "originals").map((g) => (
                    <GameTile
                      key={g.id}
                      image={g.image}
                      name={g.name}
                      category={g.category}
                      badge={g.badge}
                      badgeColor={g.badgeColor}
                      onClick={g.action}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Crash Section */}
            {(filter === "all" || filter === "crash") && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-extrabold text-xs tracking-wide uppercase text-white flex items-center gap-1.5">
                    <span>🚀</span> Crash Multipliers ({gamesList.filter(g => g.tab === "crash").length})
                  </h2>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
                  {filteredGames.filter(g => g.tab === "crash").map((g) => (
                    <GameTile
                      key={g.id}
                      image={g.image}
                      name={g.name}
                      category={g.category}
                      badge={g.badge}
                      badgeColor={g.badgeColor}
                      onClick={g.action}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Slots Section */}
            {(filter === "all" || filter === "slots") && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-extrabold text-xs tracking-wide uppercase text-white flex items-center gap-1.5">
                    <span>🎰</span> Slots & Towers ({gamesList.filter(g => g.tab === "slots").length})
                  </h2>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
                  {filteredGames.filter(g => g.tab === "slots").map((g) => (
                    <GameTile
                      key={g.id}
                      image={g.image}
                      name={g.name}
                      category={g.category}
                      badge={g.badge}
                      badgeColor={g.badgeColor}
                      onClick={g.action}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Wheel Section */}
            {(filter === "all" || filter === "wheel") && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-extrabold text-xs tracking-wide uppercase text-white flex items-center gap-1.5">
                    <span>🎡</span> Lucky Wheels ({gamesList.filter(g => g.tab === "wheel").length})
                  </h2>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
                  {filteredGames.filter(g => g.tab === "wheel").map((g) => (
                    <GameTile
                      key={g.id}
                      image={g.image}
                      name={g.name}
                      category={g.category}
                      badge={g.badge}
                      badgeColor={g.badgeColor}
                      onClick={g.action}
                    />
                  ))}
                </div>
              </section>
            )}

          </motion.div>
        ) : (
          <motion.div key={`tab-${activeTab}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="relative z-10 animate-fade-in">
            {renderTabContent()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Nav Bar with dynamic icons */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 0 && <OfferPopup />}

      <AnimatePresence>
        {openTournament && (
          <TournamentLeaderboard tournament={openTournament} onClose={() => setOpenTournament(null)} />
        )}
      </AnimatePresence>

      {/* User Profile Modal popup */}
      <AnimatePresence>
        {showProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowProfile(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[290px] rounded-3xl p-5 relative bg-[#141b2b] border border-white/[0.04] shadow-2xl"
            >
              <button
                onClick={() => setShowProfile(false)}
                className="absolute top-3 right-3 h-7 w-7 rounded-full flex items-center justify-center bg-[#090d16] hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4 text-slate-400" />
              </button>

              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl flex items-center justify-center bg-[#090d16] border border-white/[0.04]">
                  <User className="h-6 w-6 text-slate-300" />
                </div>

                <div className="text-center space-y-0.5">
                  <h3 className="font-bold text-sm text-white">
                    {telegramUser?.first_name || "User"} {telegramUser?.last_name || ""}
                  </h3>
                  {telegramUser?.username && (
                    <p className="text-[10px] text-slate-400">@{telegramUser.username}</p>
                  )}
                </div>

                <div className="w-full rounded-2xl p-3.5 mt-1 space-y-2.5 bg-[#090d16] border border-white/[0.04]">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#8e97a4]">Telegram ID</span>
                    <span className="text-[10px] font-bold text-slate-200">{telegramUser?.id || "N/A"}</span>
                  </div>
                  <div className="h-px bg-white/[0.04]" />
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#8e97a4]">💲 Balance</span>
                    <span className="text-[10px] font-bold text-emerald-400">${totalDollar.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-white/[0.04]" />
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#8e97a4]">⭐ Stars</span>
                    <span className="text-[10px] font-bold text-amber-400">{totalStar.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HomeScreen;
