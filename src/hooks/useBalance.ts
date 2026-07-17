import { useQuery } from "@tanstack/react-query";
import { fetchBalance } from "@/lib/telegram";

export const useBalance = () => {
  return useQuery({
    queryKey: ["balance"],
    queryFn: fetchBalance,
    // Fallback to zero balances if backend is not reachable
    placeholderData: { dollarBalance: 0, rupeeBalance: 0, starBalance: 0, dollarWinning: 0, rupeeWinning: 0, starWinning: 0, referralCount: 0 },
    retry: 2,
    refetchInterval: 500, // refresh every 0.5s for instant balance updates
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
};
