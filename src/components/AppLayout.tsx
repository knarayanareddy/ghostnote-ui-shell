import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Ghost } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useStats } from "@/hooks/useStats";
import { Button } from "@/components/ui/button";
import PageLoader from "@/components/PageLoader";
import { describeError } from "@/lib/errors";
import ForgetDeviceDialog from "@/components/ForgetDeviceDialog";

const navItems = [
  { label: "Home", path: "/" },
  { label: "Write", path: "/write" },
  { label: "Inbox", path: "/inbox" },
  { label: "Journal", path: "/journal" },
];

const HeaderStats = () => {
  const { data, isError } = useStats();

  if (isError) {
    return (
      <span className="hidden text-[11px] text-muted-foreground sm:inline">
        Stats unavailable
      </span>
    );
  }

  return (
    <span className="hidden text-[11px] text-muted-foreground tabular-nums sm:inline">
      Sent {data?.sent ?? "–"} · Received {data?.received ?? "–"}
    </span>
  );
};

const AuthError = ({ message, onRetry }: { message: string | null; onRetry: () => void }) => {
  const help = describeError(
    message ?? "Something went wrong while starting your anonymous session.",
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div role="alert" className="max-w-md space-y-4 text-center">
        <Ghost className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <h1 className="text-xl font-bold">Can't reach the ghosts</h1>
        <p className="text-sm font-medium text-foreground">{help.title}</p>
        <p className="text-sm text-muted-foreground">{help.description}</p>
        {help.fix && (
          <p className="text-xs text-muted-foreground">
            Fix: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{help.fix}</code>
          </p>
        )}
        <div className="flex justify-center gap-3">
          <Button onClick={onRetry}>Try again</Button>
        </div>
        <p className="text-xs text-muted-foreground/60">
          Or run <code className="font-mono">npm run preflight</code> to see what is missing.
        </p>
      </div>
    </div>
  );
};

const AppLayoutInner = () => {
  const location = useLocation();
  const { status, error, retry } = useAuth();
  const [showForget, setShowForget] = useState(false);

  if (status === "loading") {
    return <PageLoader label="Waking the ghosts…" />;
  }

  if (status === "error") {
    return <AuthError message={error} onRetry={retry} />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto max-w-[700px] px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="group flex items-center gap-2">
              <Ghost className="h-5 w-5 text-primary transition-transform group-hover:scale-110" />
              <span className="font-serif text-lg font-bold text-foreground">Kindling</span>
            </Link>
            <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-current={isActive ? "page" : undefined}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 sm:px-3 sm:text-sm ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Anonymous kindness. No replies. No likes.
            </p>
            <HeaderStats />
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[700px] px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </div>
      </main>

      <footer className="border-t py-4">
        <div className="flex flex-col items-center gap-1">
          <p className="text-center text-[11px] text-muted-foreground/50">
            No accounts. No tracking. Just kindness.
          </p>
          <button
            type="button"
            onClick={() => setShowForget(true)}
            className="rounded text-[11px] text-muted-foreground/60 underline-offset-2 hover:text-foreground hover:underline"
          >
            Forget this device
          </button>
        </div>
      </footer>

      <ForgetDeviceDialog open={showForget} onOpenChange={setShowForget} />
    </div>
  );
};

const AppLayout = () => <AppLayoutInner />;

export default AppLayout;
