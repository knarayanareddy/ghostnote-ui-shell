import { supabase } from "@/integrations/supabase/client";
import { getCaptchaToken } from "@/lib/captcha";

/** Injected in tests; production always uses the real challenge. */
export type CaptchaProvider = () => Promise<string | undefined>;

/**
 * Make sure this browser has an anonymous session and return the user id.
 *
 * Anonymous sign-in must be enabled in the Supabase dashboard
 * (Authentication → Providers → Anonymous). See README.md.
 */
export async function ensureAnonymousSession(
  captcha: CaptchaProvider = getCaptchaToken,
): Promise<string> {
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

  // Only present when VITE_TURNSTILE_SITE_KEY is set (S-4). Throws with a human
  // message if the challenge itself fails, which is different from "sign-in
  // rejected" and worth showing separately.
  const captchaToken = await captcha();

  const { data, error } = await supabase.auth.signInAnonymously(
    captchaToken ? { options: { captchaToken } } : undefined,
  );

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
