import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import NoteCard from "@/components/NoteCard";
import EmptyState from "@/components/EmptyState";
import Envelope from "@/components/Envelope";
import ReportDialog from "@/components/ReportDialog";
import ReportButton from "@/components/ReportButton";
import { supabase } from "@/integrations/supabase/client";
import { describeError } from "@/lib/errors";
import type { Database } from "@/integrations/supabase/types";

type ClaimedNote = Database["public"]["Functions"]["claim_ghost_note"]["Returns"][number];

type InboxState =
  | { status: "idle" }
  | { status: "claiming" }
  | { status: "sealed"; note: ClaimedNote }
  | { status: "opening"; note: ClaimedNote }
  | { status: "revealed"; note: ClaimedNote }
  | { status: "empty" }
  | { status: "error"; message: string };

const Inbox = () => {
  const queryClient = useQueryClient();
  const [state, setState] = useState<InboxState>({ status: "idle" });
  const [reportOpen, setReportOpen] = useState(false);
  const stashedNote = useRef<ClaimedNote | null>(null);
  const claiming = useRef(false);

  const refreshStats = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  }, [queryClient]);

  const handleSummon = async () => {
    // Re-entry guard: the checked state alone can race a double click into two
    // claims, orphaning the first note (it stays 'delivered' to this user).
    if (claiming.current || state.status === "claiming") return;
    claiming.current = true;
    setState({ status: "claiming" });

    try {
      const { data, error } = await supabase.rpc("claim_ghost_note", {});

      if (error) {
        setState({ status: "error", message: error.message });
        return;
      }

      if (!data || data.length === 0) {
        setState({ status: "empty" });
        return;
      }

      const claimed = data[0];
      stashedNote.current = claimed;
      refreshStats();
      setState({ status: "sealed", note: claimed });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not summon a note.",
      });
    } finally {
      claiming.current = false;
    }
  };

  const handleOpen = () => {
    if (state.status === "sealed") {
      setState({ status: "opening", note: state.note });
    } else if (state.status === "idle" && stashedNote.current) {
      setState({ status: "opening", note: stashedNote.current });
    }
  };

  const handleOpenComplete = useCallback(() => {
    setState((prev) => (prev.status === "opening" ? { status: "revealed", note: prev.note } : prev));
  }, []);

  // Persisting "opened" is a side effect, so it lives in an effect keyed on the
  // revealed note instead of inside a setState updater (which React may run
  // twice under StrictMode).
  const revealedId = state.status === "revealed" ? state.note.id : null;

  useEffect(() => {
    if (!revealedId) return;

    let cancelled = false;

    supabase.rpc("mark_note_opened", { p_note_id: revealedId }).then(({ error }) => {
      if (error && !cancelled) {
        // Not worth interrupting the moment, but never silent.
        console.warn("mark_note_opened failed:", error.message);
      }
    });

    void queryClient.invalidateQueries({ queryKey: ["journal"] });

    return () => {
      cancelled = true;
    };
  }, [revealedId, queryClient]);

  const handleNotNow = () => {
    // The note is already claimed; it stays in the journal.
    setState({ status: "idle" });
  };

  const handleSummonAnother = () => {
    stashedNote.current = null;
    setState({ status: "idle" });
  };

  const handleDiscard = () => {
    stashedNote.current = null;
    setState({ status: "idle" });
  };

  const handleReported = () => {
    setReportOpen(false);
    stashedNote.current = null;
    setState({ status: "idle" });
    refreshStats();
    toast("Reported. Thanks for keeping Kindling kind.");
  };

  // ── Revealed ──
  if (state.status === "revealed") {
    return (
      <div className="animate-fade-in space-y-5">
        <p className="text-center text-sm font-medium text-muted-foreground">
          A ghost left you this:
        </p>

        <NoteCard content={state.note.body} tag={state.note.tag ?? undefined} animate="drift-in" />

        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">Saved to your journal.</p>
          <ReportButton onClick={() => setReportOpen(true)} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="flex-1">
            <Link to="/write">Send one back</Link>
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleSummonAnother}>
            Summon another
          </Button>
        </div>

        <ReportDialog
          noteId={state.note.id}
          open={reportOpen}
          onOpenChange={setReportOpen}
          onReported={handleReported}
        />
      </div>
    );
  }

  // ── Empty ──
  if (state.status === "empty") {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="text-center">
          <h1 className="mb-1 text-2xl font-bold">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            No sender info. No way to reply. Just kindness.
          </p>
        </div>

        <EmptyState
          message="No ghosts right now."
          submessage="Write a note to wake the system up."
        />

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="flex-1">
            <Link to="/write">Write a note</Link>
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleSummon}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (state.status === "error") {
    const help = describeError(state.message);

    return (
      <div className="animate-fade-in space-y-4 text-center">
        <h1 className="mb-1 text-2xl font-bold">Inbox</h1>
        <div role="alert" className="space-y-2">
          <p className="text-sm font-medium text-destructive">{help.title}</p>
          <p className="mx-auto max-w-sm text-xs text-muted-foreground">{help.description}</p>
        </div>
        <Button variant="outline" onClick={handleSummon}>
          Try again
        </Button>
      </div>
    );
  }

  // ── Idle / Claiming / Sealed / Opening ──
  const idleWithStash = state.status === "idle" && stashedNote.current !== null;

  const envelopeState =
    state.status === "claiming"
      ? "claiming"
      : state.status === "sealed" || idleWithStash
        ? "sealed"
        : state.status === "opening"
          ? "opening"
          : "idle";

  const isSealed = state.status === "sealed" || idleWithStash;
  const isClaiming = state.status === "claiming";
  const isOpening = state.status === "opening";

  const statusText = isClaiming
    ? { heading: "Listening for footsteps…", detail: "A ghost may be near." }
    : isOpening
      ? { heading: "Opening…", detail: null }
      : idleWithStash
        ? { heading: "You have a sealed note waiting.", detail: null }
        : isSealed
          ? { heading: "A ghost delivered something.", detail: null }
          : { heading: "A note is nearby.", detail: "Summon it when you're ready." };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="text-center">
        <h1 className="mb-1 text-2xl font-bold">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          No sender info. No way to reply. Just kindness.
        </p>
      </div>

      <div className="py-4">
        <Envelope state={envelopeState} onOpenComplete={handleOpenComplete} />
      </div>

      <div role="status" aria-live="polite" className="space-y-1 text-center">
        <p className="text-sm font-medium text-foreground">{statusText.heading}</p>
        {statusText.detail && (
          <p className="mt-0.5 text-xs text-muted-foreground">{statusText.detail}</p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {isSealed ? (
          <>
            <Button className="flex-1" size="lg" onClick={handleOpen}>
              Open
            </Button>
            {idleWithStash ? (
              <Button variant="outline" className="flex-1" size="lg" onClick={handleDiscard}>
                Put away
              </Button>
            ) : (
              <Button variant="outline" className="flex-1" size="lg" onClick={handleNotNow}>
                Not now
              </Button>
            )}
          </>
        ) : (
          <Button
            className="flex-1"
            size="lg"
            onClick={handleSummon}
            disabled={isClaiming || isOpening}
          >
            {isClaiming ? "Summoning…" : "Summon a note"}
          </Button>
        )}
      </div>

      {isSealed && (
        <p className="text-center text-xs text-muted-foreground/70">
          It'll still be saved in your journal.
        </p>
      )}
    </div>
  );
};

export default Inbox;
