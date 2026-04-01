import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow, format } from "date-fns";

interface NoteCardProps {
  content: string;
  tag?: string;
  date?: string;
}

const NoteCard = ({ content, tag, date }: NoteCardProps) => {
  const relative = date ? formatDistanceToNow(new Date(date), { addSuffix: true }) : null;
  const exact = date ? format(new Date(date), "MMM d, yyyy 'at' h:mm a") : null;

  return (
    <div className="bg-paper border rounded-lg shadow-paper p-5 transition-shadow hover:shadow-paper-hover animate-fade-in">
      <p className="text-foreground font-serif leading-relaxed">{content}</p>
      <div className="flex items-center justify-between mt-4">
        {tag && (
          <span className="text-xs font-medium text-muted-foreground bg-accent px-2.5 py-1 rounded-full">
            {tag}
          </span>
        )}
        {relative && exact && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground ml-auto cursor-default">
                {relative}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{exact}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default NoteCard;
