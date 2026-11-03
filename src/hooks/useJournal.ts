import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export interface JournalNote {
  id: string;
  body: string;
  tag: string | null;
  delivered_at: string | null;
  opened_at: string | null;
}

/**
 * Notes received by this user. Backed by the get_my_journal() RPC, which omits
 * author_id so a recipient can never learn who sent a note.
 *
 * Errors are surfaced through `isError`, so a failed request no longer looks
 * like "your journal is empty".
 */
/** Matches the default page size in get_my_journal(). */
export const JOURNAL_PAGE_SIZE = 50;

export function useJournal(limit: number = JOURNAL_PAGE_SIZE) {
  const { userId } = useAuth();

  return useQuery({
    queryKey: ["journal", userId, limit],
    enabled: Boolean(userId),
    queryFn: async (): Promise<JournalNote[]> => {
      const { data, error } = await supabase.rpc("get_my_journal", { p_limit: limit });

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },
  });
}
