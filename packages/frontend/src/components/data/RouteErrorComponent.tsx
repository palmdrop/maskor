import { useEffect } from "react";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { ViewError } from "./ViewError";

// The router wraps every route's component in its own catch boundary, so a
// render-time throw from a view (including a useSuspenseQuery error routed here
// by the global throwOnError policy) is caught at the route level — the parent
// ProjectShellLayout (navbar) keeps rendering and only the content area swaps.
// This is the workhorse error boundary; AppErrorBoundary is the outer net.
//
// Retry path: resetting the query error boundary on mount marks failed queries
// for refetch; the router reset clears the catch boundary and re-runs the
// loader, so the next render refetches rather than re-throwing the cached error.
export const RouteErrorComponent = ({ error, reset }: ErrorComponentProps) => {
  const router = useRouter();
  const queryErrorResetBoundary = useQueryErrorResetBoundary();

  useEffect(() => {
    queryErrorResetBoundary.reset();
  }, [queryErrorResetBoundary]);

  const handleRetry = () => {
    reset();
    void router.invalidate();
  };

  return <ViewError error={error} onRetry={handleRetry} />;
};
