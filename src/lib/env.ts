import { z } from "zod";

/**
 * Runtime environment contract.
 *
 * Vite inlines `import.meta.env` at build time, so a missing or misspelled
 * variable used to surface as `Uncaught Error: supabaseUrl is required`
 * before React mounted — i.e. a blank white page with no clue why. Validating
 * here turns that into one actionable message in the console.
 */
const envSchema = z.object({
  // Zod 4 replaced required_error/invalid_type_error with a single `error`.
  // Zod 4 moved string formats to the top level; `z.string().url()` is deprecated.
  // Zod 4 reports the same `error` for a missing and for a malformed value, so
  // the message has to cover both.
  VITE_SUPABASE_URL: z.url({
    error:
      "VITE_SUPABASE_URL is missing or not a valid URL (e.g. https://xyz.supabase.co)",
  }),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: "VITE_SUPABASE_PUBLISHABLE_KEY is missing" })
    .min(20, { error: "VITE_SUPABASE_PUBLISHABLE_KEY looks too short to be a Supabase key" }),
  /**
   * Optional Cloudflare Turnstile site key. When set, anonymous sign-in carries
   * a token; pair it with the CAPTCHA switch in the Supabase dashboard.
   */
  VITE_TURNSTILE_SITE_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_TURNSTILE_SITE_KEY: import.meta.env.VITE_TURNSTILE_SITE_KEY,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment configuration:\n${details}\n\n` +
        "Copy .env.example to .env and fill in your Supabase project values, " +
        "then restart the dev server.",
    );
  }

  return parsed.data;
}

export const env = loadEnv();
