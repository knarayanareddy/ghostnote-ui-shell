import { Link, Outlet, useLocation } from "react-router-dom";
import { Ghost } from "lucide-react";
import { useEffect, useState } from "react";
import { ensureAnonymousSession } from "@/lib/supabaseAuth";
import { StatsProvider, useStats } from "@/components/StatsProvider";

const navItems = [
  { label: "Home", path: "/" },
  { label: "Write", path: "/write" },
  { label: "Inbox", path: "/inbox" },
  { label: "Journal", path: "/journal" },
];

const HeaderStats = () => {
  const { stats } = useStats();
  return (
    <span className="text-[11px] text-muted-foreground tabular-nums hidden sm:inline">
      Sent {stats.sent} · Received {stats.received}
    </span>
  );
};

const AppLayoutInner = () => {
  const location = useLocation();
  const [authStatus, setAuthStatus] = useState<"loading" | "connected" | "error">("loading");

  useEffect(() => {
    ensureAnonymousSession()
      .then(() => setAuthStatus("connected"))
      .catch(() => setAuthStatus("error"));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-[700px] mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 group">
              <Ghost className="w-5 h-5 text-primary transition-transform group-hover:scale-110" />
              <span className="font-serif font-bold text-lg text-foreground">Kindling</span>
            </Link>
            <nav className="flex items-center gap-0.5 sm:gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 ${
                    location.pathname === item.path
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[11px] text-muted-foreground">
              Anonymous kindness. No replies. No likes.
            </p>
            <div className="flex items-center gap-2">
              {authStatus === "connected" && <HeaderStats />}
              <span
                className={`text-[10px] font-medium ${
                  authStatus === "connected"
                    ? "text-green-600"
                    : authStatus === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {authStatus === "connected"
                  ? "·"
                  : authStatus === "error"
                  ? "Offline"
                  : "…"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-[700px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <Outlet />
        </div>
      </main>

      <footer className="border-t py-4">
        <p className="text-[11px] text-muted-foreground/50 text-center">
          No accounts. No tracking. Just kindness.
        </p>
      </footer>
    </div>
  );
};

const AppLayout = () => (
  <StatsProvider>
    <AppLayoutInner />
  </StatsProvider>
);

export default AppLayout;
