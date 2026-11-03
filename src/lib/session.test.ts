import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: () => signOut() } },
}));

const { authStorageKeys, forgetThisDevice } = await import("./session");

describe("forgetThisDevice (S-7)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    signOut.mockResolvedValue({ error: null });
  });

  it("only targets supabase session keys, never unrelated storage", () => {
    localStorage.setItem("sb-abcdefgh-auth-token", "{}");
    localStorage.setItem("sb-abcdefgh-auth-token-code-verifier", "x");
    localStorage.setItem("unrelated-preference", "keep me");

    expect(authStorageKeys(localStorage).sort()).toEqual([
      "sb-abcdefgh-auth-token",
      "sb-abcdefgh-auth-token-code-verifier",
    ]);
  });

  it("signs out and clears the session, leaving everything else alone", async () => {
    localStorage.setItem("sb-abcdefgh-auth-token", "{}");
    localStorage.setItem("unrelated-preference", "keep me");

    const removed = await forgetThisDevice(localStorage);

    expect(signOut).toHaveBeenCalledOnce();
    expect(removed).toBe(1);
    expect(localStorage.getItem("sb-abcdefgh-auth-token")).toBeNull();
    expect(localStorage.getItem("unrelated-preference")).toBe("keep me");
  });

  it("still clears local state when the sign-out call fails", async () => {
    signOut.mockRejectedValue(new Error("network down"));
    localStorage.setItem("sb-abcdefgh-auth-token", "{}");

    await expect(forgetThisDevice(localStorage)).resolves.toBe(1);
    expect(localStorage.getItem("sb-abcdefgh-auth-token")).toBeNull();
  });

  it("is a no-op that still signs out when nothing is stored", async () => {
    await expect(forgetThisDevice(localStorage)).resolves.toBe(0);
    expect(signOut).toHaveBeenCalledOnce();
  });
});
