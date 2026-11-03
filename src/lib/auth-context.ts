import { createContext, useContext } from "react";

export type AuthStatus = "loading" | "ready" | "error";

export interface AuthContextValue {
  status: AuthStatus;
  /** id of the anonymous user, once the session exists. */
  userId: string | null;
  error: string | null;
  /** Re-attempt the anonymous sign-in. */
  retry: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  status: "loading",
  userId: null,
  error: null,
  retry: () => {},
});

/** Session state for the anonymous user. Only meaningful inside <AuthProvider>. */
export const useAuth = () => useContext(AuthContext);
