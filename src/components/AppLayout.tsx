import { Link, Outlet, useLocation } from "react-router-dom";
import { Ghost } from "lucide-react";

const navItems = [
  { label: "Home", path: "/" },
  { label: "Write", path: "/write" },
  { label: "Inbox", path: "/inbox" },
  { label: "Journal", path: "/journal" },
];

const AppLayout = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[700px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <Ghost className="w-5 h-5 text-primary" />
              <span className="font-serif font-bold text-lg text-foreground">GhostNote</span>
            </Link>
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
          <p className="text-xs text-muted-foreground mt-1">
            Anonymous kindness. No replies. No likes.
          </p>
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

export default AppLayout;
