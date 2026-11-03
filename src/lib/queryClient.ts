import { QueryClient } from "@tanstack/react-query";

/** Shared client factory so tests can build an isolated cache. */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });

export const queryClient = createQueryClient();
