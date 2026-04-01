import EmptyState from "@/components/EmptyState";

const Journal = () => {
  const notes: { content: string; tag?: string; date?: string }[] = [];

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Ghost Journal</h1>
        <p className="text-sm text-muted-foreground">
          Notes you've received, kept safe.
        </p>
      </div>

      {notes.length === 0 ? (
        <EmptyState message="No notes yet." />
      ) : (
        <div className="space-y-4">
          {/* NoteCard list will go here */}
        </div>
      )}
    </div>
  );
};

export default Journal;
