import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow, format } from "date-fns";

interface NoteCardProps {
  content: string;
  tag?: string;
  date?: string;
  animate?: "fade" | "drift-in";
}

const NoteCard = ({ content, tag, date, animate = "fade" }: NoteCardProps) => {
  const relative = date ? formatDistanceToNow(new Date(date), { addSuffix: true }) : null;
  const exact = date ? format(new Date(date), "MMM d, yyyy 'at' h:mm a") : null;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-6 transition-shadow hover:shadow-paper-hover ${
        animate === "drift-in" ? "animate-drift-in" : "animate-slide-up"
      }`}
      style={{
        background:
          "linear-gradient(145deg, hsl(40 40% 97%), hsl(36 35% 94%))",
        boxShadow:
          "0 2px 8px -2px hsl(32 30% 75% / 0.4), 0 1px 3px -1px hsl(32 30% 75% / 0.3), inset 0 1px 0 hsl(40 50% 99% / 0.6)",
      }}
    >
      {/* Paper texture line */}
      <div
        className="pointer-events-none absolute left-6 right-6 top-0 h-px opacity-30"
        style={{ background: "linear-gradient(90deg, transparent, hsl(32 20% 80%), transparent)" }}
      />

      <p className="text-foreground font-serif text-[15px] leading-[1.75]">
        {content}
      </p>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
        {tag ? (
          <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            {tag}
          </span>
        ) : (
          <span />
        )}
        {relative && exact ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[11px] text-muted-foreground cursor-default">
                {relative}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{exact}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
};

export default NoteCard;
