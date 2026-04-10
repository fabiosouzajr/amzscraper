import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,       // 1 min before re-fetch
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
