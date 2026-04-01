import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Ghost, Flag } from "lucide-react";
import NoteCard from "@/components/NoteCard";
import EmptyState from "@/components/EmptyState";
import ReportDialog from "@/components/ReportDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStats } from "@/components/StatsProvider";

interface ClaimedNote {
  id: string;
  body: string;
  tag: string | null;
  delivered_at: string | null;
}

type PageState = "idle" | "loading" | "received" | "empty" | "error";

const Inbox = () => {
  const { refreshStats } = useStats();
  const [note, setNote] = useState<ClaimedNote | null>(null);
  const [pageState, setPageState] = useState<PageState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const handleSummon = async () => {
    setPageState("loading");
    setErrorMsg("");

    const { data, error } = await supabase.rpc("claim_ghost_note", {
      p_tag: null,
    });

    if (error) {
      setErrorMsg(error.message);
      setPageState("error");
      return;
    }

    const rows = data as unknown as ClaimedNote[];

    if (!rows || rows.length === 0) {
      setNote(null);
      setPageState("empty");
      return;
    }

    const claimed = rows[0];
    setNote(claimed);
    setPageState("received");

    supabase.rpc("mark_note_opened", { p_note_id: claimed.id });
    refreshStats();
  };

  const handleReported = () => {
    setReportOpen(false);
    setNote(null);
    setPageState("empty");
    toast("Reported. Thanks for keeping GhostNote kind.");
  };

  if (pageState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <Ghost className="w-12 h-12 text-primary mb-4 animate-ghost-float" />
        <p className="text-sm text-muted-foreground">Listening for footsteps…</p>
        <p className="text-xs text-muted-foreground/50 mt-1">A ghost may be near.</p>
      </div>
    );
  }

  if (pageState === "received" && note) {
    return (
      <div className="space-y-5 animate-fade-in">
        <p className="text-sm font-medium text-muted-foreground text-center">
          A ghost left you this:
        </p>

        <NoteCard content={note.body} tag={note.tag ?? undefined} animate="drift-in" />

        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">Saved to your journal.</p>
          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-destructive transition-colors"
          >
            <Flag className="w-3 h-3" />
            Report
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button asChild className="flex-1">
            <Link to="/write">Send one back</Link>
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleSummon}>
            Summon another
          </Button>
        </div>

        <ReportDialog
          noteId={note.id}
          open={reportOpen}
          onOpenChange={setReportOpen}
          onReported={handleReported}
        />
      </div>
    );
  }

  if (pageState === "empty") {
    return (
      <div className="animate-fade-in space-y-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Summon a note left by a stranger. No sender info. No way to reply.
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

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Summon a note left by a stranger. No sender info. No way to reply.
        </p>
      </div>

      {pageState === "error" && errorMsg && (
        <p className="text-sm text-destructive animate-fade-in">{errorMsg}</p>
      )}

      <div
        className="border rounded-xl p-8 sm:p-10 flex flex-col items-center justify-center min-h-[200px]"
        style={{
          background: "linear-gradient(145deg, hsl(40 40% 97%), hsl(36 35% 94%))",
          boxShadow: "0 2px 8px -2px hsl(32 30% 75% / 0.3)",
        }}
      >
        <Ghost className="w-8 h-8 text-muted-foreground/20 mb-3 animate-ghost-float" />
        <p className="text-muted-foreground text-sm text-center">
          A note is waiting somewhere out there...
        </p>
      </div>

      <Button onClick={handleSummon} size="lg" className="w-full">
        Summon a note
      </Button>
    </div>
  );
};

export default Inbox;
