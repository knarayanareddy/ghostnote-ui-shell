import { supabase } from "@/integrations/supabase/client";

/**
 * S-7 in docs/SECURITY-REDTEAM.md.
 *
 * There is no sign-out anywhere else in the app: an anonymous session is
 * created once per browser and refreshed forever. On a shared or resold device,
 * the next person opens Kindling and reads the previous person's whole journal —
 * which is the private mail strangers sent them.
 *
 * "Forget this device" drops the session and its local storage. It cannot and
 * does not delete notes that were already sent or received: the identity is
 * gone, the rows are not. That distinction is in the dialog copy too.
 */

/** Keys supabase-js writes for this project, e.g. `sb-<ref>-auth-token`. */
export function authStorageKeys(storage: Storage): string[] {
  return Object.keys(storage).filter((key) => key.startsWith("sb-") && key.includes("auth"));
}

/**
 * Signs out and clears the session from local storage. Returns the number of
 * storage keys removed, so the caller can log or test the effect.
 */
export async function forgetThisDevice(storage: Storage = window.localStorage): Promise<number> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Offline or already invalid: clearing local state is still the right move.
  }

  const keys = authStorageKeys(storage);
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable (private mode, disabled cookies as storage).
    }
  }

  return keys.length;
}
