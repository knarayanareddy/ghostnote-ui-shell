import { Link } from "react-router-dom";
import { Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";

const Home = () => {
  return (
    <div className="flex flex-col items-center text-center py-8 sm:py-12 animate-fade-in">
      <Ghost className="w-12 h-12 text-primary mb-4 animate-ghost-float" />
      <h1 className="text-3xl sm:text-4xl font-bold mb-2">GhostNote</h1>
      <p className="text-muted-foreground mb-2 max-w-sm text-sm sm:text-base">
        Leave a kind note for a stranger. Receive one when you need it.
      </p>
      <p className="text-xs text-muted-foreground/60 mb-8">
        No profiles. No replies. No likes. Just kindness, drifting.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-12 w-full sm:w-auto">
        <Button asChild size="lg" className="sm:min-w-[160px]">
          <Link to="/write">Write a note</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="sm:min-w-[160px]">
          <Link to="/inbox">Check my inbox</Link>
        </Button>
      </div>

      <div className="text-left space-y-3 max-w-md w-full">
        {[
          { num: "1", text: "Send anonymous kindness — no names, no profiles, no trace." },
          { num: "2", text: "Someone receives your note when they open their inbox. You'll never know who." },
          { num: "3", text: "Notes you receive are saved in your private Ghost Journal. Only you can see them." },
        ].map((item, i) => (
          <div
            key={item.num}
            className="flex gap-3 items-start border rounded-lg p-4 animate-slide-up"
            style={{
              animationDelay: `${i * 100}ms`,
              background: "linear-gradient(145deg, hsl(40 40% 97%), hsl(36 35% 94%))",
              boxShadow: "0 2px 8px -2px hsl(32 30% 75% / 0.3)",
            }}
          >
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
              {item.num}
            </span>
            <p className="text-sm text-foreground leading-relaxed">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;
