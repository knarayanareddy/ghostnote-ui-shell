/**
 * Cloudflare Turnstile for anonymous sign-in.
 *
 * S-4 in docs/SECURITY-REDTEAM.md: identities are free, so every per-identity
 * limit (10 notes an hour, 5 claims an hour) resets by signing up again. A
 * CAPTCHA is what makes those limits mean something.
 *
 * Optional by design: with no `VITE_TURNSTILE_SITE_KEY` the app behaves exactly
 * as before, and Supabase rejects tokenless sign-ins once the dashboard requires
 * a CAPTCHA. Enable both halves together — see docs/GO-LIVE.md.
 */

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TIMEOUT_MS = 10_000;

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: Record<string, unknown> & { sitekey: string },
  ) => string;
  execute: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** True when a site key is configured; the UI can use it to explain why. */
export const captchaConfigured = Boolean(SITE_KEY);

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("The anti-spam check could not load."));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Resolves with a Turnstile token, or `undefined` when no site key is set.
 * Rejects only when a key is configured and the challenge genuinely fails, so
 * the caller can tell the user something true.
 */
export async function getCaptchaToken(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;

  await loadScript();

  return new Promise<string>((resolve, reject) => {
    const api = window.turnstile;
    if (!api) {
      reject(new Error("The anti-spam check could not load."));
      return;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);

    let settled = false;
    let widgetId: string | null = null;

    const cleanUp = () => {
      clearTimeout(timer);
      if (widgetId) api.remove(widgetId);
      container.remove();
    };

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanUp();
      fn();
    };

    const timer = setTimeout(
      () => settle(() => reject(new Error("The anti-spam check timed out."))),
      TIMEOUT_MS,
    );

    try {
      widgetId = api.render(container, {
        sitekey: SITE_KEY,
        size: "invisible",
        callback: (token: string) => settle(() => resolve(token)),
        "error-callback": () =>
          settle(() => reject(new Error("The anti-spam check failed."))),
      });
      api.execute(widgetId);
    } catch (error) {
      settle(() =>
        reject(error instanceof Error ? error : new Error("The anti-spam check failed.")),
      );
    }
  });
}
