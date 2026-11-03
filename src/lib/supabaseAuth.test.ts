import { beforeEach, describe, expect, it, vi } from "vitest";

const signInAnonymously = vi.fn();
const getSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      signInAnonymously: (options?: unknown) => signInAnonymously(options),
    },
  },
}));

const { ensureAnonymousSession } = await import("./supabaseAuth");

describe("ensureAnonymousSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    signInAnonymously.mockResolvedValue({
      data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
      error: null,
    });
  });

  it("reuses an existing session without signing in", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "existing" } } },
      error: null,
    });

    await expect(ensureAnonymousSession()).resolves.toBe("existing");
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in without a captcha token when none is available (S-4 opt-in)", async () => {
    await ensureAnonymousSession(async () => undefined);

    expect(signInAnonymously).toHaveBeenCalledWith(undefined);
  });

  it("passes the captcha token through when the challenge solved", async () => {
    await ensureAnonymousSession(async () => "turnstile-token");

    expect(signInAnonymously).toHaveBeenCalledWith({
      options: { captchaToken: "turnstile-token" },
    });
  });

  it("surfaces a failed challenge instead of silently signing in", async () => {
    await expect(
      ensureAnonymousSession(async () => {
        throw new Error("The anti-spam check timed out.");
      }),
    ).rejects.toThrow("anti-spam check");

    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("explains a disabled anonymous provider", async () => {
    signInAnonymously.mockResolvedValue({
      data: { user: null },
      error: { message: "Anonymous sign-ins are disabled" },
    });

    await expect(ensureAnonymousSession(async () => undefined)).rejects.toThrow(
      /Authentication → Providers → Anonymous/,
    );
  });
});
