import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Inbox from "@/pages/Inbox";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

const claimedNote = {
  id: "note-1",
  body: "You are doing better than you think, stranger.",
  tag: "Calm",
  delivered_at: "2026-11-03T09:00:00.000Z",
  opened_at: null,
};

function renderInbox() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Inbox />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const summonButton = () => screen.getByRole("button", { name: /summon/i });

beforeEach(() => {
  rpc.mockReset();
});

describe("Inbox state machine", () => {
  it("claims a note and shows the sealed envelope", async () => {
    rpc.mockResolvedValueOnce({ data: [claimedNote], error: null });

    renderInbox();
    fireEvent.click(summonButton());

    await waitFor(() => {
      expect(screen.getByText("A ghost delivered something.")).toBeInTheDocument();
    });

    expect(rpc).toHaveBeenCalledWith("claim_ghost_note", {});
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    // The body must stay hidden until the envelope is opened.
    expect(screen.queryByText(claimedNote.body)).not.toBeInTheDocument();
  });

  it("claims only one note when the button is double-clicked", async () => {
    rpc.mockResolvedValue({ data: [claimedNote], error: null });

    renderInbox();
    const button = summonButton();

    // Two clicks in the same tick, before React can apply the `disabled` state.
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("A ghost delivered something.")).toBeInTheDocument();
    });

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when there is nothing queued", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });

    renderInbox();
    fireEvent.click(summonButton());

    await waitFor(() => {
      expect(screen.getByText("No ghosts right now.")).toBeInTheDocument();
    });
  });

  it("surfaces an error and allows a retry", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: "network is down" } })
      .mockResolvedValueOnce({ data: [claimedNote], error: null });

    renderInbox();
    fireEvent.click(summonButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("network is down");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.getByText("A ghost delivered something.")).toBeInTheDocument();
    });
  });

  it("reveals the note and marks it opened exactly once", async () => {
    rpc.mockImplementation(async (fn: string, args: { p_note_id?: string }) => {
      if (fn === "claim_ghost_note") return { data: [claimedNote], error: null };
      if (fn === "mark_note_opened") {
        expect(args).toEqual({ p_note_id: claimedNote.id });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    renderInbox();
    fireEvent.click(summonButton());
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(
      () => {
        expect(screen.getByText(claimedNote.body)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    await waitFor(() => {
      const openCalls = rpc.mock.calls.filter(([fn]) => fn === "mark_note_opened");
      expect(openCalls).toHaveLength(1);
    });
  });

  it("keeps a claimed note available after 'Not now'", async () => {
    rpc.mockResolvedValue({ data: [claimedNote], error: null });

    renderInbox();
    fireEvent.click(summonButton());
    await waitFor(() => expect(screen.getByText("A ghost delivered something.")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() => {
      expect(screen.getByText("You have a sealed note waiting.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
  });
});
