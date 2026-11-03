import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import { AuthProvider } from "@/components/AuthProvider";
import PageLoader from "@/components/PageLoader";

// Routes are split so the landing page does not ship the write/inbox/journal
// bundles (and vice versa).
const Index = lazy(() => import("./pages/Index.tsx"));
const Write = lazy(() => import("./pages/Write.tsx"));
const Inbox = lazy(() => import("./pages/Inbox.tsx"));
const Journal = lazy(() => import("./pages/Journal.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Suspense fallback={<PageLoader label="Loading…" />}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Index />} />
                <Route path="/write" element={<Write />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/journal" element={<Journal />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
