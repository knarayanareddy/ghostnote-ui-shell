interface NoteCardProps {
  content: string;
  tag?: string;
  date?: string;
}

const NoteCard = ({ content, tag, date }: NoteCardProps) => {
  return (
    <div className="bg-paper border rounded-lg shadow-paper p-5 transition-shadow hover:shadow-paper-hover animate-fade-in">
      <p className="text-foreground font-serif leading-relaxed">{content}</p>
      <div className="flex items-center justify-between mt-4">
        {tag && (
          <span className="text-xs font-medium text-muted-foreground bg-accent px-2.5 py-1 rounded-full">
            {tag}
          </span>
        )}
        {date && (
          <span className="text-xs text-muted-foreground ml-auto">{date}</span>
        )}
      </div>
    </div>
  );
};

export default NoteCard;
