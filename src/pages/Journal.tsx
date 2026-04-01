import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import NoteCard from "@/components/NoteCard";
import EmptyState from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";

interface JournalNote {
  id: string;
  body: string;
  tag: string | null;
  delivered_at: string | null;
}

const Journal = () => {
  const [notes, setNotes] = useState<JournalNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
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

    fetch();
  }, []);

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Ghost Journal</h1>
        <p className="text-sm text-muted-foreground">
          A private shelf of kindness you've received.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          Loading…
        </p>
      ) : notes.length === 0 ? (
        <div className="space-y-4">
          <EmptyState message="Your journal is empty." />
          <div className="flex gap-3 justify-center">
            <Button asChild>
              <Link to="/inbox">Check inbox</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/write">Write a note</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((n) => (
            <NoteCard
              key={n.id}
              content={n.body}
              tag={n.tag ?? undefined}
              date={n.delivered_at ?? undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Journal;
