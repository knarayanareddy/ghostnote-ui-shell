import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Stats {
  sent: number;
  received: number;
}

interface StatsContextValue {
  stats: Stats;
  refreshStats: () => Promise<void>;
}

const StatsContext = createContext<StatsContextValue>({
  stats: { sent: 0, received: 0 },
  refreshStats: async () => {},
});

export const useStats = () => useContext(StatsContext);

export const StatsProvider = ({ children }: { children: ReactNode }) => {
  const [stats, setStats] = useState<Stats>({ sent: 0, received: 0 });

  const refreshStats = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [sentRes, recvRes] = await Promise.all([
      supabase
        .from("notes")
        .select("*", { head: true, count: "exact" })
        .eq("author_id", user.id),
      supabase
        .from("notes")
        .select("*", { head: true, count: "exact" })
        .eq("recipient_id", user.id)
        .eq("status", "delivered"),
    ]);

    setStats({
      sent: sentRes.count ?? 0,
      received: recvRes.count ?? 0,
    });
  }, []);

  useEffect(() => {
    // Initial fetch after a short delay to let auth settle
    const t = setTimeout(refreshStats, 500);
    return () => clearTimeout(t);
  }, [refreshStats]);

  return (
    <StatsContext.Provider value={{ stats, refreshStats }}>
      {children}
    </StatsContext.Provider>
  );
};
