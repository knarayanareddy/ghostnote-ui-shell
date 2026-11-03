import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Ghost } from "lucide-react";
import TagChips from "@/components/TagChips";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { findBannedContent } from "@/lib/bannedFilter";
import { describeError } from "@/lib/errors";

type PageState = "form" | "sending" | "success" | "error";

const MIN_LENGTH = 15;
const MAX_LENGTH = 500;

const WriteError = ({ message }: { message: string }) => {
  const help = describeError(message);

  return (
    <div role="alert" className="animate-fade-in space-y-1">
      <p className="text-sm font-medium text-destructive">{help.title}</p>
      <p className="text-xs text-muted-foreground">{help.description}</p>
      {help.fix && (
        <p className="text-xs text-muted-foreground">
          Fix: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{help.fix}</code>
        </p>
      )}
    </div>
  );
};

const Write = () => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [isKind, setIsKind] = useState(false);
  const [pageState, setPageState] = useState<PageState>("form");
  const [errorMsg, setErrorMsg] = useState("");
  const [showDrift, setShowDrift] = useState(false);
  const driftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (driftTimer.current) clearTimeout(driftTimer.current);
    },
    [],
  );

  const trimmed = content.trim();
  const bannedResult = trimmed.length > 0 ? findBannedContent(trimmed) : { hit: false, match: null };
  const canSubmit =
    isKind &&
    trimmed.length >= MIN_LENGTH &&
    trimmed.length <= MAX_LENGTH &&
    !bannedResult.hit &&
    pageState === "form";

  const handleSubmit = async () => {
    if (!canSubmit) return;

    if (!userId) {
      setErrorMsg("Still connecting. Give it a second and try again.");
      setPageState("error");
      return;
    }

    setPageState("sending");
    setErrorMsg("");

    const { error } = await supabase.from("notes").insert({
      author_id: userId,
      body: trimmed,
      tag,
    });

    if (error) {
      // Keep the raw Postgres text in the console for debugging; show the user
      // something they can act on (S-8).
      console.error("note insert failed:", error);
      setErrorMsg(error.message);
      setPageState("error");
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ["stats"] });
    setShowDrift(true);
    driftTimer.current = setTimeout(() => {
      setShowDrift(false);
      setPageState("success");
    }, 1200);
  };

  const resetForm = () => {
    setContent("");
    setTag(null);
    setIsKind(false);
    setPageState("form");
    setErrorMsg("");
  };

  // Drift animation after send
  if (showDrift) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-drift">
          <Ghost className="h-12 w-12 text-primary" />
        </div>
        <p className="mt-6 animate-fade-in text-sm text-muted-foreground">Drifting away…</p>
      </div>
    );
  }

  if (pageState === "success") {
    return (
      <div className="animate-fade-in flex flex-col items-center py-12 text-center sm:py-16">
        <Ghost className="mb-4 h-10 w-10 animate-ghost-float text-primary" />
        <h1 className="mb-2 text-2xl font-bold">Sent.</h1>
        <p className="mb-2 max-w-sm text-sm text-muted-foreground">
          Your note is drifting. Someone may receive it the next time they open Kindling.
        </p>
        <p className="mb-8 text-xs text-muted-foreground/70">
          You won't know who. That's the point.
        </p>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button asChild className="sm:min-w-[140px]">
            <Link to="/inbox">Summon a note</Link>
          </Button>
          <Button variant="outline" onClick={resetForm} className="sm:min-w-[140px]">
            Write another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold">Write a note</h1>
        <p className="text-sm text-muted-foreground">
          Send something kind into the world. No names. No replies. It just drifts.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="note-body" className="sr-only">
          Your note
        </label>
        <Textarea
          id="note-body"
          placeholder="Write something kind to a stranger…"
          className="min-h-[160px] resize-none border bg-paper font-serif text-[15px] leading-[1.75] shadow-paper focus-visible:ring-primary/30"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={MAX_LENGTH}
          disabled={pageState === "sending"}
          aria-describedby="note-counter note-error"
        />
        <div className="flex justify-between px-0.5 text-xs text-muted-foreground">
          <span id="note-counter">
            {trimmed.length > 0 && trimmed.length < MIN_LENGTH
              ? `${MIN_LENGTH - trimmed.length} more characters needed`
              : "\u00A0"}
          </span>
          <span className="tabular-nums">
            {trimmed.length}/{MAX_LENGTH}
          </span>
        </div>
      </div>

      {bannedResult.hit && (
        <p id="note-error" role="alert" className="animate-fade-in text-sm font-medium text-destructive">
          Keep it kind.{bannedResult.match ? ` Please remove: "${bannedResult.match}"` : ""}
        </p>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Tag (optional)</p>
        <TagChips selected={tag} onSelect={setTag} />
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="kindness"
          checked={isKind}
          onCheckedChange={(checked) => setIsKind(checked === true)}
          className="mt-0.5"
          disabled={pageState === "sending"}
        />
        <label htmlFor="kindness" className="cursor-pointer text-sm leading-snug text-foreground">
          This is kind. No hate. No threats.
        </label>
      </div>

      {pageState === "error" && errorMsg && <WriteError message={errorMsg} />}

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full transition-all duration-200"
        size="lg"
      >
        {pageState === "sending" ? (
          <span className="flex items-center gap-2">
            <Ghost className="h-4 w-4 animate-pulse" />
            Sending…
          </span>
        ) : (
          "Send into the void"
        )}
      </Button>
    </div>
  );
};

export default Write;
