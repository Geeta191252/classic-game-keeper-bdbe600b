import React, { createContext, useContext, useState, useEffect } from "react";
import { useBalance } from "@/hooks/useBalance";
import { useQueryClient } from "@tanstack/react-query";

interface BalanceContextType {
  dollarBalance: number;
  rupeeBalance: number;
  starBalance: number;
  dollarWinning: number;
  rupeeWinning: number;
  starWinning: number;
  isLoading: boolean;
  refreshBalance: () => void;
  currencyDisplay: "USD" | "INR";
  toggleCurrencyDisplay: () => void;
}

const BalanceContext = createContext<BalanceContextType>({
  dollarBalance: 0,
  rupeeBalance: 0,
  starBalance: 0,
  dollarWinning: 0,
  rupeeWinning: 0,
  starWinning: 0,
  isLoading: false,
  refreshBalance: () => {},
  currencyDisplay: "USD",
  toggleCurrencyDisplay: () => {},
});

export const BalanceProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useBalance();
  const [currencyDisplay, setCurrencyDisplay] = useState<"USD" | "INR">(() => {
    return (localStorage.getItem("game_currency_display") as "USD" | "INR") || "USD";
  });

  const toggleCurrencyDisplay = () => {
    setCurrencyDisplay((prev) => {
      const next = prev === "USD" ? "INR" : "USD";
      localStorage.setItem("game_currency_display", next);
      return next;
    });
  };

  const refreshBalance = () => {
    queryClient.invalidateQueries({ queryKey: ["balance"] });
  };

  return (
    <BalanceContext.Provider
      value={{
        dollarBalance: data?.dollarBalance ?? 0,
        rupeeBalance: data?.rupeeBalance ?? 0,
        starBalance: data?.starBalance ?? 0,
        dollarWinning: data?.dollarWinning ?? 0,
        rupeeWinning: data?.rupeeWinning ?? 0,
        starWinning: data?.starWinning ?? 0,
        isLoading,
        refreshBalance,
        currencyDisplay,
        toggleCurrencyDisplay,
      }}
    >
      {children}
    </BalanceContext.Provider>
  );
};

export const useBalanceContext = () => useContext(BalanceContext);
