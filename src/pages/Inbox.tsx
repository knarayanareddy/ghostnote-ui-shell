import { useState } from "react";
import { Button } from "@/components/ui/button";
import NoteCard from "@/components/NoteCard";
import EmptyState from "@/components/EmptyState";

const Inbox = () => {
  const [note, setNote] = useState<{ content: string; tag?: string } | null>(null);
  const [summoned, setSummoned] = useState(false);

  const handleSummon = () => {
    // TODO: fetch from backend
    setSummoned(true);
    setNote(null);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Summon a note left by a stranger.
        </p>
      </div>

      {note ? (
        <NoteCard content={note.content} tag={note.tag} />
      ) : summoned ? (
        <EmptyState message="No ghosts right now." />
      ) : (
        <div className="bg-paper border rounded-lg shadow-paper p-8 flex items-center justify-center min-h-[200px]">
          <p className="text-muted-foreground text-sm">
            A note is waiting somewhere out there...
          </p>
        </div>
      )}

      <Button onClick={handleSummon} variant="outline" size="lg" className="w-full">
        Summon a note
      </Button>
    </div>
  );
};

export default Inbox;
