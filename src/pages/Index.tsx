import { Link } from "react-router-dom";
import { Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";

const Home = () => {
  return (
    <div className="flex flex-col items-center text-center py-12 animate-fade-in">
      <Ghost className="w-12 h-12 text-primary mb-4" />
      <h1 className="text-4xl font-bold mb-2">GhostNote</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        Leave a kind note for a stranger. Receive one when you need it.
      </p>

      <div className="flex gap-3 mb-12">
        <Button asChild size="lg">
          <Link to="/write">Write a note</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/inbox">Check my inbox</Link>
        </Button>
      </div>

      <div className="text-left space-y-4 max-w-md w-full">
        {[
          { num: "1", text: "Send anonymous kindness — no names, no profiles." },
          { num: "2", text: "Someone receives your note when they open their inbox." },
          { num: "3", text: "Notes you receive are saved in your private Ghost Journal." },
        ].map((item) => (
          <div key={item.num} className="flex gap-3 items-start bg-paper border rounded-lg p-4 shadow-paper">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
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
