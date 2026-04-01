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
    <span className="text-[11px] text-muted-foreground tabular-nums">
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
      <header className="border-b bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[700px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <Ghost className="w-5 h-5 text-primary" />
              <span className="font-serif font-bold text-lg text-foreground">GhostNote</span>
            </Link>
            <div className="flex items-center gap-3">
              <span
                className={`text-[11px] font-medium ${
                  authStatus === "connected"
                    ? "text-green-600"
                    : authStatus === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {authStatus === "connected"
                  ? "Connected"
                  : authStatus === "error"
                  ? "Connection failed"
                  : "Connecting\u2026"}
              </span>
              <nav className="flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      location.pathname === item.path
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">
              Anonymous kindness. No replies. No likes.
            </p>
            {authStatus === "connected" && <HeaderStats />}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-[700px] mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

const AppLayout = () => (
  <StatsProvider>
    <AppLayoutInner />
  </StatsProvider>
);

export default AppLayout;
