import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import TagChips from "@/components/TagChips";

const Write = () => {
  const [content, setContent] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [isKind, setIsKind] = useState(false);

  const canSubmit = isKind && content.trim().length >= 15;

  const handleSubmit = () => {
    // TODO: send to backend
    console.log({ content, tag, isKind });
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Write a note</h1>
        <p className="text-sm text-muted-foreground">
          Send something kind into the world. It will find someone.
        </p>
      </div>

      <Textarea
        placeholder="Write something kind to a stranger…"
        className="min-h-[160px] bg-paper border shadow-paper resize-none font-serif"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      <div>
        <p className="text-sm font-medium text-foreground mb-2">Tag (optional)</p>
        <TagChips selected={tag} onSelect={setTag} />
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="kindness"
          checked={isKind}
          onCheckedChange={(checked) => setIsKind(checked === true)}
          className="mt-0.5"
        />
        <label htmlFor="kindness" className="text-sm text-foreground cursor-pointer">
          This is kind. No hate. No threats.
        </label>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full"
        size="lg"
      >
        Send into the void
      </Button>

      {content.length > 0 && content.trim().length < 15 && (
        <p className="text-xs text-muted-foreground text-center">
          {15 - content.trim().length} more characters needed
        </p>
      )}
    </div>
  );
};

export default Write;
