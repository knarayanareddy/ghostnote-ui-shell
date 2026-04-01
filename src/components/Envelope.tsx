import { useEffect, useState } from "react";

interface EnvelopeProps {
  state: "idle" | "claiming" | "sealed" | "opening" | "revealed";
  onOpenComplete?: () => void;
}

const Envelope = ({ state, onOpenComplete }: EnvelopeProps) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (state === "opening") {
      const delay = prefersReducedMotion ? 50 : 600;
      const timer = setTimeout(() => onOpenComplete?.(), delay);
      return () => clearTimeout(timer);
    }
  }, [state, onOpenComplete, prefersReducedMotion]);

  const isOpening = state === "opening" || state === "revealed";
  const isClaiming = state === "claiming";
  const skipAnim = prefersReducedMotion;

  return (
    <div
      className={`relative w-full max-w-[320px] mx-auto select-none ${
        isClaiming && !skipAnim ? "animate-pulse" : ""
      }`}
      style={{ perspective: "800px" }}
    >
      {/* Envelope body */}
      <div
        className="relative rounded-xl border overflow-hidden"
        style={{
          background: "linear-gradient(160deg, hsl(36 40% 93%), hsl(32 35% 88%))",
          boxShadow:
            "0 4px 16px -4px hsl(32 30% 70% / 0.4), 0 2px 6px -2px hsl(32 30% 70% / 0.25), inset 0 1px 0 hsl(40 50% 97% / 0.5)",
          aspectRatio: "4 / 3",
        }}
      >
        {/* Paper texture lines */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.07]">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute left-8 right-8 h-px bg-foreground"
              style={{ top: `${28 + i * 12}%` }}
            />
          ))}
        </div>

        {/* Inner "letter" peek when opening */}
        <div
          className="absolute inset-x-4 bottom-4 top-[40%] rounded-lg border border-border/40"
          style={{
            background: "linear-gradient(145deg, hsl(40 45% 97%), hsl(38 38% 95%))",
            opacity: isOpening ? 1 : 0,
            transform: isOpening ? "translateY(0)" : "translateY(8px)",
            transition: skipAnim ? "none" : "opacity 0.4s ease, transform 0.4s ease",
            transitionDelay: skipAnim ? "0ms" : "200ms",
          }}
        />
      </div>

      {/* Envelope flap (top triangle) */}
      <div
        className="absolute left-0 right-0 top-0 overflow-hidden"
        style={{
          height: "45%",
          transformOrigin: "top center",
          transform: isOpening
            ? "rotateX(180deg)"
            : "rotateX(0deg)",
          transition: skipAnim ? "none" : "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: isOpening ? 0 : 2,
        }}
      >
        <div
          className="w-full h-full"
          style={{
            background: "linear-gradient(180deg, hsl(34 38% 86%), hsl(32 35% 88%))",
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
            borderBottom: "1px solid hsl(32 20% 82%)",
          }}
        />
      </div>

      {/* Wax seal */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-10"
        style={{
          top: "38%",
          opacity: isOpening ? 0 : 1,
          transform: `translateX(-50%) scale(${isOpening ? 0.5 : 1})`,
          transition: skipAnim ? "none" : "opacity 0.3s ease, transform 0.3s ease",
        }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shadow-md"
          style={{
            background: "radial-gradient(circle at 35% 35%, hsl(28 75% 52%), hsl(28 70% 38%))",
            boxShadow: "0 2px 6px hsl(28 70% 30% / 0.4), inset 0 1px 2px hsl(28 80% 65% / 0.3)",
          }}
        >
          <span className="text-[13px] font-serif font-bold text-primary-foreground/90">G</span>
        </div>
      </div>
    </div>
  );
};

export default Envelope;
