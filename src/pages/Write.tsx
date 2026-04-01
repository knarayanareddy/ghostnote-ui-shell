import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Ghost } from "lucide-react";
import TagChips from "@/components/TagChips";
import { supabase } from "@/integrations/supabase/client";
import { useStats } from "@/components/StatsProvider";

const BANNED_WORDS = [
  "fuck", "shit", "damn", "bitch", "ass", "bastard", "dick", "cunt",
  "nigger", "nigga", "faggot", "retard", "kys", "kill yourself",
];

function containsBannedWord(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_WORDS.some((w) => lower.includes(w));
}

type PageState = "form" | "sending" | "success" | "error";

const Write = () => {
  const { refreshStats } = useStats();
  const [content, setContent] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [isKind, setIsKind] = useState(false);
  const [pageState, setPageState] = useState<PageState>("form");
  const [errorMsg, setErrorMsg] = useState("");

  const trimmed = content.trim();
  const bannedDetected = trimmed.length > 0 && containsBannedWord(trimmed);
  const canSubmit =
    isKind &&
    trimmed.length >= 15 &&
    trimmed.length <= 500 &&
    !bannedDetected &&
    pageState === "form";

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setPageState("sending");
    setErrorMsg("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setErrorMsg("Not signed in. Please refresh the page.");
      setPageState("error");
      return;
    }

    const { error } = await supabase.from("notes").insert({
      author_id: user.id,
      body: trimmed,
      tag,
    });

    if (error) {
      setErrorMsg(error.message);
      setPageState("error");
      return;
    }

    setPageState("success");
  };

  const resetForm = () => {
    setContent("");
    setTag(null);
    setIsKind(false);
    setPageState("form");
    setErrorMsg("");
  };

  if (pageState === "success") {
    return (
      <div className="flex flex-col items-center text-center py-16 animate-fade-in">
        <Ghost className="w-10 h-10 text-primary mb-4" />
        <h1 className="text-2xl font-bold mb-2">Sent.</h1>
        <p className="text-muted-foreground max-w-sm mb-8">
          Your note is drifting. Someone may receive it the next time they open
          GhostNote.
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link to="/inbox">Summon a note</Link>
          </Button>
          <Button variant="outline" onClick={resetForm}>
            Write another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Write a note</h1>
        <p className="text-sm text-muted-foreground">
          Send something kind into the world. It will find someone.
        </p>
      </div>

      <div className="space-y-1">
        <Textarea
          placeholder="Write something kind to a stranger…"
          className="min-h-[160px] bg-paper border shadow-paper resize-none font-serif"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={500}
          disabled={pageState === "sending"}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {trimmed.length > 0 && trimmed.length < 15
              ? `${15 - trimmed.length} more characters needed`
              : "\u00A0"}
          </span>
          <span>{trimmed.length}/500</span>
        </div>
      </div>

      {bannedDetected && (
        <p className="text-sm font-medium text-destructive">Keep it kind.</p>
      )}

      <div>
        <p className="text-sm font-medium text-foreground mb-2">
          Tag (optional)
        </p>
        <TagChips selected={tag} onSelect={setTag} />
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="kindness"
          checked={isKind}
          onCheckedChange={(checked) => setIsKind(checked === true)}
          className="mt-0.5"
          disabled={pageState === "sending"}
        />
        <label
          htmlFor="kindness"
          className="text-sm text-foreground cursor-pointer"
        >
          This is kind. No hate. No threats.
        </label>
      </div>

      {pageState === "error" && errorMsg && (
        <p className="text-sm text-destructive">{errorMsg}</p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full"
        size="lg"
      >
        {pageState === "sending" ? "Sending…" : "Send into the void"}
      </Button>
    </div>
  );
};

export default Write;
