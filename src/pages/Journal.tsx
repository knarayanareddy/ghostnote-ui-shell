import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import NoteCard from "@/components/NoteCard";
import EmptyState from "@/components/EmptyState";
import ReportDialog from "@/components/ReportDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface JournalNote {
  id: string;
  body: string;
  tag: string | null;
  delivered_at: string | null;
}

const Journal = () => {
  const [notes, setNotes] = useState<JournalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportNoteId, setReportNoteId] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotes = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("notes")
        .select("id, body, tag, delivered_at")
        .eq("recipient_id", user.id)
        .eq("status", "delivered")
        .order("delivered_at", { ascending: false });

      setNotes((data as JournalNote[]) ?? []);
      setLoading(false);
    };

    fetchNotes();
  }, []);

  const handleReported = () => {
    if (reportNoteId) {
      setNotes((prev) => prev.filter((n) => n.id !== reportNoteId));
    }
    setReportNoteId(null);
    toast("Reported. Thanks for keeping GhostNote kind.");
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Ghost Journal</h1>
        <p className="text-sm text-muted-foreground">
          A private shelf of kindness you've received. Only you can see these.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-16">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground mt-3">Loading…</p>
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          message="Your journal is empty."
          submessage="Summon a note to start your collection."
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild>
              <Link to="/inbox">Check inbox</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/write">Write a note</Link>
            </Button>
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {notes.map((n, i) => (
            <div
              key={n.id}
              className="space-y-1 animate-slide-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <NoteCard
                content={n.body}
                tag={n.tag ?? undefined}
                date={n.delivered_at ?? undefined}
              />
              <div className="flex justify-end px-1">
                <button
                  onClick={() => setReportNoteId(n.id)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-destructive transition-colors"
                >
                  <Flag className="w-3 h-3" />
                  Report
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {reportNoteId && (
        <ReportDialog
          noteId={reportNoteId}
          open={true}
          onOpenChange={(open) => { if (!open) setReportNoteId(null); }}
          onReported={handleReported}
        />
      )}
    </div>
  );
};

export default Journal;
