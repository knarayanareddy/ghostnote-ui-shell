import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportButtonProps {
  onClick: () => void;
  className?: string;
}

/**
 * The quiet "Report" affordance shared by the inbox and the journal.
 * Kept in one place so the tap target, contrast and focus ring can't drift
 * between the two copies (the journal used to lack a focus ring entirely).
 */
const ReportButton = ({ onClick, className }: ReportButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex items-center gap-1 rounded-sm px-1 py-1 text-[11px] text-muted-foreground transition-colors",
      "hover:text-destructive focus-visible:outline-none focus-visible:ring-2",
      "focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
  >
    <Flag className="h-3 w-3" aria-hidden="true" />
    <span>Report</span>
  </button>
);

export default ReportButton;
