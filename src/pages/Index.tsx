import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import SplashScreen from "@/components/SplashScreen";
import HomeScreen from "@/components/HomeScreen";
import { processReferral } from "@/lib/telegram";

const Index = () => {
  const [phase, setPhase] = useState<"preload" | "splash" | "ready">("preload");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("splash"), 1500);
    const t2 = setTimeout(() => setPhase("ready"), 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Process referral on app load
  useEffect(() => {
    processReferral();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence mode="wait">
        {phase === "preload" && (
          <motion.div
            key="preload"
            className="fixed inset-0 z-50 flex items-center justify-center bg-background"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 0.3, scale: 1 }}
              transition={{ duration: 0.8 }}
              className="text-secondary"
            >
              <svg width="80" height="80" viewBox="0 0 80 80" fill="currentColor">
                <path d="M40 8c-4 0-7.5 1.5-10 4l-2 2.5c-1.5 2-3.5 3-6 3h-2c-5.5 0-10 4.5-10 10v2c0 2.5-1 4.5-3 6L4.5 38c-2.5 2.5-4 6-4 10s1.5 7.5 4 10l2.5 2c2 1.5 3 3.5 3 6v2c0 5.5 4.5 10 10 10h2c2.5 0 4.5 1 6 3l2 2.5c2.5 2.5 6 4 10 4s7.5-1.5 10-4l2-2.5c1.5-2 3.5-3 6-3h2c5.5 0 10-4.5 10-10v-2c0-2.5 1-4.5 3-6l2.5-2c2.5-2.5 4-6 4-10s-1.5-7.5-4-10l-2.5-2c-2-1.5-3-3.5-3-6v-2c0-5.5-4.5-10-10-10h-2c-2.5 0-4.5-1-6-3l-2-2.5c-2.5-2.5-6-4-10-4z" />
              </svg>
            </motion.div>
            <div className="absolute bottom-8 left-8 right-8">
              <div className="h-1 overflow-hidden rounded-full bg-muted/20">
                <motion.div
                  className="h-full rounded-full bg-secondary"
                  initial={{ width: "0%" }}
                  animate={{ width: "40%" }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {phase === "splash" && <SplashScreen key="splash" />}

        {phase === "ready" && (
          <motion.div
            key="ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <HomeScreen />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
