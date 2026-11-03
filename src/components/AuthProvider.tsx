import { useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureAnonymousSession } from "@/lib/supabaseAuth";
import { AuthContext, type AuthStatus } from "@/lib/auth-context";

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  error: string | null;
}

/**
 * Establishes the anonymous session *before* any page renders queries.
 *
 * Previously each page called `getUser()` on mount, racing the
 * fire-and-forget sign-in in AppLayout: a deep link to /journal could render
 * "your journal is empty" while the session was still being created.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    userId: null,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setState({ status: "loading", userId: null, error: null });

    ensureAnonymousSession()
      .then((userId) => {
        if (!cancelled) setState({ status: "ready", userId, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          userId: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const userId = session?.user?.id ?? null;
      setState((prev) => {
        // Ignore the initial "no session yet" event: the sign-in above owns
        // the loading → ready transition.
        if (prev.status === "loading" && !userId) return prev;
        return { status: "ready", userId, error: null };
      });
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return (
    <AuthContext.Provider
      value={{ status: state.status, userId: state.userId, error: state.error, retry }}
    >
      {children}
    </AuthContext.Provider>
  );
};
