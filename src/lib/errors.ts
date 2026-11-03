/**
 * Turns Postgres/GoTrue/network errors into something a human can act on.
 *
 * The common failure after this repo was hardened is running the new frontend
 * against a database that has not been migrated yet: the UI used to show a raw
 * "Could not find the function public.get_my_journal(...)" or, worse, nothing
 * at all. See docs/GO-LIVE.md.
 */

export interface ErrorHelp {
  title: string;
  description: string;
  /** A command or dashboard action, when there is one. */
  fix?: string;
}

const MIGRATIONS_FIX = "npm run db:push";
const ANONYMOUS_FIX = "Authentication → Providers → Anonymous → Enable";

/** Supabase throws `PostgrestError`/`AuthError` objects that are not `Error`s. */
function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

export function describeError(error: unknown): ErrorHelp {
  const message = messageOf(error);
  const normalized = message.toLowerCase();

  // PostgREST: PGRST202 "Could not find the function public.x in the schema cache"
  if (
    normalized.includes("pgrst202") ||
    normalized.includes("could not find the function") ||
    (normalized.includes("function") && normalized.includes("does not exist"))
  ) {
    return {
      title: "The database hasn't been migrated yet",
      description:
        "This build expects the hardened schema. Apply the migrations, then reload.",
      fix: MIGRATIONS_FIX,
    };
  }

  // GoTrue: anonymous_provider_disabled
  if (
    normalized.includes("anonymous") &&
    (normalized.includes("disabled") || normalized.includes("not enabled"))
  ) {
    return {
      title: "Anonymous sign-ins are disabled",
      description:
        "Kindling has no accounts, so it needs anonymous sign-ins to create a session.",
      fix: ANONYMOUS_FIX,
    };
  }

  // PostgREST/Postgres privilege errors
  if (
    normalized.includes("permission denied") ||
    normalized.includes("42501") ||
    normalized.includes("row-level security")
  ) {
    return {
      title: "This session isn't allowed to do that",
      description:
        "If you just deployed, the migrations may not have been applied to this project yet.",
      fix: MIGRATIONS_FIX,
    };
  }

  // PostgREST: invalid or rotated publishable key
  if (
    normalized.includes("invalid api key") ||
    normalized.includes("no api key") ||
    normalized.includes("jwt") ||
    normalized.includes("401")
  ) {
    return {
      title: "The publishable key was rejected",
      description:
        "The key in your environment no longer matches the project. Update it after rotating keys.",
      fix: "Copy the current publishable key into .env (docs/GO-LIVE.md)",
    };
  }

  // Turnstile, or Supabase refusing a sign-in without a token
  if (normalized.includes("captcha") || normalized.includes("anti-spam check")) {
    return {
      title: "The anti-spam check didn't finish",
      description:
        "Something blocked the challenge — usually an extension or a strict network. Reload and try once more.",
    };
  }

  // Postgres: 23514 from the content filter in the insert trigger
  if (normalized.includes("blocked content")) {
    return {
      title: "That wording isn't allowed here",
      description:
        "Kindling blocks insults and threats so nobody opens one by accident. Try saying it another way.",
    };
  }

  // Postgres: 23514 from the length constraints
  if (normalized.includes("between 15 and 500") || normalized.includes("notes_body_length")) {
    return {
      title: "That note is the wrong length",
      description: "A note needs at least 15 characters and no more than 500.",
    };
  }

  // Postgres: 53400 from the rate limits (send, receive, report)
  if (normalized.includes("rate limit") || normalized.includes("53400")) {
    return {
      title: "That's a lot for one hour",
      description:
        "Notes are capped per person so nobody can empty the queue or flood a stranger. It resets on its own.",
    };
  }

  // Browser-level network failures
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("load failed") ||
    normalized.includes("network request failed")
  ) {
    return {
      title: "Can't reach the server",
      description: "Check your connection and that the Supabase project is not paused.",
    };
  }

  return {
    title: "Something went wrong",
    description: message || "Unknown error",
  };
}
