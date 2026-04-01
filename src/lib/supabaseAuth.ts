import { supabase } from "@/integrations/supabase/client";

export async function ensureAnonymousSession(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    return session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    throw new Error(`Anonymous sign-in failed: ${error.message}`);
  }

  return data.user!.id;
}
