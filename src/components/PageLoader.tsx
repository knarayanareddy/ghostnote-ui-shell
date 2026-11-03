interface PageLoaderProps {
  label?: string;
}

/** Shared loading / error affordance so pages never render a blank frame. */
const PageLoader = ({ label = "Loading…" }: PageLoaderProps) => (
  <div
    role="status"
    aria-live="polite"
    className="flex min-h-[50vh] flex-col items-center justify-center gap-3"
  >
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
);

export default PageLoader;
