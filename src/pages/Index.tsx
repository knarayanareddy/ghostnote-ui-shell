import { useState } from "react";
import { Link } from "react-router-dom";
import { Ghost, ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SHOW_DEMO_TIPS = true;

const SAMPLE_NOTES = [
  { body: "You're doing better than you think. Keep going, stranger.", tag: "Encouragement" },
  { body: "Thank you for existing. The world is a little brighter because you're in it.", tag: "Gratitude" },
  { body: "Hey — I'm proud of you for getting through today. That counts for something.", tag: "Proud of you" },
];

const DemoPanel = () => {
  const [open, setOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    setSeeding(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not signed in.");
      setSeeding(false);
      return;
    }

    const rows = SAMPLE_NOTES.map((n) => ({
      author_id: user.id,
      body: n.body,
      tag: n.tag,
    }));

    const { error } = await supabase.from("notes").insert(rows);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("3 sample notes seeded.");
    }
    setSeeding(false);
  };

  return (
    <div className="w-full max-w-md mt-8 border border-dashed border-border rounded-lg overflow-hidden animate-fade-in">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <FlaskConical className="w-3.5 h-3.5" />
          Demo Tips
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 text-left animate-fade-in">
          <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Open two windows (one incognito) to simulate two anonymous users.</li>
            <li>In Window A: go to <span className="font-medium text-foreground">/write</span> and send 2–3 notes.</li>
            <li>In Window B: go to <span className="font-medium text-foreground">/inbox</span> and click "Summon a note".</li>
            <li>Check <span className="font-medium text-foreground">/journal</span> in Window B to see it saved.</li>
          </ol>

          <div className="pt-2 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSeed}
              disabled={seeding}
              className="w-full text-xs"
            >
              {seeding ? "Seeding…" : "Seed 3 sample notes (current user)"}
            </Button>
            <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
              Inserts 3 queued notes authored by you — claim them from another session.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const Home = () => {
  return (
    <div className="flex flex-col items-center text-center py-8 sm:py-12 animate-fade-in">
      <Ghost className="w-12 h-12 text-primary mb-4 animate-ghost-float" />
      <h1 className="text-3xl sm:text-4xl font-bold mb-2">GhostNote</h1>
      <p className="text-muted-foreground mb-2 max-w-sm text-sm sm:text-base">
        Leave a kind note for a stranger. Receive one when you need it.
      </p>
      <p className="text-xs text-muted-foreground/60 mb-8">
        No profiles. No replies. No likes. Just kindness, drifting.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-12 w-full sm:w-auto">
        <Button asChild size="lg" className="sm:min-w-[160px]">
          <Link to="/write">Write a note</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="sm:min-w-[160px]">
          <Link to="/inbox">Check my inbox</Link>
        </Button>
      </div>

      <div className="text-left space-y-3 max-w-md w-full">
        {[
          { num: "1", text: "Send anonymous kindness — no names, no profiles, no trace." },
          { num: "2", text: "Someone receives your note when they open their inbox. You'll never know who." },
          { num: "3", text: "Notes you receive are saved in your private Ghost Journal. Only you can see them." },
        ].map((item, i) => (
          <div
            key={item.num}
            className="flex gap-3 items-start border rounded-lg p-4 animate-slide-up"
            style={{
              animationDelay: `${i * 100}ms`,
              background: "linear-gradient(145deg, hsl(40 40% 97%), hsl(36 35% 94%))",
              boxShadow: "0 2px 8px -2px hsl(32 30% 75% / 0.3)",
            }}
          >
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
              {item.num}
            </span>
            <p className="text-sm text-foreground leading-relaxed">{item.text}</p>
          </div>
        ))}
      </div>

      {SHOW_DEMO_TIPS && <DemoPanel />}
    </div>
  );
};

export default Home;
