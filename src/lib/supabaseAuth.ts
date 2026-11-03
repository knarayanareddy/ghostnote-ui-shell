import { supabase } from "@/integrations/supabase/client";

/**
 * Make sure this browser has an anonymous session and return the user id.
 *
 * Anonymous sign-in must be enabled in the Supabase dashboard
 * (Authentication → Providers → Anonymous). See README.md.
 */
export async function ensureAnonymousSession(): Promise<string> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`Could not read the local session: ${sessionError.message}`);
  }

  if (session?.user) {
    return session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    const hint = /anonymous/i.test(error.message)
      ? " Enable anonymous sign-ins in the Supabase dashboard (Authentication → Providers → Anonymous)."
      : "";
    throw new Error(`Anonymous sign-in failed: ${error.message}.${hint}`);
  }

  if (!data.user) {
    throw new Error("Anonymous sign-in succeeded but returned no user.");
  }

  return data.user.id;
}
