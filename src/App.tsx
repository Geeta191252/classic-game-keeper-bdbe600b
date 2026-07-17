import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { BalanceProvider } from "@/contexts/BalanceContext";
import { useGlobalClickSound } from "@/hooks/useGlobalClickSound";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { Loader2 } from "lucide-react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import GameFrame from "./components/GameFrame";
import { ReactElement } from "react";

const framed = (el: ReactElement) => <GameFrame>{el}</GameFrame>;

// Lazy-load heavy game pages so the home screen boots instantly and
// each game only downloads its own chunk on demand (then cached).
const GreedyKingGame = lazy(() => import("./pages/GreedyKingGame"));
const DiceMasterGame = lazy(() => import("./pages/DiceMasterGame"));
const CarnivalSpinGame = lazy(() => import("./pages/CarnivalSpinGame"));
const MinesGame = lazy(() => import("./pages/MinesGame"));
const MinesClassicGame = lazy(() => import("./pages/MinesClassicGame"));
const AviatorGame = lazy(() => import("./pages/AviatorGame"));
const AviatorFunGame = lazy(() => import("./pages/AviatorFunGame"));
const PlinkoGame = lazy(() => import("./pages/PlinkoGame"));
const ChickenRoadGame = lazy(() => import("./pages/ChickenRoadGame"));
const ChickenClassicGame = lazy(() => import("./pages/ChickenClassicGame"));
const JetXGame = lazy(() => import("./pages/JetXGame"));
const TwistGame = lazy(() => import("./pages/TwistGame"));
const GoblinTower = lazy(() => import("./pages/GoblinTower"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminPages = {
  Dashboard: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.Dashboard }))),
  Users: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.UsersPage }))),
  Games: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.GamesPage }))),
  Banners: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.BannersPage }))),
  Moderators: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.ModeratorsPage }))),
  Support: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.SupportPage }))),
  Announcements: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.AnnouncementsPage }))),
  ForgottenPasswords: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.ForgottenPasswordsPage }))),
  Deposits: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.DepositsPage }))),
  Withdrawals: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.WithdrawalsPage }))),
  WalletAdjust: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.WalletAdjustPage }))),
  Analytics: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.AnalyticsPage }))),
  SpareWallet: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.SpareWalletPage }))),
  DailyAnalytics: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.DailyAnalyticsPage }))),
  BonusIncomeReport: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.BonusIncomeReportPage }))),
  FinancialsReport: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.FinancialsReportPage }))),
  UserTheme: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.UserThemePage }))),
  DepositPlans: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.DepositPlansPage }))),
  BetPlans: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.BetPlansPage }))),
  SalaryIncome: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.SalaryIncomePage }))),
  RankSystem: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.RankSystemPage }))),
  SystemControls: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.SystemControlsPage }))),
  SiteLogo: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.SiteLogoPage }))),
  BonusSettings: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.BonusSettingsPage }))),
  AviatorBucket: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.AviatorBucketPage }))),
  Cron: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.CronManagementPage }))),
  GiftCodes: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.GiftCodesPage }))),
  Settings: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.SettingsPage }))),
  DepositType: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.DepositTypePage }))),
  WithdrawLimit: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.WithdrawLimitPage }))),
  Profile: lazy(() => import("./pages/admin/pages").then(m => ({ default: m.ProfilePage }))),
};

const queryClient = new QueryClient();

const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;

const STARTAPP_GAME_ROUTES: Record<string, string> = {
  g_aviator: "/aviator",
  g_aviator_fun: "/aviator-fun",
  g_mines: "/mines",
  g_mines_classic: "/mines-classic",
  g_dice: "/dice-master",
  g_carnival: "/carnival-spin",
  g_greedy: "/greedy-king",
  g_plinko: "/plinko",
  g_chicken: "/chicken-road",
  g_chicken_classic: "/chicken-classic",
  g_jetx: "/jetx",
  g_twist: "/twist",
  g_goblin: "/goblin-tower",
};

const StartParamNavigator = () => {
  const navigate = useNavigate();
  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      const param: string | undefined = tg?.initDataUnsafe?.start_param;
      if (!param) return;
      const target = STARTAPP_GAME_ROUTES[param];
      if (target) navigate(target, { replace: true });
    } catch {
      // ignore
    }
  }, [navigate]);
  return null;
};

