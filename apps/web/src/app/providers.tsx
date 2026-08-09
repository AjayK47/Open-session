import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@opensession/ui";
import { Toaster } from "sonner";
import { BrowserRouter } from "react-router";
import type { PropsWithChildren } from "react";
import { useState } from "react";
import { ApiError } from "../api";

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404)) {
                return false;
              }
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
            staleTime: 15_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
