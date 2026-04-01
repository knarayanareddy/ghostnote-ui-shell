import { Ghost } from "lucide-react";

interface EmptyStateProps {
  message: string;
}

const EmptyState = ({ message }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground animate-fade-in">
      <Ghost className="w-10 h-10 mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
};

export default EmptyState;
