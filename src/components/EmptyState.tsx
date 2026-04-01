import { Ghost } from "lucide-react";
import { type ReactNode } from "react";

interface EmptyStateProps {
  message: string;
  submessage?: string;
  children?: ReactNode;
}

const EmptyState = ({ message, submessage, children }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
      <Ghost className="w-10 h-10 text-muted-foreground/30 mb-4 animate-ghost-float" />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
      {submessage && (
        <p className="text-xs text-muted-foreground/70 mt-1">{submessage}</p>
      )}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
};

export default EmptyState;
