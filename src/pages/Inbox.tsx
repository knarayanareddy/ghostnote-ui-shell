import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Ghost } from "lucide-react";
import NoteCard from "@/components/NoteCard";
import EmptyState from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";

interface ClaimedNote {
  id: string;
  body: string;
  tag: string | null;
  delivered_at: string | null;
}

type PageState = "idle" | "loading" | "received" | "empty" | "error";

const Inbox = () => {
  const [note, setNote] = useState<ClaimedNote | null>(null);
  const [pageState, setPageState] = useState<PageState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

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

    // Mark as opened in the background
    supabase.rpc("mark_note_opened", { p_note_id: claimed.id });
  };

  if (pageState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        <Ghost className="w-10 h-10 text-primary mb-3 animate-pulse" />
        <p className="text-sm text-muted-foreground">
          Listening for footsteps…
        </p>
      </div>
    );
  }

  if (pageState === "received" && note) {
    return (
      <div className="animate-fade-in space-y-6">
        <p className="text-sm font-medium text-muted-foreground">
          A ghost left you this:
        </p>

        <NoteCard content={note.body} tag={note.tag ?? undefined} />

        <p className="text-xs text-muted-foreground text-center">
          Saved to your journal.
        </p>

        <div className="flex gap-3">
          <Button asChild className="flex-1">
            <Link to="/write">Send one back</Link>
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleSummon}
          >
            Summon another
          </Button>
        </div>
      </div>
    );
  }

  if (pageState === "empty") {
    return (
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Summon a note left by a stranger.
          </p>
        </div>

        <EmptyState message="No ghosts right now." />

        <p className="text-sm text-muted-foreground text-center">
          Write a note to wake the system up.
        </p>

        <div className="flex gap-3">
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
          Summon a note left by a stranger.
        </p>
      </div>

      {pageState === "error" && errorMsg && (
        <p className="text-sm text-destructive">{errorMsg}</p>
      )}

      <div className="bg-paper border rounded-lg shadow-paper p-8 flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground text-sm">
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
