const TAGS = ["Encouragement", "Gratitude", "Proud of you", "Calm", "Funny"];

interface TagChipsProps {
  selected: string | null;
  onSelect: (tag: string | null) => void;
}

const TagChips = ({ selected, onSelect }: TagChipsProps) => {
  return (
    <div className="flex flex-wrap gap-2">
      {TAGS.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onSelect(selected === tag ? null : tag)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            selected === tag
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
          }`}
        >
          {tag}
        </button>
      ))}
    </div>
  );
};

export default TagChips;
