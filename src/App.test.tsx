import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { queryClient } from "@/lib/queryClient";

/**
 * App-level integration tests.
 *
 * These mirror the assertions in e2e/smoke.spec.ts one-for-one, but run in
 * jsdom so CI can prove the queries (roles, labels, headings) still resolve
 * against the real components without downloading a browser. The Playwright
 * suite remains the end-to-end check.
 */

const rpc = vi.fn();
const signInAnonymously = vi.fn();
const insert = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      signInAnonymously: (...args: unknown[]) => signInAnonymously(...args),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    rpc: (...args: unknown[]) => rpc(...args),
    from: vi.fn(() => ({ insert: (...args: unknown[]) => insert(...args) })),
  },
}));

const goTo = (path: string) => {
  window.history.pushState({}, "", path);
  return render(<App />);
};

beforeEach(() => {
  queryClient.clear();
  // Production keeps one retry for transient failures; tests shouldn't wait
  // for the backoff to observe the error state.
  queryClient.setDefaultOptions({ queries: { retry: false } });
  rpc.mockReset();
  insert.mockReset();
  signInAnonymously.mockReset();
  signInAnonymously.mockResolvedValue({
    data: { user: { id: "user-1" }, session: { user: { id: "user-1" } } },
    error: null,
  });
  rpc.mockResolvedValue({ data: [], error: null });
  insert.mockResolvedValue({ error: null });
});

describe("home", () => {
  it("renders the hero and the two primary actions", async () => {
    goTo("/");

    expect(
      await screen.findByRole("heading", { name: "Kindling", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Write a note" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check my inbox" })).toBeInTheDocument();
  });
});

describe("anonymous session gate", () => {
  it("resolves the session before rendering the journal", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "get_my_journal" || fn === "get_my_stats" ? { data: [], error: null } : { data: [], error: null },
    );

    goTo("/journal");

    // The gate must reach a real screen — never sit on the loader.
    expect(await screen.findByRole("heading", { name: "Ghost Journal" })).toBeInTheDocument();
    expect(screen.queryByText("Waking the ghosts…")).not.toBeInTheDocument();
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("shows a retryable error when the journal query fails", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "get_my_journal"
        ? { data: null, error: { message: "network is down" } }
        : { data: [], error: null },
    );

    goTo("/journal");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load your journal");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("surfaces a retry path when anonymous sign-in fails", async () => {
    signInAnonymously.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Anonymous sign-ins are disabled" },
    });

    goTo("/journal");

    expect(await screen.findByText("Can't reach the ghosts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("write", () => {
  it("enforces the minimum length", async () => {
    goTo("/write");

    const textarea = await screen.findByLabelText("Your note");
    fireEvent.change(textarea, { target: { value: "too short" } });

    expect(screen.getByRole("button", { name: "Send into the void" })).toBeDisabled();
    expect(screen.getByText(/more characters needed/)).toBeInTheDocument();
  });

  it("blocks unkind wording before it is sent", async () => {
    goTo("/write");

    fireEvent.change(await screen.findByLabelText("Your note"), {
      target: { value: "you are a total b4stard and I mean it" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /This is kind/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Keep it kind");
    expect(screen.getByRole("button", { name: "Send into the void" })).toBeDisabled();
  });

  it("sends a kind note and confirms it drifted away", async () => {
    goTo("/write");

    fireEvent.change(await screen.findByLabelText("Your note"), {
      target: {
        value: "Whatever you are carrying today, you are carrying it well.",
      },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /This is kind/i }));
    fireEvent.click(screen.getByRole("button", { name: "Send into the void" }));

    // The success screen appears after the 1.2s drift animation.
    expect(
      await screen.findByRole("heading", { name: "Sent." }, { timeout: 4000 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("You won't know who. That's the point.")).toBeInTheDocument();
    });
    expect(insert).toHaveBeenCalledWith({
      author_id: "user-1",
      body: "Whatever you are carrying today, you are carrying it well.",
      tag: null,
    });
  });
});

describe("routing", () => {
  it("renders the 404 page for unknown routes", async () => {
    goTo("/does-not-exist");

    expect(await screen.findByRole("heading", { name: "404" })).toBeInTheDocument();
  });
});
