import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import { AuthProvider } from "@/components/AuthProvider";
import PageLoader from "@/components/PageLoader";
import { queryClient } from "@/lib/queryClient";

// Routes are split so the landing page does not ship the write/inbox/journal
// bundles (and vice versa).
const Index = lazy(() => import("./pages/Index.tsx"));
const Write = lazy(() => import("./pages/Write.tsx"));
const Inbox = lazy(() => import("./pages/Inbox.tsx"));
const Journal = lazy(() => import("./pages/Journal.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
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