// Prefetch game chunks sequentially after idle so clicks feel instant
// without jamming the main thread / network on slow devices.
const prefetchGames = () => {
  const loaders: Array<() => Promise<unknown>> = [
    () => import("./pages/AviatorGame"),
    () => import("./pages/AviatorFunGame"),
    () => import("./pages/GreedyKingGame"),
    () => import("./pages/MinesGame"),
    () => import("./pages/MinesClassicGame"),
    () => import("./pages/DiceMasterGame"),
    () => import("./pages/CarnivalSpinGame"),
    () => import("./pages/PlinkoGame"),
    () => import("./pages/ChickenRoadGame"),
    () => import("./pages/ChickenClassicGame"),
    () => import("./pages/JetXGame"),
    () => import("./pages/TwistGame"),
    () => import("./pages/GoblinTower"),
  ];
  const runNext = (i: number) => {
    if (i >= loaders.length) return;
    loaders[i]().finally(() => setTimeout(() => runNext(i + 1), 400));
  };
  const start = () => runNext(0);
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) ric(start, { timeout: 4000 });
  else setTimeout(start, 2000);
};

const RouteFallback = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
  </div>
);

const App = () => {
  useGlobalClickSound();
  useEffect(() => {
    prefetchGames();
  }, []);

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <QueryClientProvider client={queryClient}>
        <BalanceProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <StartParamNavigator />
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/greedy-king" element={framed(<GreedyKingGame />)} />
                  <Route path="/dice-master" element={framed(<DiceMasterGame />)} />
                  <Route path="/carnival-spin" element={framed(<CarnivalSpinGame />)} />
                  <Route path="/mines" element={framed(<MinesGame />)} />
                  <Route path="/mines-classic" element={framed(<MinesClassicGame />)} />
                  <Route path="/aviator" element={framed(<AviatorGame />)} />
                  <Route path="/aviator-fun" element={framed(<AviatorFunGame />)} />
                  <Route path="/plinko" element={framed(<PlinkoGame />)} />
                  <Route path="/chicken-road" element={framed(<ChickenRoadGame />)} />
                  <Route path="/chicken-classic" element={framed(<ChickenClassicGame />)} />
                  <Route path="/jetx" element={framed(<JetXGame />)} />
                  <Route path="/twist" element={framed(<TwistGame />)} />
                  <Route path="/goblin-tower" element={framed(<GoblinTower />)} />
                  <Route path="/admin-legacy" element={<AdminPanel />} />
                  <Route path="/admin" element={<AdminLogin />} />
                  <Route path="/admin/login" element={<AdminLogin />} />
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route path="dashboard" element={<AdminPages.Dashboard />} />
                    <Route path="users" element={<AdminPages.Users />} />
                    <Route path="games" element={<AdminPages.Games />} />
                    <Route path="banners" element={<AdminPages.Banners />} />
                    <Route path="moderators" element={<AdminPages.Moderators />} />
                    <Route path="support" element={<AdminPages.Support />} />
                    <Route path="announcements" element={<AdminPages.Announcements />} />
                    <Route path="forgotten-passwords" element={<AdminPages.ForgottenPasswords />} />
                    <Route path="deposits" element={<AdminPages.Deposits />} />
                    <Route path="withdrawals" element={<AdminPages.Withdrawals />} />
                    <Route path="wallet-adjust" element={<AdminPages.WalletAdjust />} />
                    <Route path="analytics" element={<AdminPages.Analytics />} />
                    <Route path="spare-wallet" element={<AdminPages.SpareWallet />} />
                    <Route path="daily-analytics" element={<AdminPages.DailyAnalytics />} />
                    <Route path="bonus-income-report" element={<AdminPages.BonusIncomeReport />} />
                    <Route path="financials-report" element={<AdminPages.FinancialsReport />} />
                    <Route path="user-theme" element={<AdminPages.UserTheme />} />
                    <Route path="plans/deposit" element={<AdminPages.DepositPlans />} />
                    <Route path="plans/bet" element={<AdminPages.BetPlans />} />
                    <Route path="plans/salary" element={<AdminPages.SalaryIncome />} />
                    <Route path="plans/rank" element={<AdminPages.RankSystem />} />
                    <Route path="system-controls" element={<AdminPages.SystemControls />} />
                    <Route path="site-logo" element={<AdminPages.SiteLogo />} />
                    <Route path="bonus-settings" element={<AdminPages.BonusSettings />} />
                    <Route path="aviator-bucket" element={<AdminPages.AviatorBucket />} />
                    <Route path="cron" element={<AdminPages.Cron />} />
                    <Route path="gift-codes" element={<AdminPages.GiftCodes />} />
                    <Route path="settings" element={<AdminPages.Settings />} />
                    <Route path="deposit-type" element={<AdminPages.DepositType />} />
                    <Route path="withdraw-limit" element={<AdminPages.WithdrawLimit />} />
                    <Route path="profile" element={<AdminPages.Profile />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </BalanceProvider>
      </QueryClientProvider>
    </TonConnectUIProvider>
  );
};

export default App;
