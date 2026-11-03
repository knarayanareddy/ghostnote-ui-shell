import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import NoteCard from "@/components/NoteCard";
import EmptyState from "@/components/EmptyState";
import ReportDialog from "@/components/ReportDialog";
import ReportButton from "@/components/ReportButton";
import PageLoader from "@/components/PageLoader";
import { JOURNAL_PAGE_SIZE, useJournal } from "@/hooks/useJournal";
import { describeError } from "@/lib/errors";

const JournalError = ({ error, onRetry }: { error: unknown; onRetry: () => void }) => {
  const help = describeError(error);

  return (
    <div role="alert" className="space-y-4 py-12 text-center">
      <p className="text-sm font-medium text-destructive">{help.title}</p>
      <p className="mx-auto max-w-sm text-xs text-muted-foreground">{help.description}</p>
      {help.fix && (
        <p className="mx-auto max-w-sm text-xs text-muted-foreground">
          Fix: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{help.fix}</code>
        </p>
      )}
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
};

const Journal = () => {
  const [limit, setLimit] = useState(JOURNAL_PAGE_SIZE);
  const { data: notes, isPending, isError, error, refetch } = useJournal(limit);
  const [reportNoteId, setReportNoteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleReported = () => {
    setReportNoteId(null);
    // The reported note leaves the journal (status becomes 'reported'); refresh
    // the list and the header counters rather than mutating local state only.
    void queryClient.invalidateQueries({ queryKey: ["journal"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
    toast("Reported. Thanks for keeping Kindling kind.");
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold">Ghost Journal</h1>
        <p className="text-sm text-muted-foreground">
          A private shelf of kindness you've received. Only you can see these.
        </p>
      </div>

      {isPending ? (
        <PageLoader label="Loading your journal…" />
      ) : isError ? (
        <JournalError error={error} onRetry={() => void refetch()} />
      ) : notes.length === 0 ? (
        <EmptyState
          message="Your journal is empty."
          submessage="Summon a note to start your collection."
        >
          <div className="flex flex-col gap-3 sm:flex-row">
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
          {notes.map((note, index) => (
            <div
              key={note.id}
              className="animate-slide-up space-y-1"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <NoteCard
                content={note.body}
                tag={note.tag ?? undefined}
                date={note.delivered_at ?? undefined}
              />
              <div className="flex justify-end px-1">
                <ReportButton onClick={() => setReportNoteId(note.id)} />
              </div>
            </div>
          ))}

          {notes.length >= limit && (
            <div className="pt-2 text-center">
              <Button
                variant="outline"
                onClick={() => setLimit((value) => value + JOURNAL_PAGE_SIZE)}
              >
                Show older notes
              </Button>
            </div>
          )}
        </div>
      )}

      {reportNoteId && (
        <ReportDialog
          noteId={reportNoteId}
          open
          onOpenChange={(open) => {
            if (!open) setReportNoteId(null);
          }}
          onReported={handleReported}
        />
      )}
    </div>
  );
};

export default Journal;
