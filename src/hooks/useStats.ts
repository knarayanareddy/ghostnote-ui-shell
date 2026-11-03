import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export interface Stats {
  sent: number;
  received: number;
}

/**
 * Counts for the header. Backed by the get_my_stats() RPC so the client never
 * needs SELECT on `notes` (which would expose counterpart ids).
 */
export function useStats() {
  const { userId } = useAuth();

  return useQuery({
    queryKey: ["stats", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Stats> => {
      const { data, error } = await supabase.rpc("get_my_stats");

      if (error) {
        throw new Error(error.message);
      }

      const row = data?.[0];
      return {
        sent: Number(row?.sent ?? 0),
        received: Number(row?.received ?? 0),
      };
    },
  });
}
