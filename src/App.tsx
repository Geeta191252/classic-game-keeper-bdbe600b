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
                  <Route path="/admin" element={<AdminPanel />} />
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
