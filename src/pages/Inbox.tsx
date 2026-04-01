import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Flag } from "lucide-react";
import NoteCard from "@/components/NoteCard";
import EmptyState from "@/components/EmptyState";
import Envelope from "@/components/Envelope";
import ReportDialog from "@/components/ReportDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStats } from "@/components/StatsProvider";

interface NoteRow {
  id: string;
  body: string;
  tag: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  status: string;
}

type InboxState =
  | { status: "idle" }
  | { status: "claiming" }
  | { status: "sealed"; note: NoteRow }
  | { status: "opening"; note: NoteRow }
  | { status: "revealed"; note: NoteRow }
  | { status: "empty" }
  | { status: "error"; message: string };

const Inbox = () => {
  const { refreshStats } = useStats();
  const [state, setState] = useState<InboxState>({ status: "idle" });
  const [reportOpen, setReportOpen] = useState(false);
  const stashedNote = useRef<NoteRow | null>(null);
  // Track stashed note in state so re-renders pick it up
  const [hasStashed, setHasStashed] = useState(false);

  const handleSummon = async () => {
    setState({ status: "claiming" });

    const { data, error } = await supabase.rpc("claim_ghost_note", {
      p_tag: null,
    });

    if (error) {
      setState({ status: "error", message: error.message });
      return;
    }

    const rows = data as unknown as NoteRow[];

    if (!rows || rows.length === 0) {
      setState({ status: "empty" });
      return;
    }

    const claimed = rows[0];
    stashedNote.current = claimed;
    refreshStats();
    setState({ status: "sealed", note: claimed });
  };

  const handleOpen = () => {
    if (state.status !== "sealed") return;
    setState({ status: "opening", note: state.note });
  };

  const handleOpenComplete = useCallback(() => {
    setState((prev) => {
      if (prev.status !== "opening") return prev;
      // Mark opened in background
      supabase.rpc("mark_note_opened", { p_note_id: prev.note.id }).then(() => {});
      return { status: "revealed", note: prev.note };
    });
  }, []);

  const handleNotNow = () => {
    // Return to idle but keep note stashed (it's already claimed)
    setState({ status: "idle" });
  };

  const handleSummonAnother = () => {
    stashedNote.current = null;
    setState({ status: "idle" });
  };

  const handleReported = () => {
    setReportOpen(false);
    stashedNote.current = null;
    setState({ status: "empty" });
    toast("Reported. Thanks for keeping GhostNote kind.");
  };

  // ── Revealed ──
  if (state.status === "revealed") {
    return (
      <div className="space-y-5 animate-fade-in">
        <p className="text-sm font-medium text-muted-foreground text-center">
          A ghost left you this:
        </p>

        <NoteCard
          content={state.note.body}
          tag={state.note.tag ?? undefined}
          animate="drift-in"
        />

        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">Saved to your journal.</p>
          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            <Flag className="w-3 h-3" />
            Report
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
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
          <h1 className="text-2xl font-bold mb-1">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            No sender info. No way to reply. Just kindness.
          </p>
        </div>

        <EmptyState
          message="No ghosts right now."
          submessage="Write a note to wake the system up."
        />

        <div className="flex flex-col sm:flex-row gap-3">
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
    return (
      <div className="animate-fade-in space-y-4 text-center">
        <h1 className="text-2xl font-bold mb-1">Inbox</h1>
        <p className="text-sm text-destructive">{state.message}</p>
        <Button variant="outline" onClick={handleSummon}>
          Try again
        </Button>
      </div>
    );
  }

  // ── Idle / Claiming / Sealed / Opening ──
  const envelopeState =
    state.status === "claiming"
      ? "claiming"
      : state.status === "sealed"
      ? "sealed"
      : state.status === "opening"
      ? "opening"
      : "idle";

  const isSealed = state.status === "sealed";
  const isClaiming = state.status === "claiming";
  const isOpening = state.status === "opening";

  return (
    <div className="animate-fade-in space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-1">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          No sender info. No way to reply. Just kindness.
        </p>
      </div>

      <div className="py-4">
        <Envelope state={envelopeState} onOpenComplete={handleOpenComplete} />
      </div>

      <div className="text-center space-y-1">
        {isClaiming && (
          <div className="animate-fade-in">
            <p className="text-sm text-muted-foreground">Listening for footsteps…</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">A ghost may be near.</p>
          </div>
        )}
        {!isClaiming && !isSealed && !isOpening && (
          <div className="animate-fade-in">
            <p className="text-sm font-medium text-foreground">A note is nearby.</p>
            <p className="text-xs text-muted-foreground mt-0.5">Summon it when you're ready.</p>
          </div>
        )}
        {isSealed && (
          <div className="animate-fade-in">
            <p className="text-sm font-medium text-foreground">A ghost delivered something.</p>
          </div>
        )}
        {isOpening && (
          <div className="animate-fade-in">
            <p className="text-sm text-muted-foreground">Opening…</p>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {isSealed ? (
          <>
            <Button className="flex-1" size="lg" onClick={handleOpen}>
              Open
            </Button>
            <Button variant="outline" className="flex-1" size="lg" onClick={handleNotNow}>
              Not now
            </Button>
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
    </div>
  );
};

export default Inbox;
